import {
  createAutoSyncActivationId,
  isAutoSyncActivationId,
  type AutoSyncActivationId,
} from '~/shared/lib/auto-sync-activation';
import type { AutoSyncGroup } from '~/shared/types/auto-sync-state';
import type { AutoStartSyncContentMessage, StopSyncContentResponse } from '~/shared/types/messages';
import type { SyncState } from '~/shared/types/sync-state';

import type { ManualCleanupRetryScheduler } from './sync-cleanup-retry';
import type { SyncSessionOrchestrator } from './sync-session-orchestrator';
import type { PersistSyncStateResult } from './sync-state';
import type { SyncTransitionContext } from './sync-transition-gate';

export interface AcceptedAutoSyncInput {
  normalizedUrl: string;
  tabIds: Array<number>;
  expectedRevision: number;
}

export type AcceptedAutoSyncResult =
  | { status: 'committed'; revision: number }
  | {
      status: 'rejected';
      reason: 'stale-revision' | 'auto-start-failed' | 'persistence-failed';
      warning?: 'auto-sync-degraded';
    };

type AcceptedAutoSyncCleanupResult = { status: 'cleaned' } | { status: 'degraded' };

export interface LegacyAutoSyncAdapter {
  startAcceptedGroup(
    input: AcceptedAutoSyncInput,
  ): Promise<{ status: 'started' } | { status: 'failed'; warning?: 'auto-sync-degraded' }>;
  rollbackAcceptedGroup(input: AcceptedAutoSyncInput): Promise<AcceptedAutoSyncCleanupResult>;
}

interface CreateLegacyAutoSyncAdapterDependencies {
  groups: Map<string, AutoSyncGroup>;
  withLock: <T>(operation: () => Promise<T>) => Promise<T>;
  getState: () => SyncState;
  cleanupScheduler: ManualCleanupRetryScheduler;
  sendStart: (tabId: number, message: AutoStartSyncContentMessage) => Promise<boolean>;
  sendStop: (tabId: number) => Promise<StopSyncContentResponse>;
  createActivationId?: () => string;
}

interface ReplaceAcceptedAutoSyncDependencies {
  orchestrator: SyncSessionOrchestrator;
  legacyAutoSyncAdapter: LegacyAutoSyncAdapter;
  getState: () => SyncState;
  persistState: (nextState: SyncState) => Promise<PersistSyncStateResult>;
  commitState: (nextState: SyncState) => void;
}

function createInactiveRevisionCandidate(state: SyncState): SyncState {
  return {
    isActive: false,
    linkedTabs: [],
    connectionStatuses: {},
    lastActiveSyncedTabId: null,
    revision: state.revision + 1,
    sessionEpoch: state.sessionEpoch,
  };
}

function isValidAcceptedTabId(tabId: number): boolean {
  return Number.isSafeInteger(tabId) && tabId > 0;
}

function hasExactMembers(group: AutoSyncGroup, tabIds: ReadonlyArray<number>): boolean {
  return group.tabIds.size === tabIds.length && tabIds.every((tabId) => group.tabIds.has(tabId));
}

async function cleanupAcceptedTabs(
  dependencies: CreateLegacyAutoSyncAdapterDependencies,
  tabIds: ReadonlyArray<number>,
): Promise<AcceptedAutoSyncCleanupResult> {
  const state = dependencies.getState();
  const results = await Promise.all(
    tabIds.map(async (tabId) => {
      const stopped = await dependencies.sendStop(tabId).then(
        (response) => response.success && response.tabId === tabId,
        () => false,
      );

      if (stopped) {
        dependencies.cleanupScheduler.cancelForTab(tabId);
        return true;
      }

      dependencies.cleanupScheduler.schedule({
        tabId,
        stoppedRevision: state.revision,
        stoppedSessionEpoch: state.sessionEpoch,
        attemptIndex: 0,
      });
      return false;
    }),
  );

  return results.every(Boolean) ? { status: 'cleaned' } : { status: 'degraded' };
}

function createFailedStartResult(cleanup: AcceptedAutoSyncCleanupResult): {
  status: 'failed';
  warning?: 'auto-sync-degraded';
} {
  return cleanup.status === 'degraded'
    ? { status: 'failed', warning: 'auto-sync-degraded' }
    : { status: 'failed' };
}

export function createLegacyAutoSyncAdapter(
  dependencies: CreateLegacyAutoSyncAdapterDependencies,
): LegacyAutoSyncAdapter {
  const generateActivationId = dependencies.createActivationId ?? createAutoSyncActivationId;

  const reserveActivationGeneration = (group: AutoSyncGroup): AutoSyncActivationId | null => {
    let nextActivationId: string;
    try {
      nextActivationId = generateActivationId();
    } catch {
      return null;
    }

    if (
      !isAutoSyncActivationId(nextActivationId) ||
      nextActivationId === group.activationGeneration
    ) {
      return null;
    }

    group.activationGeneration = nextActivationId;
    return nextActivationId;
  };

  return {
    async startAcceptedGroup(input) {
      const tabIds = [...new Set(input.tabIds)];
      if (
        tabIds.length < 2 ||
        tabIds.length !== input.tabIds.length ||
        !tabIds.every(isValidAcceptedTabId)
      ) {
        return { status: 'failed' };
      }

      const proposedActivationGeneration = await dependencies.withLock(async () => {
        const group = dependencies.groups.get(input.normalizedUrl);
        if (!group || group.isActive || !hasExactMembers(group, tabIds)) {
          return null;
        }
        return reserveActivationGeneration(group);
      });
      if (proposedActivationGeneration === null) {
        return { status: 'failed' };
      }

      const attemptedTabIds: Array<number> = [];
      const connectedTabIds: Array<number> = [];
      for (const tabId of tabIds) {
        attemptedTabIds.push(tabId);
        const connected = await dependencies
          .sendStart(tabId, {
            tabIds,
            mode: 'ratio',
            currentTabId: tabId,
            isAutoSync: true,
            autoSyncGeneration: proposedActivationGeneration,
          })
          .catch(() => false);
        if (connected) {
          connectedTabIds.push(tabId);
        }
      }

      if (connectedTabIds.length !== tabIds.length) {
        const cleanup = await cleanupAcceptedTabs(dependencies, attemptedTabIds);
        return createFailedStartResult(cleanup);
      }

      const committed = await dependencies.withLock(async () => {
        const group = dependencies.groups.get(input.normalizedUrl);
        if (
          !group ||
          group.isActive ||
          group.activationGeneration !== proposedActivationGeneration ||
          !hasExactMembers(group, tabIds)
        ) {
          return false;
        }

        group.isActive = true;
        return true;
      });

      if (!committed) {
        const cleanup = await cleanupAcceptedTabs(dependencies, attemptedTabIds);
        return createFailedStartResult(cleanup);
      }

      for (const tabId of connectedTabIds) {
        dependencies.cleanupScheduler.cancelForTab(tabId);
      }

      return { status: 'started' };
    },

    async rollbackAcceptedGroup(input) {
      await dependencies.withLock(async () => {
        const group = dependencies.groups.get(input.normalizedUrl);
        if (group) {
          group.isActive = false;
        }
      });
      return cleanupAcceptedTabs(dependencies, input.tabIds);
    },
  };
}

export async function replaceManualWithAcceptedAutoSync(
  context: SyncTransitionContext,
  input: AcceptedAutoSyncInput,
  dependencies: ReplaceAcceptedAutoSyncDependencies,
): Promise<AcceptedAutoSyncResult> {
  const initialState = dependencies.getState();
  if (
    input.expectedRevision !== context.expectedRevision ||
    initialState.revision !== context.expectedRevision
  ) {
    return { status: 'rejected', reason: 'stale-revision' };
  }

  if (initialState.isActive) {
    const stopResult = await dependencies.orchestrator.stopManualSession(
      context,
      'suggestion-replace',
    );
    if (stopResult.status === 'rejected') {
      return {
        status: 'rejected',
        reason:
          stopResult.reason === 'persistence-failed' ? 'persistence-failed' : 'stale-revision',
      };
    }
  }

  const startResult = await dependencies.legacyAutoSyncAdapter.startAcceptedGroup(input);
  if (startResult.status === 'failed') {
    return {
      status: 'rejected',
      reason: 'auto-start-failed',
      ...(startResult.warning === undefined ? {} : { warning: startResult.warning }),
    };
  }

  const candidate = createInactiveRevisionCandidate(dependencies.getState());
  const persistence = await dependencies.persistState(candidate);
  if (persistence.status === 'storage-error') {
    const rollback = await dependencies.legacyAutoSyncAdapter
      .rollbackAcceptedGroup(input)
      .catch((): AcceptedAutoSyncCleanupResult => ({ status: 'degraded' }));
    return {
      status: 'rejected',
      reason: 'persistence-failed',
      ...(rollback.status === 'degraded' ? { warning: 'auto-sync-degraded' } : {}),
    };
  }

  dependencies.commitState(candidate);
  return { status: 'committed', revision: candidate.revision };
}
