/**
 * Scroll synchronization logic for content scripts
 * Implements P0: Basic Scroll Synchronization (<100ms delay)
 * Implements P1: Element-Based Synchronization Mode
 * Implements P1: Manual Adjustment Controls
 * Implements P1: URL Navigation Synchronization
 */

import { onMessage, sendMessage } from 'webext-bridge/content-script';

import { ExtensionLogger } from '~/shared/lib/logger';
import { throttleAndDebounce } from '~/shared/lib/performance-utils';
import {
  calculateScrollRatio,
  clampScrollOffset,
  clampScrollPosition,
  findNearestIndex,
} from '~/shared/lib/scroll-math';
import {
  clearManualScrollOffset,
  getManualScrollOffset,
  loadUrlSyncEnabled,
  repairUrlSyncMode,
  saveManualScrollOffset,
  type ManualScrollOffset,
} from '~/shared/lib/storage';
import { resolveUrlSyncTarget } from '~/shared/lib/translated-page-url-utils';
import type { ContextualHintScrollMetrics } from '~/shared/types/contextual-hints';
import type {
  UrlSyncMode,
  UrlSyncNotice,
  UrlSyncPanelNoticeEventDetail,
} from '~/shared/types/url-sync';

import { cleanupKeyboardHandler, initKeyboardHandler } from './keyboard-handler';
import {
  applyInstantProgrammaticScroll,
  createLatestProgrammaticScrollScheduler,
  type ProgrammaticScrollTarget,
} from './lib/instant-programmatic-scroll';
import {
  createInitialSyncState,
  createInitialWheelModeState,
  createInitialConnectionState,
  createInitialUrlMonitorState,
  THROTTLE_DELAY,
  PROGRAMMATIC_SCROLL_GRACE_PERIOD,
  MOUSEMOVE_THROTTLE,
  CONNECTION_CHECK_INTERVAL,
  CONNECTION_TIMEOUT_THRESHOLD,
  MAX_RECONNECTION_ATTEMPTS,
  RECONNECTION_BACKOFF_MS,
} from './lib/scroll-sync-state';
import { collectTranslatedPageMetadata } from './lib/translated-page-metadata';
import { destroyPanel, hidePanel, showPanel } from './panel';
import {
  showSyncSuggestionToast,
  showAddTabSuggestionToast,
  showContextualHintToast,
  hideSuggestionToasts,
} from './suggestion-toast';

const logger = new ExtensionLogger({ scope: 'scroll-sync' });

const syncState = createInitialSyncState();
const wheelState = createInitialWheelModeState();
const connectionState = createInitialConnectionState();
const urlMonitorState = createInitialUrlMonitorState();

let cachedManualOffset: ManualScrollOffset = { ratio: 0, pixels: 0 };

const programmaticScrollScheduler = createLatestProgrammaticScrollScheduler({
  requestFrame: (callback) => window.requestAnimationFrame(callback),
  cancelFrame: (frameId) => window.cancelAnimationFrame(frameId),
  apply: applyScheduledProgrammaticScroll,
});

function applyScheduledProgrammaticScroll(target: ProgrammaticScrollTarget): void {
  if (!syncState.isActive || syncState.isManualScrollEnabled) {
    return;
  }

  if (!Number.isFinite(target.top)) {
    logger.debug('Skipping scheduled scroll sync with non-finite target', {
      sourceTabId: target.sourceTabId,
      mode: target.mode,
      applied: false,
    });
    return;
  }

  syncState.lastSyncedRatio = target.sourceRatio;
  syncState.lastProgrammaticScrollTime = Date.now();
  const applied = applyInstantProgrammaticScroll(target.top);

  logger.debug('Applied scheduled scroll sync', {
    sourceTabId: target.sourceTabId,
    mode: target.mode,
    applied,
  });
}

function scheduleProgrammaticScroll(target: ProgrammaticScrollTarget): void {
  programmaticScrollScheduler.schedule(target);
}

function cancelPendingProgrammaticScroll(): void {
  programmaticScrollScheduler.cancel();
}

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

function getContextualHintScrollMetrics(tabId: number): ContextualHintScrollMetrics {
  const { scrollHeight, clientHeight } = getScrollInfo();

  return {
    tabId,
    scrollHeight,
    clientHeight,
    scrollableHeight: Math.max(0, scrollHeight - clientHeight),
  };
}

/**
 * Calculate scroll ratio (0 to 1)
 */
function getScrollRatio(): number {
  const { scrollTop, scrollHeight, clientHeight } = getScrollInfo();
  return calculateScrollRatio(scrollTop, scrollHeight, clientHeight);
}

/**
 * Cleanup mousemove listener for wheel manual mode
 */
function cleanupWheelModeMouseMoveListener() {
  if (wheelState.mouseMoveHandler) {
    window.removeEventListener('mousemove', wheelState.mouseMoveHandler);
    wheelState.mouseMoveHandler = null;
  }
}

/**
 * Exit wheel manual mode: save offset and cleanup
 */
async function exitWheelManualMode() {
  if (!wheelState.isActive) return;

  // Calculate and save offset
  const currentRatio = getScrollRatio();
  const offsetRatio = currentRatio - wheelState.baselineSnapshot;

  const clampedOffsetRatio = clampScrollOffset(offsetRatio);

  // Calculate pixel offset for display
  const { scrollHeight, clientHeight } = getScrollInfo();
  const maxScroll = scrollHeight - clientHeight;
  const offsetPixels = Math.round(clampedOffsetRatio * maxScroll);

  logger.debug('Wheel manual mode exiting, saving offset', {
    currentRatio,
    wheelBaselineSnapshot: wheelState.baselineSnapshot,
    offsetRatio,
    clampedOffsetRatio,
    offsetPixels,
  });

  await saveManualScrollOffset(syncState.tabId, clampedOffsetRatio, offsetPixels);
  cachedManualOffset = { ratio: clampedOffsetRatio, pixels: offsetPixels };

  logger.info('Wheel manual scroll offset saved', {
    tabId: syncState.tabId,
    offsetRatio: clampedOffsetRatio,
    offsetPixels,
  });

  // Reset state
  wheelState.isActive = false;
  syncState.isManualScrollEnabled = false;

  // Remove mousemove listener
  cleanupWheelModeMouseMoveListener();
}

/**
 * Handle mousemove to detect Alt release during wheel manual mode
 * Uses throttling for performance optimization
 */
function handleMouseMoveForWheelMode(event: MouseEvent) {
  if (!wheelState.isActive) return;

  // Throttle: check only every MOUSEMOVE_THROTTLE ms (performance optimization)
  const now = Date.now();
  if (now - wheelState.lastMouseMoveCheckTime < MOUSEMOVE_THROTTLE) return;
  wheelState.lastMouseMoveCheckTime = now;

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
  if (!syncState.isActive) return;

  const isModifierPressed = event.altKey || event.metaKey;

  // Enter wheel manual mode: modifier key pressed + not already in any manual mode
  if (isModifierPressed && !wheelState.isActive && !syncState.isManualScrollEnabled) {
    cancelPendingProgrammaticScroll();
    wheelState.isActive = true;
    wheelState.baselineSnapshot = syncState.lastSyncedRatio;
    syncState.isManualScrollEnabled = true; // Prevent scroll:sync from overwriting position

    // Add mousemove listener to detect Alt release (performance: only when in wheel manual mode)
    wheelState.mouseMoveHandler = handleMouseMoveForWheelMode;
    window.addEventListener('mousemove', wheelState.mouseMoveHandler, { passive: true });

    logger.debug('Wheel manual mode entered via WheelEvent modifier detection', {
      wheelBaselineSnapshot: wheelState.baselineSnapshot,
      altKey: event.altKey,
      metaKey: event.metaKey,
    });
  }

  // Exit wheel manual mode: modifier key released while in wheel manual mode
  if (!isModifierPressed && wheelState.isActive) {
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
  const idx = findNearestIndex(elements, window.scrollY);
  if (idx === -1) return null;

  return { index: idx, ratio: getScrollRatio() };
}

/**
 * Core scroll handler logic (without throttling)
 * Throttling is handled by the wrapper function
 */
async function handleScrollCore() {
  if (!syncState.isActive || syncState.isManualScrollEnabled) return;

  const now = Date.now();

  // Ignore scroll events that occur shortly after programmatic scrolls
  // This prevents infinite loops when tabs sync each other
  if (now - syncState.lastProgrammaticScrollTime < PROGRAMMATIC_SCROLL_GRACE_PERIOD) {
    logger.debug('Ignoring scroll event - programmatic scroll detected', {
      timeSinceProgrammatic: now - syncState.lastProgrammaticScrollTime,
    });
    return;
  }

  const scrollInfo = getScrollInfo();

  // Remove offset ratio from current ratio before broadcasting
  // This ensures we send the "pure" scroll ratio without offset applied
  const offsetData = cachedManualOffset;
  const myMaxScroll = scrollInfo.scrollHeight - scrollInfo.clientHeight;

  const currentRatio = calculateScrollRatio(
    scrollInfo.scrollTop,
    scrollInfo.scrollHeight,
    scrollInfo.clientHeight,
  );

  // Calculate pure ratio by removing this tab's offset
  const pureRatio = currentRatio - offsetData.ratio;

  // Update syncState.lastSyncedRatio to track the pure baseline we're broadcasting
  // This ensures manual mode snapshots an accurate baseline even when this tab is the active scroller
  syncState.lastSyncedRatio = pureRatio;

  const pureScrollTop = clampScrollPosition(pureRatio * myMaxScroll, myMaxScroll);

  const message = {
    scrollTop: pureScrollTop,
    scrollHeight: scrollInfo.scrollHeight,
    clientHeight: scrollInfo.clientHeight,
    sourceTabId: syncState.tabId,
    mode: syncState.mode,
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
    if (!connectionState.isReconnecting) {
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
  logger.info('URL changed, broadcasting to other tabs', { tabId: syncState.tabId });

  // Clear manual scroll offset when navigating to a new page (source tab)
  // Only clear if URL sync is enabled - old offset values won't be useful on a new page
  const urlSyncEnabled = await loadUrlSyncEnabled();
  if (urlSyncEnabled) {
    await clearManualScrollOffset(syncState.tabId);
    cachedManualOffset = { ratio: 0, pixels: 0 };
    logger.debug('Cleared manual scroll offset on URL change (source tab)', {
      tabId: syncState.tabId,
    });
  }

  sendMessage(
    'url:sync',
    {
      url,
      sourceTabId: syncState.tabId,
    },
    'background',
  ).catch((error) => {
    logger.error('Failed to send URL sync message', { error });
  });
}

function emitUrlSyncNotice(detail: UrlSyncPanelNoticeEventDetail) {
  window.dispatchEvent(
    new CustomEvent('scroll-sync-url-sync-notice', {
      detail,
    }),
  );
}

function createUrlSyncNoticeDetail(
  notice: UrlSyncNotice,
  mode?: UrlSyncMode,
): UrlSyncPanelNoticeEventDetail {
  if (mode) {
    return { mode, notice };
  }

  return { notice };
}

function navigateToUrl(url: string) {
  const jsdomRuntime = Reflect.get(globalThis, 'jsdom');
  if (jsdomRuntime && typeof jsdomRuntime === 'object') {
    const reconfigure = Reflect.get(jsdomRuntime, 'reconfigure');
    if (typeof reconfigure === 'function') {
      Reflect.apply(reconfigure, jsdomRuntime, [{ url }]);
      return;
    }
  }

  if (window.location.href !== url) {
    window.location.href = url;
    return;
  }
}

/**
 * Start URL monitoring (P1)
 */
function startUrlMonitoring() {
  // Stop any existing monitoring
  stopUrlMonitoring();

  syncState.lastNavigationUrl = window.location.href;

  // Use MutationObserver to detect URL changes (for SPA navigation)
  urlMonitorState.observer = new MutationObserver(() => {
    const currentUrl = window.location.href;
    if (currentUrl !== syncState.lastNavigationUrl) {
      syncState.lastNavigationUrl = currentUrl;
      broadcastUrlChange(currentUrl);
    }
  });

  urlMonitorState.observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Also listen for popstate events (browser back/forward)
  urlMonitorState.popstateHandler = () => {
    const currentUrl = window.location.href;
    if (currentUrl !== syncState.lastNavigationUrl) {
      syncState.lastNavigationUrl = currentUrl;
      broadcastUrlChange(currentUrl);
    }
  };

  window.addEventListener('popstate', urlMonitorState.popstateHandler);

  logger.info('URL monitoring started');
}

/**
 * Stop URL monitoring (P1)
 */
function stopUrlMonitoring() {
  if (urlMonitorState.observer) {
    urlMonitorState.observer.disconnect();
    urlMonitorState.observer = null;
  }

  if (urlMonitorState.popstateHandler) {
    window.removeEventListener('popstate', urlMonitorState.popstateHandler);
    urlMonitorState.popstateHandler = null;
  }

  logger.info('URL monitoring stopped');
}

/**
 * Start connection health monitoring
 */
function startConnectionHealthCheck() {
  // Clear any existing interval
  stopConnectionHealthCheck();

  connectionState.healthCheckInterval = window.setInterval(() => {
    const now = Date.now();
    const timeSinceLastSync = now - connectionState.lastSuccessfulSync;

    if (timeSinceLastSync > CONNECTION_TIMEOUT_THRESHOLD) {
      if (connectionState.isHealthy) {
        connectionState.isHealthy = false;
        logger.warn('Connection appears to be lost', {
          timeSinceLastSync,
          threshold: CONNECTION_TIMEOUT_THRESHOLD,
        });

        // Show reconnection UI
        showReconnectionPrompt();
      }
    } else {
      if (!connectionState.isHealthy) {
        connectionState.isHealthy = true;
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
  if (connectionState.healthCheckInterval) {
    clearInterval(connectionState.healthCheckInterval);
    connectionState.healthCheckInterval = null;
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
      detail: { isConnected, tabId: syncState.tabId },
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
  logger.info('Requesting content script re-injection', { tabId: syncState.tabId });
  try {
    await sendMessage('scroll:request-reinject', { tabId: syncState.tabId }, 'background');
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
  if (connectionState.isReconnecting && attemptNumber === 0) {
    logger.debug('Reconnection already in progress, skipping');
    return false;
  }

  if (!syncState.isActive || !syncState.tabId) {
    logger.debug('Sync not active or no tab ID, skipping reconnection');
    return false;
  }

  // Check if max attempts reached
  if (attemptNumber >= MAX_RECONNECTION_ATTEMPTS) {
    logger.warn('All reconnection attempts failed, requesting content script re-injection', {
      attempts: attemptNumber,
    });
    connectionState.isReconnecting = false;
    await requestContentScriptReinject();
    return false;
  }

  connectionState.isReconnecting = true;
  logger.info('Requesting reconnection', {
    tabId: syncState.tabId,
    attemptNumber,
    maxAttempts: MAX_RECONNECTION_ATTEMPTS,
  });

  try {
    // Send reconnection request to background script
    const response = await sendMessage(
      'scroll:reconnect',
      { tabId: syncState.tabId, timestamp: Date.now() },
      'background',
    );

    if (response && (response as { success: boolean }).success) {
      logger.info('Reconnection successful', { attemptNumber });
      connectionState.lastSuccessfulSync = Date.now();
      connectionState.isHealthy = true;
      hideReconnectionPrompt();
      connectionState.isReconnecting = false;
      return true;
    } else {
      logger.warn('Reconnection attempt failed', { attemptNumber });
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
  connectionState.isReconnecting = false;
  return requestReconnection(attemptNumber + 1);
}

/**
 * Handle visibility change event
 * Triggered when tab becomes visible after being hidden/idle
 */
function handleVisibilityChange() {
  if (document.visibilityState === 'visible' && syncState.isActive) {
    logger.info('Tab became visible while sync active, checking connection health');

    const timeSinceLastSync = Date.now() - connectionState.lastSuccessfulSync;

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
      sendMessage('scroll:ping', { tabId: syncState.tabId, timestamp: Date.now() }, 'background')
        .then(() => {
          logger.debug('Connection verified after visibility change');
          connectionState.lastSuccessfulSync = Date.now();
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

  connectionState.visibilityChangeHandler = handleVisibilityChange;
  document.addEventListener('visibilitychange', connectionState.visibilityChangeHandler);
  logger.info('Visibility change monitoring started');
}

/**
 * Stop visibility change monitoring
 */
function stopVisibilityChangeMonitoring() {
  if (connectionState.visibilityChangeHandler) {
    document.removeEventListener('visibilitychange', connectionState.visibilityChangeHandler);
    connectionState.visibilityChangeHandler = null;
    logger.info('Visibility change monitoring stopped');
  }
}

/**
 * Initialize scroll sync system
 */
export function initScrollSync() {
  onMessage('translated-page:get-metadata', () => {
    return collectTranslatedPageMetadata(window.location.href);
  });

  // Listen for start sync message
  onMessage('scroll:start', async ({ data }) => {
    const payload = data;

    // Hide any pending suggestion toasts since sync is starting
    hideSuggestionToasts();

    // Clean up any existing sync state before starting new sync
    // This is critical for re-sync scenarios where content script is already active
    if (syncState.isActive) {
      logger.info('Sync already active, cleaning up old state before re-initializing');

      cancelPendingProgrammaticScroll();

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
      existingPanels.forEach((panel) => {
        panel.remove();
      });
    }

    // Reset all state variables
    cancelPendingProgrammaticScroll();

    syncState.isActive = true;
    syncState.isAutoSync = payload.isAutoSync ?? false;
    syncState.mode = payload.mode;
    syncState.tabId = payload.currentTabId ?? 0;
    syncState.isManualScrollEnabled = false;
    syncState.lastProgrammaticScrollTime = 0;
    connectionState.isHealthy = true;

    // Reset mousemove state for wheel manual mode
    wheelState.lastMouseMoveCheckTime = 0;
    cleanupWheelModeMouseMoveListener();

    // Initialize lastSyncedRatio with current scroll position to prevent offset calculation errors
    syncState.lastSyncedRatio = getScrollRatio();

    logger.info(`Sync activated for tab ${syncState.tabId}`, {
      mode: syncState.mode,
      initialRatio: syncState.lastSyncedRatio,
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

    initKeyboardHandler(syncState.tabId, () => {
      // This callback exposes manual baselines, so discard pending receiver targets first.
      cancelPendingProgrammaticScroll();

      return {
        currentScrollTop: window.scrollY,
        lastSyncedRatio: syncState.lastSyncedRatio,
        setManualModeActive: (active: boolean) => {
          syncState.isManualScrollEnabled = active;
          logger.debug('Manual mode flag set synchronously via callback', { active });
        },
        updateOffsetCache: (ratio: number, pixels: number) => {
          cachedManualOffset = { ratio, pixels };
        },
      };
    });
    logger.debug('Keyboard handler initialized');

    // Show draggable control panel
    showPanel();
    logger.debug('Panel shown');

    cachedManualOffset = await getManualScrollOffset(syncState.tabId);

    // Start connection health monitoring
    startConnectionHealthCheck();
    connectionState.lastSuccessfulSync = Date.now();

    // Start visibility change monitoring for idle tab reconnection
    startVisibilityChangeMonitoring();

    return {
      success: true,
      tabId: syncState.tabId,
      metrics: getContextualHintScrollMetrics(syncState.tabId),
    };
  });

  // Listen for stop sync message
  onMessage('scroll:stop', async ({ data }) => {
    const payload = data;
    logger.info('Stopping scroll sync', {
      tabId: syncState.tabId,
      isAutoSync: payload.isAutoSync ?? false,
    });

    // Auto-sync stop should only stop auto-sync (not interfere with manual sync)
    // But manual stop (from popup) should work regardless of sync type
    if (payload.isAutoSync && !syncState.isAutoSync) {
      logger.debug('Ignoring auto-sync stop - current sync is manual');
      return { success: false, reason: 'Not in auto-sync mode' };
    }
    // Note: Manual stop (without isAutoSync flag) now works for both sync types
    // This allows users to stop sync from popup even when auto-sync is active

    cancelPendingProgrammaticScroll();

    syncState.isActive = false;
    syncState.isAutoSync = false;

    // Stop connection health check
    stopConnectionHealthCheck();

    // Stop visibility change monitoring
    stopVisibilityChangeMonitoring();

    // Remove scroll listener
    window.removeEventListener('scroll', handleScroll);

    // Remove wheel listener
    window.removeEventListener('wheel', handleWheel);

    // Reset wheel manual mode state
    wheelState.isActive = false;
    wheelState.baselineSnapshot = 0;
    wheelState.lastMouseMoveCheckTime = 0;
    cleanupWheelModeMouseMoveListener();

    // Stop URL monitoring (P1)
    stopUrlMonitoring();

    // Cleanup keyboard handler
    cleanupKeyboardHandler();

    await clearManualScrollOffset(syncState.tabId);
    cachedManualOffset = { ratio: 0, pixels: 0 };
    logger.info('Cleared manual scroll offset on sync stop', { tabId: syncState.tabId });

    // Hide draggable control panel
    hidePanel();

    return { success: true, tabId: syncState.tabId };
  });

  // Listen for scroll sync from other tabs
  onMessage('scroll:sync', async ({ data }) => {
    if (!syncState.isActive) return;

    const payload = data;

    // Don't sync if this is the source tab
    if (payload.sourceTabId === syncState.tabId) return;

    // Update last successful sync time for connection health monitoring
    connectionState.lastSuccessfulSync = Date.now();

    logger.debug('Receiving scroll sync', {
      sourceTabId: payload.sourceTabId,
      mode: payload.mode,
    });

    // Calculate the synced ratio from source tab
    const sourceRatio = payload.scrollTop / (payload.scrollHeight - payload.clientHeight);

    // If in manual mode, ignore sync messages completely (baseline is frozen)
    if (syncState.isManualScrollEnabled) {
      logger.debug('Manual mode active, ignoring sync to preserve frozen baseline', {
        sourceRatio,
        frozenBaseline: syncState.lastSyncedRatioSnapshot,
      });
      return;
    }

    // Get my document dimensions
    const myScrollInfo = getScrollInfo();
    const myMaxScroll = myScrollInfo.scrollHeight - myScrollInfo.clientHeight;

    const offsetData = cachedManualOffset;

    // Apply offset ratio to source ratio to get target ratio for this tab
    const targetRatio = sourceRatio + offsetData.ratio;

    // Convert target ratio to pixel position for this document
    const targetScrollTop = targetRatio * myMaxScroll;

    const clampedScrollTop = clampScrollPosition(targetScrollTop, myMaxScroll);

    logger.debug('Applying scroll with offset ratio', {
      sourceRatio,
      offsetRatio: offsetData.ratio,
      targetRatio,
      targetScrollTop,
      clampedScrollTop,
    });

    let nextScrollTop = clampedScrollTop;

    if (payload.mode === 'element') {
      // Element-based sync (P1) - not commonly used with manual offsets
      const nearest = findNearestElement();
      if (nearest) {
        const elements = findSemanticElements();
        if (nearest.index < elements.length) {
          nextScrollTop = elements[nearest.index].scrollTop;
        }
      }
    }

    scheduleProgrammaticScroll({
      top: nextScrollTop,
      sourceRatio,
      mode: payload.mode,
      sourceTabId: payload.sourceTabId,
    });
  });

  // Listen for manual scroll toggle (P1)
  onMessage('scroll:manual', async ({ data }) => {
    // logger.info('Manual scroll mode toggled', { data });
    const payload = data;

    // Only apply to this specific tab
    if (payload.tabId !== syncState.tabId) {
      return;
    }

    // Snapshot baseline ratio when ENTERING manual mode
    if (payload.enabled) {
      cancelPendingProgrammaticScroll();
      syncState.lastSyncedRatioSnapshot = syncState.lastSyncedRatio;
      logger.debug('Manual mode activated, snapshotted baseline', {
        lastSyncedRatio: syncState.lastSyncedRatio,
        lastSyncedRatioSnapshot: syncState.lastSyncedRatioSnapshot,
        tabId: syncState.tabId,
      });
    }

    syncState.isManualScrollEnabled = payload.enabled;

    // When manual mode is deactivated, the saved offset will be applied on the next scroll:sync
    // We do NOT programmatically scroll here to avoid jarring movements
    // The tab will smoothly sync to the correct position (with offset) when other tabs scroll
    if (!payload.enabled) {
      logger.info('Manual mode deactivated, offset will be applied on next sync', {
        lastSyncedRatio: syncState.lastSyncedRatio,
        tabId: syncState.tabId,
      });
    }
  });

  // Listen for ping from background to verify content script is alive
  onMessage('scroll:ping', async ({ data }) => {
    const payload = data;
    logger.debug('Received ping from background', {
      pingTabId: payload.tabId,
      isSyncActive: syncState.isActive,
      tabId: syncState.tabId,
    });

    // Prevents false "disconnected" status during idle — health check uses this timestamp
    connectionState.lastSuccessfulSync = Date.now();

    return {
      success: true,
      tabId: syncState.tabId,
      timestamp: Date.now(),
      isSyncActive: syncState.isActive,
    };
  });

  // Listen for URL sync from other tabs (P1)
  onMessage('url:sync', async ({ data }) => {
    if (!syncState.isActive) return;

    const payload = data;

    // Don't navigate if this is the source tab
    if (payload.sourceTabId === syncState.tabId) return;

    // Check if URL sync is enabled
    const urlSyncEnabled = await loadUrlSyncEnabled();
    if (!urlSyncEnabled) {
      logger.debug('URL sync is disabled, ignoring navigation request');
      return;
    }

    const modeRepairResult = await repairUrlSyncMode();
    if (modeRepairResult.status === 'failed') {
      emitUrlSyncNotice(createUrlSyncNoticeDetail(modeRepairResult.notice));
      logger.warn('URL sync navigation skipped because mode settings could not be repaired', {
        reason: modeRepairResult.reason,
        sourceTabId: payload.sourceTabId,
      });
      return;
    }

    if (modeRepairResult.notice) {
      emitUrlSyncNotice(createUrlSyncNoticeDetail(modeRepairResult.notice, modeRepairResult.mode));
      sendMessage(
        'sync:url-mode-changed',
        {
          mode: modeRepairResult.mode,
          notice: modeRepairResult.notice,
        },
        'background',
      ).catch((error) => {
        logger.warn('Failed to broadcast repaired URL sync mode', { error });
      });
    }

    const resolution = resolveUrlSyncTarget(
      payload.url,
      window.location.href,
      modeRepairResult.mode,
    );

    if (resolution.status === 'blocked') {
      emitUrlSyncNotice(createUrlSyncNoticeDetail(resolution.notice));
      logger.warn('URL sync navigation blocked', {
        reason: resolution.reason,
        sourceTabId: payload.sourceTabId,
        mode: modeRepairResult.mode,
      });
      return;
    }

    if (resolution.notice) {
      emitUrlSyncNotice(createUrlSyncNoticeDetail(resolution.notice));
    }

    if (resolution.url === window.location.href) {
      logger.debug('URL sync resolved to current URL; skipping navigation', {
        sourceTabId: payload.sourceTabId,
        mode: modeRepairResult.mode,
      });
      return;
    }

    logger.info('Navigating to synced URL', {
      sourceTabId: payload.sourceTabId,
      mode: modeRepairResult.mode,
    });

    await clearManualScrollOffset(syncState.tabId);
    cachedManualOffset = { ratio: 0, pixels: 0 };
    logger.debug('Cleared manual scroll offset before URL navigation', { tabId: syncState.tabId });

    navigateToUrl(resolution.url);
  });

  // Listen for auto-sync status changes from background
  onMessage('auto-sync:status-changed', async ({ data }) => {
    const payload = data;
    logger.info('Auto-sync status changed', { enabled: payload.enabled });
    // This is informational - actual sync start/stop is handled by scroll:start/stop
  });

  // Listen for auto-sync group updates from background
  onMessage('auto-sync:group-updated', async ({ data }) => {
    const payload = data;
    logger.debug('Auto-sync groups updated', { groupCount: payload.groups.length });
    // This is informational for UI updates - sync control handled by scroll:start/stop
  });

  // Listen for sync suggestion toast from background (auto-sync suggestion-based flow)
  onMessage('sync-suggestion:show', async ({ data }) => {
    const payload = data;
    logger.info('Showing sync suggestion toast', {
      tabCount: payload.tabCount,
    });
    showSyncSuggestionToast(payload);
    return { success: true };
  });

  // Listen for add tab to sync suggestion from background
  onMessage('sync-suggestion:add-tab', async ({ data }) => {
    const payload = data;
    logger.info('Showing add tab suggestion toast', {
      tabId: payload.tabId,
      hasMatchKind: payload.matchKind !== undefined,
    });
    showAddTabSuggestionToast(payload);
    return { success: true };
  });

  onMessage('contextual-hint:show', async ({ data }) => {
    const payload = data;
    if (payload.hintId !== 'manual-scroll-adjustment' || payload.surface !== 'webpage-overlay') {
      logger.debug('Ignoring unsupported contextual hint', {
        hintId: payload.hintId,
        surface: payload.surface,
      });
      return { success: true };
    }

    logger.info('Showing contextual hint', {
      hintId: payload.hintId,
      surface: payload.surface,
    });
    await showContextualHintToast(payload);
    return { success: true };
  });
}

/**
 * Get current auto-sync status
 */
export function getAutoSyncStatus(): { isActive: boolean; isAutoSync: boolean } {
  return {
    isActive: syncState.isActive,
    isAutoSync: syncState.isAutoSync,
  };
}
