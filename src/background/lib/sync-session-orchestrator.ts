import type {
  StartSyncContentMessage,
  StartSyncContentResponse,
  StopSyncMessage,
} from '~/shared/types/messages';
import type {
  ManualAddResult,
  ManualStartResult,
  ManualTransitionRejection,
} from '~/shared/types/sync-session';
import type { SyncState } from '~/shared/types/sync-state';

import type { ManualOverrideAdapter, ManualOverrideSnapshot } from './manual-override-adapter';
import type { PersistSyncStateResult } from './sync-state';
import type { SyncTransitionContext } from './sync-transition-gate';

const CONTROL_PLANE_TIMEOUT_MS = 1_000;

export interface StartManualSessionInput {
  tabIds: Array<number>;
  mode: 'ratio' | 'element';
  source: 'popup' | 'quick-sync';
  requireAll: boolean;
}

export interface AddManualSessionTabInput {
  tabId: number;
  expectedRevision: number;
  source: 'quick-sync' | 'suggestion';
}

interface StopSyncContentResponse {
  success: boolean;
  tabId: number;
}

export interface SyncSessionOrchestratorDependencies {
  getState: () => SyncState;
  persistState: (nextState: SyncState) => Promise<PersistSyncStateResult>;
  commitState: (nextState: SyncState) => void;
  ensureContentScript: (tabId: number) => Promise<boolean>;
  sendStart: (tabId: number, message: StartSyncContentMessage) => Promise<StartSyncContentResponse>;
  sendStop: (tabId: number, message: StopSyncMessage) => Promise<StopSyncContentResponse>;
  revalidate: (
    context: SyncTransitionContext,
    connectedTabIds: ReadonlyArray<number>,
  ) => Promise<boolean>;
  overrideAdapter: ManualOverrideAdapter;
  startKeepAlive: () => void;
  stopKeepAlive: () => void;
  broadcastStatus: () => Promise<void>;
  recordRecentOutcome: (
    source: StartManualSessionInput['source'] | AddManualSessionTabInput['source'],
    reason: 'auto-sync-degraded',
  ) => void;
}

export interface SyncSessionOrchestrator {
  startManualSession(
    context: SyncTransitionContext,
    input: StartManualSessionInput,
  ): Promise<ManualStartResult>;
  addTabToManualSession(
    context: SyncTransitionContext,
    input: AddManualSessionTabInput,
  ): Promise<ManualAddResult>;
}

type StartFailureReason = 'content-unreachable' | 'connection-timeout' | 'invalid-acknowledgement';

type TimedResult<T> =
  | { status: 'completed'; value: T }
  | { status: 'failed' }
  | { status: 'timed-out' };

async function withinTimeout<T>(operation: Promise<T>): Promise<TimedResult<T>> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<TimedResult<T>>((resolve) => {
    timeoutId = setTimeout(() => {
      resolve({ status: 'timed-out' });
    }, CONTROL_PLANE_TIMEOUT_MS);
  });

  const completed: Promise<TimedResult<T>> = operation.then(
    (value): TimedResult<T> => ({ status: 'completed', value }),
    (): TimedResult<T> => ({ status: 'failed' }),
  );
  const result = await Promise.race([completed, timeout]);

  if (timeoutId !== undefined) {
    clearTimeout(timeoutId);
  }
  return result;
}

function getUniqueValidTabIds(tabIds: ReadonlyArray<number>): Array<number> {
  return [...new Set(tabIds.filter((tabId) => Number.isSafeInteger(tabId) && tabId > 0))];
}

function isValidTabId(tabId: number): boolean {
  return Number.isSafeInteger(tabId) && tabId > 0;
}

async function cleanupStagedTabs(
  dependencies: SyncSessionOrchestratorDependencies,
  tabIds: ReadonlyArray<number>,
): Promise<'cleaned' | 'degraded'> {
  let degraded = false;

  for (const tabId of tabIds) {
    const result = await withinTimeout(
      dependencies.sendStop(tabId, { tabIds: [tabId], isAutoSync: false }),
    );
    if (result.status !== 'completed' || !result.value.success || result.value.tabId !== tabId) {
      degraded = true;
    }
  }

  return degraded ? 'degraded' : 'cleaned';
}

async function rollbackRejectedStart(
  dependencies: SyncSessionOrchestratorDependencies,
  snapshot: ManualOverrideSnapshot,
  tabIds: ReadonlyArray<number>,
  source: StartManualSessionInput['source'] | AddManualSessionTabInput['source'],
  reason: StartFailureReason | 'persistence-failed' | 'stale-revision',
): Promise<ManualTransitionRejection> {
  const cleanup = await cleanupStagedTabs(dependencies, tabIds);
  const rollback = await dependencies.overrideAdapter
    .rollback(snapshot)
    .catch((): { status: 'degraded' } => ({ status: 'degraded' }));
  if (cleanup === 'degraded' || rollback.status === 'degraded') {
    dependencies.recordRecentOutcome(source, 'auto-sync-degraded');
    return { status: 'rejected', reason, warning: 'auto-sync-degraded' };
  }
  return { status: 'rejected', reason };
}

async function attemptStart(
  dependencies: SyncSessionOrchestratorDependencies,
  tabId: number,
  message: StartSyncContentMessage,
): Promise<{ status: 'connected' } | { status: 'rejected'; reason: StartFailureReason }> {
  const ensured = await withinTimeout(dependencies.ensureContentScript(tabId));
  if (ensured.status === 'timed-out') {
    return { status: 'rejected', reason: 'connection-timeout' };
  }
  if (ensured.status !== 'completed' || !ensured.value) {
    return { status: 'rejected', reason: 'content-unreachable' };
  }

  const response = await withinTimeout(dependencies.sendStart(tabId, message));
  if (response.status === 'timed-out') {
    return { status: 'rejected', reason: 'connection-timeout' };
  }
  if (response.status !== 'completed') {
    return { status: 'rejected', reason: 'content-unreachable' };
  }
  if (!response.value.success || response.value.tabId !== tabId) {
    return { status: 'rejected', reason: 'invalid-acknowledgement' };
  }
  return { status: 'connected' };
}

function createStartCandidate(
  previousState: SyncState,
  connectedTabIds: ReadonlyArray<number>,
  mode: StartManualSessionInput['mode'],
): SyncState {
  const connectionStatuses: SyncState['connectionStatuses'] = {};
  for (const tabId of connectedTabIds) {
    connectionStatuses[tabId] = 'connected';
  }

  return {
    isActive: true,
    linkedTabs: [...connectedTabIds],
    connectionStatuses,
    mode,
    lastActiveSyncedTabId: null,
    revision: previousState.revision + 1,
    sessionEpoch: previousState.sessionEpoch + 1,
  };
}

export function createSyncSessionOrchestrator(
  dependencies: SyncSessionOrchestratorDependencies,
): SyncSessionOrchestrator {
  return {
    async startManualSession(context, input) {
      const requestedTabIds = getUniqueValidTabIds(input.tabIds);
      const initialState = dependencies.getState();
      if (
        !input.tabIds.every(isValidTabId) ||
        requestedTabIds.length < 2 ||
        initialState.revision !== context.expectedRevision ||
        initialState.isActive
      ) {
        return {
          status: 'rejected',
          reason:
            !input.tabIds.every(isValidTabId) || requestedTabIds.length < 2
              ? 'content-unreachable'
              : initialState.revision !== context.expectedRevision
                ? 'stale-revision'
                : 'not-active',
        };
      }

      const snapshot = await dependencies.overrideAdapter.prepare(
        context.operationGeneration,
        requestedTabIds,
      );
      const proposedEpoch = initialState.sessionEpoch + 1;
      const connectedTabIds: Array<number> = [];
      const rejectedTabIds: Array<number> = [];
      let firstFailure: StartFailureReason = 'content-unreachable';

      for (const tabId of requestedTabIds) {
        const result = await attemptStart(dependencies, tabId, {
          tabIds: requestedTabIds,
          mode: input.mode,
          currentTabId: tabId,
          isAutoSync: false,
          sessionEpoch: proposedEpoch,
        });
        if (result.status === 'connected') {
          connectedTabIds.push(tabId);
        } else {
          if (rejectedTabIds.length === 0) {
            firstFailure = result.reason;
          }
          rejectedTabIds.push(tabId);
        }
      }

      if (connectedTabIds.length < 2 || (input.requireAll && rejectedTabIds.length > 0)) {
        return rollbackRejectedStart(
          dependencies,
          snapshot,
          requestedTabIds,
          input.source,
          firstFailure,
        );
      }

      const isCurrent =
        (await dependencies.revalidate(context, connectedTabIds)) &&
        dependencies.getState().revision === context.expectedRevision;
      if (!isCurrent) {
        return rollbackRejectedStart(
          dependencies,
          snapshot,
          requestedTabIds,
          input.source,
          'stale-revision',
        );
      }

      const overrideCommit = await dependencies.overrideAdapter.commit(snapshot, connectedTabIds);
      if (overrideCommit.status === 'stale') {
        return rollbackRejectedStart(
          dependencies,
          snapshot,
          requestedTabIds,
          input.source,
          'stale-revision',
        );
      }

      const candidate = createStartCandidate(initialState, connectedTabIds, input.mode);
      const persistence = await dependencies.persistState(candidate);
      if (persistence.status === 'storage-error') {
        return rollbackRejectedStart(
          dependencies,
          snapshot,
          requestedTabIds,
          input.source,
          'persistence-failed',
        );
      }

      dependencies.commitState(candidate);
      await dependencies.broadcastStatus().catch(() => undefined);
      dependencies.startKeepAlive();

      let warning: 'auto-sync-degraded' | undefined;
      if (rejectedTabIds.length > 0) {
        const cleanup = await cleanupStagedTabs(dependencies, rejectedTabIds);
        const rollback = await dependencies.overrideAdapter
          .rollbackUncommitted(snapshot, connectedTabIds)
          .catch((): { status: 'degraded' } => ({ status: 'degraded' }));
        if (cleanup === 'degraded' || rollback.status === 'degraded') {
          warning = 'auto-sync-degraded';
          dependencies.recordRecentOutcome(input.source, warning);
        }
      }

      return {
        status: 'committed',
        connectedTabIds: [...connectedTabIds],
        revision: candidate.revision,
        sessionEpoch: candidate.sessionEpoch,
        ...(warning === undefined ? {} : { warning }),
      };
    },

    async addTabToManualSession(context, input) {
      const initialState = dependencies.getState();
      if (
        !isValidTabId(input.tabId) ||
        !initialState.isActive ||
        initialState.revision !== context.expectedRevision ||
        input.expectedRevision !== context.expectedRevision ||
        initialState.linkedTabs.includes(input.tabId)
      ) {
        return {
          status: 'rejected',
          reason: !isValidTabId(input.tabId)
            ? 'content-unreachable'
            : !initialState.isActive
              ? 'not-active'
              : initialState.revision !== context.expectedRevision ||
                  input.expectedRevision !== context.expectedRevision
                ? 'stale-revision'
                : 'invalid-acknowledgement',
        };
      }

      const snapshot = await dependencies.overrideAdapter.prepare(context.operationGeneration, [
        input.tabId,
      ]);
      const proposedTabIds = [...initialState.linkedTabs, input.tabId];
      const mode = initialState.mode ?? 'ratio';
      const startResult = await attemptStart(dependencies, input.tabId, {
        tabIds: proposedTabIds,
        mode,
        currentTabId: input.tabId,
        isAutoSync: false,
        sessionEpoch: initialState.sessionEpoch,
      });
      if (startResult.status === 'rejected') {
        return rollbackRejectedStart(
          dependencies,
          snapshot,
          [input.tabId],
          input.source,
          startResult.reason,
        );
      }

      const isCurrent =
        (await dependencies.revalidate(context, [input.tabId])) &&
        dependencies.getState().revision === context.expectedRevision;
      if (!isCurrent) {
        return rollbackRejectedStart(
          dependencies,
          snapshot,
          [input.tabId],
          input.source,
          'stale-revision',
        );
      }

      const overrideCommit = await dependencies.overrideAdapter.commit(snapshot, [input.tabId]);
      if (overrideCommit.status === 'stale') {
        return rollbackRejectedStart(
          dependencies,
          snapshot,
          [input.tabId],
          input.source,
          'stale-revision',
        );
      }

      const candidate: SyncState = {
        ...initialState,
        linkedTabs: proposedTabIds,
        connectionStatuses: {
          ...initialState.connectionStatuses,
          [input.tabId]: 'connected',
        },
        revision: initialState.revision + 1,
      };
      const persistence = await dependencies.persistState(candidate);
      if (persistence.status === 'storage-error') {
        return rollbackRejectedStart(
          dependencies,
          snapshot,
          [input.tabId],
          input.source,
          'persistence-failed',
        );
      }

      dependencies.commitState(candidate);
      await dependencies.broadcastStatus().catch(() => undefined);
      return {
        status: 'committed',
        linkedTabIds: [...candidate.linkedTabs],
        revision: candidate.revision,
        sessionEpoch: candidate.sessionEpoch,
      };
    },
  };
}
