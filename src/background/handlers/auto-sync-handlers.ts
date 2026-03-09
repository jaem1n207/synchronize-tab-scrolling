import { onMessage } from 'webext-bridge/background';
import browser from 'webextension-polyfill';

import { ExtensionLogger } from '~/shared/lib/logger';
import type { AutoSyncGroupInfo } from '~/shared/types/messages';

import { removeTabFromAllAutoSyncGroups } from '../lib/auto-sync-groups';
import {
  autoSyncState,
  manualSyncOverriddenTabs,
  dismissedUrlGroups,
  pendingSuggestions,
} from '../lib/auto-sync-state';
import { toggleAutoSync } from '../lib/auto-sync-lifecycle';
import { sendMessageWithTimeout } from '../lib/messaging';
import { syncState, persistSyncState, broadcastSyncStatus } from '../lib/sync-state';

const logger = new ExtensionLogger({ scope: 'background/auto-sync-handlers' });

export function registerAutoSyncHandlers(): void {
  onMessage('auto-sync:status-changed', async ({ data }) => {
    const payload = data;
    await toggleAutoSync(payload.enabled);
    return { success: true, enabled: autoSyncState.enabled };
  });

  onMessage('auto-sync:get-status', async () => {
    const groups: Array<AutoSyncGroupInfo> = [];
    for (const [normalizedUrl, group] of autoSyncState.groups.entries()) {
      groups.push({
        normalizedUrl,
        tabIds: Array.from(group.tabIds),
        isActive: group.isActive,
      });
    }

    return {
      success: true,
      enabled: autoSyncState.enabled,
      groups,
    };
  });

  onMessage('auto-sync:get-detailed-status', async ({ sender }) => {
    logger.debug('[AUTO-SYNC] get-detailed-status request', { senderTabId: sender.tabId });

    const allGroups = Array.from(autoSyncState.groups.entries()).map(([url, g]) => ({
      url,
      tabCount: g.tabIds.size,
      tabIds: Array.from(g.tabIds),
      isActive: g.isActive,
    }));
    const activeGroups = Array.from(autoSyncState.groups.values()).filter((g) => g.isActive);
    const totalSyncedTabs = activeGroups.reduce((sum, g) => sum + g.tabIds.size, 0);

    const potentialSyncTabs = Array.from(autoSyncState.groups.values())
      .filter((g) => g.tabIds.size >= 2)
      .reduce((sum, g) => sum + g.tabIds.size, 0);

    let currentTabGroup:
      | {
          normalizedUrl: string;
          tabCount: number;
          isActive: boolean;
        }
      | undefined;

    if (sender.tabId) {
      for (const [normalizedUrl, group] of autoSyncState.groups.entries()) {
        if (group.tabIds.has(sender.tabId)) {
          currentTabGroup = {
            normalizedUrl,
            tabCount: group.tabIds.size,
            isActive: group.isActive,
          };
          break;
        }
      }
    }

    const response = {
      success: true,
      enabled: autoSyncState.enabled,
      activeGroupCount: activeGroups.length,
      totalSyncedTabs,
      potentialSyncTabs,
      currentTabGroup,
    };

    logger.debug('[AUTO-SYNC] get-detailed-status response', {
      ...response,
      allGroups,
      groupCount: autoSyncState.groups.size,
    });

    return response;
  });

  onMessage('sync-suggestion:response', async ({ data }) => {
    const payload = data;
    logger.info('[AUTO-SYNC] Received sync suggestion response', payload);

    pendingSuggestions.delete(payload.normalizedUrl);

    // Issue 12 Fix: Broadcast dismiss message to ALL tabs in the group
    const group = autoSyncState.groups.get(payload.normalizedUrl);
    if (group) {
      const uniqueTargetTabs = Array.from(group.tabIds);

      Promise.allSettled(
        uniqueTargetTabs.map((targetTabId) =>
          sendMessageWithTimeout(
            'sync-suggestion:dismiss',
            { normalizedUrl: payload.normalizedUrl },
            { context: 'content-script', tabId: targetTabId },
            1_000,
          ).catch(() => {
            // Ignore errors - tab may have been closed or content script not ready
          }),
        ),
      ).then((results) => {
        const successCount = results.filter((r) => r.status === 'fulfilled').length;
        logger.debug('[AUTO-SYNC] Dismiss sync suggestion toast broadcast', {
          totalTabs: uniqueTargetTabs.length,
          successCount,
        });
      });
    }

    if (payload.accepted) {
      const group = autoSyncState.groups.get(payload.normalizedUrl);
      if (group && group.tabIds.size >= 2) {
        const tabIds = Array.from(group.tabIds);
        logger.info('[AUTO-SYNC] Starting manual sync from suggestion acceptance', {
          normalizedUrl: payload.normalizedUrl,
          tabIds,
        });

        for (const tabId of tabIds) {
          manualSyncOverriddenTabs.add(tabId);
        }

        autoSyncState.groups.delete(payload.normalizedUrl);

        // ✅ FIX: Set syncState BEFORE starting connections to prevent race condition
        syncState.isActive = true;
        syncState.linkedTabs = tabIds;
        syncState.mode = 'ratio';

        const connectionResults: Record<number, { success: boolean; error?: string }> = {};

        const promises = tabIds.map(async (tabId) => {
          try {
            const response = await sendMessageWithTimeout<{ success: boolean; tabId: number }>(
              'scroll:start',
              {
                tabIds,
                mode: 'ratio',
                currentTabId: tabId,
                isAutoSync: false,
              },
              { context: 'content-script', tabId },
              2_000,
            );

            if (response && response.success && response.tabId === tabId) {
              connectionResults[tabId] = { success: true };
              syncState.connectionStatuses[tabId] = 'connected';
            } else {
              connectionResults[tabId] = { success: false, error: 'Invalid acknowledgment' };
              syncState.connectionStatuses[tabId] = 'error';
            }
          } catch (error) {
            connectionResults[tabId] = { success: false, error: String(error) };
            syncState.connectionStatuses[tabId] = 'error';
          }
        });

        await Promise.all(promises);

        const successfulConnections = Object.entries(connectionResults).filter(
          ([, result]) => result.success,
        );
        const connectedTabIds = successfulConnections.map(([tabId]) => Number(tabId));

        if (connectedTabIds.length >= 2) {
          syncState.linkedTabs = connectedTabIds;
          await persistSyncState();
          await broadcastSyncStatus();
          logger.info('[AUTO-SYNC] Manual sync started from suggestion', { connectedTabIds });
        } else {
          syncState.isActive = false;
          syncState.linkedTabs = [];
          syncState.connectionStatuses = {};
          logger.warn('[AUTO-SYNC] Failed to start sync - not enough tabs connected', {
            connectionResults,
          });
        }
      }
    } else {
      dismissedUrlGroups.add(payload.normalizedUrl);
      logger.info('[AUTO-SYNC] User dismissed sync suggestion', {
        normalizedUrl: payload.normalizedUrl,
      });
    }

    return { success: true };
  });

  onMessage('sync-suggestion:add-tab-response', async ({ data }) => {
    const payload = data;
    logger.info('[AUTO-SYNC] Received add-tab suggestion response', payload);

    // Issue 10 Fix: Broadcast dismiss message to ALL tabs (synced + new tab)
    const allTargetTabs = [...syncState.linkedTabs, payload.tabId];
    const uniqueTargetTabs = [...new Set(allTargetTabs)];

    Promise.allSettled(
      uniqueTargetTabs.map((targetTabId) =>
        sendMessageWithTimeout(
          'sync-suggestion:dismiss-add-tab',
          { tabId: payload.tabId },
          { context: 'content-script', tabId: targetTabId },
          1_000,
        ).catch(() => {
          // Ignore errors - tab may have been closed or content script not ready
        }),
      ),
    ).then((results) => {
      const successCount = results.filter((r) => r.status === 'fulfilled').length;
      logger.debug('[AUTO-SYNC] Dismiss add-tab toast broadcast', {
        totalTabs: uniqueTargetTabs.length,
        successCount,
      });
    });

    if (payload.accepted && syncState.isActive) {
      const tabId = payload.tabId;

      try {
        const tab = await browser.tabs.get(tabId);
        if (!tab) {
          return { success: false, error: 'Tab no longer exists' };
        }

        manualSyncOverriddenTabs.add(tabId);

        await removeTabFromAllAutoSyncGroups(tabId);

        const newTabIds = [...syncState.linkedTabs, tabId];

        const promises = newTabIds.map(async (tId) => {
          try {
            const response = await sendMessageWithTimeout<{ success: boolean; tabId: number }>(
              'scroll:start',
              {
                tabIds: newTabIds,
                mode: syncState.mode || 'ratio',
                currentTabId: tId,
                isAutoSync: false,
              },
              { context: 'content-script', tabId: tId },
              2_000,
            );

            if (response && response.success && response.tabId === tId) {
              syncState.connectionStatuses[tId] = 'connected';
            } else {
              syncState.connectionStatuses[tId] = 'error';
            }
          } catch {
            syncState.connectionStatuses[tId] = 'error';
          }
        });

        await Promise.all(promises);

        syncState.linkedTabs = newTabIds;
        await persistSyncState();
        await broadcastSyncStatus();

        logger.info('[AUTO-SYNC] Added tab to manual sync', { tabId, newTabIds });
      } catch (error) {
        logger.error('[AUTO-SYNC] Failed to add tab to sync', { tabId, error });
        return { success: false, error: String(error) };
      }
    }

    return { success: true };
  });
}
