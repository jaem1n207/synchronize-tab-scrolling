import browser from 'webextension-polyfill';

import { ExtensionLogger } from '~/shared/lib/logger';
import type { StartSyncContentResponse } from '~/shared/types/messages';

import { manualSyncOverriddenTabs, withAutoSyncLock } from './auto-sync-state';
import { isContentScriptAlive, reinjectManualReconnect } from './content-script-manager';
import { sendMessageWithTimeout } from './messaging';
import { createManualCleanupRetryScheduler } from './sync-cleanup-retry';
import {
  createManualSessionLifecycleController,
  executeManualReconnect,
} from './sync-session-orchestrator';
import {
  syncState,
  getSyncStateSnapshot,
  persistSyncState,
  commitSyncState,
  broadcastSyncStatus,
} from './sync-state';
import { syncTransitionGate } from './sync-transition-gate';

import type { ManualSessionLifecycleController } from './sync-session-orchestrator';

const logger = new ExtensionLogger({ scope: 'keep-alive' });

const KEEP_ALIVE_INTERVAL_MS = 25000;

interface KeepAliveState {
  interval: ReturnType<typeof setInterval> | null;
}

const keepAliveState: KeepAliveState = {
  interval: null,
};

function createKeepAliveLifecycleController(): ManualSessionLifecycleController {
  const cleanupScheduler = createManualCleanupRetryScheduler({
    transitionGate: syncTransitionGate,
    getState: getSyncStateSnapshot,
    sendStop: (tabId) =>
      sendMessageWithTimeout<{ success: boolean; tabId?: number; reason?: string }>(
        'scroll:stop',
        { tabIds: [tabId], isAutoSync: false },
        { context: 'content-script', tabId },
        1_000,
      ),
    setTimer: (callback, delay) => setTimeout(callback, delay),
    clearTimer: (timer) => clearTimeout(timer),
  });

  return createManualSessionLifecycleController({
    getState: getSyncStateSnapshot,
    persistState: persistSyncState,
    commitState: commitSyncState,
    sendStop: (tabId, message) =>
      sendMessageWithTimeout<{ success: boolean; tabId?: number; reason?: string }>(
        'scroll:stop',
        {
          ...(message.tabIds === undefined ? {} : { tabIds: [...message.tabIds] }),
          ...(message.isAutoSync === undefined ? {} : { isAutoSync: message.isAutoSync }),
        },
        { context: 'content-script', tabId },
        1_000,
      ),
    stopKeepAlive,
    clearManualOverrides: (tabIds) =>
      withAutoSyncLock(async () => {
        for (const tabId of tabIds) {
          manualSyncOverriddenTabs.delete(tabId);
        }
      }),
    cleanupScheduler,
    broadcastStatus: broadcastSyncStatus,
  });
}

export function startKeepAlive(): void {
  if (keepAliveState.interval) {
    logger.debug('Keep-alive already running');
    return;
  }

  keepAliveState.interval = setInterval(async () => {
    logger.debug('Keep-alive ping', {
      syncActive: syncState.isActive,
      linkedTabs: syncState.linkedTabs.length,
    });

    if (syncState.isActive && syncState.linkedTabs.length > 0) {
      await checkAllTabsHealth();
    }
  }, KEEP_ALIVE_INTERVAL_MS);

  logger.info('Keep-alive started');
}

export function stopKeepAlive(): void {
  if (keepAliveState.interval) {
    clearInterval(keepAliveState.interval);
    keepAliveState.interval = null;
    logger.info('Keep-alive stopped');
  }
}

async function checkAllTabsHealth(): Promise<void> {
  if (!syncState.isActive) return;
  const lifecycleController = createKeepAliveLifecycleController();
  const initialState = getSyncStateSnapshot();

  logger.debug('Checking health of all synced tabs', {
    tabCount: initialState.linkedTabs.length,
  });

  for (const tabId of initialState.linkedTabs) {
    if (initialState.connectionStatuses[tabId] !== 'connected') {
      continue;
    }

    await executeManualReconnect({
      controller: lifecycleController,
      transitionGate: syncTransitionGate,
      tabId,
      isTabAvailable: async () => {
        try {
          await browser.tabs.get(tabId);
          return true;
        } catch {
          return false;
        }
      },
      sendHandshake: async (token): Promise<StartSyncContentResponse> => {
        if (await isContentScriptAlive(tabId)) {
          return { success: true, tabId };
        }

        const state = getSyncStateSnapshot();
        if (
          !state.isActive ||
          state.revision !== token.revision ||
          state.sessionEpoch !== token.sessionEpoch ||
          !state.linkedTabs.includes(tabId)
        ) {
          return { success: false, tabId };
        }

        logger.warn(`Tab ${tabId} lost connection during keep-alive check, attempting recovery`);
        return reinjectManualReconnect(token, () => {
          const state = getSyncStateSnapshot();
          return (
            state.isActive &&
            state.revision === token.revision &&
            state.sessionEpoch === token.sessionEpoch &&
            state.linkedTabs.includes(tabId)
          );
        });
      },
    });
  }
}
