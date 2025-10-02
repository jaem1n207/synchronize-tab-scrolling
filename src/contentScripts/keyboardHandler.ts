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
let baselineSyncedRatio = 0; // Store the synced ratio when manual mode is activated
let getScrollInfoCallback: (() => { currentRatio: number; lastSyncedRatio: number }) | null = null;

/**
 * Initialize keyboard handler
 * @param tabId - Current tab ID
 * @param getScrollInfo - Callback to get current scroll ratio and last synced ratio
 */
export function initKeyboardHandler(
  tabId: number,
  getScrollInfo?: () => { currentRatio: number; lastSyncedRatio: number },
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

    // Store the baseline synced ratio at the moment manual mode is activated
    if (getScrollInfoCallback) {
      const { lastSyncedRatio } = getScrollInfoCallback();
      baselineSyncedRatio = lastSyncedRatio;
      logger.debug('Stored baseline synced ratio for offset calculation', {
        baseline: baselineSyncedRatio,
      });
    }

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

  // Calculate and save manual scroll offset using baseline
  if (getScrollInfoCallback) {
    try {
      const { currentRatio } = getScrollInfoCallback();
      // Use the baseline ratio stored when manual mode was activated
      const offset = currentRatio - baselineSyncedRatio;

      logger.debug('Calculating manual scroll offset', {
        currentRatio,
        baselineSyncedRatio,
        offset,
      });

      // Save the offset for this tab
      await saveManualScrollOffset(currentTabId, offset);
      logger.info('Manual scroll offset saved', { tabId: currentTabId, offset });
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
