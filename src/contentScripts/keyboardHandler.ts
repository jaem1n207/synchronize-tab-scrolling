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
let getScrollInfoCallback: (() => { currentScrollTop: number; lastSyncedRatio: number }) | null =
  null;

/**
 * Initialize keyboard handler
 * @param tabId - Current tab ID
 * @param getScrollInfo - Callback to get current scroll position and last synced ratio
 */
export function initKeyboardHandler(
  tabId: number,
  getScrollInfo?: () => { currentScrollTop: number; lastSyncedRatio: number },
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
    isManualModeActive = true;
    logger.debug('Manual scroll mode enabled');

    // Notify content script to disable scroll sync
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
  logger.debug('Manual scroll mode disabled');

  // Calculate and save manual scroll offset in pixels using latest synced position
  if (getScrollInfoCallback) {
    try {
      const { currentScrollTop, lastSyncedRatio } = getScrollInfoCallback();

      // Use the LATEST lastSyncedRatio (which may have been updated during manual mode)
      const myMaxScroll =
        document.documentElement.scrollHeight - document.documentElement.clientHeight;
      const currentBaselineScrollTop = lastSyncedRatio * myMaxScroll;

      // Calculate pixel offset: current position - where we "should be" according to latest sync
      const offsetPx = currentScrollTop - currentBaselineScrollTop;

      // Validate offset is within reasonable range (±50% of viewport height)
      const viewportHeight = window.innerHeight;
      const maxReasonableOffset = viewportHeight * 0.5;

      if (Math.abs(offsetPx) > maxReasonableOffset) {
        logger.warn('Offset exceeds reasonable range, clamping', {
          offsetPx,
          maxReasonableOffset,
          currentScrollTop,
          currentBaselineScrollTop,
          lastSyncedRatio,
        });
      }

      // Clamp offset to reasonable range
      const clampedOffsetPx = Math.max(
        -maxReasonableOffset,
        Math.min(maxReasonableOffset, offsetPx),
      );

      logger.debug('Calculating manual scroll offset', {
        currentScrollTop,
        lastSyncedRatio,
        currentBaselineScrollTop,
        offsetPx,
        clampedOffsetPx,
      });

      // Save the clamped pixel offset for this tab
      await saveManualScrollOffset(currentTabId, clampedOffsetPx);
      logger.info('Manual scroll offset saved', { tabId: currentTabId, offsetPx: clampedOffsetPx });
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
