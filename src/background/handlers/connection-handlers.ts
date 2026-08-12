import { onMessage } from 'webext-bridge/background';
import browser from 'webextension-polyfill';

import type { AutoSyncActivationId } from '~/shared/lib/auto-sync-activation';
import { ExtensionLogger } from '~/shared/lib/logger';
import { loadManualScrollOffsetsStrict, type ManualScrollOffset } from '~/shared/lib/storage';
import type { StartSyncContentMessage, StartSyncContentResponse } from '~/shared/types/messages';
import type { RecentQuickSyncOutcome } from '~/shared/types/quick-sync';
import type {
  ManualReconnectResult,
  SyncStatusResponseMessage,
  SyncStatusViewerContext,
} from '~/shared/types/sync-session';

import {
  getAutoSyncActivationGenerationForTab,
  removeTabFromAllAutoSyncGroups,
  getAutoSyncGroupMembers,
  isTabInActiveAutoSyncGroup,
} from '../lib/auto-sync-groups';
import { manualSyncOverriddenTabs, withAutoSyncLock } from '../lib/auto-sync-state';
import { waitForBackgroundInitialization } from '../lib/background-initialization';
import { reinjectContentScript, reinjectManualReconnect } from '../lib/content-script-manager';
import { stopKeepAlive } from '../lib/keep-alive';
import { sendMessageWithTimeout } from '../lib/messaging';
import { createManualCleanupRetryScheduler } from '../lib/sync-cleanup-retry';
import {
  createManualSessionLifecycleController,
  executeManualReconnect,
} from '../lib/sync-session-orchestrator';
import {
  buildContentManualSyncSnapshot,
  buildManualSyncSnapshot,
} from '../lib/sync-session-snapshot';
import {
  syncState,
  getSyncStateSnapshot,
  persistSyncState,
  commitSyncState,
  broadcastSyncStatus,
} from '../lib/sync-state';
import { syncTransitionGate } from '../lib/sync-transition-gate';

import type { ReinjectionContext } from '../lib/content-script-manager';
import type { ManualSessionLifecycleController } from '../lib/sync-session-orchestrator';

const logger = new ExtensionLogger({ scope: 'background/connection-handlers' });

function createConnectionLifecycleController(): ManualSessionLifecycleController {
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

async function reconnectManualTab(
  controller: ManualSessionLifecycleController,
  tabId: number,
  reinject: boolean,
): Promise<{ result: Awaited<ReturnType<typeof executeManualReconnect>>; tabMissing: boolean }> {
  let tabMissing = false;
  const result = await executeManualReconnect({
    controller,
    transitionGate: syncTransitionGate,
    tabId,
    isTabAvailable: async () => {
      try {
        await browser.tabs.get(tabId);
        return true;
      } catch {
        tabMissing = true;
        return false;
      }
    },
    sendHandshake: async (token): Promise<StartSyncContentResponse> => {
      if (reinject) {
        return reinjectManualReconnect(token, () => {
          const state = getSyncStateSnapshot();
          return (
            state.isActive &&
            state.revision === token.revision &&
            state.sessionEpoch === token.sessionEpoch &&
            state.linkedTabs.includes(tabId)
          );
        });
      }

      return sendMessageWithTimeout<StartSyncContentResponse>(
        'scroll:start',
        {
          tabIds: [...token.startMessage.tabIds],
          mode: token.startMessage.mode,
          currentTabId: token.startMessage.currentTabId,
          isAutoSync: false,
          sessionEpoch: token.sessionEpoch,
        },
        { context: 'content-script', tabId },
        3_000,
      );
    },
  });

  return { result, tabMissing };
}

interface ManualRecoverySnapshot {
  tabId: number;
  sessionEpoch: number;
  linkedTabIds: Array<number>;
  mode: 'ratio' | 'element';
}

interface AutoRecoverySnapshot {
  tabId: number;
  groupTabIds: Array<number>;
  activationGeneration: AutoSyncActivationId;
  mode: 'ratio';
}

function captureManualRecovery(tabId: number): ManualRecoverySnapshot | null {
  if (!syncState.isActive || !syncState.linkedTabs.includes(tabId)) {
    return null;
  }

  return {
    tabId,
    sessionEpoch: syncState.sessionEpoch,
    linkedTabIds: [...syncState.linkedTabs],
    mode: syncState.mode || 'ratio',
  };
}

function getCurrentAutoGroupTabIds(tabId: number): Array<number> {
  return [...new Set([...getAutoSyncGroupMembers(tabId), tabId])];
}

function captureAutoRecovery(tabId: number): AutoRecoverySnapshot | null {
  if (!isTabInActiveAutoSyncGroup(tabId)) {
    return null;
  }
  const activationGeneration = getAutoSyncActivationGenerationForTab(tabId);
  if (activationGeneration === null) {
    return null;
  }

  return {
    tabId,
    groupTabIds: getCurrentAutoGroupTabIds(tabId),
    activationGeneration,
    mode: 'ratio',
  };
}

function haveSameTabIds(left: ReadonlyArray<number>, right: ReadonlyArray<number>): boolean {
  return left.length === right.length && left.every((tabId) => right.includes(tabId));
}

function isCurrentAutoRecovery(snapshot: AutoRecoverySnapshot): boolean {
  return (
    isTabInActiveAutoSyncGroup(snapshot.tabId) &&
    getAutoSyncActivationGenerationForTab(snapshot.tabId) === snapshot.activationGeneration &&
    haveSameTabIds(snapshot.groupTabIds, getCurrentAutoGroupTabIds(snapshot.tabId))
  );
}

export interface ConnectionHandlerDependencies {
  getRecentQuickSyncOutcome: () => RecentQuickSyncOutcome | undefined;
  now: () => number;
}

const defaultConnectionHandlerDependencies: ConnectionHandlerDependencies = {
  getRecentQuickSyncOutcome: () => undefined,
  now: Date.now,
};

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

async function resolveSyncStatusViewer(
  request: unknown,
  senderContext: unknown,
  senderTabId: unknown,
): Promise<{
  source: 'popup' | 'content-script';
  viewer: SyncStatusViewerContext;
} | null> {
  if (typeof request !== 'object' || request === null) {
    return null;
  }

  const source = Reflect.get(request, 'source');
  if (source === 'popup') {
    if (senderContext !== 'popup') {
      return null;
    }
    const viewerTabId = Reflect.get(request, 'viewerTabId');
    const viewerWindowId = Reflect.get(request, 'viewerWindowId');
    return isPositiveSafeInteger(viewerTabId) && isPositiveSafeInteger(viewerWindowId)
      ? {
          source: 'popup',
          viewer: { viewerTabId, viewerWindowId },
        }
      : null;
  }

  if (
    source !== 'content-script' ||
    senderContext !== 'content-script' ||
    !isPositiveSafeInteger(senderTabId)
  ) {
    return null;
  }

  try {
    const senderTab = await browser.tabs.get(senderTabId);
    if (senderTab.id !== senderTabId || !isPositiveSafeInteger(senderTab.windowId)) {
      return null;
    }
    return {
      source: 'content-script',
      viewer: {
        viewerTabId: senderTabId,
        viewerWindowId: senderTab.windowId,
      },
    };
  } catch {
    return null;
  }
}

function getMatchingRecentOutcome(
  requestSource: 'popup' | 'content-script',
  viewer: SyncStatusViewerContext,
  dependencies: ConnectionHandlerDependencies,
): RecentQuickSyncOutcome | undefined {
  if (requestSource !== 'popup') {
    return undefined;
  }

  const outcome = dependencies.getRecentQuickSyncOutcome();
  return outcome?.tabId === viewer.viewerTabId && outcome.expiresAt > dependencies.now()
    ? outcome
    : undefined;
}

export function registerConnectionHandlers(
  dependencies: ConnectionHandlerDependencies = defaultConnectionHandlerDependencies,
): void {
  const manualLifecycleController = createConnectionLifecycleController();

  onMessage('sync:get-status', async ({ data, sender }) => {
    const readiness = await waitForBackgroundInitialization();
    if (readiness.manual.status !== 'ready') {
      const response: SyncStatusResponseMessage = {
        status: 'error',
        reason: readiness.manual.status === 'storage-error' ? 'storage-error' : 'invalid-state',
      };
      return response;
    }

    const resolvedViewer = await resolveSyncStatusViewer(data, sender.context, sender.tabId);
    if (resolvedViewer === null) {
      const response: SyncStatusResponseMessage = {
        status: 'error',
        reason: 'invalid-viewer-context',
      };
      return response;
    }

    const { source, viewer } = resolvedViewer;
    const recentQuickSyncOutcome = getMatchingRecentOutcome(source, viewer, dependencies);
    const state = getSyncStateSnapshot();

    if (!state.isActive) {
      const response: SyncStatusResponseMessage =
        source === 'popup'
          ? {
              status: 'inactive',
              source,
              revision: state.revision,
              sessionEpoch: state.sessionEpoch,
              ...(recentQuickSyncOutcome === undefined ? {} : { recentQuickSyncOutcome }),
            }
          : {
              status: 'inactive',
              source,
              revision: state.revision,
              sessionEpoch: state.sessionEpoch,
            };
      return response;
    }

    if (source === 'content-script') {
      if (!state.linkedTabs.includes(viewer.viewerTabId)) {
        const response: SyncStatusResponseMessage = {
          status: 'error',
          reason: 'invalid-viewer-context',
        };
        return response;
      }

      let manualOffsets: Record<number, ManualScrollOffset>;
      try {
        manualOffsets = await loadManualScrollOffsetsStrict();
      } catch {
        const response: SyncStatusResponseMessage = {
          status: 'error',
          reason: 'storage-error',
        };
        return response;
      }
      const response: SyncStatusResponseMessage = {
        status: 'active',
        source,
        snapshot: await buildContentManualSyncSnapshot(state, viewer.viewerTabId, manualOffsets),
      };
      return response;
    }

    const snapshot = await buildManualSyncSnapshot(state, viewer);
    const response: SyncStatusResponseMessage = {
      status: 'active',
      source,
      snapshot,
      ...(recentQuickSyncOutcome === undefined ? {} : { recentQuickSyncOutcome }),
    };
    return response;
  });

  onMessage('sync:reconnect-session', async ({ data }) => {
    const expectedRevision = data.expectedRevision;
    const readiness = await waitForBackgroundInitialization();
    if (readiness.manual.status !== 'ready') {
      const rejection: ManualReconnectResult = {
        status: 'rejected',
        reason: 'session-state-unavailable',
      };
      return rejection;
    }
    if (
      !Number.isSafeInteger(expectedRevision) ||
      expectedRevision < 0 ||
      expectedRevision !== getSyncStateSnapshot().revision
    ) {
      const rejection: ManualReconnectResult = {
        status: 'rejected',
        reason: 'stale-revision',
      };
      return rejection;
    }

    const state = getSyncStateSnapshot();
    if (!state.isActive) {
      const rejection: ManualReconnectResult = {
        status: 'rejected',
        reason: 'not-active',
      };
      return rejection;
    }
    const reconnectTabIds = state.linkedTabs.filter((tabId) => {
      const status = state.connectionStatuses[tabId];
      return status === 'disconnected' || status === 'error';
    });
    if (reconnectTabIds.length === 0) {
      const result: ManualReconnectResult = {
        status: 'committed',
        revision: state.revision,
      };
      return result;
    }

    const results = await Promise.all(
      reconnectTabIds.map((tabId) => reconnectManualTab(manualLifecycleController, tabId, false)),
    );
    const rejected = results.find(({ result }) => result.status === 'rejected');
    if (rejected?.result.status === 'rejected') {
      return rejected.result;
    }
    if (results.some(({ tabMissing }) => tabMissing)) {
      const result: ManualReconnectResult = {
        status: 'refresh-required',
        revision: getSyncStateSnapshot().revision,
      };
      return result;
    }
    const result: ManualReconnectResult = {
      status: 'committed',
      revision: getSyncStateSnapshot().revision,
    };
    return result;
  });

  onMessage('scroll:ping', async ({ data }) => {
    const payload = data;
    logger.debug('Received connection health ping', { tabId: payload.tabId });

    return { success: true, timestamp: Date.now(), tabId: payload.tabId };
  });

  onMessage('scroll:reconnect', async ({ data, sender }) => {
    const senderTabId = sender.tabId;
    if (
      !Number.isSafeInteger(senderTabId) ||
      senderTabId === undefined ||
      senderTabId <= 0 ||
      (data.tabId !== 0 && data.tabId !== senderTabId)
    ) {
      return { success: false, reason: 'Invalid tab identity' };
    }
    const tabId = senderTabId;
    const readiness = await waitForBackgroundInitialization();
    if (readiness.manual.status !== 'ready') {
      return { success: false, reason: 'session-state-unavailable' };
    }
    if (!Number.isSafeInteger(tabId) || tabId === undefined || tabId <= 0) {
      return { success: false, reason: 'Invalid tab identity' };
    }

    logger.info('Received reconnection request from content script', { tabId });

    const manualRecovery = captureManualRecovery(tabId);
    if (manualRecovery) {
      const { result, tabMissing } = await reconnectManualTab(
        manualLifecycleController,
        tabId,
        false,
      );
      if (tabMissing) {
        return { success: false, reason: 'Tab no longer exists' };
      }
      return result.status === 'committed'
        ? { success: true }
        : {
            success: false,
            reason: result.status === 'refresh-required' ? 'Topology changed' : result.reason,
          };
    }

    const autoRecovery = captureAutoRecovery(tabId);
    if (!autoRecovery) {
      logger.debug('Tab not in any active sync, ignoring reconnection request', {
        tabId,
        manualSyncActive: syncState.isActive,
        linkedTabs: syncState.linkedTabs,
        isInAutoSync: false,
      });
      return { success: false, reason: 'Sync not active' };
    }

    try {
      await browser.tabs.get(tabId);
      if (!isCurrentAutoRecovery(autoRecovery)) {
        return { success: false, reason: 'stale-session' };
      }
      logger.debug('Tab verified for reconnection', { tabId });
    } catch (error) {
      logger.error('Tab no longer exists, removing from sync', { tabId, error });
      if (!isCurrentAutoRecovery(autoRecovery)) {
        return { success: false, reason: 'stale-session' };
      }
      await removeTabFromAllAutoSyncGroups(tabId);
      return { success: false, reason: 'Tab no longer exists' };
    }

    try {
      const startMessage = {
        tabIds: autoRecovery.groupTabIds,
        mode: autoRecovery.mode,
        currentTabId: tabId,
        isAutoSync: true,
        autoSyncGeneration: autoRecovery.activationGeneration,
      } satisfies StartSyncContentMessage;
      const response = await sendMessageWithTimeout<{ success: boolean; tabId: number }>(
        'scroll:start',
        startMessage,
        { context: 'content-script', tabId },
        3_000,
      );

      if (!isCurrentAutoRecovery(autoRecovery)) {
        return { success: false, reason: 'stale-session' };
      }
      if (response.success && response.tabId === tabId) {
        logger.info(`Tab ${tabId} reconnected successfully after idle recovery`, {
          isManualSync: false,
          isAutoSync: true,
        });
        return { success: true };
      }
      logger.error('Invalid reconnection acknowledgment', { tabId });
      return { success: false, reason: 'Invalid acknowledgment' };
    } catch (error) {
      logger.error(`Failed to reconnect tab ${tabId}`, { error });
      if (!isCurrentAutoRecovery(autoRecovery)) {
        return { success: false, reason: 'stale-session' };
      }
      return { success: false, reason: 'Connection failed' };
    }
  });

  onMessage('scroll:request-reinject', async ({ data }) => {
    const payload = { tabId: data.tabId };
    const readiness = await waitForBackgroundInitialization();
    if (readiness.manual.status !== 'ready') {
      return { success: false, reason: 'session-state-unavailable' };
    }

    logger.info('Received content script re-inject request', { tabId: payload.tabId });

    const manualRecovery = captureManualRecovery(payload.tabId);
    if (manualRecovery) {
      const { result, tabMissing } = await reconnectManualTab(
        manualLifecycleController,
        payload.tabId,
        true,
      );
      if (tabMissing) {
        return { success: false, reason: 'Tab no longer exists' };
      }
      return { success: result.status === 'committed' };
    }

    const autoRecovery = captureAutoRecovery(payload.tabId);
    if (!autoRecovery) {
      logger.debug('Tab not in any active sync, ignoring re-inject request', {
        tabId: payload.tabId,
      });
      return { success: false, reason: 'Tab not in sync' };
    }

    const context: ReinjectionContext = {
      startMessage: {
        tabIds: autoRecovery.groupTabIds,
        mode: autoRecovery.mode,
        currentTabId: payload.tabId,
        isAutoSync: true,
        autoSyncGeneration: autoRecovery.activationGeneration,
      },
      isSessionCurrent: (): boolean => isCurrentAutoRecovery(autoRecovery),
    };
    const success = await reinjectContentScript(payload.tabId, context);
    if (!context.isSessionCurrent()) {
      return { success: false };
    }
    return { success };
  });
}
