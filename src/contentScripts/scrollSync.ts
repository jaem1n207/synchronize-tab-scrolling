/**
 * Scroll synchronization logic for content scripts
 * Implements P0: Basic Scroll Synchronization (<100ms delay)
 * Implements P1: Element-Based Synchronization Mode
 * Implements P1: Manual Adjustment Controls
 * Implements P1: URL Navigation Synchronization
 */

import { onMessage, sendMessage } from 'webext-bridge/content-script';
import * as Browser from 'webextension-polyfill';

import { ExtensionLogger } from '~/shared/lib/logger';

import type { SyncMode } from '~/shared/types/messages';

const logger = new ExtensionLogger({ scope: 'scroll-sync' });

// Sync state
let isSyncActive = false;
let currentMode: SyncMode = 'ratio';
let isManualScrollEnabled = false;
let lastScrollTime = 0;
let lastNavigationUrl = window.location.href;
const THROTTLE_DELAY = 50; // ms - ensures <100ms sync delay

// URL monitoring
let urlObserver: MutationObserver | null = null;
let popstateHandler: (() => void) | null = null;

// Get current tab ID
let currentTabId = 0;
Browser.tabs
  .getCurrent()
  .then((tab) => {
    if (tab?.id) {
      currentTabId = tab.id;
    }
  })
  .catch(() => {
    // Ignore error in content script context
  });

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
 * Set scroll position by ratio (P0: Ratio-based synchronization)
 */
function setScrollByRatio(ratio: number) {
  const { scrollHeight, clientHeight } = getScrollInfo();
  const maxScroll = scrollHeight - clientHeight;
  const targetScrollTop = Math.max(0, Math.min(maxScroll, ratio * maxScroll));

  window.scrollTo({
    top: targetScrollTop,
    behavior: 'auto', // Instant scroll for synchronization
  });
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
 * Scroll to element by index with ratio adjustment (P1)
 */
function scrollToElement(index: number, ratio: number) {
  const elements = findSemanticElements();
  if (index >= elements.length) {
    // Fallback to ratio-based
    setScrollByRatio(ratio);
    return;
  }

  const targetElement = elements[index];
  window.scrollTo({
    top: targetElement.scrollTop,
    behavior: 'auto',
  });
}

/**
 * Handle scroll event with throttling
 */
function handleScroll() {
  if (!isSyncActive || isManualScrollEnabled) return;

  const now = Date.now();
  if (now - lastScrollTime < THROTTLE_DELAY) return;
  lastScrollTime = now;

  const scrollInfo = getScrollInfo();

  const message = {
    ...scrollInfo,
    sourceTabId: currentTabId,
    mode: currentMode,
    timestamp: now,
  };

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
  // Listen for start sync message
  onMessage('scroll:start', ({ data }) => {
    logger.info('Starting scroll sync', { data });
    const payload = data as { tabIds: Array<number>; mode: SyncMode };
    isSyncActive = true;
    currentMode = payload.mode;

    // Add scroll listener
    window.addEventListener('scroll', handleScroll, { passive: true });

    // Start URL monitoring (P1)
    startUrlMonitoring();

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

    return { success: true, tabId: currentTabId };
  });

  // Listen for scroll sync from other tabs
  onMessage('scroll:sync', ({ data }) => {
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

    if (payload.mode === 'element') {
      // Element-based sync (P1)
      const nearest = findNearestElement();
      if (nearest) {
        scrollToElement(nearest.index, payload.scrollTop / payload.scrollHeight);
      } else {
        // Fallback to ratio
        setScrollByRatio(payload.scrollTop / (payload.scrollHeight - payload.clientHeight));
      }
    } else {
      // Ratio-based sync (P0)
      const ratio = payload.scrollTop / (payload.scrollHeight - payload.clientHeight);
      setScrollByRatio(ratio);
    }
  });

  // Listen for manual scroll toggle (P1)
  onMessage('scroll:manual', ({ data }) => {
    logger.info('Manual scroll mode toggled', { data });
    const payload = data as { tabId: number; enabled: boolean };
    isManualScrollEnabled = payload.enabled;
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
