import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AutoSyncGroup } from '~/shared/types/auto-sync-state';
import type { StartSyncContentMessage, StopSyncContentResponse } from '~/shared/types/messages';
import type { SyncState } from '~/shared/types/sync-state';

import {
  createLegacyAutoSyncAdapter,
  replaceManualWithAcceptedAutoSync,
  type LegacyAutoSyncAdapter,
} from './legacy-auto-sync-adapter';

import type { PendingManualCleanup } from './sync-cleanup-retry';
import type { SyncSessionOrchestrator } from './sync-session-orchestrator';

function createState(overrides: Partial<SyncState> = {}): SyncState {
  return {
    isActive: false,
    linkedTabs: [],
    connectionStatuses: {},
    lastActiveSyncedTabId: null,
    revision: 6,
    sessionEpoch: 3,
    ...overrides,
  };
}

describe('replaceManualWithAcceptedAutoSync', () => {
  const events: Array<string> = [];
  let state = createState();
  const persistState = vi.fn();
  const commitState = vi.fn((nextState: SyncState) => {
    events.push(`commit:${nextState.revision}`);
    state = nextState;
  });
  const startAcceptedGroup = vi.fn();
  const rollbackAcceptedGroup = vi.fn();
  const stopManualSession = vi.fn();

  const legacyAutoSyncAdapter: LegacyAutoSyncAdapter = {
    startAcceptedGroup,
    rollbackAcceptedGroup,
  };

  const orchestrator = {
    startManualSession: vi.fn(),
    addTabToManualSession: vi.fn(),
    stopManualSession,
    beginManualReconnect: vi.fn(),
    finishManualReconnect: vi.fn(),
    isManualReconnectCurrent: vi.fn(),
  } satisfies SyncSessionOrchestrator;

  const input = {
    normalizedUrl: 'https://fixture.invalid/group',
    tabIds: [11, 22],
    expectedRevision: 6,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    events.length = 0;
    state = createState();
    persistState.mockImplementation(async (nextState: SyncState) => {
      events.push(`persist:${nextState.revision}`);
      return { status: 'persisted' };
    });
    startAcceptedGroup.mockImplementation(async () => {
      events.push('auto:start');
      return { status: 'started' };
    });
    rollbackAcceptedGroup.mockImplementation(async () => {
      events.push('auto:rollback');
      return { status: 'cleaned' };
    });
    stopManualSession.mockImplementation(async () => {
      events.push('manual:stop');
      state = createState({ revision: 7 });
      return { status: 'committed', revision: 7 };
    });
  });

  it('rejects stale acceptance without changing manual or auto state', async () => {
    const initialState = createState({ revision: 7 });
    state = initialState;

    await expect(
      replaceManualWithAcceptedAutoSync({ operationGeneration: 4, expectedRevision: 7 }, input, {
        orchestrator,
        legacyAutoSyncAdapter,
        getState: () => state,
        persistState,
        commitState,
      }),
    ).resolves.toEqual({ status: 'rejected', reason: 'stale-revision' });

    expect(state).toBe(initialState);
    expect(stopManualSession).not.toHaveBeenCalled();
    expect(startAcceptedGroup).not.toHaveBeenCalled();
    expect(persistState).not.toHaveBeenCalled();
  });

  it('durably stops an active manual session before starting the accepted auto group', async () => {
    state = createState({
      isActive: true,
      linkedTabs: [1, 2],
      connectionStatuses: { 1: 'connected', 2: 'connected' },
      mode: 'ratio',
    });

    await expect(
      replaceManualWithAcceptedAutoSync({ operationGeneration: 5, expectedRevision: 6 }, input, {
        orchestrator,
        legacyAutoSyncAdapter,
        getState: () => state,
        persistState,
        commitState,
      }),
    ).resolves.toEqual({ status: 'committed', revision: 8 });

    expect(events).toEqual(['manual:stop', 'auto:start', 'persist:8', 'commit:8']);
    expect(stopManualSession).toHaveBeenCalledWith(
      { operationGeneration: 5, expectedRevision: 6 },
      'suggestion-replace',
    );
    expect(state).toEqual(createState({ revision: 8 }));
  });

  it('advances only the inactive manual revision after accepted auto start', async () => {
    await expect(
      replaceManualWithAcceptedAutoSync({ operationGeneration: 6, expectedRevision: 6 }, input, {
        orchestrator,
        legacyAutoSyncAdapter,
        getState: () => state,
        persistState,
        commitState,
      }),
    ).resolves.toEqual({ status: 'committed', revision: 7 });

    expect(state).toEqual(createState({ revision: 7 }));
    expect(state.sessionEpoch).toBe(3);
    expect(stopManualSession).not.toHaveBeenCalled();
    expect(events).toEqual(['auto:start', 'persist:7', 'commit:7']);
  });

  it('keeps the durable post-stop manual state when accepted auto start fails', async () => {
    state = createState({
      isActive: true,
      linkedTabs: [1, 2],
      connectionStatuses: { 1: 'connected', 2: 'connected' },
      mode: 'ratio',
    });
    startAcceptedGroup.mockImplementationOnce(async () => {
      events.push('auto:start');
      return { status: 'failed' };
    });

    await expect(
      replaceManualWithAcceptedAutoSync({ operationGeneration: 7, expectedRevision: 6 }, input, {
        orchestrator,
        legacyAutoSyncAdapter,
        getState: () => state,
        persistState,
        commitState,
      }),
    ).resolves.toEqual({ status: 'rejected', reason: 'auto-start-failed' });

    expect(state).toEqual(createState({ revision: 7 }));
    expect(events).toEqual(['manual:stop', 'auto:start']);
    expect(persistState).not.toHaveBeenCalled();
    expect(rollbackAcceptedGroup).not.toHaveBeenCalled();
  });

  it('surfaces cleanup degradation from a failed accepted auto start', async () => {
    state = createState({
      isActive: true,
      linkedTabs: [1, 2],
      connectionStatuses: { 1: 'connected', 2: 'connected' },
      mode: 'ratio',
    });
    startAcceptedGroup.mockImplementationOnce(async () => {
      events.push('auto:start');
      return { status: 'failed', warning: 'auto-sync-degraded' };
    });

    await expect(
      replaceManualWithAcceptedAutoSync({ operationGeneration: 8, expectedRevision: 6 }, input, {
        orchestrator,
        legacyAutoSyncAdapter,
        getState: () => state,
        persistState,
        commitState,
      }),
    ).resolves.toEqual({
      status: 'rejected',
      reason: 'auto-start-failed',
      warning: 'auto-sync-degraded',
    });

    expect(state).toEqual(createState({ revision: 7 }));
    expect(state.sessionEpoch).toBe(3);
    expect(events).toEqual(['manual:stop', 'auto:start']);
  });

  it('rolls back the accepted auto group when the inactive revision cannot persist', async () => {
    state = createState({
      isActive: true,
      linkedTabs: [1, 2],
      connectionStatuses: { 1: 'connected', 2: 'connected' },
      mode: 'ratio',
    });
    persistState.mockImplementationOnce(async (nextState: SyncState) => {
      events.push(`persist:${nextState.revision}`);
      return { status: 'storage-error' };
    });

    await expect(
      replaceManualWithAcceptedAutoSync({ operationGeneration: 8, expectedRevision: 6 }, input, {
        orchestrator,
        legacyAutoSyncAdapter,
        getState: () => state,
        persistState,
        commitState,
      }),
    ).resolves.toEqual({ status: 'rejected', reason: 'persistence-failed' });

    expect(events).toEqual(['manual:stop', 'auto:start', 'persist:8', 'auto:rollback']);
    expect(state).toEqual(createState({ revision: 7 }));
    expect(commitState).not.toHaveBeenCalled();
  });

  it('reports degraded rollback while preserving durable post-stop manual truth', async () => {
    state = createState({
      isActive: true,
      linkedTabs: [1, 2],
      connectionStatuses: { 1: 'connected', 2: 'connected' },
      mode: 'ratio',
    });
    persistState.mockImplementationOnce(async (nextState: SyncState) => {
      events.push(`persist:${nextState.revision}`);
      return { status: 'storage-error' };
    });
    rollbackAcceptedGroup.mockImplementationOnce(async () => {
      events.push('auto:rollback');
      return { status: 'degraded' };
    });

    await expect(
      replaceManualWithAcceptedAutoSync({ operationGeneration: 9, expectedRevision: 6 }, input, {
        orchestrator,
        legacyAutoSyncAdapter,
        getState: () => state,
        persistState,
        commitState,
      }),
    ).resolves.toEqual({
      status: 'rejected',
      reason: 'persistence-failed',
      warning: 'auto-sync-degraded',
    });

    expect(state).toEqual(createState({ revision: 7 }));
    expect(state.sessionEpoch).toBe(3);
    expect(commitState).not.toHaveBeenCalled();
  });
});

describe('createLegacyAutoSyncAdapter', () => {
  const normalizedUrl = 'https://fixture.invalid/group';
  const groups = new Map<string, AutoSyncGroup>();
  const started: Array<{ tabId: number; message: StartSyncContentMessage }> = [];
  const stopped: Array<number> = [];
  const activeRuntimeTabIds = new Set<number>();
  const scheduledCleanup: Array<PendingManualCleanup> = [];
  const startResults = new Map<number, boolean>();
  const stopResults = new Map<number, StopSyncContentResponse>();
  const thrownStopIds = new Set<number>();

  beforeEach(() => {
    groups.clear();
    started.length = 0;
    stopped.length = 0;
    activeRuntimeTabIds.clear();
    scheduledCleanup.length = 0;
    startResults.clear();
    stopResults.clear();
    thrownStopIds.clear();
    groups.set(normalizedUrl, {
      tabIds: new Set([11, 22]),
      tabUrls: new Map([
        [11, 'https://fixture.invalid/first'],
        [22, 'https://fixture.invalid/second'],
      ]),
      isActive: false,
    });
  });

  function createAdapter() {
    return createLegacyAutoSyncAdapter({
      groups,
      withLock: async (operation) => operation(),
      getState: () => createState(),
      cleanupScheduler: {
        schedule: (input) => {
          scheduledCleanup.push(input);
        },
        cancelForTab: () => undefined,
        cancelAll: () => undefined,
      },
      sendStart: async (tabId, message) => {
        started.push({ tabId, message });
        activeRuntimeTabIds.add(tabId);
        return startResults.get(tabId) ?? true;
      },
      sendStop: async (tabId) => {
        stopped.push(tabId);
        if (thrownStopIds.has(tabId)) {
          throw new Error('Stop failed');
        }
        const response = stopResults.get(tabId) ?? { success: true, tabId };
        if (response.success && response.tabId === tabId) {
          activeRuntimeTabIds.delete(tabId);
        }
        return response;
      },
    });
  }

  it('starts the accepted group as auto-sync without creating a manual session', async () => {
    const adapter = createAdapter();

    await expect(
      adapter.startAcceptedGroup({
        normalizedUrl,
        tabIds: [11, 22],
        expectedRevision: 6,
      }),
    ).resolves.toEqual({ status: 'started' });

    expect(groups.get(normalizedUrl)?.isActive).toBe(true);
    expect(started).toEqual([
      {
        tabId: 11,
        message: {
          tabIds: [11, 22],
          mode: 'ratio',
          currentTabId: 11,
          isAutoSync: true,
        },
      },
      {
        tabId: 22,
        message: {
          tabIds: [11, 22],
          mode: 'ratio',
          currentTabId: 22,
          isAutoSync: true,
        },
      },
    ]);
  });

  it('requires every accepted tab to confirm Start and cleans every attempted runtime', async () => {
    groups.set(normalizedUrl, {
      tabIds: new Set([11, 22, 33]),
      tabUrls: new Map([
        [11, 'https://fixture.invalid/first'],
        [22, 'https://fixture.invalid/second'],
        [33, 'https://fixture.invalid/third'],
      ]),
      isActive: false,
    });
    startResults.set(33, false);
    const adapter = createAdapter();

    await expect(
      adapter.startAcceptedGroup({
        normalizedUrl,
        tabIds: [11, 22, 33],
        expectedRevision: 6,
      }),
    ).resolves.toEqual({ status: 'failed' });

    expect(Array.from(groups.get(normalizedUrl)?.tabIds ?? [])).toEqual([11, 22, 33]);
    expect(Array.from(groups.get(normalizedUrl)?.tabUrls?.keys() ?? [])).toEqual([11, 22, 33]);
    expect(groups.get(normalizedUrl)?.isActive).toBe(false);
    expect(stopped).toEqual([11, 22, 33]);
    expect(activeRuntimeTabIds.size).toBe(0);
  });

  it('cleans a runtime that activates before its Start acknowledgement times out', async () => {
    startResults.set(22, false);
    const adapter = createAdapter();

    await expect(
      adapter.startAcceptedGroup({
        normalizedUrl,
        tabIds: [11, 22],
        expectedRevision: 6,
      }),
    ).resolves.toEqual({ status: 'failed' });

    expect(groups.get(normalizedUrl)?.isActive).toBe(false);
    expect(Array.from(groups.get(normalizedUrl)?.tabIds ?? [])).toEqual([11, 22]);
    expect(stopped).toEqual([11, 22]);
    expect(activeRuntimeTabIds.size).toBe(0);
  });

  it('rejects a changed group and cleans tabs started from the stale snapshot', async () => {
    const adapter = createLegacyAutoSyncAdapter({
      groups,
      withLock: async (operation) => operation(),
      getState: () => createState(),
      cleanupScheduler: {
        schedule: (input) => {
          scheduledCleanup.push(input);
        },
        cancelForTab: () => undefined,
        cancelAll: () => undefined,
      },
      sendStart: async (tabId, message) => {
        started.push({ tabId, message });
        activeRuntimeTabIds.add(tabId);
        if (tabId === 11) {
          groups.get(normalizedUrl)?.tabIds.add(33);
        }
        return true;
      },
      sendStop: async (tabId) => {
        stopped.push(tabId);
        activeRuntimeTabIds.delete(tabId);
        return { success: true, tabId };
      },
    });

    await expect(
      adapter.startAcceptedGroup({
        normalizedUrl,
        tabIds: [11, 22],
        expectedRevision: 6,
      }),
    ).resolves.toEqual({ status: 'failed' });

    expect(groups.get(normalizedUrl)?.isActive).toBe(false);
    expect(stopped).toEqual([11, 22]);
    expect(activeRuntimeTabIds.size).toBe(0);
  });

  it('reports degraded cleanup and schedules exact-ack Stop retries for attempted tabs', async () => {
    startResults.set(22, false);
    stopResults.set(22, { success: true, tabId: 99 });
    const adapter = createAdapter();

    await expect(
      adapter.startAcceptedGroup({
        normalizedUrl,
        tabIds: [11, 22],
        expectedRevision: 6,
      }),
    ).resolves.toEqual({ status: 'failed', warning: 'auto-sync-degraded' });

    expect(stopped).toEqual([11, 22]);
    expect(activeRuntimeTabIds.has(11)).toBe(false);
    expect(activeRuntimeTabIds.has(22)).toBe(true);
    expect(scheduledCleanup).toEqual([
      {
        tabId: 22,
        stoppedRevision: 6,
        stoppedSessionEpoch: 3,
        attemptIndex: 0,
      },
    ]);
  });

  it('schedules retry when attempted cleanup throws', async () => {
    startResults.set(22, false);
    thrownStopIds.add(11);
    const adapter = createAdapter();

    await expect(
      adapter.startAcceptedGroup({
        normalizedUrl,
        tabIds: [11, 22],
        expectedRevision: 6,
      }),
    ).resolves.toEqual({ status: 'failed', warning: 'auto-sync-degraded' });

    expect(stopped).toEqual([11, 22]);
    expect(scheduledCleanup.map((input) => input.tabId)).toEqual([11]);
  });

  it('marks the accepted group inactive before cleaning every tab on rollback', async () => {
    const adapter = createAdapter();
    const input = {
      normalizedUrl,
      tabIds: [11, 22],
      expectedRevision: 6,
    };
    await adapter.startAcceptedGroup(input);

    await expect(adapter.rollbackAcceptedGroup(input)).resolves.toEqual({ status: 'cleaned' });

    expect(groups.get(normalizedUrl)?.isActive).toBe(false);
    expect(stopped).toEqual([11, 22]);
  });

  it('reports and retries degraded rollback cleanup', async () => {
    const adapter = createAdapter();
    const input = {
      normalizedUrl,
      tabIds: [11, 22],
      expectedRevision: 6,
    };
    await adapter.startAcceptedGroup(input);
    stopResults.set(22, { success: false, tabId: 22 });

    await expect(adapter.rollbackAcceptedGroup(input)).resolves.toEqual({
      status: 'degraded',
    });

    expect(groups.get(normalizedUrl)?.isActive).toBe(false);
    expect(stopped).toEqual([11, 22]);
    expect(scheduledCleanup.map((cleanup) => cleanup.tabId)).toEqual([22]);
  });
});
