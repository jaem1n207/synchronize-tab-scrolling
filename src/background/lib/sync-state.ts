import { sendMessage } from 'webext-bridge/background';
import browser from 'webextension-polyfill';

import { ExtensionLogger } from '~/shared/lib/logger';
import type { SyncState } from '~/shared/types/sync-state';

const logger = new ExtensionLogger({ scope: 'sync-state' });

export const syncState: SyncState = {
  isActive: false,
  linkedTabs: [],
  connectionStatuses: {},
  lastActiveSyncedTabId: null,
};

export async function persistSyncState(): Promise<void> {
  try {
    await browser.storage.local.set({ syncState });
    logger.debug('Sync state persisted to storage', { syncState });
  } catch (error) {
    logger.error('Failed to persist sync state', { error });
  }
}

export async function restoreSyncState(): Promise<void> {
  try {
    const result = await browser.storage.local.get('syncState');
    if (result.syncState) {
      Object.assign(syncState, result.syncState as SyncState);
      logger.info('Sync state restored from storage', { syncState });

      if (syncState.isActive && syncState.linkedTabs.length >= 2) {
        logger.info('Reconnecting previously synced tabs after service worker restart');
        const tabs = await browser.tabs.query({ currentWindow: true });
        const existingTabIds = tabs.map((t) => t.id).filter((id): id is number => id !== undefined);

        syncState.linkedTabs = syncState.linkedTabs.filter((id) => existingTabIds.includes(id));

        if (syncState.linkedTabs.length >= 2) {
          const reconnectPromises = syncState.linkedTabs.map(async (tabId) => {
            try {
              await sendMessage(
                'scroll:start',
                {
                  tabIds: syncState.linkedTabs,
                  mode: syncState.mode || 'ratio',
                  currentTabId: tabId,
                },
                { context: 'content-script', tabId },
              );
              syncState.connectionStatuses[tabId] = 'connected';
              logger.info(`Reconnected tab ${tabId} after service worker restart`);
            } catch (error) {
              logger.error(`Failed to reconnect tab ${tabId}`, { error });
              syncState.connectionStatuses[tabId] = 'error';
            }
          });

          await Promise.all(reconnectPromises);
          await broadcastSyncStatus();

          // Keep-alive will be started by the caller after restore
        } else {
          logger.info(
            'Not enough tabs remaining after service worker restart, clearing sync state',
          );
          syncState.isActive = false;
          syncState.linkedTabs = [];
          syncState.connectionStatuses = {};
          await persistSyncState();
        }
      }
    }
  } catch (error) {
    logger.error('Failed to restore sync state', { error });
  }
}

export async function broadcastSyncStatus(): Promise<void> {
  const tabs = await browser.tabs.query({ currentWindow: true });

  const tabInfoPromises = syncState.linkedTabs.map(async (tabId) => {
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return null;

    return {
      id: tab.id!,
      title: tab.title || 'Untitled',
      url: tab.url || '',
      favIconUrl: tab.favIconUrl,
      eligible: true,
    };
  });

  const linkedTabsInfo = (await Promise.all(tabInfoPromises)).filter(
    (info): info is NonNullable<typeof info> => info !== null,
  );

  const statusPayload = {
    linkedTabs: linkedTabsInfo,
    connectionStatuses: syncState.connectionStatuses,
  };

  const promises = syncState.linkedTabs.map(async (tabId) => {
    await sendMessage(
      'sync:status',
      { ...statusPayload, currentTabId: tabId },
      { context: 'content-script', tabId },
    ).catch((error) => {
      logger.debug(`Failed to send sync status to tab ${tabId}`, { error });
    });
  });

  await Promise.all(promises);
}
