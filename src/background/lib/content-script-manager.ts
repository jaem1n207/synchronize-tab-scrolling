import browser from 'webextension-polyfill';

import { ExtensionLogger } from '~/shared/lib/logger';

import { sendMessageWithTimeout } from './messaging';
import { broadcastSyncStatus, persistSyncState, syncState } from './sync-state';

const logger = new ExtensionLogger({ scope: 'content-script-manager' });

// Helper function to check if content script is alive via ping
export async function isContentScriptAlive(tabId: number): Promise<boolean> {
  try {
    const response = await sendMessageWithTimeout<{ success: boolean }>(
      'scroll:ping',
      { tabId, timestamp: Date.now() },
      { context: 'content-script', tabId },
      1_000, // 1 second timeout for ping
    );
    return response && response.success;
  } catch {
    return false;
  }
}

// Helper function to re-inject content script into a tab
export async function reinjectContentScript(tabId: number): Promise<boolean> {
  try {
    logger.info(`Re-injecting content script into tab ${tabId}`);

    // Re-inject the content script
    await browser.scripting.executeScript({
      target: { tabId },
      files: ['dist/contentScripts/index.global.js'],
    });

    logger.info(`Content script re-injected into tab ${tabId}`);

    // Wait a moment for the script to initialize
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Now send scroll:start to initialize sync
    const response = await sendMessageWithTimeout<{ success: boolean; tabId: number }>(
      'scroll:start',
      {
        tabIds: syncState.linkedTabs,
        mode: syncState.mode || 'ratio',
        currentTabId: tabId,
      },
      { context: 'content-script', tabId },
      3_000,
    );

    if (response && response.success && response.tabId === tabId) {
      syncState.connectionStatuses[tabId] = 'connected';
      logger.info(`Tab ${tabId} reconnected after content script re-injection`);
      await persistSyncState();
      await broadcastSyncStatus();
      return true;
    }

    return false;
  } catch (error) {
    logger.error(`Failed to re-inject content script into tab ${tabId}`, { error });
    return false;
  }
}
