import { onMessage } from 'webext-bridge/background';
import browser from 'webextension-polyfill';

import { extractDomainFromUrl } from '~/shared/lib/auto-sync-url-utils';
import { ExtensionLogger } from '~/shared/lib/logger';
import {
  loadExcludedDomains,
  saveExcludedDomains,
  saveSuggestionSnooze,
} from '~/shared/lib/storage';
import type { AutoSyncGroupInfo } from '~/shared/types/messages';

import { removeTabFromAllAutoSyncGroups, updateAutoSyncGroup } from '../lib/auto-sync-groups';
import { toggleAutoSync } from '../lib/auto-sync-lifecycle';
import {
  autoSyncState,
  addTabSuggestedTabs,
  excludedDomains,
  manualSyncOverriddenTabs,
  dismissedUrlGroups,
  pendingSuggestions,
  SUGGESTION_SNOOZE_DURATION_MS,
  suggestionSnoozeUntil,
  withAutoSyncLock,
} from '../lib/auto-sync-state';
import { stopKeepAlive } from '../lib/keep-alive';
import { sendMessageWithTimeout } from '../lib/messaging';
import { syncState, persistSyncState, broadcastSyncStatus } from '../lib/sync-state';

const logger = new ExtensionLogger({ scope: 'background/auto-sync-handlers' });

async function stopManualSyncAndReturnTabsToAutoSync(tabIds: Array<number>): Promise<void> {
  await Promise.allSettled(
    tabIds.map((tabId) =>
      sendMessageWithTimeout(
        'scroll:stop',
        { tabIds },
        { context: 'content-script', tabId },
        1_000,
      ),
    ),
  );

  if (autoSyncState.enabled) {
    for (const tabId of tabIds) {
      manualSyncOverriddenTabs.delete(tabId);

      try {
        const tab = await browser.tabs.get(tabId);
        if (tab.url) {
          await updateAutoSyncGroup(tabId, tab.url);
        }
      } catch {
        // Tab may have been closed.
      }
    }
  } else {
    for (const tabId of tabIds) {
      manualSyncOverriddenTabs.delete(tabId);
    }
  }

  stopKeepAlive();
  addTabSuggestedTabs.clear();

  syncState.isActive = false;
  syncState.linkedTabs = [];
  syncState.connectionStatuses = {};
  syncState.mode = undefined;

  await persistSyncState();
}

async function rollbackFailedSuggestionStart(connectedTabIds: Array<number>): Promise<void> {
  await Promise.allSettled(
    connectedTabIds.map((tabId) =>
      sendMessageWithTimeout('scroll:stop', {}, { context: 'content-script', tabId }, 1_000),
    ),
  );

  syncState.isActive = false;
  syncState.linkedTabs = [];
  syncState.connectionStatuses = {};
  syncState.mode = undefined;

  await persistSyncState();
  await broadcastSyncStatus();
}

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
        matchKind: group.matchKind,
        matchConfidence: group.matchConfidence,
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

    const activeGroups = Array.from(autoSyncState.groups.values()).filter((g) => g.isActive);
    const totalSyncedTabs = activeGroups.reduce((sum, g) => sum + g.tabIds.size, 0);

    const potentialSyncTabs = Array.from(autoSyncState.groups.values())
      .filter((g) => g.tabIds.size >= 2)
      .reduce((sum, g) => sum + g.tabIds.size, 0);

    let currentTabGroup:
      | {
          tabCount: number;
          isActive: boolean;
        }
      | undefined;

    if (sender.tabId) {
      for (const [, group] of autoSyncState.groups.entries()) {
        if (group.tabIds.has(sender.tabId)) {
          currentTabGroup = {
            tabCount: group.tabIds.size,
            isActive: group.isActive,
          };
          break;
        }
      }
    }

    const status = {
      success: true,
      enabled: autoSyncState.enabled,
      activeGroupCount: activeGroups.length,
      totalSyncedTabs,
      potentialSyncTabs,
      currentTabGroup,
    };

    logger.debug('[AUTO-SYNC] get-detailed-status response', {
      groupCount: autoSyncState.groups.size,
      activeGroupCount: activeGroups.length,
      totalSyncedTabs,
      potentialSyncTabs,
      hasCurrentTabGroup: currentTabGroup !== undefined,
      currentTabGroupSize: currentTabGroup?.tabCount,
    });

    return status;
  });

  onMessage(
    'sync-suggestion:response',
    async ({ data: { accepted, normalizedUrl, permanent, snooze } }) => {
      logger.info('[AUTO-SYNC] Received sync suggestion response', {
        accepted,
        permanent: permanent === true,
        snooze: snooze === true,
      });

      pendingSuggestions.delete(normalizedUrl);

      // Issue 12 Fix: Broadcast dismiss message to ALL tabs in the group
      const group = autoSyncState.groups.get(normalizedUrl);
      if (group) {
        const uniqueTargetTabs = Array.from(group.tabIds);

        Promise.allSettled(
          uniqueTargetTabs.map((targetTabId) =>
            sendMessageWithTimeout(
              'sync-suggestion:dismiss',
              { normalizedUrl },
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
      if (accepted) {
        const group = autoSyncState.groups.get(normalizedUrl);
        if (group && group.tabIds.size >= 2) {
          const tabIds = Array.from(group.tabIds);

          if (syncState.isActive && syncState.linkedTabs.length > 0) {
            const previousLinkedTabs = [...syncState.linkedTabs];

            logger.info(
              '[AUTO-SYNC] Stopping existing sync before starting new sync from suggestion',
              { previousLinkedTabs: syncState.linkedTabs, newTabIds: tabIds },
            );

            await stopManualSyncAndReturnTabsToAutoSync(previousLinkedTabs);
          }

          logger.info('[AUTO-SYNC] Starting manual sync from suggestion acceptance', {
            tabCount: tabIds.length,
            tabIds,
          });

          // ✅ FIX: Set syncState BEFORE starting connections to prevent race condition
          syncState.isActive = true;
          syncState.linkedTabs = tabIds;
          syncState.mode = 'ratio';

          const connectionResults: Record<number, { success: boolean; error?: string }> = {};

          const promises = tabIds.map(async (tabId) => {
            try {
              const ack = await sendMessageWithTimeout<{ success: boolean; tabId: number }>(
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

              if (ack && ack.success && ack.tabId === tabId) {
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
            for (const tabId of connectedTabIds) {
              manualSyncOverriddenTabs.add(tabId);
            }

            await withAutoSyncLock(async () => {
              autoSyncState.groups.delete(normalizedUrl);
            });
            syncState.linkedTabs = connectedTabIds;
            await persistSyncState();
            await broadcastSyncStatus();
            logger.info('[AUTO-SYNC] Manual sync started from suggestion', { connectedTabIds });
          } else {
            await rollbackFailedSuggestionStart(connectedTabIds);
            logger.warn('[AUTO-SYNC] Failed to start sync - not enough tabs connected', {
              attemptedTabCount: tabIds.length,
              connectedTabCount: connectedTabIds.length,
            });
          }
        }
      } else {
        dismissedUrlGroups.add(normalizedUrl);

        if (permanent) {
          const domain = extractDomainFromUrl(normalizedUrl);
          if (domain) {
            excludedDomains.add(domain);
            await saveExcludedDomains(Array.from(excludedDomains));
            logger.info('[AUTO-SYNC] User permanently excluded domain from suggestions');
          }
        } else if (snooze) {
          const domain = extractDomainFromUrl(normalizedUrl);
          if (domain) {
            const expiresAt = Date.now() + SUGGESTION_SNOOZE_DURATION_MS;
            suggestionSnoozeUntil.set(domain, expiresAt);
            await saveSuggestionSnooze(domain, expiresAt);
            logger.info('[AUTO-SYNC] User snoozed sync suggestion for domain', {
              expiresAt: new Date(expiresAt).toISOString(),
            });
          }
        } else {
          logger.info('[AUTO-SYNC] Sync suggestion auto-dismissed');
        }
      }

      return { success: true };
    },
  );

  onMessage(
    'sync-suggestion:add-tab-response',
    async ({ data: { accepted, tabId, permanent, snooze, normalizedUrl } }) => {
      logger.info('[AUTO-SYNC] Received add-tab suggestion response', {
        accepted,
        tabId,
        permanent: permanent === true,
        snooze: snooze === true,
      });

      // Issue 10 Fix: Broadcast dismiss message to ALL tabs (synced + new tab)
      const allTargetTabs = [...syncState.linkedTabs, tabId];
      const uniqueTargetTabs = [...new Set(allTargetTabs)];

      Promise.allSettled(
        uniqueTargetTabs.map((targetTabId) =>
          sendMessageWithTimeout(
            'sync-suggestion:dismiss-add-tab',
            { tabId },
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

      if (accepted && syncState.isActive) {
        try {
          if (syncState.linkedTabs.includes(tabId)) {
            return { success: true };
          }

          const tab = await browser.tabs.get(tabId);
          if (!tab) {
            return { success: false, error: 'Tab no longer exists' };
          }

          await removeTabFromAllAutoSyncGroups(tabId);

          const newTabIds = [...new Set([...syncState.linkedTabs, tabId])];
          const connectionResults = new Map<number, boolean>();

          const promises = newTabIds.map(async (candidateTabId) => {
            try {
              const ack = await sendMessageWithTimeout<{ success: boolean; tabId: number }>(
                'scroll:start',
                {
                  tabIds: newTabIds,
                  mode: syncState.mode || 'ratio',
                  currentTabId: candidateTabId,
                  isAutoSync: false,
                },
                { context: 'content-script', tabId: candidateTabId },
                2_000,
              );

              if (ack && ack.success && ack.tabId === candidateTabId) {
                connectionResults.set(candidateTabId, true);
                syncState.connectionStatuses[candidateTabId] = 'connected';
              } else {
                connectionResults.set(candidateTabId, false);
                syncState.connectionStatuses[candidateTabId] = 'error';
              }
            } catch {
              connectionResults.set(candidateTabId, false);
              syncState.connectionStatuses[candidateTabId] = 'error';
            }
          });

          await Promise.all(promises);

          const connectedTabIds = newTabIds.filter(
            (candidateTabId) => connectionResults.get(candidateTabId) === true,
          );
          const failedTabIds = newTabIds.filter(
            (candidateTabId) => connectionResults.get(candidateTabId) !== true,
          );

          for (const candidateTabId of connectedTabIds) {
            manualSyncOverriddenTabs.add(candidateTabId);
          }

          for (const candidateTabId of failedTabIds) {
            manualSyncOverriddenTabs.delete(candidateTabId);
          }

          if (connectedTabIds.length < 2) {
            syncState.isActive = false;
            syncState.linkedTabs = [];
            syncState.connectionStatuses = {};
            syncState.mode = undefined;
            await persistSyncState();
            await broadcastSyncStatus();

            return { success: false, error: 'Not enough tabs connected' };
          }

          syncState.linkedTabs = connectedTabIds;
          await persistSyncState();
          await broadcastSyncStatus();

          logger.info('[AUTO-SYNC] Added tab to manual sync', {
            tabId,
            connectedTabIds,
            failedTabCount: failedTabIds.length,
          });

          if (!connectedTabIds.includes(tabId)) {
            return { success: false, error: 'Tab failed to join sync' };
          }
        } catch (error) {
          logger.error('[AUTO-SYNC] Failed to add tab to sync', { tabId, error });
          return { success: false, error: String(error) };
        }
      } else if (!accepted && permanent && normalizedUrl) {
        const domain = extractDomainFromUrl(normalizedUrl);
        if (domain) {
          excludedDomains.add(domain);
          await saveExcludedDomains(Array.from(excludedDomains));
          logger.info('[AUTO-SYNC] User permanently excluded domain from add-tab suggestions', {
            tabId,
          });
        }
      } else if (!accepted && snooze && normalizedUrl) {
        const domain = extractDomainFromUrl(normalizedUrl);
        if (domain) {
          const expiresAt = Date.now() + SUGGESTION_SNOOZE_DURATION_MS;
          suggestionSnoozeUntil.set(domain, expiresAt);
          await saveSuggestionSnooze(domain, expiresAt);
          logger.info('[AUTO-SYNC] User snoozed add-tab suggestion for domain', {
            tabId,
            expiresAt: new Date(expiresAt).toISOString(),
          });
        }
      }

      return { success: true };
    },
  );

  onMessage('auto-sync:excluded-domains-changed', async ({ data }) => {
    const { domains } = data;
    excludedDomains.clear();
    for (const domain of domains) {
      excludedDomains.add(domain);
    }
    await saveExcludedDomains(domains);
    logger.info('[AUTO-SYNC] Excluded domains updated from popup', {
      domainCount: domains.length,
    });
  });

  onMessage('auto-sync:get-excluded-domains', async () => {
    const domains = await loadExcludedDomains();
    return { domains };
  });
}
