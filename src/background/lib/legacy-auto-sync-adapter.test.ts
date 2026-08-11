import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AutoSyncGroup } from '~/shared/types/auto-sync-state';
import type { StartSyncContentMessage } from '~/shared/types/messages';
import type { SyncState } from '~/shared/types/sync-state';

import {
  createLegacyAutoSyncAdapter,
  replaceManualWithAcceptedAutoSync,
  type LegacyAutoSyncAdapter,
} from './legacy-auto-sync-adapter';

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
});

describe('createLegacyAutoSyncAdapter', () => {
  const normalizedUrl = 'https://fixture.invalid/group';
  const groups = new Map<string, AutoSyncGroup>();
  const started: Array<{ tabId: number; message: StartSyncContentMessage }> = [];
  const stopped: Array<number> = [];
  const startResults = new Map<number, boolean>();

  beforeEach(() => {
    groups.clear();
    started.length = 0;
    stopped.length = 0;
    startResults.clear();
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
      sendStart: async (tabId, message) => {
        started.push({ tabId, message });
        return startResults.get(tabId) ?? true;
      },
      sendStop: async (tabId) => {
        stopped.push(tabId);
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

  it('commits only the connected subset when at least two accepted tabs start', async () => {
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
    ).resolves.toEqual({ status: 'started' });

    expect(Array.from(groups.get(normalizedUrl)?.tabIds ?? [])).toEqual([11, 22]);
    expect(Array.from(groups.get(normalizedUrl)?.tabUrls?.keys() ?? [])).toEqual([11, 22]);
    expect(groups.get(normalizedUrl)?.isActive).toBe(true);
    expect(stopped).toEqual([]);
  });

  it('cleans staged tabs and leaves the group inactive when fewer than two start', async () => {
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
    expect(stopped).toEqual([11]);
  });

  it('rejects a changed group and cleans tabs started from the stale snapshot', async () => {
    const adapter = createLegacyAutoSyncAdapter({
      groups,
      withLock: async (operation) => operation(),
      sendStart: async (tabId, message) => {
        started.push({ tabId, message });
        if (tabId === 11) {
          groups.get(normalizedUrl)?.tabIds.add(33);
        }
        return true;
      },
      sendStop: async (tabId) => {
        stopped.push(tabId);
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
  });

  it('marks the accepted group inactive before cleaning every tab on rollback', async () => {
    const adapter = createAdapter();
    const input = {
      normalizedUrl,
      tabIds: [11, 22],
      expectedRevision: 6,
    };
    await adapter.startAcceptedGroup(input);

    await adapter.rollbackAcceptedGroup(input);

    expect(groups.get(normalizedUrl)?.isActive).toBe(false);
    expect(stopped).toEqual([11, 22]);
  });
});
