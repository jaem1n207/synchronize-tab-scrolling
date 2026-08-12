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
type StopResponse = 'invalid' | 'mismatched' | 'timeout' | 'throw';

interface HarnessOptions {
  initialState: SyncState;
  startResponses?: Record<number, StartResponse>;
  stopResponses?: Record<number, StopResponse>;
  failedInjectionTabIds?: Array<number>;
  persistFails?: boolean;
  overrideCommitStale?: boolean;
  rollbackDegraded?: boolean;
  rollbackUncommittedDegraded?: boolean;
  revalidateFails?: boolean;
  residualCleanupDegraded?: boolean;
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
  const cleanupRetries: Array<{
    tabId: number;
    stoppedRevision: number;
    stoppedSessionEpoch: number;
    attemptIndex: number;
  }> = [];
  const cancelledCleanupTabIds: Array<number> = [];
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
    cleanupResidualRuntime: async () => {
      events.push('override:cleanup-residual');
      return options.residualCleanupDegraded ? { status: 'degraded' } : { status: 'cleaned' };
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
      const response = options.stopResponses?.[tabId];
      if (response === 'timeout') {
        return new Promise(() => undefined);
      }
      if (response === 'throw') {
        throw new Error('stop failed');
      }
      if (response === 'invalid') {
        return { success: false, tabId };
      }
      if (response === 'mismatched') {
        return { success: true, tabId: tabId + 1 };
      }
      return { success: true, tabId };
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
    clearManualOverrides: async (tabIds) => {
      events.push(`override:clear:${tabIds.join(',')}`);
    },
    cleanupScheduler: {
      schedule: (input) => {
        cleanupRetries.push({ ...input });
      },
      cancelForTab: (tabId) => {
        cancelledCleanupTabIds.push(tabId);
      },
      cancelAll: vi.fn(),
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
    cleanupRetries,
    cancelledCleanupTabIds,
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

  it('preserves an explicit content offset reconciliation failure', async () => {
    const harness = createOrchestratorHarness({
      initialState: inactiveState,
      startResponses: {
        11: {
          success: false,
          tabId: 11,
          reason: 'offset-reconciliation-failed',
        },
        22: { success: true, tabId: 22 },
      },
    });

    const result = await harness.orchestrator.startManualSession(
      { operationGeneration: 1, expectedRevision: 0 },
      { tabIds: [11, 22], mode: 'ratio', source: 'quick-sync', requireAll: true },
    );

    expect(result).toEqual({
      status: 'rejected',
      reason: 'offset-reconciliation-failed',
    });
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
    expect(harness.events.slice(-2)).toEqual(['status:broadcast', 'override:cleanup-residual']);
  });

  it('keeps the committed Add topology truthful when residual auto cleanup degrades', async () => {
    const harness = createOrchestratorHarness({
      initialState: activeState,
      residualCleanupDegraded: true,
    });

    const result = await harness.orchestrator.addTabToManualSession(
      { operationGeneration: 2, expectedRevision: 7 },
      { tabId: 33, expectedRevision: 7, source: 'quick-sync' },
    );

    expect(result).toEqual({
      status: 'committed',
      linkedTabIds: [11, 22, 33],
      revision: 8,
      sessionEpoch: 4,
      warning: 'auto-sync-degraded',
    });
    expect(harness.recentOutcomes).toEqual(['auto-sync-degraded']);
    expect(harness.committedState.linkedTabs).toEqual([11, 22, 33]);
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
    expect(harness.events).not.toContain('override:cleanup-residual');
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

  it.each([
    { name: 'invalid Stop acknowledgement', stopResponse: 'invalid' },
    { name: 'mismatched Stop acknowledgement', stopResponse: 'mismatched' },
    { name: 'thrown Stop', stopResponse: 'throw' },
  ] satisfies Array<{ name: string; stopResponse: StopResponse }>)(
    'reports degraded full rollback after $name',
    async ({ stopResponse }) => {
      const harness = createOrchestratorHarness({
        initialState: inactiveState,
        startResponses: { 22: { success: true, tabId: 999 } },
        stopResponses: { 11: stopResponse },
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
    },
  );

  it('times out full rollback Stop cleanup after 1,000ms and reports degradation', async () => {
    vi.useFakeTimers();
    const harness = createOrchestratorHarness({
      initialState: inactiveState,
      startResponses: { 22: { success: true, tabId: 999 } },
      stopResponses: { 11: 'timeout' },
    });

    const resultPromise = harness.orchestrator.startManualSession(
      { operationGeneration: 1, expectedRevision: 0 },
      { tabIds: [11, 22], mode: 'ratio', source: 'quick-sync', requireAll: true },
    );
    const observed = Promise.race([
      resultPromise,
      new Promise<'not-settled'>((resolve) => {
        setTimeout(() => resolve('not-settled'), 1_001);
      }),
    ]);
    await vi.advanceTimersByTimeAsync(1_001);

    await expect(observed).resolves.toEqual({
      status: 'rejected',
      reason: 'invalid-acknowledgement',
      warning: 'auto-sync-degraded',
    });
    expect(harness.recentOutcomes).toEqual(['auto-sync-degraded']);
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

  it.each([
    { name: 'invalid Stop acknowledgement', stopResponse: 'invalid' },
    { name: 'mismatched Stop acknowledgement', stopResponse: 'mismatched' },
    { name: 'thrown Stop', stopResponse: 'throw' },
  ] satisfies Array<{ name: string; stopResponse: StopResponse }>)(
    'keeps the committed popup subset truthful but warns after excluded $name',
    async ({ stopResponse }) => {
      const harness = createOrchestratorHarness({
        initialState: inactiveState,
        startResponses: { 33: { success: false, tabId: 33 } },
        stopResponses: { 33: stopResponse },
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
      expect(harness.committedState.linkedTabs).toEqual([11, 22]);
    },
  );

  it('times out excluded popup Stop cleanup after 1,000ms and warns on the committed subset', async () => {
    vi.useFakeTimers();
    const harness = createOrchestratorHarness({
      initialState: inactiveState,
      startResponses: { 33: { success: false, tabId: 33 } },
      stopResponses: { 33: 'timeout' },
    });

    const resultPromise = harness.orchestrator.startManualSession(
      { operationGeneration: 1, expectedRevision: 0 },
      { tabIds: [11, 22, 33], mode: 'ratio', source: 'popup', requireAll: false },
    );
    const observed = Promise.race([
      resultPromise,
      new Promise<'not-settled'>((resolve) => {
        setTimeout(() => resolve('not-settled'), 1_001);
      }),
    ]);
    await vi.advanceTimersByTimeAsync(1_001);

    await expect(observed).resolves.toEqual({
      status: 'committed',
      connectedTabIds: [11, 22],
      revision: 1,
      sessionEpoch: 1,
      warning: 'auto-sync-degraded',
    });
    expect(harness.recentOutcomes).toEqual(['auto-sync-degraded']);
  });

  it('durably commits inactive before stopping runtime and cleaning every committed tab', async () => {
    const harness = createOrchestratorHarness({ initialState: activeState });

    const result = await harness.orchestrator.stopManualSession(
      { operationGeneration: 3, expectedRevision: 7 },
      'popup',
    );

    expect(result).toEqual({ status: 'committed', revision: 8 });
    expect(harness.committedState).toEqual({
      isActive: false,
      linkedTabs: [],
      connectionStatuses: {},
      lastActiveSyncedTabId: null,
      revision: 8,
      sessionEpoch: 4,
    });
    expect(harness.events).toEqual([
      'state:persist',
      'state:commit',
      'keep-alive:stop',
      'override:clear:11,22',
      'status:broadcast',
      'stop:11',
      'stop:22',
    ]);
  });

  it('leaves the active state untouched and sends no Stop when inactive persistence fails', async () => {
    const harness = createOrchestratorHarness({
      initialState: activeState,
      persistFails: true,
    });

    const result = await harness.orchestrator.stopManualSession(
      { operationGeneration: 3, expectedRevision: 7 },
      'popup',
    );

    expect(result).toEqual({ status: 'rejected', reason: 'persistence-failed' });
    expect(harness.committedState).toEqual(activeState);
    expect(harness.stopTargets).toEqual([]);
    expect(harness.events).toEqual(['state:persist-failed']);
  });

  it.each([
    { name: 'invalid acknowledgement', response: 'invalid' },
    { name: 'mismatched acknowledgement', response: 'mismatched' },
    { name: 'thrown cleanup', response: 'throw' },
  ] satisfies Array<{ name: string; response: StopResponse }>)(
    'keeps Stop committed and schedules exact cleanup retry after $name',
    async ({ response }) => {
      const harness = createOrchestratorHarness({
        initialState: activeState,
        stopResponses: { 22: response },
      });

      const result = await harness.orchestrator.stopManualSession(
        { operationGeneration: 3, expectedRevision: 7 },
        'popup',
      );

      expect(result).toEqual({
        status: 'committed',
        revision: 8,
        warning: 'cleanup-incomplete',
      });
      expect(harness.committedState.isActive).toBe(false);
      expect(harness.cleanupRetries).toEqual([
        {
          tabId: 22,
          stoppedRevision: 8,
          stoppedSessionEpoch: 4,
          attemptIndex: 0,
        },
      ]);
    },
  );

  it('times out Stop cleanup after 1,000ms without resurrecting the session', async () => {
    vi.useFakeTimers();
    const harness = createOrchestratorHarness({
      initialState: activeState,
      stopResponses: { 22: 'timeout' },
    });

    const resultPromise = harness.orchestrator.stopManualSession(
      { operationGeneration: 3, expectedRevision: 7 },
      'popup',
    );
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(resultPromise).resolves.toEqual({
      status: 'committed',
      revision: 8,
      warning: 'cleanup-incomplete',
    });
    expect(harness.committedState.isActive).toBe(false);
    expect(harness.cleanupRetries.map((cleanup) => cleanup.tabId)).toEqual([22]);
  });

  it('freezes reconnect identity and ignores reverse completion from an older attempt', async () => {
    const harness = createOrchestratorHarness({
      initialState: {
        ...activeState,
        connectionStatuses: { 11: 'error', 22: 'connected' },
      },
    });
    const first = harness.orchestrator.beginManualReconnect(
      { operationGeneration: 4, expectedRevision: 7 },
      11,
    );
    const second = harness.orchestrator.beginManualReconnect(
      { operationGeneration: 5, expectedRevision: 7 },
      11,
    );

    expect(first.status).toBe('ready');
    expect(second.status).toBe('ready');
    if (first.status !== 'ready' || second.status !== 'ready') {
      throw new Error('Expected reconnect tokens');
    }

    const secondResult = await harness.orchestrator.finishManualReconnect(
      { operationGeneration: 6, expectedRevision: 7 },
      second.token,
      { success: true, tabId: 11 },
    );
    const firstResult = await harness.orchestrator.finishManualReconnect(
      { operationGeneration: 7, expectedRevision: 7 },
      first.token,
      { success: false, tabId: 11 },
    );

    expect(secondResult).toEqual({ status: 'committed', revision: 7 });
    expect(firstResult).toEqual({ status: 'rejected', reason: 'stale-revision' });
    expect(harness.committedState.connectionStatuses[11]).toBe('connected');
    expect(harness.persistedStates).toHaveLength(1);
  });

  it('persists reconnect connection status before committing memory', async () => {
    const harness = createOrchestratorHarness({ initialState: activeState });
    const begin = harness.orchestrator.beginManualReconnect(
      { operationGeneration: 4, expectedRevision: 7 },
      11,
    );
    if (begin.status !== 'ready') {
      throw new Error('Expected reconnect token');
    }

    const result = await harness.orchestrator.finishManualReconnect(
      { operationGeneration: 5, expectedRevision: 7 },
      begin.token,
      { success: false, tabId: 11 },
    );

    expect(result).toEqual({ status: 'rejected', reason: 'invalid-acknowledgement' });
    expect(harness.events.slice(-3)).toEqual(['state:persist', 'state:commit', 'status:broadcast']);
    expect(harness.committedState.connectionStatuses[11]).toBe('error');
  });
});
