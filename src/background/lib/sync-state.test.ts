import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendMessage } from 'webext-bridge/background';
import browser from 'webextension-polyfill';

import type { SyncState } from '~/shared/types/sync-state';

import {
  broadcastSyncStatus,
  commitSyncState,
  getSyncStateSnapshot,
  persistSyncState,
  restoreSyncState,
  syncState,
} from './sync-state';

const {
  sendMessageMock,
  storageSetMock,
  storageGetMock,
  tabsQueryMock,
  loggerMock,
  extensionLoggerMock,
} = vi.hoisted(() => ({
  sendMessageMock: vi.fn(),
  storageSetMock: vi.fn(),
  storageGetMock: vi.fn(),
  tabsQueryMock: vi.fn(),
  loggerMock: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  extensionLoggerMock: vi.fn(),
}));

vi.mock('webext-bridge/background', () => ({
  sendMessage: sendMessageMock,
}));

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      local: {
        set: storageSetMock,
        get: storageGetMock,
      },
    },
    tabs: {
      query: tabsQueryMock,
    },
  },
}));

vi.mock('~/shared/lib/logger', () => ({
  ExtensionLogger: extensionLoggerMock.mockImplementation(() => loggerMock),
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
    linkedTabs: [1, 2],
    connectionStatuses: { 1: 'connected', 2: 'connected' },
    mode: 'ratio',
    lastActiveSyncedTabId: 1,
    revision: 4,
    sessionEpoch: 2,
    ...overrides,
  };
}

function createMockTab(overrides: Partial<browser.Tabs.Tab> = {}): browser.Tabs.Tab {
  return {
    id: 1,
    index: 0,
    highlighted: false,
    active: false,
    pinned: false,
    incognito: false,
    ...overrides,
  };
}

function findForbiddenContentMessageKeys(value: unknown): Array<string> {
  if (Array.isArray(value)) {
    return value.flatMap(findForbiddenContentMessageKeys);
  }
  if (typeof value !== 'object' || value === null) {
    return [];
  }

  const forbiddenNames = ['title', 'favIconUrl', 'url', 'tabId', 'windowId', 'linkedTabIds'];
  return Object.entries(value).flatMap(([key, nestedValue]) => {
    const forbiddenKey = forbiddenNames.includes(key) || /^\d+$/.test(key) ? [key] : [];
    return [...forbiddenKey, ...findForbiddenContentMessageKeys(nestedValue)];
  });
}

describe('sync-state', () => {
  const mockedSendMessage = vi.mocked(sendMessage);
  const mockedBrowser = vi.mocked(browser, true);

  beforeEach(() => {
    vi.clearAllMocks();
    commitSyncState(createInactiveState());

    mockedBrowser.storage.local.set.mockResolvedValue();
    mockedBrowser.storage.local.get.mockResolvedValue({});
    mockedBrowser.tabs.query.mockResolvedValue([]);
    mockedSendMessage.mockResolvedValue(undefined);
  });

  describe('committed state', () => {
    it('starts with default initial values', () => {
      expect(syncState).toEqual(createInactiveState());
    });

    it('returns fresh arrays and records from every snapshot', () => {
      commitSyncState(createActiveState());

      const firstSnapshot = getSyncStateSnapshot();
      const secondSnapshot = getSyncStateSnapshot();

      firstSnapshot.linkedTabs.push(3);
      firstSnapshot.connectionStatuses[1] = 'error';

      expect(secondSnapshot).toEqual(createActiveState());
      expect(getSyncStateSnapshot()).toEqual(createActiveState());
      expect(firstSnapshot.linkedTabs).not.toBe(secondSnapshot.linkedTabs);
      expect(firstSnapshot.connectionStatuses).not.toBe(secondSnapshot.connectionStatuses);
    });

    it('clones candidate collections when committing', () => {
      const candidate = createActiveState();

      commitSyncState(candidate);
      candidate.linkedTabs.push(3);
      candidate.connectionStatuses[1] = 'error';

      expect(getSyncStateSnapshot()).toEqual(createActiveState());
    });
  });

  describe('persistSyncState', () => {
    it('persists the supplied candidate and returns an explicit result', async () => {
      const candidate = createActiveState({ revision: 5 });

      await expect(persistSyncState(candidate)).resolves.toEqual({ status: 'persisted' });

      expect(mockedBrowser.storage.local.set).toHaveBeenCalledWith({ syncState: candidate });
      expect(loggerMock.debug).toHaveBeenCalledWith('Sync state persisted to storage', {
        linkedTabCount: 2,
        revision: 5,
        sessionEpoch: 2,
      });
    });

    it('returns storage-error when the candidate write rejects', async () => {
      mockedBrowser.storage.local.set.mockRejectedValueOnce(new Error('storage set failed'));

      await expect(persistSyncState(createActiveState())).resolves.toEqual({
        status: 'storage-error',
      });
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to persist sync state', {
        reason: 'storage-write-failed',
        linkedTabCount: 2,
        revision: 4,
        sessionEpoch: 2,
      });
    });

    it('does not mutate committed memory when a candidate write fails', async () => {
      const committed = createActiveState({ revision: 8 });
      const candidate = createActiveState({
        linkedTabs: [1, 2, 3],
        connectionStatuses: { 1: 'connected', 2: 'connected', 3: 'connected' },
        revision: 9,
      });
      commitSyncState(committed);
      mockedBrowser.storage.local.set.mockRejectedValueOnce(new Error('storage set failed'));

      await persistSyncState(candidate);

      expect(getSyncStateSnapshot()).toEqual(committed);
    });
  });

  describe('restoreSyncState', () => {
    it('persists a migrated stored state before committing it without reconnecting tabs', async () => {
      const previouslyCommitted = createActiveState({ revision: 9 });
      commitSyncState(previouslyCommitted);
      mockedBrowser.storage.local.get.mockResolvedValueOnce({
        syncState: {
          isActive: true,
          linkedTabs: [7, 8],
          connectionStatuses: { 7: 'connected' },
          lastActiveSyncedTabId: 7,
        },
      });
      mockedBrowser.storage.local.set.mockImplementationOnce(async () => {
        expect(getSyncStateSnapshot()).toEqual(previouslyCommitted);
      });

      await expect(restoreSyncState()).resolves.toEqual({ status: 'ready' });

      const repairedState = {
        isActive: true,
        linkedTabs: [7, 8],
        connectionStatuses: { 7: 'connected', 8: 'error' },
        mode: 'ratio',
        lastActiveSyncedTabId: 7,
        revision: 0,
        sessionEpoch: 0,
      };
      expect(mockedBrowser.storage.local.set).toHaveBeenCalledWith({ syncState: repairedState });
      expect(getSyncStateSnapshot()).toEqual(repairedState);
      expect(mockedBrowser.tabs.query).not.toHaveBeenCalled();
      expect(mockedSendMessage).not.toHaveBeenCalled();
      expect(loggerMock.info).toHaveBeenCalledWith('Sync state restored from storage', {
        linkedTabCount: 2,
        revision: 0,
        sessionEpoch: 0,
      });
    });

    it('preserves committed memory when a migrated-state repair write fails', async () => {
      const previouslyCommitted = createActiveState({ revision: 12 });
      commitSyncState(previouslyCommitted);
      mockedBrowser.storage.local.get.mockResolvedValueOnce({
        syncState: {
          isActive: true,
          linkedTabs: [7, 8],
          connectionStatuses: { 7: 'connected' },
          lastActiveSyncedTabId: 7,
        },
      });
      mockedBrowser.storage.local.set.mockRejectedValueOnce(new Error('storage set failed'));

      await expect(restoreSyncState()).resolves.toEqual({ status: 'storage-error' });

      expect(getSyncStateSnapshot()).toEqual(previouslyCommitted);
      expect(mockedBrowser.tabs.query).not.toHaveBeenCalled();
      expect(mockedSendMessage).not.toHaveBeenCalled();
    });

    it('commits the safe default when storage has no syncState', async () => {
      commitSyncState(createActiveState());
      mockedBrowser.storage.local.get.mockResolvedValueOnce({});

      await expect(restoreSyncState()).resolves.toEqual({ status: 'ready' });

      expect(getSyncStateSnapshot()).toEqual(createInactiveState());
      expect(mockedBrowser.tabs.query).not.toHaveBeenCalled();
      expect(mockedSendMessage).not.toHaveBeenCalled();
    });

    it('returns storage-error without changing committed memory when reading rejects', async () => {
      const committed = createActiveState({ revision: 12 });
      commitSyncState(committed);
      mockedBrowser.storage.local.get.mockRejectedValueOnce(new Error('storage get failed'));

      await expect(restoreSyncState()).resolves.toEqual({ status: 'storage-error' });

      expect(getSyncStateSnapshot()).toEqual(committed);
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to restore sync state', {
        reason: 'storage-read-failed',
      });
    });

    it('returns invalid-state without falling back or reconnecting', async () => {
      const committed = createActiveState({ revision: 12 });
      commitSyncState(committed);
      mockedBrowser.storage.local.get.mockResolvedValueOnce({
        syncState: {
          isActive: true,
          linkedTabs: [7, 8],
          connectionStatuses: { 7: 'connected', 8: 'connected' },
          mode: 'semantic',
          lastActiveSyncedTabId: 7,
          revision: 13,
          sessionEpoch: 3,
        },
      });

      await expect(restoreSyncState()).resolves.toEqual({
        status: 'invalid-state',
        reason: 'invalid-mode',
      });

      expect(getSyncStateSnapshot()).toEqual(committed);
      expect(mockedBrowser.tabs.query).not.toHaveBeenCalled();
      expect(mockedSendMessage).not.toHaveBeenCalled();
      expect(loggerMock.error).toHaveBeenCalledWith('Stored sync state is invalid', {
        reason: 'invalid-mode',
      });
    });
  });

  describe('broadcastSyncStatus', () => {
    it('does not query tab metadata or send the removed legacy status message', async () => {
      commitSyncState(
        createActiveState({
          linkedTabs: [101, 102, 103],
          connectionStatuses: {
            101: 'connected',
            102: 'disconnected',
            103: 'error',
          },
          lastActiveSyncedTabId: 101,
        }),
      );
      mockedBrowser.tabs.query.mockResolvedValueOnce([
        createMockTab({
          id: 101,
          title: 'Private fixture title',
          url: 'https://private.example/token',
          favIconUrl: 'private.ico',
        }),
      ]);

      await broadcastSyncStatus();

      expect(mockedBrowser.tabs.query).not.toHaveBeenCalled();
      expect(mockedSendMessage).not.toHaveBeenCalled();
      expect(
        mockedSendMessage.mock.calls.flatMap((call) => findForbiddenContentMessageKeys(call[1])),
      ).toEqual([]);
      expect(JSON.stringify(mockedSendMessage.mock.calls)).not.toContain('Private fixture title');
      expect(JSON.stringify(mockedSendMessage.mock.calls)).not.toContain(
        'https://private.example/token',
      );
      expect(JSON.stringify(mockedSendMessage.mock.calls)).not.toContain('private.ico');
    });
  });
});
