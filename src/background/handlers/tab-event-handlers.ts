import { sendMessage } from 'webext-bridge/background';
import browser from 'webextension-polyfill';

import { ExtensionLogger } from '~/shared/lib/logger';
import { loadUrlSyncEnabled } from '~/shared/lib/storage';
import {
  buildTranslatedPageSignature,
  isTranslatedPageMetadataMatch,
  type TranslatedPageMetadata,
  type TranslatedPageSignature,
} from '~/shared/lib/translated-page-url-utils';

import {
  removeTabFromAllAutoSyncGroups,
  updateAutoSyncGroup,
  broadcastAutoSyncGroupUpdate,
  refreshAutoSyncGroupMetadata,
  getAutoSyncGroupKeyForTab,
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
  isDomainPermanentlyExcluded,
} from '../lib/auto-sync-suggestions';
import { isContentScriptAlive, reinjectContentScript } from '../lib/content-script-manager';
import { clearPendingUrlSyncContextualHint } from '../lib/contextual-hint-state';
import { stopKeepAlive } from '../lib/keep-alive';
import { sendMessageWithTimeout } from '../lib/messaging';
import { syncState, persistSyncState, broadcastSyncStatus } from '../lib/sync-state';

const logger = new ExtensionLogger({ scope: 'background/tab-event-handlers' });
const ACTIVE_SYNC_METADATA_TIMEOUT_MS = 500;
const MAX_ACTIVE_SYNC_METADATA_PROBES = 10;

interface ActiveSyncMetadataMatch {
  normalizedUrl: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function getAlternateUrls(value: unknown): TranslatedPageMetadata['alternateUrls'] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }

    const hreflang = getOptionalString(item.hreflang);
    const href = getOptionalString(item.href);

    if (!hreflang || !href) {
      return [];
    }

    return [{ hreflang, href }];
  });
}

function getMetadataUrlKey(url: string): string | null {
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return null;
    }

    parsedUrl.hash = '';
    return parsedUrl.toString();
  } catch {
    return null;
  }
}

function isMetadataForRequestedUrl(
  metadata: TranslatedPageMetadata,
  requestedUrl: string,
): boolean {
  const metadataUrlKey = getMetadataUrlKey(metadata.url);
  const requestedUrlKey = getMetadataUrlKey(requestedUrl);

  return Boolean(metadataUrlKey && requestedUrlKey && metadataUrlKey === requestedUrlKey);
}

async function getActiveSyncTabMetadata(
  tabId: number,
  url: string,
): Promise<TranslatedPageMetadata | null> {
  try {
    const response = await sendMessageWithTimeout(
      'translated-page:get-metadata',
      { tabId },
      { context: 'content-script', tabId },
      ACTIVE_SYNC_METADATA_TIMEOUT_MS,
    );

    if (!isRecord(response) || response.success !== true) {
      return null;
    }

    const metadata: TranslatedPageMetadata = {
      url: getOptionalString(response.url) ?? url,
      title: getOptionalString(response.title),
      canonicalUrl: getOptionalString(response.canonicalUrl),
      alternateUrls: getAlternateUrls(response.alternateUrls),
    };

    return isMetadataForRequestedUrl(metadata, url) ? metadata : null;
  } catch {
    return null;
  }
}

async function findActiveSyncMetadataMatch(
  tabId: number,
  url: string,
): Promise<ActiveSyncMetadataMatch | null> {
  const sourceMetadata = await getActiveSyncTabMetadata(tabId, url);
  if (!sourceMetadata) {
    return null;
  }

  const candidateMatches = await Promise.all(
    syncState.linkedTabs
      .filter((syncedTabId) => syncedTabId !== tabId)
      .slice(0, MAX_ACTIVE_SYNC_METADATA_PROBES)
      .map(async (syncedTabId): Promise<ActiveSyncMetadataMatch | null> => {
        try {
          const syncedTab = await browser.tabs.get(syncedTabId);
          if (!syncedTab.url) {
            return null;
          }

          const syncedMetadata = await getActiveSyncTabMetadata(syncedTabId, syncedTab.url);
          if (!syncedMetadata || !isTranslatedPageMetadataMatch(sourceMetadata, syncedMetadata)) {
            return null;
          }

          const syncedSignature = buildTranslatedPageSignature(syncedTab.url);
          return syncedSignature ? { normalizedUrl: syncedSignature.canonicalKey } : null;
        } catch {
          return null;
        }
      }),
  );

  return candidateMatches.find((match) => match !== null) ?? null;
}

export function registerTabEventHandlers(): void {
  browser.tabs.onRemoved.addListener(async (tabId) => {
    manualSyncOverriddenTabs.delete(tabId);
    clearPendingUrlSyncContextualHint(tabId);

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
      logger.debug(`New tab ${tab.id} created with URL, adding to auto-sync group (pending)`);
      const groupKey = await updateAutoSyncGroup(tab.id, tab.url, true, true);

      // ✅ FIX: Show suggestion after content script is ready (delayed)
      const normalizedUrl = groupKey;
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
              !isDomainPermanentlyExcluded(normalizedUrl) &&
              !isDomainSnoozed(normalizedUrl)
            ) {
              if (pendingSuggestions.has(normalizedUrl) && tab.id !== undefined) {
                logger.info('[AUTO-SYNC] Sending suggestion to newly joined tab', {
                  tabId: tab.id,
                  groupTabCount: currentGroup.tabIds.size,
                });
                await sendSuggestionToSingleTab(tab.id, normalizedUrl, currentGroup);
              } else {
                logger.info('[AUTO-SYNC] Showing delayed suggestion after tab creation', {
                  tabId: tab.id,
                  groupTabCount: currentGroup.tabIds.size,
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
      const newTabSignature = buildTranslatedPageSignature(url);
      const normalizedUrl = newTabSignature?.canonicalKey ?? null;

      if (normalizedUrl) {
        if (syncState.isActive && !syncState.linkedTabs.includes(tabId)) {
          const syncedTabSignaturesWithSameUrl = await Promise.all(
            syncState.linkedTabs.map(async (syncedTabId) => {
              try {
                const syncedTab = await browser.tabs.get(syncedTabId);
                const syncedTabSignature = syncedTab.url
                  ? buildTranslatedPageSignature(syncedTab.url)
                  : null;
                return syncedTabSignature?.canonicalKey === normalizedUrl
                  ? syncedTabSignature
                  : null;
              } catch {
                return null;
              }
            }),
          );
          const matchingSyncedTabSignatures = syncedTabSignaturesWithSameUrl.filter(
            (signature): signature is TranslatedPageSignature => signature !== null,
          );

          if (matchingSyncedTabSignatures.length > 0 && !addTabSuggestedTabs.has(tabId)) {
            addTabSuggestedTabs.add(tabId);
            logger.info('[AUTO-SYNC] Detected new tab with same URL as synced tab (immediate)', {
              tabId,
              trigger: changeInfo.url ? 'url_change' : 'loading_with_url',
              sourceMatchCount: matchingSyncedTabSignatures.length,
            });
            const isTranslatedPageMatch =
              newTabSignature?.matchKind === 'translated-page' ||
              matchingSyncedTabSignatures.some(
                (signature) => signature.matchKind === 'translated-page',
              );

            await showAddTabSuggestion(
              tabId,
              tab.title || 'Untitled',
              normalizedUrl,
              isTranslatedPageMatch ? 'translated-page' : newTabSignature?.matchKind,
              isTranslatedPageMatch ? 'high' : newTabSignature?.confidence,
            );
          } else if (!addTabSuggestedTabs.has(tabId)) {
            const metadataMatch = await findActiveSyncMetadataMatch(tabId, url);
            if (metadataMatch) {
              addTabSuggestedTabs.add(tabId);
              logger.info('[AUTO-SYNC] Detected translated metadata match for active sync tab', {
                tabId,
                trigger: changeInfo.url ? 'url_change' : 'loading_with_url',
              });

              await showAddTabSuggestion(
                tabId,
                tab.title || 'Untitled',
                metadataMatch.normalizedUrl,
                'possible-translation',
                'medium',
              );
            }
          }
        }

        if (autoSyncState.enabled) {
          const currentGroupKey = getAutoSyncGroupKeyForTab(tabId);
          const currentGroup = currentGroupKey
            ? autoSyncState.groups.get(currentGroupKey)
            : undefined;
          const currentTabUrl = currentGroup?.tabUrls?.get(tabId);
          const existingGroupKey =
            currentGroup &&
            currentGroupKey &&
            (currentGroupKey === normalizedUrl || currentTabUrl === url)
              ? currentGroupKey
              : normalizedUrl;
          const existingGroup = autoSyncState.groups.get(existingGroupKey);
          const shouldProbeCandidates =
            existingGroupKey === normalizedUrl &&
            existingGroup?.tabIds.size === 1 &&
            autoSyncState.groups.size > 1;

          if (!existingGroup || !existingGroup.tabIds.has(tabId) || shouldProbeCandidates) {
            await updateAutoSyncGroup(tabId, url);
          } else if (existingGroup && existingGroup.tabIds.has(tabId)) {
            const didRefreshMetadata = refreshAutoSyncGroupMetadata(existingGroupKey, tabId, url);
            if (didRefreshMetadata) {
              await broadcastAutoSyncGroupUpdate();
            }

            if (
              !existingGroup.isActive &&
              existingGroup.tabIds.size >= 2 &&
              !pendingSuggestions.has(existingGroupKey) &&
              !dismissedUrlGroups.has(existingGroupKey) &&
              !isDomainPermanentlyExcluded(existingGroupKey) &&
              !isDomainSnoozed(existingGroupKey) &&
              !(syncState.isActive && syncState.linkedTabs.includes(tabId))
            ) {
              await showSyncSuggestion(existingGroupKey);
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
      logger.info(`Synced tab ${tabId} URL changed, broadcasting`, { tabId });

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

    logger.info(`Synced tab ${tabId} was refreshed/updated, reconnecting`, { tabId });

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
