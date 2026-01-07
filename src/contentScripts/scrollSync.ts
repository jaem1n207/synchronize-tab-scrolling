/**
 * Scroll synchronization logic for content scripts
 * Implements P0: Basic Scroll Synchronization (<100ms delay)
 * Implements P1: Element-Based Synchronization Mode
 * Implements P1: Manual Adjustment Controls
 * Implements P1: URL Navigation Synchronization
 */

import { onMessage, sendMessage } from 'webext-bridge/content-script';

import { applyLocalePreservingSync } from '~/shared/lib/locale-utils';
import { ExtensionLogger } from '~/shared/lib/logger';
import { throttleAndDebounce } from '~/shared/lib/performance-utils';
import {
  clearManualScrollOffset,
  getManualScrollOffset,
  loadUrlSyncEnabled,
  saveManualScrollOffset,
} from '~/shared/lib/storage';
import type { SyncMode, SyncSuggestionMessage, AddTabToSyncMessage } from '~/shared/types/messages';

import { cleanupKeyboardHandler, initKeyboardHandler } from './keyboardHandler';
import { destroyPanel, hidePanel, showPanel } from './panel';
import {
  showSyncSuggestionToast,
  showAddTabSuggestionToast,
  hideSuggestionToasts,
} from './suggestionToast';

const logger = new ExtensionLogger({ scope: 'scroll-sync' });

// Sync state
let isSyncActive = false;
let isAutoSyncActive = false; // Track if current sync is from auto-sync feature
let currentMode: SyncMode = 'ratio';
let isManualScrollEnabled = false;
let lastNavigationUrl = window.location.href;
let lastSyncedRatio = 0; // Track the last synced ratio for offset calculation
let lastSyncedRatioSnapshot = 0; // Frozen snapshot when entering manual mode
let lastProgrammaticScrollTime = 0; // Track programmatic scrolls to prevent infinite loops
const THROTTLE_DELAY = 50; // ms - ensures <100ms sync delay
const PROGRAMMATIC_SCROLL_GRACE_PERIOD = 100; // ms - ignore user scrolls shortly after programmatic scroll

// Wheel-based manual mode for unfocused tabs (detects Alt/Option via WheelEvent.altKey)
let wheelManualModeActive = false;
let wheelBaselineSnapshot = 0;

// Mousemove handler for detecting Alt release during wheel manual mode
let wheelModeMouseMoveHandler: ((e: MouseEvent) => void) | null = null;
let lastMouseMoveCheckTime = 0;
const MOUSEMOVE_THROTTLE = 50; // ms - performance optimization

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

// Visibility change handler for idle tab reconnection
let visibilityChangeHandler: (() => void) | null = null;
let isReconnecting = false; // Prevent duplicate reconnection attempts

// Reconnection retry mechanism
const MAX_RECONNECTION_ATTEMPTS = 3;
const RECONNECTION_BACKOFF_MS = [500, 1000, 2000]; // Exponential backoff delays

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
 * Cleanup mousemove listener for wheel manual mode
 */
function cleanupWheelModeMouseMoveListener() {
  if (wheelModeMouseMoveHandler) {
    window.removeEventListener('mousemove', wheelModeMouseMoveHandler);
    wheelModeMouseMoveHandler = null;
  }
}

/**
 * Exit wheel manual mode: save offset and cleanup
 */
async function exitWheelManualMode() {
  if (!wheelManualModeActive) return;

  // Calculate and save offset
  const currentRatio = getScrollRatio();
  const offsetRatio = currentRatio - wheelBaselineSnapshot;

  // Clamp offset to reasonable range (±50% of document)
  const maxReasonableOffset = 0.5;
  const clampedOffsetRatio = Math.max(
    -maxReasonableOffset,
    Math.min(maxReasonableOffset, offsetRatio),
  );

  // Calculate pixel offset for display
  const { scrollHeight, clientHeight } = getScrollInfo();
  const maxScroll = scrollHeight - clientHeight;
  const offsetPixels = Math.round(clampedOffsetRatio * maxScroll);

  logger.debug('Wheel manual mode exiting, saving offset', {
    currentRatio,
    wheelBaselineSnapshot,
    offsetRatio,
    clampedOffsetRatio,
    offsetPixels,
  });

  // Save offset to storage
  await saveManualScrollOffset(currentTabId, clampedOffsetRatio, offsetPixels);

  logger.info('Wheel manual scroll offset saved', {
    tabId: currentTabId,
    offsetRatio: clampedOffsetRatio,
    offsetPixels,
  });

  // Reset state
  wheelManualModeActive = false;
  isManualScrollEnabled = false;

  // Remove mousemove listener
  cleanupWheelModeMouseMoveListener();
}

/**
 * Handle mousemove to detect Alt release during wheel manual mode
 * Uses throttling for performance optimization
 */
function handleMouseMoveForWheelMode(event: MouseEvent) {
  if (!wheelManualModeActive) return;

  // Throttle: check only every MOUSEMOVE_THROTTLE ms (performance optimization)
  const now = Date.now();
  if (now - lastMouseMoveCheckTime < MOUSEMOVE_THROTTLE) return;
  lastMouseMoveCheckTime = now;

  const isModifierPressed = event.altKey || event.metaKey;

  // If Alt/Meta was released, exit wheel manual mode
  if (!isModifierPressed) {
    logger.debug('Alt release detected via mousemove, exiting wheel manual mode');
    exitWheelManualMode();
  }
}

/**
 * Handle wheel events to detect modifier keys for unfocused tab manual scroll
 * This enables manual scroll adjustment even when the tab doesn't have keyboard focus
 * (e.g., in Arc browser's split view where user holds Alt in focused tab A,
 * then scrolls with mouse wheel in unfocused tab B)
 */
async function handleWheel(event: WheelEvent) {
  if (!isSyncActive) return;

  const isModifierPressed = event.altKey || event.metaKey;

  // Enter wheel manual mode: modifier key pressed + not already in any manual mode
  if (isModifierPressed && !wheelManualModeActive && !isManualScrollEnabled) {
    wheelManualModeActive = true;
    wheelBaselineSnapshot = lastSyncedRatio;
    isManualScrollEnabled = true; // Prevent scroll:sync from overwriting position

    // Add mousemove listener to detect Alt release (performance: only when in wheel manual mode)
    wheelModeMouseMoveHandler = handleMouseMoveForWheelMode;
    window.addEventListener('mousemove', wheelModeMouseMoveHandler, { passive: true });

    logger.debug('Wheel manual mode entered via WheelEvent modifier detection', {
      wheelBaselineSnapshot,
      altKey: event.altKey,
      metaKey: event.metaKey,
    });
  }

  // Exit wheel manual mode: modifier key released while in wheel manual mode
  if (!isModifierPressed && wheelManualModeActive) {
    await exitWheelManualMode();
  }
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
 * Core scroll handler logic (without throttling)
 * Throttling is handled by the wrapper function
 */
async function handleScrollCore() {
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

  const scrollInfo = getScrollInfo();

  // Remove offset ratio from current ratio before broadcasting
  // This ensures we send the "pure" scroll ratio without offset applied
  const offsetData = await getManualScrollOffset(currentTabId);
  const myMaxScroll = scrollInfo.scrollHeight - scrollInfo.clientHeight;

  // Calculate current scroll ratio
  const currentRatio = myMaxScroll > 0 ? scrollInfo.scrollTop / myMaxScroll : 0;

  // Calculate pure ratio by removing this tab's offset
  const pureRatio = currentRatio - offsetData.ratio;

  // Update lastSyncedRatio to track the pure baseline we're broadcasting
  // This ensures manual mode snapshots an accurate baseline even when this tab is the active scroller
  lastSyncedRatio = pureRatio;

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
    offsetRatio: offsetData.ratio,
    pureRatio,
    pureScrollTop,
  });

  // Broadcast to other tabs via background script
  sendMessage('scroll:sync', message, 'background').catch((error) => {
    logger.error('Failed to send scroll sync message', { error });
    // Message failure indicates connection problem - trigger reconnection
    if (!isReconnecting) {
      logger.info('Initiating reconnection due to scroll sync message failure');
      requestReconnection();
    }
  });
}

/**
 * Throttled and debounced scroll handler
 * - First call: immediate execution for responsiveness
 * - Subsequent calls: throttled for performance
 * - Final call: guaranteed via debounce for accuracy (ensures final position sync)
 */
const handleScroll = throttleAndDebounce(handleScrollCore, THROTTLE_DELAY);

/**
 * Broadcast URL change to other tabs (P1)
 */
async function broadcastUrlChange(url: string) {
  logger.info('URL changed, broadcasting to other tabs', { url });

  // Clear manual scroll offset when navigating to a new page (source tab)
  // Only clear if URL sync is enabled - old offset values won't be useful on a new page
  const urlSyncEnabled = await loadUrlSyncEnabled();
  if (urlSyncEnabled) {
    await clearManualScrollOffset(currentTabId);
    logger.debug('Cleared manual scroll offset on URL change (source tab)', { currentTabId });
  }

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
 * Dispatch connection status event via CustomEvent
 * This is used for same-page communication to the panel component
 * (sendMessage to 'content-script' context doesn't work reliably in MV3)
 */
function dispatchConnectionStatusEvent(isConnected: boolean) {
  window.dispatchEvent(
    new CustomEvent('scroll-sync-connection-status', {
      detail: { isConnected, tabId: currentTabId },
    }),
  );
}

/**
 * Show reconnection prompt to user
 */
function showReconnectionPrompt() {
  logger.info('Connection lost, notifying panel');
  dispatchConnectionStatusEvent(false);
}

/**
 * Hide reconnection prompt
 */
function hideReconnectionPrompt() {
  logger.info('Connection restored, notifying panel');
  dispatchConnectionStatusEvent(true);
}

/**
 * Request content script re-injection from background
 * Called when all reconnection attempts fail
 */
async function requestContentScriptReinject(): Promise<void> {
  logger.info('Requesting content script re-injection', { tabId: currentTabId });
  try {
    await sendMessage('scroll:request-reinject', { tabId: currentTabId }, 'background');
  } catch (error) {
    logger.error('Failed to request reinject', { error });
  }
}

/**
 * Request reconnection from background script
 * Called when tab becomes visible after being idle/suspended
 * Implements retry mechanism with exponential backoff
 */
async function requestReconnection(attemptNumber = 0): Promise<boolean> {
  // Only check isReconnecting for the first attempt
  if (isReconnecting && attemptNumber === 0) {
    logger.debug('Reconnection already in progress, skipping');
    return false;
  }

  if (!isSyncActive || !currentTabId) {
    logger.debug('Sync not active or no tab ID, skipping reconnection');
    return false;
  }

  // Check if max attempts reached
  if (attemptNumber >= MAX_RECONNECTION_ATTEMPTS) {
    logger.warn('All reconnection attempts failed, requesting content script re-injection', {
      attempts: attemptNumber,
    });
    isReconnecting = false;
    await requestContentScriptReinject();
    return false;
  }

  isReconnecting = true;
  logger.info('Requesting reconnection', {
    currentTabId,
    attemptNumber,
    maxAttempts: MAX_RECONNECTION_ATTEMPTS,
  });

  try {
    // Send reconnection request to background script
    const response = await sendMessage(
      'scroll:reconnect',
      { tabId: currentTabId, timestamp: Date.now() },
      'background',
    );

    if (response && (response as { success: boolean }).success) {
      logger.info('Reconnection successful', { attemptNumber });
      lastSuccessfulSync = Date.now();
      isConnectionHealthy = true;
      hideReconnectionPrompt();
      isReconnecting = false;
      return true;
    } else {
      logger.warn('Reconnection attempt failed', { attemptNumber, response });
    }
  } catch (error) {
    logger.warn('Reconnection attempt error', { attemptNumber, error });
  }

  // Wait with exponential backoff before retry
  const backoffMs = RECONNECTION_BACKOFF_MS[attemptNumber] || 2000;
  logger.debug('Waiting before next reconnection attempt', {
    backoffMs,
    nextAttempt: attemptNumber + 1,
  });
  await new Promise((resolve) => setTimeout(resolve, backoffMs));

  // Recursive retry
  isReconnecting = false;
  return requestReconnection(attemptNumber + 1);
}

/**
 * Handle visibility change event
 * Triggered when tab becomes visible after being hidden/idle
 */
function handleVisibilityChange() {
  if (document.visibilityState === 'visible' && isSyncActive) {
    logger.info('Tab became visible while sync active, checking connection health');

    const timeSinceLastSync = Date.now() - lastSuccessfulSync;

    // If it's been a while since last sync, proactively request reconnection
    // This handles cases where the tab was suspended/discarded by the browser
    if (timeSinceLastSync > CONNECTION_TIMEOUT_THRESHOLD) {
      logger.info('Connection likely stale after visibility change, requesting reconnection', {
        timeSinceLastSync,
        threshold: CONNECTION_TIMEOUT_THRESHOLD,
      });
      requestReconnection();
    } else {
      // Even if within threshold, send a ping to verify connection is alive
      // The content script itself may have been reloaded
      sendMessage('scroll:ping', { tabId: currentTabId, timestamp: Date.now() }, 'background')
        .then(() => {
          logger.debug('Connection verified after visibility change');
          lastSuccessfulSync = Date.now();
        })
        .catch((error) => {
          logger.warn('Connection verification failed, requesting reconnection', { error });
          requestReconnection();
        });
    }
  }
}

/**
 * Start visibility change monitoring for idle tab reconnection
 */
function startVisibilityChangeMonitoring() {
  // Remove any existing handler
  stopVisibilityChangeMonitoring();

  visibilityChangeHandler = handleVisibilityChange;
  document.addEventListener('visibilitychange', visibilityChangeHandler);
  logger.info('Visibility change monitoring started');
}

/**
 * Stop visibility change monitoring
 */
function stopVisibilityChangeMonitoring() {
  if (visibilityChangeHandler) {
    document.removeEventListener('visibilitychange', visibilityChangeHandler);
    visibilityChangeHandler = null;
    logger.info('Visibility change monitoring stopped');
  }
}

/**
 * Initialize scroll sync system
 */
export function initScrollSync() {
  // Listen for start sync message
  onMessage('scroll:start', async ({ data }) => {
    const payload = data as {
      tabIds: Array<number>;
      mode: SyncMode;
      currentTabId: number;
      isAutoSync?: boolean;
    };

    // Hide any pending suggestion toasts since sync is starting
    hideSuggestionToasts();

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

      // Destroy existing panel to ensure clean re-initialization
      destroyPanel();
    }

    // Detect re-injection scenario: module was reloaded but DOM elements remain
    // This handles cases where content script was re-injected and module state was reset
    const existingPanels = document.querySelectorAll('#scroll-sync-panel-root');
    if (existingPanels.length > 0) {
      logger.info('Detected orphaned panel elements (likely re-injection), cleaning up', {
        count: existingPanels.length,
      });
      existingPanels.forEach((panel) => panel.remove());
    }

    // Reset all state variables
    isSyncActive = true;
    isAutoSyncActive = payload.isAutoSync ?? false;
    currentMode = payload.mode;
    currentTabId = payload.currentTabId;
    isManualScrollEnabled = false;
    lastProgrammaticScrollTime = 0;
    isConnectionHealthy = true;

    // Reset mousemove state for wheel manual mode
    lastMouseMoveCheckTime = 0;
    cleanupWheelModeMouseMoveListener();

    // Initialize lastSyncedRatio with current scroll position to prevent offset calculation errors
    lastSyncedRatio = getScrollRatio();

    logger.info(`Sync activated for tab ${currentTabId}`, {
      mode: currentMode,
      initialRatio: lastSyncedRatio,
    });

    // Add scroll listener
    window.addEventListener('scroll', handleScroll, { passive: true });
    logger.debug('Scroll listener added');

    // Add wheel listener for unfocused tab manual scroll detection
    // This allows detecting Alt/Option key via WheelEvent.altKey even when tab doesn't have focus
    window.addEventListener('wheel', handleWheel, { passive: true });
    logger.debug('Wheel listener added for unfocused tab manual scroll support');

    // Start URL monitoring (P1)
    startUrlMonitoring();

    // Initialize keyboard handler with tab ID and scroll info callback
    initKeyboardHandler(currentTabId, () => ({
      currentScrollTop: window.scrollY,
      lastSyncedRatio: lastSyncedRatio, // Return live value for synchronous snapshot
      setManualModeActive: (active: boolean) => {
        // Set flag SYNCHRONOUSLY to prevent race condition with scroll:sync messages
        isManualScrollEnabled = active;
        logger.debug('Manual mode flag set synchronously via callback', { active });
      },
    }));
    logger.debug('Keyboard handler initialized');

    // Show draggable control panel
    showPanel();
    logger.debug('Panel shown');

    // Start connection health monitoring
    startConnectionHealthCheck();
    lastSuccessfulSync = Date.now();

    // Start visibility change monitoring for idle tab reconnection
    startVisibilityChangeMonitoring();

    return { success: true, tabId: currentTabId };
  });

  // Listen for stop sync message
  onMessage('scroll:stop', async ({ data }) => {
    const payload = data as { isAutoSync?: boolean };
    logger.info('Stopping scroll sync', { data, isAutoSync: payload.isAutoSync });

    // Auto-sync stop should only stop auto-sync (not interfere with manual sync)
    // But manual stop (from popup) should work regardless of sync type
    if (payload.isAutoSync && !isAutoSyncActive) {
      logger.debug('Ignoring auto-sync stop - current sync is manual');
      return { success: false, reason: 'Not in auto-sync mode' };
    }
    // Note: Manual stop (without isAutoSync flag) now works for both sync types
    // This allows users to stop sync from popup even when auto-sync is active

    isSyncActive = false;
    isAutoSyncActive = false;

    // Stop connection health check
    stopConnectionHealthCheck();

    // Stop visibility change monitoring
    stopVisibilityChangeMonitoring();

    // Remove scroll listener
    window.removeEventListener('scroll', handleScroll);

    // Remove wheel listener
    window.removeEventListener('wheel', handleWheel);

    // Reset wheel manual mode state
    wheelManualModeActive = false;
    wheelBaselineSnapshot = 0;
    lastMouseMoveCheckTime = 0;
    cleanupWheelModeMouseMoveListener();

    // Stop URL monitoring (P1)
    stopUrlMonitoring();

    // Cleanup keyboard handler
    cleanupKeyboardHandler();

    // Clear manual scroll offset for this tab when stopping sync
    await clearManualScrollOffset(currentTabId);
    logger.info('Cleared manual scroll offset on sync stop', { currentTabId });

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

    // If in manual mode, ignore sync messages completely (baseline is frozen)
    if (isManualScrollEnabled) {
      logger.debug('Manual mode active, ignoring sync to preserve frozen baseline', {
        sourceRatio,
        frozenBaseline: lastSyncedRatioSnapshot,
      });
      return;
    }

    // Get my document dimensions
    const myScrollInfo = getScrollInfo();
    const myMaxScroll = myScrollInfo.scrollHeight - myScrollInfo.clientHeight;

    // Load manual scroll offset ratio for this tab
    const offsetData = await getManualScrollOffset(currentTabId);

    // Apply offset ratio to source ratio to get target ratio for this tab
    const targetRatio = sourceRatio + offsetData.ratio;

    // Update lastSyncedRatio to the SOURCE ratio (pure baseline without offsets)
    // This ensures manual offset calculations always use a consistent baseline
    lastSyncedRatio = sourceRatio;

    // Convert target ratio to pixel position for this document
    const targetScrollTop = targetRatio * myMaxScroll;

    // Clamp to valid range [0, myMaxScroll]
    const clampedScrollTop = Math.max(0, Math.min(myMaxScroll, targetScrollTop));

    logger.debug('Applying scroll with offset ratio', {
      sourceRatio,
      offsetRatio: offsetData.ratio,
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
    // logger.info('Manual scroll mode toggled', { data });
    const payload = data as { tabId: number; enabled: boolean };

    // Only apply to this specific tab
    if (payload.tabId !== currentTabId) {
      return;
    }

    // Snapshot baseline ratio when ENTERING manual mode
    if (payload.enabled) {
      lastSyncedRatioSnapshot = lastSyncedRatio;
      logger.debug('Manual mode activated, snapshotted baseline', {
        lastSyncedRatio,
        lastSyncedRatioSnapshot,
        currentTabId,
      });
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

  // Listen for ping from background to verify content script is alive
  onMessage('scroll:ping', async ({ data }) => {
    const payload = data as { tabId: number; timestamp: number };
    logger.debug('Received ping from background', { payload, isSyncActive, currentTabId });
    return { success: true, tabId: currentTabId, timestamp: Date.now(), isSyncActive };
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

    // Clear manual scroll offset before navigating to new page
    // Old offset values won't be useful on a new page
    await clearManualScrollOffset(currentTabId);
    logger.debug('Cleared manual scroll offset before URL navigation', { currentTabId });

    try {
      // Apply locale-preserving URL sync
      // Preserves target tab's locale code while syncing path changes
      const finalUrl = applyLocalePreservingSync(payload.url, window.location.href);

      logger.debug('URL sync with locale and query/hash preservation', {
        sourceUrl: payload.url,
        targetUrl: window.location.href,
        finalUrl,
      });

      // Navigate to the new URL with preserved locale, query, and hash
      window.location.href = finalUrl;
    } catch (error) {
      // Fallback: use source URL as-is if locale-aware sync fails
      logger.warn('Locale-aware URL sync failed, using source URL directly', {
        error,
      });
      window.location.href = payload.url;
    }
  });

  // Listen for auto-sync status changes from background
  onMessage('auto-sync:status-changed', async ({ data }) => {
    const payload = data as { enabled: boolean };
    logger.info('Auto-sync status changed', { enabled: payload.enabled });
    // This is informational - actual sync start/stop is handled by scroll:start/stop
  });

  // Listen for auto-sync group updates from background
  onMessage('auto-sync:group-updated', async ({ data }) => {
    const payload = data as {
      groups: Array<{
        normalizedUrl: string;
        tabIds: Array<number>;
        isActive: boolean;
      }>;
    };
    logger.debug('Auto-sync groups updated', { groupCount: payload.groups.length });
    // This is informational for UI updates - sync control handled by scroll:start/stop
  });

  // Listen for sync suggestion toast from background (auto-sync suggestion-based flow)
  onMessage('sync-suggestion:show', async ({ data }) => {
    const payload = data as unknown as SyncSuggestionMessage;
    logger.info('Showing sync suggestion toast', {
      normalizedUrl: payload.normalizedUrl,
      tabCount: payload.tabCount,
    });
    showSyncSuggestionToast(payload);
    return { success: true };
  });

  // Listen for add tab to sync suggestion from background
  onMessage('sync-suggestion:add-tab', async ({ data }) => {
    const payload = data as unknown as AddTabToSyncMessage;
    logger.info('Showing add tab suggestion toast', {
      tabId: payload.tabId,
      tabTitle: payload.tabTitle,
    });
    showAddTabSuggestionToast(payload);
    return { success: true };
  });
}

/**
 * Get current auto-sync status
 */
export function getAutoSyncStatus(): { isActive: boolean; isAutoSync: boolean } {
  return {
    isActive: isSyncActive,
    isAutoSync: isAutoSyncActive,
  };
}
