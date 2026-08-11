import { onMessage } from 'webext-bridge/background';
import browser from 'webextension-polyfill';

import { extractDomainFromUrl } from '~/shared/lib/auto-sync-url-utils';
import { ExtensionLogger } from '~/shared/lib/logger';
import {
  loadExcludedDomains,
  saveExcludedDomains,
  saveSuggestionSnooze,
} from '~/shared/lib/storage';
import type {
  AutoSyncGroupInfo,
  StartSyncContentResponse,
  SyncSuggestionDecisionResponse,
} from '~/shared/types/messages';
import type { ManualAddResult } from '~/shared/types/sync-session';

import { updateAutoSyncGroup } from '../lib/auto-sync-groups';
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
import { waitForBackgroundInitialization } from '../lib/background-initialization';
import { startKeepAlive, stopKeepAlive } from '../lib/keep-alive';
import {
  createLegacyAutoSyncAdapter,
  replaceManualWithAcceptedAutoSync,
} from '../lib/legacy-auto-sync-adapter';
import { manualOverrideAdapter } from '../lib/manual-override-adapter';
import { sendMessageWithTimeout } from '../lib/messaging';
import { createManualCleanupRetryScheduler } from '../lib/sync-cleanup-retry';
import { createSyncSessionOrchestrator } from '../lib/sync-session-orchestrator';
import {
  broadcastSyncStatus,
  commitSyncState,
  getSyncStateSnapshot,
  persistSyncState,
  syncState,
} from '../lib/sync-state';
import { syncTransitionGate } from '../lib/sync-transition-gate';

import type { AcceptedAutoSyncResult } from '../lib/legacy-auto-sync-adapter';

const logger = new ExtensionLogger({ scope: 'background/auto-sync-handlers' });

const suggestionCleanupScheduler = createManualCleanupRetryScheduler({
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

const acceptedAutoCleanupScheduler = createManualCleanupRetryScheduler({
  transitionGate: syncTransitionGate,
  getState: getSyncStateSnapshot,
  sendStop: (tabId) =>
    sendMessageWithTimeout<{ success: boolean; tabId?: number; reason?: string }>(
      'scroll:stop',
      { isAutoSync: true },
      { context: 'content-script', tabId },
      1_000,
    ),
  setTimer: (callback, delay) => setTimeout(callback, delay),
  clearTimer: (timer) => clearTimeout(timer),
});

async function clearSuggestionManualOverrides(tabIds: ReadonlyArray<number>): Promise<void> {
  await withAutoSyncLock(async () => {
    for (const tabId of tabIds) {
      manualSyncOverriddenTabs.delete(tabId);
    }
  });

  if (autoSyncState.enabled !== true) {
    return;
  }

  for (const tabId of tabIds) {
    try {
      const tab = await browser.tabs.get(tabId);
      if (tab.url) {
        await updateAutoSyncGroup(tabId, tab.url);
      }
    } catch {
      // Closed tabs have no auto-sync membership to restore.
    }
  }
}

const acceptedSuggestionOrchestrator = createSyncSessionOrchestrator({
  getState: getSyncStateSnapshot,
  persistState: persistSyncState,
  commitState: commitSyncState,
  ensureContentScript: async (tabId) => {
    try {
      await browser.tabs.get(tabId);
      return true;
    } catch {
      return false;
    }
  },
  sendStart: (tabId, message) => {
    if (message.isAutoSync === true) {
      return sendMessageWithTimeout<StartSyncContentResponse>(
        'scroll:start',
        {
          tabIds: [...message.tabIds],
          mode: message.mode,
          currentTabId: message.currentTabId,
          isAutoSync: true,
        },
        { context: 'content-script', tabId },
        1_000,
      );
    }

    return sendMessageWithTimeout<StartSyncContentResponse>(
      'scroll:start',
      {
        tabIds: [...message.tabIds],
        mode: message.mode,
        currentTabId: message.currentTabId,
        isAutoSync: false,
        sessionEpoch: message.sessionEpoch,
      },
      { context: 'content-script', tabId },
      1_000,
    );
  },
  sendStop: (tabId, message) => {
    const contentMessage = {
      ...(message.tabIds === undefined ? {} : { tabIds: [...message.tabIds] }),
      ...(message.isAutoSync === undefined ? {} : { isAutoSync: message.isAutoSync }),
    };
    return sendMessageWithTimeout<{ success: boolean; tabId?: number; reason?: string }>(
      'scroll:stop',
      contentMessage,
      { context: 'content-script', tabId },
      1_000,
    );
  },
  revalidate: async (context, tabIds) => {
    if (getSyncStateSnapshot().revision !== context.expectedRevision) {
      return false;
    }
    const availability = await Promise.all(
      tabIds.map(async (tabId) => {
        try {
          await browser.tabs.get(tabId);
          return true;
        } catch {
          return false;
        }
      }),
    );
    return availability.every(Boolean);
  },
  overrideAdapter: manualOverrideAdapter,
  startKeepAlive,
  stopKeepAlive,
  clearManualOverrides: clearSuggestionManualOverrides,
  cleanupScheduler: suggestionCleanupScheduler,
  broadcastStatus: broadcastSyncStatus,
  recordRecentOutcome: (source, reason) => {
    logger.warn('[AUTO-SYNC] Accepted suggestion transition degraded', { source, reason });
  },
});

const legacyAutoSyncAdapter = createLegacyAutoSyncAdapter({
  groups: autoSyncState.groups,
  withLock: withAutoSyncLock,
  getState: getSyncStateSnapshot,
  cleanupScheduler: acceptedAutoCleanupScheduler,
  sendStart: async (tabId, message) => {
    try {
      const response = await sendMessageWithTimeout<StartSyncContentResponse>(
        'scroll:start',
        {
          tabIds: [...message.tabIds],
          mode: message.mode,
          currentTabId: message.currentTabId,
          isAutoSync: true,
        },
        { context: 'content-script', tabId },
        2_000,
      );
      return response.success && response.tabId === tabId;
    } catch {
      return false;
    }
  },
  sendStop: (tabId) =>
    sendMessageWithTimeout<{ success: boolean; tabId?: number; reason?: string }>(
      'scroll:stop',
      { isAutoSync: true },
      { context: 'content-script', tabId },
      1_000,
    ),
});

function broadcastSuggestionDismiss(normalizedUrl: string, tabIds: ReadonlyArray<number>): void {
  void Promise.allSettled(
    tabIds.map((targetTabId) =>
      sendMessageWithTimeout(
        'sync-suggestion:dismiss',
        { normalizedUrl },
        { context: 'content-script', tabId: targetTabId },
        1_000,
      ).catch(() => undefined),
    ),
  ).then((results) => {
    const successCount = results.filter((result) => result.status === 'fulfilled').length;
    logger.debug('[AUTO-SYNC] Dismiss sync suggestion toast broadcast', {
      totalTabs: tabIds.length,
      successCount,
    });
  });
}

function broadcastAddTabDismiss(tabId: number, tabIds: ReadonlyArray<number>): void {
  void Promise.allSettled(
    tabIds.map((targetTabId) =>
      sendMessageWithTimeout(
        'sync-suggestion:dismiss-add-tab',
        { tabId },
        { context: 'content-script', tabId: targetTabId },
        1_000,
      ).catch(() => undefined),
    ),
  ).then((results) => {
    const successCount = results.filter((result) => result.status === 'fulfilled').length;
    logger.debug('[AUTO-SYNC] Dismiss add-tab toast broadcast', {
      totalTabs: tabIds.length,
      successCount,
    });
  });
}

export function registerAutoSyncHandlers(): void {
  onMessage('auto-sync:status-changed', async ({ data }) => {
    const enabled = data.enabled;
    const readiness = await waitForBackgroundInitialization();
    if (readiness.manual.status !== 'ready' || readiness.auto.status !== 'ready') {
      return { success: false, reason: 'initialization-unavailable' };
    }

    await toggleAutoSync(enabled);
    return { success: true, enabled: autoSyncState.enabled };
  });

  onMessage('auto-sync:get-status', async () => {
    const readiness = await waitForBackgroundInitialization();
    if (readiness.manual.status !== 'ready' || readiness.auto.status !== 'ready') {
      return { success: false, reason: 'initialization-unavailable' };
    }

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
    const senderTabId = sender.tabId;
    const readiness = await waitForBackgroundInitialization();
    if (readiness.manual.status !== 'ready' || readiness.auto.status !== 'ready') {
      return { success: false, reason: 'initialization-unavailable' };
    }

    logger.debug('[AUTO-SYNC] get-detailed-status request', { senderTabId });

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

    if (senderTabId) {
      for (const [, group] of autoSyncState.groups.entries()) {
        if (group.tabIds.has(senderTabId)) {
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
    async ({
      data: { accepted, expectedRevision, normalizedUrl, permanent, snooze },
    }): Promise<SyncSuggestionDecisionResponse> => {
      const readiness = await waitForBackgroundInitialization();
      if (readiness.manual.status !== 'ready' || readiness.auto.status !== 'ready') {
        return { success: false, reason: 'initialization-unavailable' };
      }

      logger.info('[AUTO-SYNC] Received sync suggestion response', {
        accepted,
        permanent: permanent === true,
        snooze: snooze === true,
      });

      const group = autoSyncState.groups.get(normalizedUrl);
      const suggestionTabIds = group ? Array.from(group.tabIds) : [];

      if (accepted) {
        if (autoSyncState.enabled !== true) {
          return { success: false, reason: 'auto-sync-disabled' };
        }

        const result = await syncTransitionGate.run<AcceptedAutoSyncResult>(async (context) => {
          if (
            !Number.isSafeInteger(expectedRevision) ||
            expectedRevision !== context.expectedRevision
          ) {
            return { status: 'rejected', reason: 'stale-revision' };
          }

          const acceptedGroup = autoSyncState.groups.get(normalizedUrl);
          if (!acceptedGroup || acceptedGroup.tabIds.size < 2) {
            return { status: 'rejected', reason: 'auto-start-failed' };
          }

          return replaceManualWithAcceptedAutoSync(
            context,
            {
              normalizedUrl,
              tabIds: Array.from(acceptedGroup.tabIds),
              expectedRevision,
            },
            {
              orchestrator: acceptedSuggestionOrchestrator,
              legacyAutoSyncAdapter,
              getState: getSyncStateSnapshot,
              persistState: persistSyncState,
              commitState: commitSyncState,
            },
          );
        });

        if (result.status === 'rejected') {
          return {
            success: false,
            reason: result.reason,
            ...(result.warning === undefined ? {} : { warning: result.warning }),
          };
        }

        pendingSuggestions.delete(normalizedUrl);
        addTabSuggestedTabs.clear();
        broadcastSuggestionDismiss(normalizedUrl, suggestionTabIds);
        return { success: true, revision: result.revision };
      }

      pendingSuggestions.delete(normalizedUrl);
      if (suggestionTabIds.length > 0) {
        broadcastSuggestionDismiss(normalizedUrl, suggestionTabIds);
      }
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

      return { success: true };
    },
  );

  onMessage(
    'sync-suggestion:add-tab-response',
    async ({
      data: { accepted, expectedRevision, tabId, permanent, snooze, normalizedUrl },
    }): Promise<SyncSuggestionDecisionResponse> => {
      const readiness = await waitForBackgroundInitialization();
      if (readiness.manual.status !== 'ready' || readiness.auto.status !== 'ready') {
        return { success: false, reason: 'initialization-unavailable' };
      }

      logger.info('[AUTO-SYNC] Received add-tab suggestion response', {
        accepted,
        tabId,
        permanent: permanent === true,
        snooze: snooze === true,
      });

      const allTargetTabs = [...syncState.linkedTabs, tabId];
      const uniqueTargetTabs = [...new Set(allTargetTabs)];

      if (accepted) {
        if (autoSyncState.enabled !== true) {
          return { success: false, reason: 'auto-sync-disabled' };
        }

        const result = await syncTransitionGate.run<ManualAddResult>(async (context) => {
          if (
            !Number.isSafeInteger(expectedRevision) ||
            expectedRevision !== context.expectedRevision
          ) {
            return { status: 'rejected', reason: 'stale-revision' };
          }

          return acceptedSuggestionOrchestrator.addTabToManualSession(context, {
            tabId,
            expectedRevision,
            source: 'suggestion',
          });
        });

        if (result.status === 'rejected') {
          return { success: false, reason: result.reason };
        }

        broadcastAddTabDismiss(tabId, uniqueTargetTabs);
        return { success: true, revision: result.revision };
      }

      broadcastAddTabDismiss(tabId, uniqueTargetTabs);
      if (permanent && normalizedUrl) {
        const domain = extractDomainFromUrl(normalizedUrl);
        if (domain) {
          excludedDomains.add(domain);
          await saveExcludedDomains(Array.from(excludedDomains));
          logger.info('[AUTO-SYNC] User permanently excluded domain from add-tab suggestions', {
            tabId,
          });
        }
      } else if (snooze && normalizedUrl) {
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
    const domains = [...data.domains];
    await waitForBackgroundInitialization();

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
    await waitForBackgroundInitialization();
    const domains = await loadExcludedDomains();
    return { domains };
  });
}
