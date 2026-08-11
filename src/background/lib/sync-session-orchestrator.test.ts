import { afterEach, describe, expect, it, vi } from 'vitest';

import type { StartSyncContentMessage, StartSyncContentResponse } from '~/shared/types/messages';
import type { SyncState } from '~/shared/types/sync-state';

import { createSyncSessionOrchestrator } from './sync-session-orchestrator';

import type { ManualOverrideAdapter, ManualOverrideSnapshot } from './manual-override-adapter';

const inactiveState: SyncState = {
  isActive: false,
  linkedTabs: [],
  connectionStatuses: {},
  lastActiveSyncedTabId: null,
  revision: 0,
  sessionEpoch: 0,
};

const activeState: SyncState = {
  isActive: true,
  linkedTabs: [11, 22],
  connectionStatuses: { 11: 'connected', 22: 'connected' },
  mode: 'ratio',
  lastActiveSyncedTabId: 11,
  revision: 7,
  sessionEpoch: 4,
};

type StartResponse = StartSyncContentResponse | 'timeout' | 'throw';

interface HarnessOptions {
  initialState: SyncState;
  startResponses?: Record<number, StartResponse>;
  failedInjectionTabIds?: Array<number>;
  persistFails?: boolean;
  overrideCommitStale?: boolean;
  rollbackDegraded?: boolean;
  rollbackUncommittedDegraded?: boolean;
  revalidateFails?: boolean;
}

function cloneState(state: SyncState): SyncState {
  const clone = {
    isActive: state.isActive,
    linkedTabs: [...state.linkedTabs],
    connectionStatuses: { ...state.connectionStatuses },
    lastActiveSyncedTabId: state.lastActiveSyncedTabId,
    revision: state.revision,
    sessionEpoch: state.sessionEpoch,
  };
  return state.mode === undefined ? clone : { ...clone, mode: state.mode };
}

function createOrchestratorHarness(options: HarnessOptions) {
  let committedState = cloneState(options.initialState);
  const events: Array<string> = [];
  const persistedStates: Array<SyncState> = [];
  const startTargets: Array<number> = [];
  const startMessages: Array<StartSyncContentMessage> = [];
  const stopTargets: Array<number> = [];
  const overrideRollbacks: Array<ManualOverrideSnapshot> = [];
  const recentOutcomes: Array<'auto-sync-degraded'> = [];
  const failedInjectionTabIds = new Set(options.failedInjectionTabIds ?? []);
  const startResponses = options.startResponses ?? {};

  const overrideAdapter: ManualOverrideAdapter = {
    prepare: async (operationGeneration, joiningTabIds) => {
      events.push('override:prepare');
      return {
        operationGeneration,
        joiningTabIds: [...joiningTabIds],
        previousOverrideTabIds: [],
        affectedGroupIds: [],
      };
    },
    commit: async (_, committedJoiningTabIds) => {
      events.push(
        committedJoiningTabIds.length === 2 && committedJoiningTabIds.includes(33)
          ? 'override:commit'
          : `override:commit${committedJoiningTabIds.length > 0 ? `:${committedJoiningTabIds.join(',')}` : ''}`,
      );
      return options.overrideCommitStale ? { status: 'stale' } : { status: 'committed' };
    },
    rollbackUncommitted: async (_, committedJoiningTabIds) => {
      const excluded = _.joiningTabIds.filter((tabId) => !committedJoiningTabIds.includes(tabId));
      events.push(`override:rollback-uncommitted:${excluded.join(',')}`);
      return options.rollbackUncommittedDegraded
        ? { status: 'degraded' }
        : { status: 'rolled-back' };
    },
    rollback: async (snapshot) => {
      events.push('override:rollback');
      overrideRollbacks.push(snapshot);
      return options.rollbackDegraded ? { status: 'degraded' } : { status: 'rolled-back' };
    },
  };

  const orchestrator = createSyncSessionOrchestrator({
    getState: () => cloneState(committedState),
    persistState: async (nextState) => {
      if (options.persistFails) {
        events.push('state:persist-failed');
        return { status: 'storage-error' };
      }
      events.push('state:persist');
      persistedStates.push(cloneState(nextState));
      return { status: 'persisted' };
    },
    commitState: (nextState) => {
      events.push('state:commit');
      committedState = cloneState(nextState);
    },
    ensureContentScript: async (tabId) => !failedInjectionTabIds.has(tabId),
    sendStart: async (tabId, message) => {
      events.push(`start:${tabId}`);
      startTargets.push(tabId);
      startMessages.push(message);
      const response = startResponses[tabId];
      if (response === 'timeout') {
        return new Promise(() => undefined);
      }
      if (response === 'throw') {
        throw new Error('content unreachable');
      }
      return response ?? { success: true, tabId };
    },
    sendStop: async (tabId) => {
      events.push(`stop:${tabId}`);
      stopTargets.push(tabId);
      return { success: true };
    },
    revalidate: async () => {
      events.push('revalidate');
      return !options.revalidateFails;
    },
    overrideAdapter,
    startKeepAlive: () => {
      events.push('keep-alive:start');
    },
    stopKeepAlive: () => {
      events.push('keep-alive:stop');
    },
    broadcastStatus: async () => {
      events.push('status:broadcast');
    },
    recordRecentOutcome: () => {
      recentOutcomes.push('auto-sync-degraded');
    },
  });

  return {
    orchestrator,
    events,
    persistedStates,
    startTargets,
    startMessages,
    stopTargets,
    overrideRollbacks,
    recentOutcomes,
    get committedState() {
      return cloneState(committedState);
    },
  };
}

describe('createSyncSessionOrchestrator', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('commits Quick Sync Start only after both tabs acknowledge', async () => {
    const harness = createOrchestratorHarness({
      initialState: inactiveState,
      startResponses: {
        11: { success: true, tabId: 11 },
        22: { success: true, tabId: 22 },
      },
    });

    const result = await harness.orchestrator.startManualSession(
      { operationGeneration: 1, expectedRevision: 0 },
      { tabIds: [11, 22], mode: 'ratio', source: 'quick-sync', requireAll: true },
    );

    expect(result).toEqual({
      status: 'committed',
      connectedTabIds: [11, 22],
      revision: 1,
      sessionEpoch: 1,
    });
    expect(harness.persistedStates).toHaveLength(1);
    expect(harness.committedState.linkedTabs).toEqual([11, 22]);
    expect(harness.startMessages).toEqual([
      {
        tabIds: [11, 22],
        mode: 'ratio',
        currentTabId: 11,
        isAutoSync: false,
        sessionEpoch: 1,
      },
      {
        tabIds: [11, 22],
        mode: 'ratio',
        currentTabId: 22,
        isAutoSync: false,
        sessionEpoch: 1,
      },
    ]);
    expect(harness.events).toEqual([
      'override:prepare',
      'start:11',
      'start:22',
      'revalidate',
      'override:commit:11,22',
      'state:persist',
      'state:commit',
      'status:broadcast',
      'keep-alive:start',
    ]);
  });

  it('rolls back Quick Sync Start when either tab returns an invalid acknowledgement', async () => {
    const harness = createOrchestratorHarness({
      initialState: inactiveState,
      startResponses: {
        11: { success: true, tabId: 11 },
        22: { success: true, tabId: 999 },
      },
    });

    const result = await harness.orchestrator.startManualSession(
      { operationGeneration: 1, expectedRevision: 0 },
      { tabIds: [11, 22], mode: 'ratio', source: 'quick-sync', requireAll: true },
    );

    expect(result).toEqual({ status: 'rejected', reason: 'invalid-acknowledgement' });
    expect(harness.committedState).toEqual(inactiveState);
    expect(harness.stopTargets).toEqual([11, 22]);
    expect(harness.overrideRollbacks).toHaveLength(1);
  });

  it('adds only the new tab and preserves existing epoch and connection state', async () => {
    const harness = createOrchestratorHarness({ initialState: activeState });

    const result = await harness.orchestrator.addTabToManualSession(
      { operationGeneration: 2, expectedRevision: 7 },
      { tabId: 33, expectedRevision: 7, source: 'quick-sync' },
    );

    expect(result).toEqual({
      status: 'committed',
      linkedTabIds: [11, 22, 33],
      revision: 8,
      sessionEpoch: 4,
    });
    expect(harness.startTargets).toEqual([33]);
    expect(harness.startMessages).toEqual([
      {
        tabIds: [11, 22, 33],
        mode: 'ratio',
        currentTabId: 33,
        isAutoSync: false,
        sessionEpoch: 4,
      },
    ]);
    expect(harness.committedState).toEqual({
      ...activeState,
      linkedTabs: [11, 22, 33],
      connectionStatuses: { 11: 'connected', 22: 'connected', 33: 'connected' },
      revision: 8,
    });
  });

  it('commits the popup subset and restores excluded auto membership after cleanup', async () => {
    const harness = createOrchestratorHarness({
      initialState: inactiveState,
      startResponses: {
        11: { success: true, tabId: 11 },
        22: { success: true, tabId: 22 },
        33: { success: false, tabId: 33 },
      },
    });

    const result = await harness.orchestrator.startManualSession(
      { operationGeneration: 1, expectedRevision: 0 },
      { tabIds: [11, 22, 33], mode: 'ratio', source: 'popup', requireAll: false },
    );

    expect(result).toEqual({
      status: 'committed',
      connectedTabIds: [11, 22],
      revision: 1,
      sessionEpoch: 1,
    });
    expect(harness.events).toContain('override:commit:11,22');
    expect(harness.events.slice(-2)).toEqual(['stop:33', 'override:rollback-uncommitted:33']);
  });

  it('deduplicates valid requested IDs before preparing or starting', async () => {
    const harness = createOrchestratorHarness({ initialState: inactiveState });

    const result = await harness.orchestrator.startManualSession(
      { operationGeneration: 1, expectedRevision: 0 },
      { tabIds: [11, 11, 22], mode: 'ratio', source: 'quick-sync', requireAll: true },
    );

    expect(result.status).toBe('committed');
    expect(harness.startTargets).toEqual([11, 22]);
    expect(harness.committedState.linkedTabs).toEqual([11, 22]);
  });

  it('rejects fewer than two unique requested tabs before staging an override', async () => {
    const harness = createOrchestratorHarness({ initialState: inactiveState });

    const result = await harness.orchestrator.startManualSession(
      { operationGeneration: 1, expectedRevision: 0 },
      { tabIds: [11, 11], mode: 'ratio', source: 'quick-sync', requireAll: true },
    );

    expect(result).toEqual({ status: 'rejected', reason: 'content-unreachable' });
    expect(harness.events).toEqual([]);
  });

  it('rejects an invalid requested tab ID instead of silently dropping it', async () => {
    const harness = createOrchestratorHarness({ initialState: inactiveState });

    const result = await harness.orchestrator.startManualSession(
      { operationGeneration: 1, expectedRevision: 0 },
      { tabIds: [11, -1, 22], mode: 'ratio', source: 'quick-sync', requireAll: true },
    );

    expect(result).toEqual({ status: 'rejected', reason: 'content-unreachable' });
    expect(harness.events).toEqual([]);
  });

  it('times out a content Start after 1,000ms and rolls back every staged tab', async () => {
    vi.useFakeTimers();
    const harness = createOrchestratorHarness({
      initialState: inactiveState,
      startResponses: { 22: 'timeout' },
    });

    const resultPromise = harness.orchestrator.startManualSession(
      { operationGeneration: 1, expectedRevision: 0 },
      { tabIds: [11, 22], mode: 'ratio', source: 'quick-sync', requireAll: true },
    );
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(resultPromise).resolves.toEqual({
      status: 'rejected',
      reason: 'connection-timeout',
    });
    expect(harness.stopTargets).toEqual([11, 22]);
  });

  it('treats content injection failure as a rejected required Start', async () => {
    const harness = createOrchestratorHarness({
      initialState: inactiveState,
      failedInjectionTabIds: [22],
    });

    const result = await harness.orchestrator.startManualSession(
      { operationGeneration: 1, expectedRevision: 0 },
      { tabIds: [11, 22], mode: 'ratio', source: 'quick-sync', requireAll: true },
    );

    expect(result).toEqual({ status: 'rejected', reason: 'content-unreachable' });
    expect(harness.startTargets).toEqual([11]);
    expect(harness.stopTargets).toEqual([11, 22]);
  });

  it('cleans staged runtime and rolls back override when persistence fails after finalization', async () => {
    const harness = createOrchestratorHarness({
      initialState: inactiveState,
      persistFails: true,
    });

    const result = await harness.orchestrator.startManualSession(
      { operationGeneration: 1, expectedRevision: 0 },
      { tabIds: [11, 22], mode: 'ratio', source: 'quick-sync', requireAll: true },
    );

    expect(result).toEqual({ status: 'rejected', reason: 'persistence-failed' });
    expect(harness.events.slice(-4)).toEqual([
      'state:persist-failed',
      'stop:11',
      'stop:22',
      'override:rollback',
    ]);
    expect(harness.committedState).toEqual(inactiveState);
  });

  it('rejects a stale override commit before persistence and broadcast', async () => {
    const harness = createOrchestratorHarness({
      initialState: inactiveState,
      overrideCommitStale: true,
    });

    const result = await harness.orchestrator.startManualSession(
      { operationGeneration: 1, expectedRevision: 0 },
      { tabIds: [11, 22], mode: 'ratio', source: 'quick-sync', requireAll: true },
    );

    expect(result).toEqual({ status: 'rejected', reason: 'stale-revision' });
    expect(harness.persistedStates).toEqual([]);
    expect(harness.events).not.toContain('status:broadcast');
  });

  it('rejects a stale captured revision before preparing an override', async () => {
    const harness = createOrchestratorHarness({ initialState: activeState });

    const result = await harness.orchestrator.addTabToManualSession(
      { operationGeneration: 8, expectedRevision: 6 },
      { tabId: 33, expectedRevision: 6, source: 'quick-sync' },
    );

    expect(result).toEqual({ status: 'rejected', reason: 'stale-revision' });
    expect(harness.events).toEqual([]);
  });

  it('preserves all committed Add state when the new tab fails', async () => {
    const harness = createOrchestratorHarness({
      initialState: activeState,
      startResponses: { 33: { success: true, tabId: 999 } },
    });

    const result = await harness.orchestrator.addTabToManualSession(
      { operationGeneration: 2, expectedRevision: 7 },
      { tabId: 33, expectedRevision: 7, source: 'quick-sync' },
    );

    expect(result).toEqual({ status: 'rejected', reason: 'invalid-acknowledgement' });
    expect(harness.committedState).toEqual(activeState);
    expect(harness.persistedStates).toEqual([]);
    expect(harness.stopTargets).toEqual([33]);
  });

  it('rejects an invalid Add tab ID before staging an override', async () => {
    const harness = createOrchestratorHarness({ initialState: activeState });

    const result = await harness.orchestrator.addTabToManualSession(
      { operationGeneration: 2, expectedRevision: 7 },
      { tabId: 0, expectedRevision: 7, source: 'quick-sync' },
    );

    expect(result).toEqual({ status: 'rejected', reason: 'content-unreachable' });
    expect(harness.events).toEqual([]);
    expect(harness.committedState).toEqual(activeState);
  });

  it('rolls back only the staged Add tab when Add persistence fails', async () => {
    const harness = createOrchestratorHarness({
      initialState: activeState,
      persistFails: true,
    });

    const result = await harness.orchestrator.addTabToManualSession(
      { operationGeneration: 2, expectedRevision: 7 },
      { tabId: 33, expectedRevision: 7, source: 'quick-sync' },
    );

    expect(result).toEqual({ status: 'rejected', reason: 'persistence-failed' });
    expect(harness.events.slice(-3)).toEqual([
      'state:persist-failed',
      'stop:33',
      'override:rollback',
    ]);
    expect(harness.committedState).toEqual(activeState);
  });

  it('rejects after post-ack revalidation without publishing state', async () => {
    const harness = createOrchestratorHarness({
      initialState: activeState,
      revalidateFails: true,
    });

    const result = await harness.orchestrator.addTabToManualSession(
      { operationGeneration: 2, expectedRevision: 7 },
      { tabId: 33, expectedRevision: 7, source: 'quick-sync' },
    );

    expect(result).toEqual({ status: 'rejected', reason: 'stale-revision' });
    expect(harness.persistedStates).toEqual([]);
    expect(harness.events).not.toContain('status:broadcast');
    expect(harness.committedState).toEqual(activeState);
  });

  it('reports degraded Add rollback without claiming a committed topology', async () => {
    const harness = createOrchestratorHarness({
      initialState: activeState,
      startResponses: { 33: 'throw' },
      rollbackDegraded: true,
    });

    const result = await harness.orchestrator.addTabToManualSession(
      { operationGeneration: 2, expectedRevision: 7 },
      { tabId: 33, expectedRevision: 7, source: 'quick-sync' },
    );

    expect(result).toEqual({
      status: 'rejected',
      reason: 'content-unreachable',
      warning: 'auto-sync-degraded',
    });
    expect(harness.recentOutcomes).toEqual(['auto-sync-degraded']);
    expect(harness.committedState).toEqual(activeState);
  });

  it('returns a degraded warning and records a recent outcome when full rollback degrades', async () => {
    const harness = createOrchestratorHarness({
      initialState: inactiveState,
      startResponses: { 22: { success: true, tabId: 999 } },
      rollbackDegraded: true,
    });

    const result = await harness.orchestrator.startManualSession(
      { operationGeneration: 1, expectedRevision: 0 },
      { tabIds: [11, 22], mode: 'ratio', source: 'quick-sync', requireAll: true },
    );

    expect(result).toEqual({
      status: 'rejected',
      reason: 'invalid-acknowledgement',
      warning: 'auto-sync-degraded',
    });
    expect(harness.recentOutcomes).toEqual(['auto-sync-degraded']);
    expect(harness.committedState).toEqual(inactiveState);
  });

  it('reports a committed popup subset with a warning when excluded rollback degrades', async () => {
    const harness = createOrchestratorHarness({
      initialState: inactiveState,
      startResponses: { 33: { success: false, tabId: 33 } },
      rollbackUncommittedDegraded: true,
    });

    const result = await harness.orchestrator.startManualSession(
      { operationGeneration: 1, expectedRevision: 0 },
      { tabIds: [11, 22, 33], mode: 'ratio', source: 'popup', requireAll: false },
    );

    expect(result).toEqual({
      status: 'committed',
      connectedTabIds: [11, 22],
      revision: 1,
      sessionEpoch: 1,
      warning: 'auto-sync-degraded',
    });
    expect(harness.recentOutcomes).toEqual(['auto-sync-degraded']);
  });
});
