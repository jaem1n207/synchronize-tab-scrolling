/**
 * Scroll synchronization logic for content scripts
 * Implements P0: Basic Scroll Synchronization (<100ms delay)
 * Implements P1: Element-Based Synchronization Mode
 * Implements P1: Manual Adjustment Controls
 * Implements P1: URL Navigation Synchronization
 */

import { onMessage, sendMessage } from 'webext-bridge/content-script';

import { ExtensionLogger } from '~/shared/lib/logger';
import { getManualScrollOffset } from '~/shared/lib/storage';

import { cleanupKeyboardHandler, initKeyboardHandler } from './keyboardHandler';
import { hidePanel, showPanel } from './panel';

import type { SyncMode } from '~/shared/types/messages';

const logger = new ExtensionLogger({ scope: 'scroll-sync' });

// Sync state
let isSyncActive = false;
let currentMode: SyncMode = 'ratio';
let isManualScrollEnabled = false;
let lastScrollTime = 0;
let lastNavigationUrl = window.location.href;
let lastSyncedRatio = 0; // Track the last synced ratio for offset calculation
let lastProgrammaticScrollTime = 0; // Track programmatic scrolls to prevent infinite loops
const THROTTLE_DELAY = 50; // ms - ensures <100ms sync delay
const PROGRAMMATIC_SCROLL_GRACE_PERIOD = 100; // ms - ignore user scrolls shortly after programmatic scroll

// URL monitoring
let urlObserver: MutationObserver | null = null;
let popstateHandler: (() => void) | null = null;

// Current tab ID - will be set when sync starts
let currentTabId = 0;

/**
 * Get current scroll information
 */
function getScrollInfo() {
  return {
    scrollTop: window.scrollY || document.documentElement.scrollTop,
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
  };
}

/**
 * Calculate scroll ratio (0 to 1)
 */
function getScrollRatio(): number {
  const { scrollTop, scrollHeight, clientHeight } = getScrollInfo();
  const maxScroll = scrollHeight - clientHeight;
  return maxScroll > 0 ? scrollTop / maxScroll : 0;
}

/**
 * Find semantic elements for element-based sync (P1)
 */
function findSemanticElements(): Array<{ element: Element; scrollTop: number }> {
  const selectors = [
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'article',
    'section',
    'p',
    'img',
    'table',
    'pre',
    'blockquote',
  ];

  const elements: Array<{ element: Element; scrollTop: number }> = [];

  for (const selector of selectors) {
    const matches = document.querySelectorAll(selector);
    matches.forEach((element) => {
      const rect = element.getBoundingClientRect();
      const scrollTop = window.scrollY + rect.top;
      elements.push({ element, scrollTop });
    });
  }

  // Sort by scroll position
  return elements.sort((a, b) => a.scrollTop - b.scrollTop);
}

/**
 * Find nearest semantic element to current scroll position (P1)
 */
function findNearestElement(): { index: number; ratio: number } | null {
  const elements = findSemanticElements();
  if (elements.length === 0) return null;

  const currentScroll = window.scrollY;
  let nearestIndex = 0;
  let minDistance = Math.abs(elements[0].scrollTop - currentScroll);

  for (let i = 1; i < elements.length; i++) {
    const distance = Math.abs(elements[i].scrollTop - currentScroll);
    if (distance < minDistance) {
      minDistance = distance;
      nearestIndex = i;
    }
  }

  // Calculate fine-tuned ratio within the element
  const ratio = getScrollRatio();

  return { index: nearestIndex, ratio };
}

/**
 * Handle scroll event with throttling
 */
async function handleScroll() {
  if (!isSyncActive || isManualScrollEnabled) return;

  const now = Date.now();

  // Ignore scroll events that occur shortly after programmatic scrolls
  // This prevents infinite loops when tabs sync each other
  if (now - lastProgrammaticScrollTime < PROGRAMMATIC_SCROLL_GRACE_PERIOD) {
    logger.debug('Ignoring scroll event - programmatic scroll detected', {
      timeSinceProgrammatic: now - lastProgrammaticScrollTime,
    });
    return;
  }

  if (now - lastScrollTime < THROTTLE_DELAY) return;
  lastScrollTime = now;

  const scrollInfo = getScrollInfo();

  // Remove offset from scrollTop before broadcasting
  // This ensures we send the "pure" scroll position without offset applied
  const offsetPx = await getManualScrollOffset(currentTabId);
  const myMaxScroll = scrollInfo.scrollHeight - scrollInfo.clientHeight;

  // Clamp pureScrollTop to valid range to prevent negative or overflow values
  const pureScrollTop = Math.max(0, Math.min(myMaxScroll, scrollInfo.scrollTop - offsetPx));

  const message = {
    scrollTop: pureScrollTop,
    scrollHeight: scrollInfo.scrollHeight,
    clientHeight: scrollInfo.clientHeight,
    sourceTabId: currentTabId,
    mode: currentMode,
    timestamp: now,
  };

  logger.debug('Broadcasting scroll (offset removed)', {
    actualScrollTop: scrollInfo.scrollTop,
    offsetPx,
    pureScrollTop,
    clamped: pureScrollTop !== scrollInfo.scrollTop - offsetPx,
  });

  // Broadcast to other tabs via background script
  sendMessage('scroll:sync', message, 'background').catch((error) => {
    logger.error('Failed to send scroll sync message', { error });
  });
}

/**
 * Broadcast URL change to other tabs (P1)
 */
function broadcastUrlChange(url: string) {
  logger.info('URL changed, broadcasting to other tabs', { url });

  sendMessage(
    'url:sync',
    {
      url,
      sourceTabId: currentTabId,
    },
    'background',
  ).catch((error) => {
    logger.error('Failed to send URL sync message', { error });
  });
}

/**
 * Start URL monitoring (P1)
 */
function startUrlMonitoring() {
  // Stop any existing monitoring
  stopUrlMonitoring();

  lastNavigationUrl = window.location.href;

  // Use MutationObserver to detect URL changes (for SPA navigation)
  urlObserver = new MutationObserver(() => {
    const currentUrl = window.location.href;
    if (currentUrl !== lastNavigationUrl) {
      lastNavigationUrl = currentUrl;
      broadcastUrlChange(currentUrl);
    }
  });

  urlObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Also listen for popstate events (browser back/forward)
  popstateHandler = () => {
    const currentUrl = window.location.href;
    if (currentUrl !== lastNavigationUrl) {
      lastNavigationUrl = currentUrl;
      broadcastUrlChange(currentUrl);
    }
  };

  window.addEventListener('popstate', popstateHandler);

  logger.info('URL monitoring started');
}

/**
 * Stop URL monitoring (P1)
 */
function stopUrlMonitoring() {
  if (urlObserver) {
    urlObserver.disconnect();
    urlObserver = null;
  }

  if (popstateHandler) {
    window.removeEventListener('popstate', popstateHandler);
    popstateHandler = null;
  }

  logger.info('URL monitoring stopped');
}

/**
 * Initialize scroll sync system
 */
export function initScrollSync() {
  logger.info('Registering scroll sync message handlers');
  console.log('[scrollSync] Registering scroll sync message handlers');

  // Listen for start sync message
  onMessage('scroll:start', ({ data }) => {
    console.log('[scrollSync] Received scroll:start message', data);
    logger.info('Received scroll:start message', { data });
    const payload = data as { tabIds: Array<number>; mode: SyncMode; currentTabId: number };
    isSyncActive = true;
    currentMode = payload.mode;
    currentTabId = payload.currentTabId; // Set the tab ID from background script

    // Initialize lastSyncedRatio with current scroll position to prevent offset calculation errors
    lastSyncedRatio = getScrollRatio();

    logger.info(`Sync activated for tab ${currentTabId}`, {
      mode: currentMode,
      initialRatio: lastSyncedRatio,
    });

    // Add scroll listener
    window.addEventListener('scroll', handleScroll, { passive: true });
    logger.debug('Scroll listener added');

    // Start URL monitoring (P1)
    startUrlMonitoring();

    // Initialize keyboard handler with tab ID and scroll info callback
    initKeyboardHandler(currentTabId, () => ({
      currentScrollTop: window.scrollY,
      lastSyncedRatio,
    }));
    logger.debug('Keyboard handler initialized');

    // Show draggable control panel
    showPanel();
    logger.debug('Panel shown');

    return { success: true, tabId: currentTabId };
  });

  // Listen for stop sync message
  onMessage('scroll:stop', ({ data }) => {
    logger.info('Stopping scroll sync', { data });
    isSyncActive = false;

    // Remove scroll listener
    window.removeEventListener('scroll', handleScroll);

    // Stop URL monitoring (P1)
    stopUrlMonitoring();

    // Cleanup keyboard handler
    cleanupKeyboardHandler();

    // Hide draggable control panel
    hidePanel();

    return { success: true, tabId: currentTabId };
  });

  // Listen for scroll sync from other tabs
  onMessage('scroll:sync', async ({ data }) => {
    if (!isSyncActive) return;

    const payload = data as {
      scrollTop: number;
      scrollHeight: number;
      clientHeight: number;
      sourceTabId: number;
      mode: SyncMode;
      timestamp: number;
    };

    // Don't sync if this is the source tab
    if (payload.sourceTabId === currentTabId) return;

    logger.debug('Receiving scroll sync', { data });

    // Calculate the synced ratio from source tab
    const sourceRatio = payload.scrollTop / (payload.scrollHeight - payload.clientHeight);
    lastSyncedRatio = sourceRatio;

    // If in manual mode, store the synced ratio but don't apply it
    if (isManualScrollEnabled) {
      logger.debug('Manual mode active, storing synced ratio but not applying', {
        syncedRatio: sourceRatio,
      });
      return;
    }

    // Get my document dimensions
    const myScrollInfo = getScrollInfo();
    const myMaxScroll = myScrollInfo.scrollHeight - myScrollInfo.clientHeight;

    // Convert source ratio to my document's pixel position
    const targetBaseScrollTop = sourceRatio * myMaxScroll;

    // Load manual scroll offset (in pixels) for this tab
    const offsetPx = await getManualScrollOffset(currentTabId);

    // Apply pixel offset
    const finalScrollTop = targetBaseScrollTop + offsetPx;

    // Clamp to valid range [0, myMaxScroll]
    const clampedScrollTop = Math.max(0, Math.min(myMaxScroll, finalScrollTop));

    logger.debug('Applying scroll with pixel offset', {
      sourceRatio,
      targetBaseScrollTop,
      offsetPx,
      finalScrollTop,
      clampedScrollTop,
    });

    // Mark as programmatic scroll to prevent infinite loops
    lastProgrammaticScrollTime = Date.now();

    if (payload.mode === 'element') {
      // Element-based sync (P1) - not commonly used with manual offsets
      const nearest = findNearestElement();
      if (nearest) {
        const elements = findSemanticElements();
        if (nearest.index < elements.length) {
          window.scrollTo({
            top: elements[nearest.index].scrollTop,
            behavior: 'auto',
          });
        } else {
          window.scrollTo({
            top: clampedScrollTop,
            behavior: 'auto',
          });
        }
      } else {
        window.scrollTo({
          top: clampedScrollTop,
          behavior: 'auto',
        });
      }
    } else {
      // Ratio-based sync (P0) with pixel offset
      window.scrollTo({
        top: clampedScrollTop,
        behavior: 'auto',
      });
    }
  });

  // Listen for manual scroll toggle (P1)
  onMessage('scroll:manual', async ({ data }) => {
    logger.info('Manual scroll mode toggled', { data });
    const payload = data as { tabId: number; enabled: boolean };

    // Only apply to this specific tab
    if (payload.tabId !== currentTabId) {
      return;
    }

    isManualScrollEnabled = payload.enabled;

    // When manual mode is deactivated, immediately apply sync with pixel offset
    if (!payload.enabled) {
      const myScrollInfo = getScrollInfo();
      const myMaxScroll = myScrollInfo.scrollHeight - myScrollInfo.clientHeight;

      // Convert last synced ratio to pixel position
      const targetBaseScrollTop = lastSyncedRatio * myMaxScroll;

      // Load pixel offset
      const offsetPx = await getManualScrollOffset(currentTabId);

      // Apply pixel offset
      const finalScrollTop = targetBaseScrollTop + offsetPx;
      const clampedScrollTop = Math.max(0, Math.min(myMaxScroll, finalScrollTop));

      logger.info('Manual mode deactivated, applying immediate sync', {
        lastSyncedRatio,
        targetBaseScrollTop,
        offsetPx,
        finalScrollTop: clampedScrollTop,
      });

      // Mark as programmatic scroll to prevent infinite loops
      lastProgrammaticScrollTime = Date.now();

      window.scrollTo({
        top: clampedScrollTop,
        behavior: 'auto',
      });
    }
  });

  // Listen for URL sync from other tabs (P1)
  onMessage('url:sync', ({ data }) => {
    if (!isSyncActive) return;

    const payload = data as { url: string; sourceTabId: number };

    // Don't navigate if this is the source tab
    if (payload.sourceTabId === currentTabId) return;

    logger.info('Navigating to synced URL', { url: payload.url, sourceTabId: payload.sourceTabId });

    // Navigate to the new URL
    window.location.href = payload.url;
  });

  logger.info('Scroll sync initialized');
}
