import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SyncState } from '~/shared/types/sync-state';

const {
  tabsGetMock,
  initializeAutoSyncMock,
  manualSyncOverriddenTabsMock,
  startKeepAliveMock,
  restoreSyncStateMock,
  getSyncStateSnapshotMock,
  persistSyncStateMock,
  commitSyncStateMock,
} = vi.hoisted(() => ({
  tabsGetMock: vi.fn(),
  initializeAutoSyncMock: vi.fn(),
  manualSyncOverriddenTabsMock: new Set<number>(),
  startKeepAliveMock: vi.fn(),
  restoreSyncStateMock: vi.fn(),
  getSyncStateSnapshotMock: vi.fn(),
  persistSyncStateMock: vi.fn(),
  commitSyncStateMock: vi.fn(),
}));

vi.mock('webextension-polyfill', () => ({
  default: {
    tabs: {
      get: tabsGetMock,
    },
  },
}));

vi.mock('./auto-sync-lifecycle', () => ({
  initializeAutoSync: initializeAutoSyncMock,
}));

vi.mock('./auto-sync-state', () => ({
  manualSyncOverriddenTabs: manualSyncOverriddenTabsMock,
}));

vi.mock('./keep-alive', () => ({
  startKeepAlive: startKeepAliveMock,
}));

vi.mock('./sync-state', () => ({
  restoreSyncState: restoreSyncStateMock,
  getSyncStateSnapshot: getSyncStateSnapshotMock,
  persistSyncState: persistSyncStateMock,
  commitSyncState: commitSyncStateMock,
}));

function createInactiveState(overrides: Partial<SyncState> = {}): SyncState {
  return {
    isActive: false,
    linkedTabs: [],
    connectionStatuses: {},
    lastActiveSyncedTabId: null,
    revision: 0,
    sessionEpoch: 0,
    ...overrides,
  };
}

function createActiveState(overrides: Partial<SyncState> = {}): SyncState {
  return {
    isActive: true,
    linkedTabs: [1, 2, 3],
    connectionStatuses: { 1: 'connected', 2: 'connected', 3: 'error' },
    mode: 'ratio',
    lastActiveSyncedTabId: 2,
    revision: 4,
    sessionEpoch: 3,
    ...overrides,
  };
}

async function importInitializationModule() {
  return import('./background-initialization');
}

describe('background initialization', () => {
  let committedState: SyncState;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    manualSyncOverriddenTabsMock.clear();
    committedState = createInactiveState();

    restoreSyncStateMock.mockResolvedValue({ status: 'ready' });
    getSyncStateSnapshotMock.mockImplementation(() => ({
      ...committedState,
      linkedTabs: [...committedState.linkedTabs],
      connectionStatuses: { ...committedState.connectionStatuses },
    }));
    persistSyncStateMock.mockResolvedValue({ status: 'persisted' });
    commitSyncStateMock.mockImplementation((nextState: SyncState) => {
      committedState = {
        ...nextState,
        linkedTabs: [...nextState.linkedTabs],
        connectionStatuses: { ...nextState.connectionStatuses },
      };
    });
    initializeAutoSyncMock.mockResolvedValue({ status: 'ready', enabled: false });
    tabsGetMock.mockResolvedValue({ id: 1, windowId: 1 });
  });

  it('keeps manual readiness pending until restore completes and initializes auto-sync afterward', async () => {
    const events: Array<string> = [];
    const restoreRelease = Promise.withResolvers<void>();
    restoreSyncStateMock.mockImplementation(async () => {
      events.push('restore:start');
      await restoreRelease.promise;
      events.push('restore:complete');
      return { status: 'ready' };
    });
    initializeAutoSyncMock.mockImplementation(async () => {
      events.push('auto:start');
      return { status: 'ready', enabled: false };
    });
    const { getManualReadinessSnapshot, initializeBackground, waitForBackgroundInitialization } =
      await importInitializationModule();

    const initialization = initializeBackground();

    expect(getManualReadinessSnapshot()).toBe('pending');
    expect(initializeAutoSyncMock).not.toHaveBeenCalled();
    expect(waitForBackgroundInitialization()).toBe(initialization);

    restoreRelease.resolve();

    await expect(initialization).resolves.toEqual({
      manual: { status: 'ready' },
      auto: { status: 'ready' },
    });
    expect(events).toEqual(['restore:start', 'restore:complete', 'auto:start']);
    expect(getManualReadinessSnapshot()).toBe('ready');
  });

  it.each([
    { manual: { status: 'storage-error' }, label: 'storage error' },
    {
      manual: { status: 'invalid-state', reason: 'invalid-linked-tabs' },
      label: 'invalid state',
    },
  ])('fails closed after a manual $label without scanning tabs', async ({ manual }) => {
    restoreSyncStateMock.mockResolvedValue(manual);
    const { getManualReadinessSnapshot, initializeBackground } = await importInitializationModule();

    await expect(initializeBackground()).resolves.toEqual({
      manual,
      auto: { status: 'degraded', reason: 'manual-state-unavailable' },
    });

    expect(getManualReadinessSnapshot()).toBe('unavailable');
    expect(tabsGetMock).not.toHaveBeenCalled();
    expect(initializeAutoSyncMock).not.toHaveBeenCalled();
    expect(startKeepAliveMock).not.toHaveBeenCalled();
    expect(manualSyncOverriddenTabsMock.size).toBe(0);
  });

  it('repairs active membership across windows before restoring overrides and keep-alive', async () => {
    const events: Array<string> = [];
    committedState = createActiveState();
    tabsGetMock.mockImplementation(async (tabId: number) => {
      events.push(`get:${tabId}`);
      if (tabId === 2) {
        throw new Error('tab missing');
      }
      return { id: tabId, windowId: tabId === 1 ? 1 : 2 };
    });
    persistSyncStateMock.mockImplementation(async (candidate: SyncState) => {
      events.push(`persist:${candidate.revision}:${candidate.linkedTabs.join(',')}`);
      expect(committedState).toEqual(createActiveState());
      return { status: 'persisted' };
    });
    commitSyncStateMock.mockImplementation((nextState: SyncState) => {
      events.push(`commit:${nextState.revision}:${nextState.linkedTabs.join(',')}`);
      expect(manualSyncOverriddenTabsMock.size).toBe(0);
      committedState = {
        ...nextState,
        linkedTabs: [...nextState.linkedTabs],
        connectionStatuses: { ...nextState.connectionStatuses },
      };
    });
    startKeepAliveMock.mockImplementation(() => {
      events.push('keep-alive');
    });
    const { initializeBackground } = await importInitializationModule();

    await expect(initializeBackground()).resolves.toEqual({
      manual: { status: 'ready' },
      auto: { status: 'ready' },
    });

    expect(tabsGetMock).toHaveBeenCalledTimes(3);
    expect(committedState).toEqual(
      createActiveState({
        linkedTabs: [1, 3],
        connectionStatuses: { 1: 'connected', 3: 'error' },
        lastActiveSyncedTabId: 1,
        revision: 5,
      }),
    );
    expect(events).toEqual([
      'get:1',
      'get:2',
      'get:3',
      'persist:5:1,3',
      'commit:5:1,3',
      'keep-alive',
    ]);
    expect(manualSyncOverriddenTabsMock).toEqual(new Set([1, 3]));
  });

  it('persists and commits durable inactive state when fewer than two tabs survive', async () => {
    committedState = createActiveState();
    tabsGetMock.mockImplementation(async (tabId: number) => {
      if (tabId !== 3) {
        throw new Error('tab missing');
      }
      return { id: tabId, windowId: 2 };
    });
    const { initializeBackground } = await importInitializationModule();

    await initializeBackground();

    expect(persistSyncStateMock).toHaveBeenCalledWith(
      createInactiveState({
        revision: 5,
        sessionEpoch: 3,
      }),
    );
    expect(committedState).toEqual(
      createInactiveState({
        revision: 5,
        sessionEpoch: 3,
      }),
    );
    expect(manualSyncOverriddenTabsMock.size).toBe(0);
    expect(startKeepAliveMock).not.toHaveBeenCalled();
  });

  it('leaves manual readiness unavailable when repair persistence fails', async () => {
    committedState = createActiveState();
    tabsGetMock.mockImplementation(async (tabId: number) => {
      if (tabId === 2) {
        throw new Error('tab missing');
      }
      return { id: tabId, windowId: 1 };
    });
    persistSyncStateMock.mockResolvedValue({ status: 'storage-error' });
    const { getManualReadinessSnapshot, initializeBackground } = await importInitializationModule();

    await expect(initializeBackground()).resolves.toEqual({
      manual: { status: 'storage-error' },
      auto: { status: 'degraded', reason: 'manual-state-unavailable' },
    });

    expect(getManualReadinessSnapshot()).toBe('unavailable');
    expect(commitSyncStateMock).not.toHaveBeenCalled();
    expect(initializeAutoSyncMock).not.toHaveBeenCalled();
    expect(manualSyncOverriddenTabsMock.size).toBe(0);
    expect(startKeepAliveMock).not.toHaveBeenCalled();
  });

  it('reports degraded readiness when auto-sync initialization fails', async () => {
    initializeAutoSyncMock.mockResolvedValue({
      status: 'failed',
      reason: 'initialization-failed',
    });
    const { initializeBackground } = await importInitializationModule();

    await expect(initializeBackground()).resolves.toEqual({
      manual: { status: 'ready' },
      auto: { status: 'degraded', reason: 'initialization-failed' },
    });
  });
});
