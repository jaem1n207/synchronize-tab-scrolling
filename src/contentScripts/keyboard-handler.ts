/**
 * Keyboard event handler for manual scroll adjustment (P1)
 * Implements Option/Alt key modifier for individual tab scrolling
 */

import { sendMessage } from 'webext-bridge/content-script';

import { ExtensionLogger } from '~/shared/lib/logger';
import { saveManualScrollOffset, type ManualScrollOffset } from '~/shared/lib/storage';

import { createManualScrollOffset } from './lib/manual-scroll-offset';

const logger = new ExtensionLogger({ scope: 'keyboard-handler' });

interface KeyboardScrollInfo {
  currentScrollTop: number;
  lastSyncedRatio: number;
  setManualModeActive: (active: boolean) => void;
  updateOffsetCache: (offset: ManualScrollOffset) => void;
}

interface DisableManualModeOptions {
  persistOffset?: boolean;
}

interface CleanupKeyboardHandlerOptions {
  persistManualOffset?: boolean;
}

let isManualModeActive = false;
let currentTabId = 0;
let manualModeBaselineSnapshot = 0;
let getScrollInfoCallback: (() => KeyboardScrollInfo) | null = null;
let pendingManualModeExit: Promise<void> | null = null;

/**
 * Initialize keyboard handler
 * @param tabId - Current tab ID
 * @param getScrollInfo - Callback to get current scroll position and last synced ratio
 */
export function initKeyboardHandler(tabId: number, getScrollInfo?: () => KeyboardScrollInfo) {
  currentTabId = tabId;
  getScrollInfoCallback = getScrollInfo || null;

  // Listen for Option/Alt key press
  window.addEventListener('keydown', handleKeyDown, { passive: true });
  window.addEventListener('keyup', handleKeyUp, { passive: true });

  // Handle when window loses focus
  window.addEventListener('blur', handleBlur);

  logger.info('Keyboard handler initialized');
}

/**
 * Handle keydown event
 */
function handleKeyDown(event: KeyboardEvent) {
  // Check for Option (macOS) or Alt (Windows/Linux)
  if ((event.altKey || event.metaKey) && !isManualModeActive) {
    // Snapshot baseline IMMEDIATELY when entering manual mode (synchronous, no race condition)
    if (getScrollInfoCallback) {
      const { lastSyncedRatio, setManualModeActive } = getScrollInfoCallback();
      manualModeBaselineSnapshot = lastSyncedRatio;

      // Set manual mode flag SYNCHRONOUSLY to prevent race condition with scroll:sync
      setManualModeActive(true);

      logger.debug('Manual mode enabled, snapshotted baseline', {
        manualModeBaselineSnapshot,
      });
    }

    isManualModeActive = true;
    logger.debug('Manual scroll mode enabled');

    // Notify content script to disable scroll syn
    sendMessage(
      'scroll:manual',
      {
        tabId: currentTabId,
        enabled: true,
      },
      'background',
    ).catch((error) => {
      logger.error('Failed to send manual mode message', { error });
    });

    // Visual feedback: add class to document
    document.documentElement.classList.add('scroll-sync-manual-mode');
  }
}

/**
 * Handle keyup event
 */
function handleKeyUp(event: KeyboardEvent) {
  // Check if Option/Alt key was released
  if (!event.altKey && !event.metaKey && isManualModeActive) {
    void startManualModeExit();
  }
}

/**
 * Handle window blur (user switched away)
 */
function handleBlur() {
  if (isManualModeActive) {
    void startManualModeExit();
  }
}

function startManualModeExit(options?: DisableManualModeOptions): Promise<void> {
  if (pendingManualModeExit) {
    return pendingManualModeExit;
  }

  pendingManualModeExit = disableManualMode(options).finally(() => {
    pendingManualModeExit = null;
  });

  return pendingManualModeExit;
}

/**
 * Disable manual scroll mode
 */
async function disableManualMode({ persistOffset = true }: DisableManualModeOptions = {}) {
  isManualModeActive = false;

  const scrollInfo = getScrollInfoCallback?.() ?? null;

  logger.debug('Manual scroll mode disabled');

  let reopenedScrollSync = false;

  // Calculate and save manual scroll offset using snapshot from Alt PRESS
  if (persistOffset && scrollInfo) {
    const { currentScrollTop, updateOffsetCache } = scrollInfo;
    const maxScroll = document.documentElement.scrollHeight - document.documentElement.clientHeight;

    const offset = createManualScrollOffset({
      baselineLogicalRatio: manualModeBaselineSnapshot,
      currentScrollTop,
      maxScroll,
    });

    const maxReasonableOffset = 0.5;

    if (Math.abs(offset.ratio) >= maxReasonableOffset) {
      logger.warn('Offset ratio exceeds reasonable range, clamping', {
        maxReasonableOffset,
        offsetRatio: offset.ratio,
        lastSyncedRatio: manualModeBaselineSnapshot,
      });
    }

    logger.debug('Calculating manual scroll offset', {
      lastSyncedRatio: manualModeBaselineSnapshot,
      offsetRatio: offset.ratio,
      offsetPixels: offset.pixels,
    });

    // Keep the hot scroll path coherent before reopening sync.
    updateOffsetCache(offset);
    scrollInfo.setManualModeActive(false);
    reopenedScrollSync = true;

    try {
      await saveManualScrollOffset(currentTabId, offset.ratio, offset.pixels, offset.anchor);
      logger.info('Manual scroll offset saved', {
        tabId: currentTabId,
        offsetRatio: offset.ratio,
        offsetPixels: offset.pixels,
      });
    } catch (error) {
      logger.error('Failed to save manual scroll offset', { error });
    }
  }

  // Reopen scroll sync only after cachedManualOffset has the newly captured value.
  if (!reopenedScrollSync) {
    scrollInfo?.setManualModeActive(false);
  }

  // Notify content script to re-enable scroll sync
  sendMessage(
    'scroll:manual',
    {
      tabId: currentTabId,
      enabled: false,
    },
    'background',
  ).catch((error) => {
    logger.error('Failed to send manual mode message', { error });
  });

  // Remove visual feedback
  document.documentElement.classList.remove('scroll-sync-manual-mode');
}

/**
 * Cleanup keyboard handler
 */
export async function cleanupKeyboardHandler({
  persistManualOffset = true,
}: CleanupKeyboardHandlerOptions = {}) {
  window.removeEventListener('keydown', handleKeyDown);
  window.removeEventListener('keyup', handleKeyUp);
  window.removeEventListener('blur', handleBlur);

  if (isManualModeActive) {
    await startManualModeExit({ persistOffset: persistManualOffset });
  } else if (pendingManualModeExit) {
    await pendingManualModeExit;
  }

  logger.info('Keyboard handler cleaned up');
}
