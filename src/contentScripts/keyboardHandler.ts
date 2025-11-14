/**
 * Keyboard event handler for manual scroll adjustment (P1)
 * Implements Option/Alt key modifier for individual tab scrolling
 */

import { sendMessage } from 'webext-bridge/content-script';

import { ExtensionLogger } from '~/shared/lib/logger';
import { getManualScrollOffset, saveManualScrollOffset } from '~/shared/lib/storage';

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
  logger.debug('Manual scroll mode disabled');

  // Calculate and save manual scroll offset as RATIO using latest synced position
  if (getScrollInfoCallback) {
    try {
      const { currentScrollTop, lastSyncedRatio } = getScrollInfoCallback();

      // Calculate current scroll ratio
      const myMaxScroll =
        document.documentElement.scrollHeight - document.documentElement.clientHeight;
      const currentRatio = myMaxScroll > 0 ? currentScrollTop / myMaxScroll : 0;

      // Calculate ratio offset: how far ahead/behind this tab should be from sync baseline
      const offsetRatio = currentRatio - lastSyncedRatio;

      // Validate offset is within reasonable range (±0.5 ratio, which is ±50% of document)
      const maxReasonableOffset = 0.5;

      if (Math.abs(offsetRatio) > maxReasonableOffset) {
        logger.warn('Offset ratio exceeds reasonable range, clamping', {
          offsetRatio,
          maxReasonableOffset,
          currentRatio,
          lastSyncedRatio,
        });
      }

      // Clamp offset to reasonable range
      const clampedOffsetRatio = Math.max(
        -maxReasonableOffset,
        Math.min(maxReasonableOffset, offsetRatio),
      );

      logger.debug('Calculating manual scroll offset as ratio', {
        currentRatio,
        lastSyncedRatio,
        offsetRatio,
        clampedOffsetRatio,
      });

      // Get existing offset and accumulate (support multiple manual adjustments)
      const existingOffset = await getManualScrollOffset(currentTabId);
      const accumulatedOffset = existingOffset + clampedOffsetRatio;

      // Clamp accumulated offset to reasonable range
      const clampedAccumulatedOffset = Math.max(
        -maxReasonableOffset,
        Math.min(maxReasonableOffset, accumulatedOffset),
      );

      logger.debug('Accumulating manual scroll offset', {
        existingOffset,
        newOffset: clampedOffsetRatio,
        accumulatedOffset,
        clampedAccumulatedOffset,
      });

      // Save the accumulated clamped ratio offset for this tab
      await saveManualScrollOffset(currentTabId, clampedAccumulatedOffset);
      logger.info('Manual scroll offset saved as ratio', {
        tabId: currentTabId,
        offsetRatio: clampedAccumulatedOffset,
      });

      // Broadcast new baseline ratio to all tabs so they update their lastSyncedRatio
      // This prevents jumps when this tab starts scrolling again
      const newBaselineRatio = currentRatio - clampedAccumulatedOffset;
      sendMessage(
        'scroll:baseline-update',
        {
          sourceTabId: currentTabId,
          baselineRatio: newBaselineRatio,
          timestamp: Date.now(),
        },
        'background',
      ).catch((error) => {
        logger.error('Failed to send baseline update message', { error });
      });

      logger.debug('Broadcast baseline update', {
        newBaselineRatio,
        sourceTabId: currentTabId,
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
