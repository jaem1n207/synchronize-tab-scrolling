/**
 * Keyboard event handler for manual scroll adjustment (P1)
 * Implements Option/Alt key modifier for individual tab scrolling
 */

import { sendMessage } from 'webext-bridge/content-script';

import { ExtensionLogger } from '~/shared/lib/logger';
import { saveManualScrollOffset } from '~/shared/lib/storage';

const logger = new ExtensionLogger({ scope: 'keyboard-handler' });

let isManualModeActive = false;
let currentTabId = 0;
let manualModeBaselineSnapshot = 0; // Snapshot taken synchronously when Alt is pressed
let getScrollInfoCallback:
  | (() => {
      currentScrollTop: number;
      lastSyncedRatio: number;
      setManualModeActive: (active: boolean) => void;
    })
  | null = null;

/**
 * Initialize keyboard handler
 * @param tabId - Current tab ID
 * @param getScrollInfo - Callback to get current scroll position and last synced ratio
 */
export function initKeyboardHandler(
  tabId: number,
  getScrollInfo?: () => {
    currentScrollTop: number;
    lastSyncedRatio: number;
    setManualModeActive: (active: boolean) => void;
  },
) {
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
    disableManualMode();
  }
}

/**
 * Handle window blur (user switched away)
 */
function handleBlur() {
  if (isManualModeActive) {
    disableManualMode();
  }
}

/**
 * Disable manual scroll mode
 */
async function disableManualMode() {
  isManualModeActive = false;

  // Set manual mode flag SYNCHRONOUSLY to prevent race condition
  if (getScrollInfoCallback) {
    const { setManualModeActive } = getScrollInfoCallback();
    setManualModeActive(false);
  }

  logger.debug('Manual scroll mode disabled');

  // Calculate and save manual scroll offset as RATIO using snapshot from Alt PRESS
  if (getScrollInfoCallback) {
    try {
      const { currentScrollTop } = getScrollInfoCallback();

      // Calculate current scroll ratio
      const myMaxScroll =
        document.documentElement.scrollHeight - document.documentElement.clientHeight;
      const currentRatio = myMaxScroll > 0 ? currentScrollTop / myMaxScroll : 0;

      // Calculate ratio offset using snapshot taken at Alt PRESS (not release)
      const offsetRatio = currentRatio - manualModeBaselineSnapshot;

      // Validate offset is within reasonable range (±0.5 ratio, which is ±50% of document)
      const maxReasonableOffset = 0.5;

      if (Math.abs(offsetRatio) > maxReasonableOffset) {
        logger.warn('Offset ratio exceeds reasonable range, clamping', {
          offsetRatio,
          maxReasonableOffset,
          currentRatio,
          lastSyncedRatio: manualModeBaselineSnapshot,
        });
      }

      // Clamp offset to reasonable range
      const clampedOffsetRatio = Math.max(
        -maxReasonableOffset,
        Math.min(maxReasonableOffset, offsetRatio),
      );

      // Calculate pixel offset for display purposes
      const offsetPixels = Math.round(clampedOffsetRatio * myMaxScroll);

      logger.debug('Calculating manual scroll offset as ratio', {
        currentRatio,
        lastSyncedRatio: manualModeBaselineSnapshot,
        offsetRatio,
        clampedOffsetRatio,
        offsetPixels,
      });

      // The calculated offsetRatio is already the absolute offset from baseline
      // Save it directly (no accumulation needed) along with pixel value
      await saveManualScrollOffset(currentTabId, clampedOffsetRatio, offsetPixels);
      logger.info('Manual scroll offset saved', {
        tabId: currentTabId,
        offsetRatio: clampedOffsetRatio,
        offsetPixels,
      });
    } catch (error) {
      logger.error('Failed to save manual scroll offset', { error });
    }
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
export function cleanupKeyboardHandler() {
  window.removeEventListener('keydown', handleKeyDown);
  window.removeEventListener('keyup', handleKeyUp);
  window.removeEventListener('blur', handleBlur);

  if (isManualModeActive) {
    disableManualMode();
  }

  logger.info('Keyboard handler cleaned up');
}
