import { onMessage, sendMessage } from 'webext-bridge/background';
import browser from 'webextension-polyfill';

import {
  getManualAdjustmentHintDecision,
  isPendingUrlSyncContextualHintId,
} from '~/shared/lib/contextual-hints';
import { ExtensionLogger } from '~/shared/lib/logger';
import { isContextualHintDismissed } from '~/shared/lib/storage';
import type {
  ContextualHintScrollMetrics,
  ContextualHintShowMessage,
} from '~/shared/types/contextual-hints';
import type {
  ContentRuntimeDegradedMessage,
  ContentRuntimeDegradedResponse,
  ConsumePendingUrlSyncContextualHintResponse,
  SavePendingUrlSyncContextualHintResponse,
  StartSyncConnectionResults,
  StartSyncContentResponse,
  StopManualSyncMessage,
  UrlSyncBackgroundResponse,
  UrlSyncMessage,
} from '~/shared/types/messages';
import type { ManualStopResult, SessionMessageIdentity } from '~/shared/types/sync-session';

import {
  broadcastAutoSyncGroupUpdate,
  getAutoSyncGroupMembers,
  stopAutoSyncForGroup,
  updateAutoSyncGroup,
} from '../lib/auto-sync-groups';
import { autoSyncState, manualSyncOverriddenTabs, withAutoSyncLock } from '../lib/auto-sync-state';
import {
  getManualReadinessSnapshot,
  waitForBackgroundInitialization,
} from '../lib/background-initialization';
import { isContentScriptAlive } from '../lib/content-script-manager';
import {
  consumePendingUrlSyncContextualHint,
  savePendingUrlSyncContextualHint,
} from '../lib/contextual-hint-state';
import { startKeepAlive, stopKeepAlive } from '../lib/keep-alive';
import { manualOverrideAdapter } from '../lib/manual-override-adapter';
import { isAuthorizedManualSessionMessage } from '../lib/manual-session-authorization';
import { sendMessageWithTimeout } from '../lib/messaging';
import { createManualCleanupRetryScheduler } from '../lib/sync-cleanup-retry';
import {
  createManualSessionLifecycleController,
  createSyncSessionOrchestrator,
} from '../lib/sync-session-orchestrator';
import {
  syncState,
  getSyncStateSnapshot,
  commitSyncState,
  persistSyncState,
  broadcastSyncStatus,
} from '../lib/sync-state';
import { syncTransitionGate } from '../lib/sync-transition-gate';

import { quickSyncCoordinator } from './quick-sync-command-handler';

const logger = new ExtensionLogger({ scope: 'background/scroll-sync-handlers' });
const MANUAL_ADJUSTMENT_HINT_ID = 'manual-scroll-adjustment';
const MANUAL_ADJUSTMENT_HINT_MESSAGE: ContextualHintShowMessage = {
  hintId: MANUAL_ADJUSTMENT_HINT_ID,
  surface: 'webpage-overlay',
  source: 'sync-start',
};

const manualCleanupScheduler = createManualCleanupRetryScheduler({
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

async function clearManualOverrides(tabIds: ReadonlyArray<number>): Promise<void> {
  await withAutoSyncLock(async () => {
    for (const tabId of tabIds) {
      manualSyncOverriddenTabs.delete(tabId);
    }
  });

  if (!autoSyncState.enabled) {
    return;
  }
  for (const tabId of tabIds) {
    try {
      const tab = await browser.tabs.get(tabId);
      if (tab.url) {
        await updateAutoSyncGroup(tabId, tab.url);
      }
    } catch {
      // Closed tabs have no auto membership to restore.
    }
  }
}

const manualLifecycleController = createManualSessionLifecycleController({
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
  clearManualOverrides,
  cleanupScheduler: manualCleanupScheduler,
  broadcastStatus: broadcastSyncStatus,
});

function getAuthorizedRelayTargets(
  identity: SessionMessageIdentity,
  senderTabId: number | undefined,
): Array<number> | null {
  if (identity.isAutoSync) {
    if (!Number.isSafeInteger(senderTabId) || senderTabId !== identity.sourceTabId) {
      return null;
    }
    const targets = getAutoSyncGroupMembers(identity.sourceTabId);
    return targets.length > 0 ? targets : null;
  }

  if (!isAuthorizedManualSessionMessage(syncState, senderTabId, identity)) {
    return null;
  }

  return syncState.linkedTabs.filter((tabId) => tabId !== identity.sourceTabId);
}

type UrlSyncContentFailureReason =
  | 'stale-operation'
  | 'offset-clear-failed'
  | 'offset-reconciliation-failed';

function readUrlSyncContentFailureReason(value: unknown): UrlSyncContentFailureReason | null {
  if (typeof value !== 'object' || value === null || Reflect.get(value, 'success') !== false) {
    return null;
  }

  const reason = Reflect.get(value, 'reason');
  if (
    reason === 'stale-operation' ||
    reason === 'offset-clear-failed' ||
    reason === 'offset-reconciliation-failed'
  ) {
    return reason;
  }
  return null;
}

type RuntimeReconciliationIdentity = ContentRuntimeDegradedMessage | UrlSyncMessage;

function getAutoSyncGroupActivationGeneration(group: {
  activationGeneration?: number;
}): number | null {
  const generation = group.activationGeneration ?? 0;
  return Number.isSafeInteger(generation) && generation >= 0 ? generation : null;
}

function isCurrentAutoSyncActivation(
  identity: RuntimeReconciliationIdentity,
  memberTabIds: ReadonlyArray<number>,
): boolean {
  if (
    !identity.isAutoSync ||
    !Number.isSafeInteger(identity.autoSyncGeneration) ||
    identity.autoSyncGeneration < 0
  ) {
    return false;
  }

  for (const [, group] of autoSyncState.groups.entries()) {
    if (
      group.isActive &&
      getAutoSyncGroupActivationGeneration(group) === identity.autoSyncGeneration &&
      group.tabIds.has(identity.sourceTabId) &&
      memberTabIds.every((tabId) => group.tabIds.has(tabId))
    ) {
      return true;
    }
  }
  return false;
}

async function recordRuntimeReconciliationFailure(
  identity: RuntimeReconciliationIdentity,
  failedTabIds: ReadonlyArray<number>,
): Promise<ContentRuntimeDegradedResponse> {
  const uniqueFailedTabIds = [...new Set(failedTabIds)];

  if (identity.isAutoSync) {
    const stoppedGroupCount = await withAutoSyncLock(async () => {
      const matchingGroupKeys: Array<string> = [];
      for (const [groupKey, group] of autoSyncState.groups.entries()) {
        if (
          group.isActive &&
          getAutoSyncGroupActivationGeneration(group) === identity.autoSyncGeneration &&
          group.tabIds.has(identity.sourceTabId) &&
          uniqueFailedTabIds.some((tabId) => group.tabIds.has(tabId))
        ) {
          matchingGroupKeys.push(groupKey);
        }
      }

      for (const groupKey of matchingGroupKeys) {
        await stopAutoSyncForGroup(groupKey);
      }
      return matchingGroupKeys.length;
    });

    if (stoppedGroupCount === 0) {
      return {
        success: false,
        reason: 'stale-operation',
        revision: getSyncStateSnapshot().revision,
      };
    }

    await broadcastAutoSyncGroupUpdate();
    return { success: true, revision: getSyncStateSnapshot().revision };
  }

  return syncTransitionGate.run(async (context) => {
    const currentState = getSyncStateSnapshot();
    if (
      currentState.revision !== context.expectedRevision ||
      !isAuthorizedManualSessionMessage(currentState, identity.sourceTabId, identity) ||
      uniqueFailedTabIds.some((tabId) => !currentState.linkedTabs.includes(tabId))
    ) {
      return {
        success: false,
        reason: 'stale-operation',
        revision: currentState.revision,
      };
    }

    const nextConnectionStatuses = { ...currentState.connectionStatuses };
    let changed = false;
    for (const tabId of uniqueFailedTabIds) {
      if (nextConnectionStatuses[tabId] !== 'error') {
        nextConnectionStatuses[tabId] = 'error';
        changed = true;
      }
    }
    if (!changed) {
      return { success: true, revision: currentState.revision };
    }

    const candidate = {
      ...currentState,
      linkedTabs: [...currentState.linkedTabs],
      connectionStatuses: nextConnectionStatuses,
      revision: currentState.revision + 1,
    };
    const persistence = await persistSyncState(candidate);
    if (persistence.status === 'storage-error') {
      return {
        success: false,
        reason: 'persistence-failed',
        revision: currentState.revision,
      };
    }

    const latestState = getSyncStateSnapshot();
    if (
      latestState.revision !== context.expectedRevision ||
      latestState.sessionEpoch !== currentState.sessionEpoch
    ) {
      return {
        success: false,
        reason: 'stale-operation',
        revision: latestState.revision,
      };
    }

    commitSyncState(candidate);
    await broadcastSyncStatus().catch(() => undefined);
    return { success: true, revision: candidate.revision };
  });
}

function isValidScrollMetrics(
  metrics: StartSyncContentResponse['metrics'],
  tabId: number,
): metrics is ContextualHintScrollMetrics {
  if (metrics === undefined || metrics.tabId !== tabId) {
    return false;
  }

  const expectedScrollableHeight = Math.max(0, metrics.scrollHeight - metrics.clientHeight);

  return (
    Number.isFinite(metrics.scrollHeight) &&
    Number.isFinite(metrics.clientHeight) &&
    Number.isFinite(metrics.scrollableHeight) &&
    metrics.scrollHeight >= 0 &&
    metrics.clientHeight >= 0 &&
    metrics.scrollableHeight === expectedScrollableHeight
  );
}

async function maybeShowManualAdjustmentHint(
  metrics: ReadonlyArray<ContextualHintScrollMetrics>,
  connectedTabIds: ReadonlyArray<number>,
): Promise<void> {
  const decision = getManualAdjustmentHintDecision(metrics);

  if (!decision.shouldShow) {
    return;
  }

  const isDismissed = await isContextualHintDismissed(MANUAL_ADJUSTMENT_HINT_ID);

  if (isDismissed) {
    logger.debug('Skipping contextual hint because it was dismissed', {
      hintId: MANUAL_ADJUSTMENT_HINT_ID,
      connectedTabCount: connectedTabIds.length,
      reason: 'dismissed',
    });
    return;
  }

  const results = await Promise.allSettled(
    connectedTabIds.map((tabId) =>
      sendMessage('contextual-hint:show', MANUAL_ADJUSTMENT_HINT_MESSAGE, {
        context: 'content-script',
        tabId,
      }),
    ),
  );
  const failedCount = results.filter((result) => result.status === 'rejected').length;

  if (failedCount > 0) {
    logger.debug('Failed to send contextual hint to some tabs', {
      hintId: MANUAL_ADJUSTMENT_HINT_ID,
      connectedTabCount: connectedTabIds.length,
      failedCount,
      reason: 'send-failed',
    });
  }
}

async function ensurePopupContentScript(tabId: number): Promise<boolean> {
  try {
    await browser.tabs.get(tabId);
    const isAlive = await Promise.race([
      isContentScriptAlive(tabId),
      new Promise<false>((resolve) => {
        setTimeout(() => resolve(false), 250);
      }),
    ]);
    if (isAlive) {
      return true;
    }

    await browser.scripting.executeScript({
      target: { tabId },
      files: ['dist/contentScripts/index.global.js'],
    });
    return true;
  } catch {
    return false;
  }
}

function getPopupStartError(
  reason:
    | 'unsupported-page'
    | 'content-unreachable'
    | 'candidate-tab-missing'
    | 'connection-timeout'
    | 'invalid-acknowledgement'
    | 'offset-reconciliation-failed'
    | 'persistence-failed'
    | 'auto-sync-degraded'
    | 'session-state-unavailable'
    | 'hud-unavailable'
    | 'stale-revision'
    | 'not-active',
): string {
  switch (reason) {
    case 'connection-timeout':
      return 'Timeout after 1000ms';
    case 'invalid-acknowledgement':
      return 'Invalid acknowledgment';
    case 'offset-reconciliation-failed':
      return 'Failed to restore the saved manual scroll position';
    case 'persistence-failed':
      return 'Failed to persist synchronization state';
    case 'stale-revision':
      return 'Synchronization state changed';
    case 'not-active':
      return 'A synchronization session is already active';
    default:
      return 'Could not establish connection';
  }
}

async function startPopupManualSession(startRequest: {
  tabIds: Array<number>;
  mode: 'ratio' | 'element';
}): Promise<{
  success: boolean;
  connectedTabs: Array<number>;
  connectionResults: StartSyncConnectionResults;
  revision: number;
  error?: string;
  warning?: 'auto-sync-degraded';
}> {
  const connectionResults: StartSyncConnectionResults = {};
  const connectedScrollMetrics: Array<ContextualHintScrollMetrics> = [];
  const orchestrator = createSyncSessionOrchestrator({
    getState: getSyncStateSnapshot,
    persistState: persistSyncState,
    commitState: commitSyncState,
    ensureContentScript: ensurePopupContentScript,
    sendStart: async (tabId, message) => {
      try {
        let response: StartSyncContentResponse;
        if (message.isAutoSync === true) {
          response = await sendMessageWithTimeout<StartSyncContentResponse>(
            'scroll:start',
            {
              tabIds: message.tabIds,
              mode: message.mode,
              currentTabId: message.currentTabId,
              isAutoSync: true,
              autoSyncGeneration: message.autoSyncGeneration,
            },
            { context: 'content-script', tabId },
            1_000,
          );
        } else {
          response = await sendMessageWithTimeout<StartSyncContentResponse>(
            'scroll:start',
            {
              tabIds: message.tabIds,
              mode: message.mode,
              currentTabId: message.currentTabId,
              isAutoSync: false,
              sessionEpoch: message.sessionEpoch,
            },
            { context: 'content-script', tabId },
            1_000,
          );
        }
        if (response.success && response.tabId === tabId) {
          connectionResults[tabId] = { success: true };
          if (isValidScrollMetrics(response.metrics, tabId)) {
            connectedScrollMetrics.push(response.metrics);
          }
        } else {
          connectionResults[tabId] = {
            success: false,
            error:
              response.reason === 'offset-reconciliation-failed'
                ? getPopupStartError(response.reason)
                : 'Invalid acknowledgment',
          };
        }
        return response;
      } catch (error) {
        connectionResults[tabId] = {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
        throw error;
      }
    },
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
    revalidate: async (context, connectedTabIds) => {
      if (getSyncStateSnapshot().revision !== context.expectedRevision) {
        return false;
      }
      const results = await Promise.allSettled(
        connectedTabIds.map((tabId) => browser.tabs.get(tabId)),
      );
      return results.every((result) => result.status === 'fulfilled');
    },
    overrideAdapter: manualOverrideAdapter,
    startKeepAlive,
    stopKeepAlive,
    clearManualOverrides,
    cleanupScheduler: manualCleanupScheduler,
    broadcastStatus: broadcastSyncStatus,
    recordRecentOutcome: () => undefined,
  });

  const result = await syncTransitionGate.run(async (context) => {
    const transitionResult = await orchestrator.startManualSession(context, {
      tabIds: [...startRequest.tabIds],
      mode: startRequest.mode,
      source: 'popup',
      requireAll: false,
    });
    if (transitionResult.status === 'committed') {
      await quickSyncCoordinator.invalidateCandidate(context, 'consumed');
    }
    return transitionResult;
  });

  for (const tabId of startRequest.tabIds) {
    if (connectionResults[tabId] === undefined) {
      connectionResults[tabId] = {
        success: false,
        error:
          result.status === 'rejected'
            ? getPopupStartError(result.reason)
            : 'Could not establish connection',
      };
    }
  }

  const connectedTabs =
    result.status === 'committed'
      ? result.connectedTabIds
      : Object.entries(connectionResults)
          .filter(([, connection]) => connection.success)
          .map(([tabId]) => Number(tabId));

  if (result.status === 'rejected') {
    return {
      success: false,
      connectedTabs,
      connectionResults,
      revision: getSyncStateSnapshot().revision,
      error: getPopupStartError(result.reason),
      ...(result.warning === undefined ? {} : { warning: result.warning }),
    };
  }

  await maybeShowManualAdjustmentHint(connectedScrollMetrics, result.connectedTabIds);
  return {
    success: true,
    connectedTabs: result.connectedTabIds,
    connectionResults,
    revision: result.revision,
    ...(result.warning === undefined ? {} : { warning: result.warning }),
  };
}

export function registerScrollSyncHandlers(): void {
  logger.info('Registering scroll:start handler');
  onMessage('contextual-hint:save-pending-url-sync', ({ data, sender }) => {
    if (!sender.tabId || !isPendingUrlSyncContextualHintId(data.hintId)) {
      const response: SavePendingUrlSyncContextualHintResponse = { status: 'failed' };
      return response;
    }

    savePendingUrlSyncContextualHint(sender.tabId, data.hintId);
    const response: SavePendingUrlSyncContextualHintResponse = { status: 'success' };
    return response;
  });

  onMessage('contextual-hint:consume-pending-url-sync', ({ sender }) => {
    if (!sender.tabId) {
      const response: ConsumePendingUrlSyncContextualHintResponse = { status: 'failed' };
      return response;
    }

    const response: ConsumePendingUrlSyncContextualHintResponse = {
      status: 'success',
      hintId: consumePendingUrlSyncContextualHint(sender.tabId),
    };
    return response;
  });

  onMessage('scroll:start', async ({ data }) => {
    const startRequest = {
      ...data,
      tabIds: [...data.tabIds],
    };
    const readiness = await waitForBackgroundInitialization();
    if (readiness.manual.status !== 'ready') {
      return {
        success: false,
        connectedTabs: [],
        connectionResults: {},
        revision: syncState.revision,
        error: 'Session state unavailable',
      };
    }

    logger.info('Received scroll:start message', {
      requestedTabCount: startRequest.tabIds.length,
      mode: startRequest.mode,
      isAutoSync: startRequest.isAutoSync ?? false,
    });

    if (startRequest.isAutoSync === true) {
      return {
        success: false,
        connectedTabs: [],
        connectionResults: {},
        revision: syncState.revision,
        error: 'Accepted auto-sync must use the auto-sync adapter',
      };
    }

    return startPopupManualSession({
      tabIds: startRequest.tabIds,
      mode: startRequest.mode,
    });
  });

  onMessage('scroll:stop', async ({ data }) => {
    const readiness = await waitForBackgroundInitialization();
    if (readiness.manual.status !== 'ready') {
      const rejection: ManualStopResult = {
        status: 'rejected',
        reason: 'session-state-unavailable',
      };
      return rejection;
    }

    if (data.isAutoSync === true) {
      const tabIds = data.tabIds ?? [];
      await Promise.all(
        tabIds.map((tabId) =>
          sendMessage('scroll:stop', data, { context: 'content-script', tabId }).catch((error) => {
            logger.error(`Failed to send auto stop message to tab ${tabId}`, { error });
          }),
        ),
      );
      for (const [, group] of autoSyncState.groups.entries()) {
        if (group.isActive && tabIds.some((tabId) => group.tabIds.has(tabId))) {
          group.isActive = false;
        }
      }
      return { success: true };
    }

    const expectedRevision = data.expectedRevision;
    if (
      typeof expectedRevision !== 'number' ||
      !Number.isSafeInteger(expectedRevision) ||
      expectedRevision < 0
    ) {
      const rejection: ManualStopResult = {
        status: 'rejected',
        reason: 'stale-revision',
      };
      return rejection;
    }
    const stopMessage: StopManualSyncMessage = { expectedRevision };

    return syncTransitionGate.run((context) => {
      if (stopMessage.expectedRevision !== context.expectedRevision) {
        const rejection: ManualStopResult = {
          status: 'rejected',
          reason: 'stale-revision',
        };
        return Promise.resolve(rejection);
      }
      return manualLifecycleController.stopManualSession(context, 'popup');
    });
  });

  onMessage('scroll:sync', ({ data, sender }) => {
    if (getManualReadinessSnapshot() !== 'ready') {
      return Promise.resolve({ success: false, reason: 'session-state-unavailable' });
    }

    const payload = data;
    const targetTabIds = getAuthorizedRelayTargets(payload, sender.tabId);
    if (targetTabIds === null) {
      return Promise.resolve({ success: false, reason: 'unauthorized-session' });
    }

    return (async () => {
      logger.debug('Relaying scroll sync message', {
        sourceTabId: payload.sourceTabId,
        mode: payload.mode,
        hasSenderTab: sender.tabId !== undefined,
      });

      if (targetTabIds.length === 0) {
        logger.debug('No target tabs to relay scroll sync to');
        return { success: true };
      }

      const promises = targetTabIds.map((tabId) =>
        sendMessage('scroll:sync', data, { context: 'content-script', tabId }).catch((error) => {
          logger.debug(`Failed to relay scroll sync to tab ${tabId}`, { error });
        }),
      );

      await Promise.all(promises);
      return { success: true };
    })();
  });

  onMessage('scroll:manual', ({ data, sender }) => {
    if (getManualReadinessSnapshot() !== 'ready') {
      return Promise.resolve({ success: false, reason: 'session-state-unavailable' });
    }

    const payload = data;
    const targets = getAuthorizedRelayTargets(payload, sender.tabId);
    if (targets === null || payload.tabId !== payload.sourceTabId) {
      return Promise.resolve({ success: false, reason: 'unauthorized-session' });
    }

    return (async () => {
      logger.debug('Manual scroll mode toggled', {
        tabId: payload.tabId,
        enabled: payload.enabled,
      });

      // Send manual mode change to the specific tab only
      try {
        await sendMessage('scroll:manual', data, {
          context: 'content-script',
          tabId: payload.tabId,
        });
      } catch (error) {
        logger.debug(`Failed to send manual mode to tab ${payload.tabId}`, { error });
      }

      return { success: true };
    })();
  });

  onMessage('scroll:baseline-update', ({ data, sender }) => {
    if (getManualReadinessSnapshot() !== 'ready') {
      return Promise.resolve({ success: false, reason: 'session-state-unavailable' });
    }

    const targetTabIds = getAuthorizedRelayTargets(data, sender.tabId);
    if (targetTabIds === null) {
      return Promise.resolve({ success: false, reason: 'unauthorized-session' });
    }

    return Promise.all(
      targetTabIds.map((tabId) =>
        sendMessage('scroll:baseline-update', data, {
          context: 'content-script',
          tabId,
        }).catch((error) => {
          logger.debug(`Failed to relay baseline update to tab ${tabId}`, { error });
        }),
      ),
    ).then(() => ({ success: true }));
  });

  onMessage('sync:runtime-degraded', ({ data, sender }) => {
    const currentRevision = getSyncStateSnapshot().revision;
    if (getManualReadinessSnapshot() !== 'ready') {
      const response: ContentRuntimeDegradedResponse = {
        success: false,
        reason: 'session-state-unavailable',
        revision: currentRevision,
      };
      return Promise.resolve(response);
    }
    if (
      !Number.isSafeInteger(sender.tabId) ||
      sender.tabId !== data.sourceTabId ||
      data.reason !== 'offset-reconciliation-failed'
    ) {
      const response: ContentRuntimeDegradedResponse = {
        success: false,
        reason: 'unauthorized-session',
        revision: currentRevision,
      };
      return Promise.resolve(response);
    }

    const payload: ContentRuntimeDegradedMessage = data;
    return recordRuntimeReconciliationFailure(payload, [payload.sourceTabId]);
  });

  onMessage('url:sync', ({ data, sender }) => {
    if (getManualReadinessSnapshot() !== 'ready') {
      const response: UrlSyncBackgroundResponse = {
        success: false,
        reason: 'session-state-unavailable',
      };
      return Promise.resolve(response);
    }

    const payload = data;
    const targetTabIds = getAuthorizedRelayTargets(payload, sender.tabId);
    if (targetTabIds === null) {
      const response: UrlSyncBackgroundResponse = {
        success: false,
        reason: 'unauthorized-session',
      };
      return Promise.resolve(response);
    }
    if (payload.isAutoSync && !isCurrentAutoSyncActivation(payload, targetTabIds)) {
      const response: UrlSyncBackgroundResponse = {
        success: false,
        reason: 'stale-operation',
        revision: getSyncStateSnapshot().revision,
      };
      return Promise.resolve(response);
    }

    return (async () => {
      logger.info('Relaying URL sync message', { sourceTabId: payload.sourceTabId });

      // Broadcast to all synced tabs except the source
      const relayResults = await Promise.all(
        targetTabIds.map(async (tabId) => {
          try {
            const response = await sendMessage('url:sync', data, {
              context: 'content-script',
              tabId,
            });
            return { tabId, response };
          } catch (error) {
            logger.debug(`Failed to relay URL sync to tab ${tabId}`, { error });
            return { tabId, response: null };
          }
        }),
      );

      const reconciliationFailedTabIds = relayResults
        .filter(
          ({ response }) =>
            readUrlSyncContentFailureReason(response) === 'offset-reconciliation-failed',
        )
        .map(({ tabId }) => tabId);
      if (reconciliationFailedTabIds.length > 0) {
        const transition = await recordRuntimeReconciliationFailure(
          payload,
          reconciliationFailedTabIds,
        );
        if (!transition.success) {
          const response: UrlSyncBackgroundResponse = transition;
          return response;
        }
        const response: UrlSyncBackgroundResponse = {
          success: false,
          reason: 'offset-reconciliation-failed',
          revision: transition.revision,
        };
        return response;
      }

      const clearFailed = relayResults.some(
        ({ response }) => readUrlSyncContentFailureReason(response) === 'offset-clear-failed',
      );
      if (clearFailed) {
        const response: UrlSyncBackgroundResponse = {
          success: false,
          reason: 'offset-clear-failed',
          revision: getSyncStateSnapshot().revision,
        };
        return response;
      }

      const stale = relayResults.some(
        ({ response }) => readUrlSyncContentFailureReason(response) === 'stale-operation',
      );
      if (stale) {
        const response: UrlSyncBackgroundResponse = {
          success: false,
          reason: 'stale-operation',
          revision: getSyncStateSnapshot().revision,
        };
        return response;
      }

      const response: UrlSyncBackgroundResponse = { success: true };
      return response;
    })();
  });

  // Handler for URL sync enabled state change broadcast
  onMessage('sync:url-enabled-changed', async ({ data, sender }) => {
    const sourceTabId = sender.tabId;
    const payload = { ...data };
    const readiness = await waitForBackgroundInitialization();
    if (readiness.manual.status !== 'ready') {
      return { success: false, reason: 'session-state-unavailable' };
    }

    logger.info('Relaying URL sync enabled change', { enabled: payload.enabled, sourceTabId });

    // Broadcast to all synced tabs except the source
    const targetTabIds = syncState.linkedTabs.filter((tabId) => tabId !== sourceTabId);
    const promises = targetTabIds.map((tabId) =>
      sendMessage('sync:url-enabled-changed', payload, { context: 'content-script', tabId }).catch(
        (error) => {
          logger.debug(`Failed to relay URL sync enabled to tab ${tabId}`, { error });
        },
      ),
    );

    await Promise.all(promises);
    return { success: true };
  });

  onMessage('sync:url-mode-changed', async ({ data, sender }) => {
    const sourceTabId = sender.tabId;
    const payload = { ...data };
    const readiness = await waitForBackgroundInitialization();
    if (readiness.manual.status !== 'ready') {
      return { success: false, reason: 'session-state-unavailable' };
    }

    logger.info('Relaying URL sync mode change', { mode: payload.mode, sourceTabId });

    const targetTabIds =
      sourceTabId === undefined
        ? syncState.linkedTabs
        : syncState.linkedTabs.filter((tabId) => tabId !== sourceTabId);

    const promises = targetTabIds.map((tabId) =>
      sendMessage('sync:url-mode-changed', payload, {
        context: 'content-script',
        tabId,
      }).catch((error) => {
        logger.debug(`Failed to relay URL sync mode to tab ${tabId}`, { error });
      }),
    );

    await Promise.all(promises);
    return { success: true };
  });
}
