import type {
  StartSyncContentMessage,
  StartSyncContentResponse,
  StopSyncContentMessage,
  StopSyncContentResponse,
} from '~/shared/types/messages';
import type {
  ManualReconnectResult,
  ManualAddResult,
  ManualStartResult,
  ManualStopResult,
  ManualTransitionRejection,
} from '~/shared/types/sync-session';
import type { SyncState } from '~/shared/types/sync-state';

import type { ManualOverrideAdapter, ManualOverrideSnapshot } from './manual-override-adapter';
import type { ManualCleanupRetryScheduler } from './sync-cleanup-retry';
import type { PersistSyncStateResult } from './sync-state';
import type { SyncTransitionContext, SyncTransitionGate } from './sync-transition-gate';

const CONTROL_PLANE_TIMEOUT_MS = 1_000;
const RECONNECT_TIMEOUT_MS = 3_000;
const reconnectAttemptGenerations = new Map<number, number>();

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

export interface SyncSessionOrchestratorDependencies {
  getState: () => SyncState;
  persistState: (nextState: SyncState) => Promise<PersistSyncStateResult>;
  commitState: (nextState: SyncState) => void;
  ensureContentScript: (tabId: number) => Promise<boolean>;
  sendStart: (tabId: number, message: StartSyncContentMessage) => Promise<StartSyncContentResponse>;
  sendStop: (tabId: number, message: StopSyncContentMessage) => Promise<StopSyncContentResponse>;
  revalidate: (
    context: SyncTransitionContext,
    connectedTabIds: ReadonlyArray<number>,
  ) => Promise<boolean>;
  overrideAdapter: ManualOverrideAdapter;
  startKeepAlive: () => void;
  stopKeepAlive: () => void;
  clearManualOverrides: (tabIds: ReadonlyArray<number>) => Promise<void>;
  cleanupScheduler: ManualCleanupRetryScheduler;
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
  stopManualSession(
    context: SyncTransitionContext,
    source: 'popup' | 'suggestion-replace' | 'tab-close',
  ): Promise<ManualStopResult>;
  beginManualReconnect(context: SyncTransitionContext, tabId: number): BeginReconnectResult;
  finishManualReconnect(
    context: SyncTransitionContext,
    token: ReconnectAttemptToken,
    acknowledgement: StartSyncContentResponse | null,
  ): Promise<ManualReconnectResult>;
  isManualReconnectCurrent(context: SyncTransitionContext, token: ReconnectAttemptToken): boolean;
}

export interface ReconnectAttemptToken {
  tabId: number;
  revision: number;
  sessionEpoch: number;
  attemptGeneration: number;
  startMessage: StartSyncContentMessage;
}

export type BeginReconnectResult =
  | { status: 'ready'; token: ReconnectAttemptToken }
  | ManualTransitionRejection;

interface StopManualSessionDependencies {
  getState: () => SyncState;
  persistState: (nextState: SyncState) => Promise<PersistSyncStateResult>;
  commitState: (nextState: SyncState) => void;
  sendStop: (tabId: number, message: StopSyncContentMessage) => Promise<StopSyncContentResponse>;
  stopKeepAlive: () => void;
  clearManualOverrides: (tabIds: ReadonlyArray<number>) => Promise<void>;
  cleanupScheduler: ManualCleanupRetryScheduler;
  broadcastStatus: () => Promise<void>;
}

interface ManualReconnectDependencies {
  getState: () => SyncState;
  persistState: (nextState: SyncState) => Promise<PersistSyncStateResult>;
  commitState: (nextState: SyncState) => void;
  cleanupScheduler: ManualCleanupRetryScheduler;
  broadcastStatus: () => Promise<void>;
}

export type ManualSessionLifecycleDependencies = StopManualSessionDependencies &
  ManualReconnectDependencies;

export interface ManualSessionLifecycleController {
  stopManualSession(
    context: SyncTransitionContext,
    source: 'popup' | 'suggestion-replace' | 'tab-close',
  ): Promise<ManualStopResult>;
  beginManualReconnect(context: SyncTransitionContext, tabId: number): BeginReconnectResult;
  finishManualReconnect(
    context: SyncTransitionContext,
    token: ReconnectAttemptToken,
    acknowledgement: StartSyncContentResponse | null,
  ): Promise<ManualReconnectResult>;
  isManualReconnectCurrent(context: SyncTransitionContext, token: ReconnectAttemptToken): boolean;
  removeTabFromManualSession(
    context: SyncTransitionContext,
    tabId: number,
  ): Promise<ManualStopResult>;
}

type StartFailureReason = 'content-unreachable' | 'connection-timeout' | 'invalid-acknowledgement';

type TimedResult<T> =
  | { status: 'completed'; value: T }
  | { status: 'failed' }
  | { status: 'timed-out' };

async function withinTimeout<T>(
  operation: Promise<T>,
  timeoutMs = CONTROL_PLANE_TIMEOUT_MS,
): Promise<TimedResult<T>> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<TimedResult<T>>((resolve) => {
    timeoutId = setTimeout(() => {
      resolve({ status: 'timed-out' });
    }, timeoutMs);
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

function createInactiveCandidate(previousState: SyncState): SyncState {
  return {
    isActive: false,
    linkedTabs: [],
    connectionStatuses: {},
    lastActiveSyncedTabId: null,
    revision: previousState.revision + 1,
    sessionEpoch: previousState.sessionEpoch,
  };
}

async function stopManualSessionWithDependencies(
  dependencies: StopManualSessionDependencies,
  context: SyncTransitionContext,
): Promise<ManualStopResult> {
  const initialState = dependencies.getState();
  if (!initialState.isActive) {
    return { status: 'rejected', reason: 'not-active' };
  }
  if (initialState.revision !== context.expectedRevision) {
    return { status: 'rejected', reason: 'stale-revision' };
  }

  const stoppedTabIds = [...initialState.linkedTabs];
  const candidate = createInactiveCandidate(initialState);
  const persistence = await dependencies.persistState(candidate);
  if (persistence.status === 'storage-error') {
    return { status: 'rejected', reason: 'persistence-failed' };
  }

  dependencies.commitState(candidate);
  dependencies.stopKeepAlive();
  await dependencies.clearManualOverrides(stoppedTabIds).catch(() => undefined);
  await dependencies.broadcastStatus().catch(() => undefined);

  let cleanupIncomplete = false;
  await Promise.all(
    stoppedTabIds.map(async (tabId) => {
      const cleanup = await withinTimeout(
        dependencies.sendStop(tabId, {
          tabIds: [tabId],
          isAutoSync: false,
        }),
      );
      if (
        cleanup.status === 'completed' &&
        cleanup.value.success &&
        cleanup.value.tabId === tabId
      ) {
        return;
      }

      cleanupIncomplete = true;
      dependencies.cleanupScheduler.schedule({
        tabId,
        stoppedRevision: candidate.revision,
        stoppedSessionEpoch: candidate.sessionEpoch,
        attemptIndex: 0,
      });
    }),
  );

  if (cleanupIncomplete) {
    return {
      status: 'committed',
      revision: candidate.revision,
      warning: 'cleanup-incomplete',
    };
  }
  return { status: 'committed', revision: candidate.revision };
}

function beginManualReconnectWithDependencies(
  dependencies: ManualReconnectDependencies,
  context: SyncTransitionContext,
  tabId: number,
): BeginReconnectResult {
  const state = dependencies.getState();
  if (
    !isValidTabId(tabId) ||
    !state.isActive ||
    state.revision !== context.expectedRevision ||
    !state.linkedTabs.includes(tabId)
  ) {
    return {
      status: 'rejected',
      reason:
        !state.isActive || !state.linkedTabs.includes(tabId) ? 'not-active' : 'stale-revision',
    };
  }

  const attemptGeneration = (reconnectAttemptGenerations.get(tabId) ?? 0) + 1;
  reconnectAttemptGenerations.set(tabId, attemptGeneration);
  dependencies.cleanupScheduler.cancelForTab(tabId);

  return {
    status: 'ready',
    token: {
      tabId,
      revision: state.revision,
      sessionEpoch: state.sessionEpoch,
      attemptGeneration,
      startMessage: {
        tabIds: [...state.linkedTabs],
        mode: state.mode ?? 'ratio',
        currentTabId: tabId,
        isAutoSync: false,
        sessionEpoch: state.sessionEpoch,
      },
    },
  };
}

function isManualReconnectCurrent(
  dependencies: ManualReconnectDependencies,
  context: SyncTransitionContext,
  token: ReconnectAttemptToken,
): boolean {
  const state = dependencies.getState();
  return (
    state.revision === context.expectedRevision &&
    state.revision === token.revision &&
    state.sessionEpoch === token.sessionEpoch &&
    state.isActive &&
    state.linkedTabs.includes(token.tabId) &&
    reconnectAttemptGenerations.get(token.tabId) === token.attemptGeneration
  );
}

async function finishManualReconnectWithDependencies(
  dependencies: ManualReconnectDependencies,
  context: SyncTransitionContext,
  token: ReconnectAttemptToken,
  acknowledgement: StartSyncContentResponse | null,
): Promise<ManualReconnectResult> {
  const state = dependencies.getState();
  if (!isManualReconnectCurrent(dependencies, context, token)) {
    return { status: 'rejected', reason: 'stale-revision' };
  }

  const acknowledged =
    acknowledgement !== null && acknowledgement.success && acknowledgement.tabId === token.tabId;
  if (acknowledged && state.connectionStatuses[token.tabId] === 'connected') {
    return { status: 'committed', revision: state.revision };
  }
  const candidate: SyncState = {
    ...state,
    linkedTabs: [...state.linkedTabs],
    connectionStatuses: {
      ...state.connectionStatuses,
      [token.tabId]: acknowledged ? 'connected' : 'error',
    },
  };
  const persistence = await dependencies.persistState(candidate);
  if (persistence.status === 'storage-error') {
    return { status: 'rejected', reason: 'persistence-failed' };
  }

  if (
    dependencies.getState().revision !== token.revision ||
    reconnectAttemptGenerations.get(token.tabId) !== token.attemptGeneration
  ) {
    return { status: 'rejected', reason: 'stale-revision' };
  }

  dependencies.commitState(candidate);
  await dependencies.broadcastStatus().catch(() => undefined);
  return acknowledged
    ? { status: 'committed', revision: candidate.revision }
    : {
        status: 'rejected',
        reason: acknowledgement === null ? 'connection-timeout' : 'invalid-acknowledgement',
      };
}

export function createManualSessionLifecycleController(
  dependencies: ManualSessionLifecycleDependencies,
): ManualSessionLifecycleController {
  return {
    stopManualSession(context) {
      return stopManualSessionWithDependencies(dependencies, context);
    },
    beginManualReconnect(context, tabId) {
      return beginManualReconnectWithDependencies(dependencies, context, tabId);
    },
    finishManualReconnect(context, token, acknowledgement) {
      return finishManualReconnectWithDependencies(dependencies, context, token, acknowledgement);
    },
    isManualReconnectCurrent(context, token) {
      return isManualReconnectCurrent(dependencies, context, token);
    },
    async removeTabFromManualSession(context, tabId) {
      const initialState = dependencies.getState();
      if (
        !initialState.isActive ||
        initialState.revision !== context.expectedRevision ||
        !initialState.linkedTabs.includes(tabId)
      ) {
        return {
          status: 'rejected',
          reason:
            initialState.revision !== context.expectedRevision ? 'stale-revision' : 'not-active',
        };
      }

      const remainingTabIds = initialState.linkedTabs.filter(
        (linkedTabId) => linkedTabId !== tabId,
      );
      if (remainingTabIds.length < 2) {
        return stopManualSessionWithDependencies(dependencies, context);
      }

      const connectionStatuses = { ...initialState.connectionStatuses };
      delete connectionStatuses[tabId];
      const candidate: SyncState = {
        ...initialState,
        linkedTabs: remainingTabIds,
        connectionStatuses,
        lastActiveSyncedTabId:
          initialState.lastActiveSyncedTabId === tabId ? null : initialState.lastActiveSyncedTabId,
        revision: initialState.revision + 1,
      };
      const persistence = await dependencies.persistState(candidate);
      if (persistence.status === 'storage-error') {
        return { status: 'rejected', reason: 'persistence-failed' };
      }

      dependencies.commitState(candidate);
      await dependencies.clearManualOverrides([tabId]).catch(() => undefined);
      await dependencies.broadcastStatus().catch(() => undefined);
      return { status: 'committed', revision: candidate.revision };
    },
  };
}

export async function executeManualReconnect(input: {
  controller: ManualSessionLifecycleController;
  transitionGate: SyncTransitionGate;
  tabId: number;
  isTabAvailable: () => Promise<boolean>;
  sendHandshake: (token: ReconnectAttemptToken) => Promise<StartSyncContentResponse>;
}): Promise<ManualReconnectResult> {
  const begin = await input.transitionGate.run(async (context) =>
    input.controller.beginManualReconnect(context, input.tabId),
  );
  if (begin.status !== 'ready') {
    return begin;
  }

  const isTabAvailable = await input.isTabAvailable().catch(() => false);
  if (!isTabAvailable) {
    const removal = await input.transitionGate.run((context) =>
      input.controller.removeTabFromManualSession(context, input.tabId),
    );
    return removal.status === 'committed'
      ? { status: 'committed', revision: removal.revision }
      : removal;
  }

  const tokenIsCurrent = await input.transitionGate.run(async (context) =>
    input.controller.isManualReconnectCurrent(context, begin.token),
  );
  if (!tokenIsCurrent) {
    return { status: 'rejected', reason: 'stale-revision' };
  }

  const handshake = await withinTimeout(input.sendHandshake(begin.token), RECONNECT_TIMEOUT_MS);
  const acknowledgement = handshake.status === 'completed' ? handshake.value : null;

  return input.transitionGate.run((context) =>
    input.controller.finishManualReconnect(context, begin.token, acknowledgement),
  );
}

export function createSyncSessionOrchestrator(
  dependencies: SyncSessionOrchestratorDependencies,
): SyncSessionOrchestrator {
  const lifecycleController = createManualSessionLifecycleController(dependencies);
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
      for (const tabId of connectedTabIds) {
        dependencies.cleanupScheduler.cancelForTab(tabId);
      }
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
      dependencies.cleanupScheduler.cancelForTab(input.tabId);
      await dependencies.broadcastStatus().catch(() => undefined);
      return {
        status: 'committed',
        linkedTabIds: [...candidate.linkedTabs],
        revision: candidate.revision,
        sessionEpoch: candidate.sessionEpoch,
      };
    },

    stopManualSession(context) {
      return lifecycleController.stopManualSession(context, 'popup');
    },

    beginManualReconnect(context, tabId) {
      return lifecycleController.beginManualReconnect(context, tabId);
    },

    async finishManualReconnect(context, token, acknowledgement) {
      return lifecycleController.finishManualReconnect(context, token, acknowledgement);
    },

    isManualReconnectCurrent(context, token) {
      return lifecycleController.isManualReconnectCurrent(context, token);
    },
  };
}
