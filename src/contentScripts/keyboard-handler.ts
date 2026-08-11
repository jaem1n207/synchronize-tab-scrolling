/**
 * Keyboard event handler for manual scroll adjustment (P1)
 * Implements Option/Alt key modifier for individual tab scrolling
 */

import { sendMessage } from 'webext-bridge/content-script';

import { ExtensionLogger } from '~/shared/lib/logger';
import {
  clearManualScrollOffset,
  saveManualScrollOffset,
  type ManualScrollOffset,
} from '~/shared/lib/storage';
import type { ManualScrollMessage } from '~/shared/types/messages';
import type { SessionMessageIdentity } from '~/shared/types/sync-session';

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
let getSessionMessageIdentityCallback: (() => SessionMessageIdentity) | null = null;
let pendingManualModeExit: Promise<void> | null = null;
let pendingManualModeExitAllowsPersistence = true;
let pendingManualModeExitNeedsPersistedClear = false;

/**
 * Initialize keyboard handler
 * @param tabId - Current tab ID
 * @param getScrollInfo - Callback to get current scroll position and last synced ratio
 */
export function initKeyboardHandler(
  tabId: number,
  getScrollInfo?: () => KeyboardScrollInfo,
  getSessionMessageIdentity?: () => SessionMessageIdentity,
) {
  currentTabId = tabId;
  getScrollInfoCallback = getScrollInfo || null;
  getSessionMessageIdentityCallback = getSessionMessageIdentity || null;

  // Listen for Option/Alt key press
  window.addEventListener('keydown', handleKeyDown, { passive: true });
  window.addEventListener('keyup', handleKeyUp, { passive: true });

  // Handle when window loses focus
  window.addEventListener('blur', handleBlur);

  logger.info('Keyboard handler initialized');
}

function getSessionMessageIdentity(): SessionMessageIdentity {
  return (
    getSessionMessageIdentityCallback?.() ?? {
      isAutoSync: false,
      sourceTabId: currentTabId,
      sessionEpoch: 0,
    }
  );
}

/**
 * Handle keydown event
 */
function handleKeyDown(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229) {
    return;
  }

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
    const message: ManualScrollMessage & SessionMessageIdentity = {
      ...getSessionMessageIdentity(),
      tabId: currentTabId,
      enabled: true,
    };
    sendMessage('scroll:manual', message, 'background').catch((error) => {
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
  if (event.isComposing || event.keyCode === 229) {
    return;
  }

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
  const persistOffset = options?.persistOffset ?? true;

  if (pendingManualModeExit) {
    if (!persistOffset) {
      pendingManualModeExitAllowsPersistence = false;
      pendingManualModeExitNeedsPersistedClear = true;
    }
    return pendingManualModeExit;
  }

  pendingManualModeExitAllowsPersistence = persistOffset;
  pendingManualModeExitNeedsPersistedClear = false;
  pendingManualModeExit = disableManualMode().finally(() => {
    pendingManualModeExit = null;
    pendingManualModeExitAllowsPersistence = true;
    pendingManualModeExitNeedsPersistedClear = false;
  });

  return pendingManualModeExit;
}

/**
 * Disable manual scroll mode
 */
async function disableManualMode() {
  isManualModeActive = false;

  const scrollInfo = getScrollInfoCallback?.() ?? null;

  logger.debug('Manual scroll mode disabled');

  let reopenedScrollSync = false;

  // Give cleanupKeyboardHandler({ persistManualOffset: false }) a chance to override a keyup/blur
  // exit that was started just before sync re-initialization or stop cleanup.
  await Promise.resolve();
  const persistOffset = pendingManualModeExitAllowsPersistence;

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
      if (pendingManualModeExitNeedsPersistedClear) {
        await clearManualScrollOffset(currentTabId);
        logger.debug('Cleared manual scroll offset after non-persisting cleanup override', {
          tabId: currentTabId,
        });
      }
    } catch (error) {
      logger.error('Failed to save manual scroll offset', { error });
    }
  }

  // Reopen scroll sync only after cachedManualOffset has the newly captured value.
  if (!reopenedScrollSync) {
    scrollInfo?.setManualModeActive(false);
  }

  // Notify content script to re-enable scroll sync
  const message: ManualScrollMessage & SessionMessageIdentity = {
    ...getSessionMessageIdentity(),
    tabId: currentTabId,
    enabled: false,
  };
  sendMessage('scroll:manual', message, 'background').catch((error) => {
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

  if (pendingManualModeExit || isManualModeActive) {
    await startManualModeExit({ persistOffset: persistManualOffset });
  }

  getSessionMessageIdentityCallback = null;
  logger.info('Keyboard handler cleaned up');
}
