/**
 * Scroll synchronization logic for content scripts
 * Implements P0: Basic Scroll Synchronization (<100ms delay)
 * Implements P1: Element-Based Synchronization Mode
 * Implements P1: Manual Adjustment Controls
 * Implements P1: URL Navigation Synchronization
 */

import { onMessage, sendMessage } from 'webext-bridge/content-script';

import { ExtensionLogger } from '~/shared/lib/logger';
import { getManualScrollOffset, loadUrlSyncEnabled } from '~/shared/lib/storage';

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

// Connection health monitoring
let connectionHealthCheckInterval: number | null = null;
let lastSuccessfulSync = Date.now();
let isConnectionHealthy = true;
const CONNECTION_CHECK_INTERVAL = 30000; // Check every 30 seconds
const CONNECTION_TIMEOUT_THRESHOLD = 60000; // Consider disconnected after 60 seconds

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

  // Remove offset ratio from current ratio before broadcasting
  // This ensures we send the "pure" scroll ratio without offset applied
  const offsetRatio = await getManualScrollOffset(currentTabId);
  const myMaxScroll = scrollInfo.scrollHeight - scrollInfo.clientHeight;

  // Calculate current scroll ratio
  const currentRatio = myMaxScroll > 0 ? scrollInfo.scrollTop / myMaxScroll : 0;

  // Calculate pure ratio by removing this tab's offset
  const pureRatio = currentRatio - offsetRatio;

  // Convert pure ratio back to pixels for the message (for backward compatibility)
  // Receiving tabs will convert back to ratio and add their own offsets
  const pureScrollTop = Math.max(0, Math.min(myMaxScroll, pureRatio * myMaxScroll));

  const message = {
    scrollTop: pureScrollTop,
    scrollHeight: scrollInfo.scrollHeight,
    clientHeight: scrollInfo.clientHeight,
    sourceTabId: currentTabId,
    mode: currentMode,
    timestamp: now,
  };

  logger.debug('Broadcasting scroll (offset ratio removed)', {
    actualScrollTop: scrollInfo.scrollTop,
    currentRatio,
    offsetRatio,
    pureRatio,
    pureScrollTop,
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
 * Start connection health monitoring
 */
function startConnectionHealthCheck() {
  // Clear any existing interval
  stopConnectionHealthCheck();

  connectionHealthCheckInterval = window.setInterval(() => {
    const now = Date.now();
    const timeSinceLastSync = now - lastSuccessfulSync;

    if (timeSinceLastSync > CONNECTION_TIMEOUT_THRESHOLD) {
      if (isConnectionHealthy) {
        isConnectionHealthy = false;
        logger.warn('Connection appears to be lost', {
          timeSinceLastSync,
          threshold: CONNECTION_TIMEOUT_THRESHOLD,
        });

        // Show reconnection UI
        showReconnectionPrompt();
      }
    } else {
      if (!isConnectionHealthy) {
        isConnectionHealthy = true;
        logger.info('Connection restored');
        hideReconnectionPrompt();
      }
    }
  }, CONNECTION_CHECK_INTERVAL);

  logger.info('Connection health check started');
}

/**
 * Stop connection health monitoring
 */
function stopConnectionHealthCheck() {
  if (connectionHealthCheckInterval) {
    clearInterval(connectionHealthCheckInterval);
    connectionHealthCheckInterval = null;
    logger.info('Connection health check stopped');
  }
}

/**
 * Show reconnection prompt to user
 */
function showReconnectionPrompt() {
  logger.info('Showing reconnection prompt');
  // Send message to panel to show reconnection UI
  sendMessage('connection:lost', {}, 'content-script').catch((error) => {
    logger.error('Failed to send connection lost message', { error });
  });
}

/**
 * Hide reconnection prompt
 */
function hideReconnectionPrompt() {
  logger.info('Hiding reconnection prompt');
  // Send message to panel to hide reconnection UI
  sendMessage('connection:restored', {}, 'content-script').catch((error) => {
    logger.error('Failed to send connection restored message', { error });
  });
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

    // Clean up any existing sync state before starting new sync
    // This is critical for re-sync scenarios where content script is already active
    if (isSyncActive) {
      logger.info('Sync already active, cleaning up old state before re-initializing');

      // Remove old scroll listener
      window.removeEventListener('scroll', handleScroll);

      // Stop old URL monitoring
      stopUrlMonitoring();

      // Cleanup old keyboard handler
      cleanupKeyboardHandler();

      // Stop old connection health check
      stopConnectionHealthCheck();
    }

    // Reset all state variables
    isSyncActive = true;
    currentMode = payload.mode;
    currentTabId = payload.currentTabId;
    isManualScrollEnabled = false;
    lastScrollTime = 0;
    lastProgrammaticScrollTime = 0;
    isConnectionHealthy = true;

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

    // Start connection health monitoring
    startConnectionHealthCheck();
    lastSuccessfulSync = Date.now();

    logger.info('Content script sync initialization complete');
    return { success: true, tabId: currentTabId };
  });

  // Listen for stop sync message
  onMessage('scroll:stop', ({ data }) => {
    logger.info('Stopping scroll sync', { data });
    isSyncActive = false;

    // Stop connection health check
    stopConnectionHealthCheck();

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

    // Update last successful sync time for connection health monitoring
    lastSuccessfulSync = Date.now();

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

    // Load manual scroll offset ratio for this tab
    const offsetRatio = await getManualScrollOffset(currentTabId);

    // Apply offset ratio to source ratio to get target ratio for this tab
    const targetRatio = sourceRatio + offsetRatio;

    // Convert target ratio to pixel position for this document
    const targetScrollTop = targetRatio * myMaxScroll;

    // Clamp to valid range [0, myMaxScroll]
    const clampedScrollTop = Math.max(0, Math.min(myMaxScroll, targetScrollTop));

    logger.debug('Applying scroll with offset ratio', {
      sourceRatio,
      offsetRatio,
      targetRatio,
      targetScrollTop,
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
      // Ratio-based sync (P0) with ratio offset
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

    // When manual mode is deactivated, the saved offset will be applied on the next scroll:sync
    // We do NOT programmatically scroll here to avoid jarring movements
    // The tab will smoothly sync to the correct position (with offset) when other tabs scroll
    if (!payload.enabled) {
      logger.info('Manual mode deactivated, offset will be applied on next sync', {
        lastSyncedRatio,
        currentTabId,
      });
    }
  });

  // Listen for sync baseline updates (P1)
  // When a tab finishes manual adjustment, it broadcasts the new baseline ratio
  // so all tabs update their lastSyncedRatio without actually scrolling
  onMessage('scroll:baseline-update', ({ data }) => {
    if (!isSyncActive) return;

    const payload = data as { sourceTabId: number; baselineRatio: number; timestamp: number };

    // Don't update if this is the source tab
    if (payload.sourceTabId === currentTabId) return;

    logger.info('Updating sync baseline ratio', {
      oldRatio: lastSyncedRatio,
      newRatio: payload.baselineRatio,
      sourceTabId: payload.sourceTabId,
    });

    // Update lastSyncedRatio WITHOUT scrolling
    // This prevents jumps when the source tab starts scrolling again
    lastSyncedRatio = payload.baselineRatio;
  });

  // Listen for URL sync from other tabs (P1)
  onMessage('url:sync', async ({ data }) => {
    if (!isSyncActive) return;

    const payload = data as { url: string; sourceTabId: number };

    // Don't navigate if this is the source tab
    if (payload.sourceTabId === currentTabId) return;

    // Check if URL sync is enabled
    const urlSyncEnabled = await loadUrlSyncEnabled();
    if (!urlSyncEnabled) {
      logger.debug('URL sync is disabled, ignoring navigation request');
      return;
    }

    logger.info('Navigating to synced URL', { url: payload.url, sourceTabId: payload.sourceTabId });

    try {
      // Parse URLs to preserve target's query parameters and hash fragment
      const sourceUrl = new URL(payload.url);
      const targetUrl = new URL(window.location.href);

      // Build new URL: source's base (origin + pathname) + target's query + target's hash
      const newBase = `${sourceUrl.origin}${sourceUrl.pathname}`;
      const finalUrl = newBase + targetUrl.search + targetUrl.hash;

      logger.debug('URL sync with query and hash preservation', {
        sourceUrl: payload.url,
        targetSearch: targetUrl.search,
        targetHash: targetUrl.hash,
        finalUrl,
      });

      // Navigate to the new URL with preserved query and hash
      window.location.href = finalUrl;
    } catch (error) {
      // Fallback: use source URL as-is if parsing fails
      logger.warn('Failed to parse URL for query/hash preservation, using source URL directly', {
        error,
      });
      window.location.href = payload.url;
    }
  });

  logger.info('Scroll sync initialized');
}
