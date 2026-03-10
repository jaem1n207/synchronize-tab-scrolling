import { sendMessage } from 'webext-bridge/background';
import browser from 'webextension-polyfill';

import { normalizeUrlForAutoSync } from '~/shared/lib/auto-sync-url-utils';
import { ExtensionLogger } from '~/shared/lib/logger';
import { loadUrlSyncEnabled } from '~/shared/lib/storage';

import {
  removeTabFromAllAutoSyncGroups,
  updateAutoSyncGroup,
  broadcastAutoSyncGroupUpdate,
} from '../lib/auto-sync-groups';
import { toggleAutoSync } from '../lib/auto-sync-lifecycle';
import {
  autoSyncState,
  manualSyncOverriddenTabs,
  dismissedUrlGroups,
  pendingSuggestions,
  addTabSuggestedTabs,
} from '../lib/auto-sync-state';
import {
  showSyncSuggestion,
  sendSuggestionToSingleTab,
  showAddTabSuggestion,
  isDomainSnoozed,
} from '../lib/auto-sync-suggestions';
import { isContentScriptAlive, reinjectContentScript } from '../lib/content-script-manager';
import { stopKeepAlive } from '../lib/keep-alive';
import { sendMessageWithTimeout } from '../lib/messaging';
import { syncState, persistSyncState, broadcastSyncStatus } from '../lib/sync-state';

const logger = new ExtensionLogger({ scope: 'background/tab-event-handlers' });

export function registerTabEventHandlers(): void {
  browser.tabs.onRemoved.addListener(async (tabId) => {
    manualSyncOverriddenTabs.delete(tabId);

    if (autoSyncState.enabled) {
      await removeTabFromAllAutoSyncGroups(tabId);
      await broadcastAutoSyncGroupUpdate();
    }

    if (syncState.isActive && syncState.linkedTabs.length > 0) {
      const dismissPromises = syncState.linkedTabs.map((linkedTabId) =>
        sendMessageWithTimeout(
          'sync-suggestion:dismiss-add-tab',
          { tabId },
          { context: 'content-script', tabId: linkedTabId },
          1_000,
        ).catch(() => {
          // Ignore errors - tab may have been closed
        }),
      );
      await Promise.allSettled(dismissPromises);
    }

    if (!syncState.isActive || !syncState.linkedTabs.includes(tabId)) {
      return;
    }

    logger.info(`Synced tab ${tabId} was closed, updating sync state`);

    syncState.linkedTabs = syncState.linkedTabs.filter((id) => id !== tabId);
    delete syncState.connectionStatuses[tabId];

    if (syncState.linkedTabs.length < 2) {
      logger.info('Less than 2 tabs remaining, stopping sync');

      const remainingTabs = [...syncState.linkedTabs];

      // ✅ FIX: Remove remaining tabs from manualSyncOverriddenTabs
      for (const remainingTabId of remainingTabs) {
        manualSyncOverriddenTabs.delete(remainingTabId);
      }

      const promises = remainingTabs.map((remainingTabId) =>
        sendMessage('scroll:stop', {}, { context: 'content-script', tabId: remainingTabId }).catch(
          (error) => {
            logger.error(`Failed to send stop message to tab ${remainingTabId}`, { error });
          },
        ),
      );
      await Promise.all(promises);

      stopKeepAlive();

      syncState.isActive = false;
      syncState.linkedTabs = [];
      syncState.connectionStatuses = {};
      syncState.mode = undefined;
      await persistSyncState();

      // ✅ FIX: Re-add remaining tabs to auto-sync groups if auto-sync is enabled
      if (autoSyncState.enabled) {
        for (const remainingTabId of remainingTabs) {
          try {
            const tab = await browser.tabs.get(remainingTabId);
            if (tab.url) {
              await updateAutoSyncGroup(remainingTabId, tab.url);
            }
          } catch {
            // Tab may have been closed
          }
        }
      }
    } else {
      logger.info(`Continuing sync with ${syncState.linkedTabs.length} tabs`);
      await persistSyncState();
      await broadcastSyncStatus();
    }
  });

  browser.tabs.onCreated.addListener(async (tab) => {
    // ✅ Bug 9-1 Fix: Record the current active synced tab BEFORE browser switches to new tab
    if (syncState.isActive) {
      try {
        const activeTabs = await browser.tabs.query({ active: true, currentWindow: true });
        const activeTab = activeTabs[0];
        if (activeTab?.id && syncState.linkedTabs.includes(activeTab.id)) {
          syncState.lastActiveSyncedTabId = activeTab.id;
          logger.debug('[AUTO-SYNC] Recorded lastActiveSyncedTabId in onCreated', {
            lastActiveSyncedTabId: activeTab.id,
            newTabId: tab.id,
          });
        }
      } catch {
        // Ignore errors when querying tabs
      }
    }

    if (!autoSyncState.enabled || !tab.id) {
      return;
    }

    if (tab.url && tab.url !== 'about:blank' && tab.url !== 'chrome://newtab/') {
      logger.debug(`New tab ${tab.id} created with URL, adding to auto-sync group (pending)`, {
        url: tab.url,
      });
      await updateAutoSyncGroup(tab.id, tab.url, true, true);

      // ✅ FIX: Show suggestion after content script is ready (delayed)
      const normalizedUrl = normalizeUrlForAutoSync(tab.url);
      if (normalizedUrl) {
        const group = autoSyncState.groups.get(normalizedUrl);
        if (group && group.tabIds.size >= 2 && !group.isActive) {
          setTimeout(async () => {
            const currentGroup = autoSyncState.groups.get(normalizedUrl);
            if (
              currentGroup &&
              currentGroup.tabIds.size >= 2 &&
              !currentGroup.isActive &&
              !dismissedUrlGroups.has(normalizedUrl) &&
              !isDomainSnoozed(normalizedUrl)
            ) {
              if (pendingSuggestions.has(normalizedUrl) && tab.id !== undefined) {
                logger.info('[AUTO-SYNC] Sending suggestion to newly joined tab', {
                  tabId: tab.id,
                  normalizedUrl,
                });
                await sendSuggestionToSingleTab(tab.id, normalizedUrl, currentGroup);
              } else {
                logger.info('[AUTO-SYNC] Showing delayed suggestion after tab creation', {
                  tabId: tab.id,
                  normalizedUrl,
                });
                await showSyncSuggestion(normalizedUrl);
              }
            }
          }, 500);
        }
      }
    }
  });

  browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.url || (changeInfo.status === 'loading' && tab.url)) {
      const url = changeInfo.url || tab.url || '';
      const normalizedUrl = normalizeUrlForAutoSync(url);

      if (normalizedUrl) {
        if (syncState.isActive && !syncState.linkedTabs.includes(tabId)) {
          const syncedTabsWithSameUrl = await Promise.all(
            syncState.linkedTabs.map(async (syncedTabId) => {
              try {
                const syncedTab = await browser.tabs.get(syncedTabId);
                const syncedNormalizedUrl = syncedTab.url
                  ? normalizeUrlForAutoSync(syncedTab.url)
                  : null;
                return syncedNormalizedUrl === normalizedUrl;
              } catch {
                return false;
              }
            }),
          );

          if (syncedTabsWithSameUrl.some((match) => match) && !addTabSuggestedTabs.has(tabId)) {
            addTabSuggestedTabs.add(tabId);
            logger.info('[AUTO-SYNC] Detected new tab with same URL as synced tab (immediate)', {
              tabId,
              normalizedUrl,
              trigger: changeInfo.url ? 'url_change' : 'loading_with_url',
            });
            await showAddTabSuggestion(tabId, tab.title || 'Untitled', normalizedUrl);
          }
        }

        if (autoSyncState.enabled) {
          const existingGroup = autoSyncState.groups.get(normalizedUrl);

          if (!existingGroup || !existingGroup.tabIds.has(tabId)) {
            await updateAutoSyncGroup(tabId, url);
          } else if (existingGroup && existingGroup.tabIds.has(tabId) && !existingGroup.isActive) {
            if (
              existingGroup.tabIds.size >= 2 &&
              !pendingSuggestions.has(normalizedUrl) &&
              !dismissedUrlGroups.has(normalizedUrl) &&
              !isDomainSnoozed(normalizedUrl) &&
              !(syncState.isActive && syncState.linkedTabs.includes(tabId))
            ) {
              await showSyncSuggestion(normalizedUrl);
            }
          }
        }
      }
    }

    if (!syncState.isActive || !syncState.linkedTabs.includes(tabId)) {
      return;
    }

    if (changeInfo.url) {
      const changedUrl = changeInfo.url;
      logger.info(`Synced tab ${tabId} URL changed, broadcasting`, { url: changedUrl });

      const urlSyncEnabled = await loadUrlSyncEnabled();
      if (urlSyncEnabled) {
        const targetTabIds = syncState.linkedTabs.filter((id) => id !== tabId);
        await Promise.all(
          targetTabIds.map((targetTabId) =>
            sendMessage(
              'url:sync',
              { url: changedUrl, sourceTabId: tabId },
              { context: 'content-script', tabId: targetTabId },
            ).catch((error) => {
              logger.debug(`Failed to relay URL sync to tab ${targetTabId}`, { error });
            }),
          ),
        );
      }
    }

    if (changeInfo.status !== 'complete') {
      return;
    }

    logger.info(`Synced tab ${tabId} was refreshed/updated, reconnecting`, { url: tab.url });

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
      logger.info(`Successfully reconnected tab ${tabId}`);

      await persistSyncState();
      await broadcastSyncStatus();
    } catch (error) {
      logger.error(`Failed to reconnect tab ${tabId}`, { error });
      syncState.connectionStatuses[tabId] = 'error';
      await persistSyncState();
    }
  });

  browser.tabs.onActivated.addListener(async ({ tabId }) => {
    if (syncState.isActive && syncState.linkedTabs.includes(tabId)) {
      syncState.lastActiveSyncedTabId = tabId;
    }

    if (!syncState.isActive || !syncState.linkedTabs.includes(tabId)) {
      return;
    }

    logger.debug(`Synced tab ${tabId} activated, checking content script health`);

    const isAlive = await isContentScriptAlive(tabId);

    if (isAlive) {
      if (syncState.connectionStatuses[tabId] !== 'connected') {
        syncState.connectionStatuses[tabId] = 'connected';
        await persistSyncState();
        await broadcastSyncStatus();
      }
      logger.debug(`Tab ${tabId} content script is alive`);
      return;
    }

    logger.info(`Content script in tab ${tabId} not responding, attempting recovery`);

    try {
      const response = await sendMessageWithTimeout<{ success: boolean; tabId: number }>(
        'scroll:start',
        {
          tabIds: syncState.linkedTabs,
          mode: syncState.mode || 'ratio',
          currentTabId: tabId,
        },
        { context: 'content-script', tabId },
        2_000,
      );

      if (response && response.success && response.tabId === tabId) {
        syncState.connectionStatuses[tabId] = 'connected';
        logger.info(`Successfully reconnected activated tab ${tabId}`);
        await persistSyncState();
        await broadcastSyncStatus();
        return;
      }
    } catch (error) {
      logger.debug(`Reconnection attempt failed for tab ${tabId}, trying re-injection`, { error });
    }

    const reinjectSuccess = await reinjectContentScript(tabId);

    if (!reinjectSuccess) {
      logger.error(`Failed to recover tab ${tabId} after all attempts`);
      syncState.connectionStatuses[tabId] = 'error';
      await persistSyncState();
      await broadcastSyncStatus();
    }
  });

  logger.info('Tab event listeners registered');

  browser.storage.onChanged.addListener(async (changes, areaName) => {
    if (areaName !== 'local') return;

    if ('autoSyncEnabled' in changes) {
      const { newValue, oldValue } = changes.autoSyncEnabled as {
        newValue?: boolean;
        oldValue?: boolean;
      };
      if (newValue !== oldValue && newValue !== undefined) {
        logger.info('Auto-sync enabled changed via storage', { newValue, oldValue });
        await toggleAutoSync(newValue);
      }
    }
  });

  logger.info('Storage change listener registered');
}
