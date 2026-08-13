import browser from 'webextension-polyfill';

import { ExtensionLogger } from '~/shared/lib/logger';
import type { StartSyncContentMessage, StartSyncContentResponse } from '~/shared/types/messages';

import { sendMessageWithTimeout } from './messaging';

import type { ReconnectAttemptToken } from './sync-session-orchestrator';

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
export interface ReinjectionContext {
  startMessage: StartSyncContentMessage;
  isSessionCurrent: () => boolean;
}

export async function reinjectContentScript(
  tabId: number,
  context: ReinjectionContext,
): Promise<boolean> {
  try {
    logger.info(`Re-injecting content script into tab ${tabId}`);

    // Re-inject the content script
    await browser.scripting.executeScript({
      target: { tabId },
      files: ['dist/contentScripts/index.global.js'],
    });

    logger.info(`Content script re-injected into tab ${tabId}`);
    if (!context.isSessionCurrent()) {
      return false;
    }

    // Wait a moment for the script to initialize
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (!context.isSessionCurrent()) {
      return false;
    }

    let response: { success: boolean; tabId: number } | undefined;
    if (context.startMessage.isAutoSync === true) {
      response = await sendMessageWithTimeout<{ success: boolean; tabId: number }>(
        'scroll:start',
        {
          tabIds: context.startMessage.tabIds,
          mode: context.startMessage.mode,
          currentTabId: context.startMessage.currentTabId,
          isAutoSync: true,
          autoSyncGeneration: context.startMessage.autoSyncGeneration,
        },
        { context: 'content-script', tabId },
        3_000,
      );
    } else if (context.startMessage.isAutoSync === false) {
      response = await sendMessageWithTimeout<{ success: boolean; tabId: number }>(
        'scroll:start',
        {
          tabIds: context.startMessage.tabIds,
          mode: context.startMessage.mode,
          currentTabId: context.startMessage.currentTabId,
          isAutoSync: false,
          sessionEpoch: context.startMessage.sessionEpoch,
        },
        { context: 'content-script', tabId },
        3_000,
      );
    } else {
      response = await sendMessageWithTimeout<{ success: boolean; tabId: number }>(
        'scroll:start',
        {
          tabIds: context.startMessage.tabIds,
          mode: context.startMessage.mode,
          currentTabId: context.startMessage.currentTabId,
          sessionEpoch: context.startMessage.sessionEpoch,
        },
        { context: 'content-script', tabId },
        3_000,
      );
    }

    if (context.isSessionCurrent() && response && response.success && response.tabId === tabId) {
      logger.info(`Tab ${tabId} reconnected after content script re-injection`);
      return true;
    }

    return false;
  } catch (error) {
    logger.error(`Failed to re-inject content script into tab ${tabId}`, { error });
    return false;
  }
}

export async function reinjectManualReconnect(
  token: ReconnectAttemptToken,
  isSessionCurrent: () => boolean,
): Promise<StartSyncContentResponse> {
  const success = await reinjectContentScript(token.tabId, {
    startMessage: token.startMessage,
    isSessionCurrent,
  });
  return { success, tabId: token.tabId };
}
