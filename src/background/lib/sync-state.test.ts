import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendMessage } from 'webext-bridge/background';
import browser from 'webextension-polyfill';

import { broadcastSyncStatus, persistSyncState, restoreSyncState, syncState } from './sync-state';

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

type ConnectionStatus = 'connected' | 'disconnected' | 'error';

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

describe('sync-state', () => {
  const mockedSendMessage = vi.mocked(sendMessage);
  const mockedBrowser = vi.mocked(browser, true);

  beforeEach(() => {
    vi.clearAllMocks();

    Object.assign(syncState, {
      isActive: false,
      linkedTabs: [],
      connectionStatuses: {},
      lastActiveSyncedTabId: null,
    });
    delete syncState.mode;

    mockedBrowser.storage.local.set.mockResolvedValue();
    mockedBrowser.storage.local.get.mockResolvedValue({});
    mockedBrowser.tabs.query.mockResolvedValue([]);
    mockedSendMessage.mockResolvedValue(undefined);
  });

  describe('syncState export', () => {
    it('starts with default initial values', () => {
      expect(syncState).toEqual({
        isActive: false,
        linkedTabs: [],
        connectionStatuses: {},
        lastActiveSyncedTabId: null,
      });
    });
  });

  describe('persistSyncState', () => {
    it('saves syncState to browser.storage.local', async () => {
      syncState.isActive = true;
      syncState.linkedTabs = [1, 2];

      await persistSyncState();

      expect(mockedBrowser.storage.local.set).toHaveBeenCalledWith({ syncState });
      expect(loggerMock.debug).toHaveBeenCalledWith('Sync state persisted to storage', {
        syncState,
      });
    });

    it('handles storage write errors gracefully', async () => {
      const storageError = new Error('storage set failed');
      mockedBrowser.storage.local.set.mockRejectedValueOnce(storageError);

      await expect(persistSyncState()).resolves.toBeUndefined();
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to persist sync state', {
        error: storageError,
      });
    });
  });

  describe('restoreSyncState', () => {
    it('restores state from storage when syncState exists', async () => {
      mockedBrowser.storage.local.get.mockResolvedValueOnce({
        syncState: {
          isActive: false,
          linkedTabs: [7],
          connectionStatuses: { 7: 'connected' as ConnectionStatus },
          lastActiveSyncedTabId: 7,
        },
      });

      await restoreSyncState();

      expect(syncState.isActive).toBe(false);
      expect(syncState.linkedTabs).toEqual([7]);
      expect(syncState.connectionStatuses).toEqual({ 7: 'connected' });
      expect(syncState.lastActiveSyncedTabId).toBe(7);
      expect(loggerMock.info).toHaveBeenCalledWith('Sync state restored from storage', {
        syncState,
      });
    });

    it('does nothing when storage has no syncState', async () => {
      mockedBrowser.storage.local.get.mockResolvedValueOnce({});

      await restoreSyncState();

      expect(syncState).toEqual({
        isActive: false,
        linkedTabs: [],
        connectionStatuses: {},
        lastActiveSyncedTabId: null,
      });
      expect(mockedBrowser.tabs.query).not.toHaveBeenCalled();
      expect(mockedSendMessage).not.toHaveBeenCalled();
    });

    it('reconnects active tabs and filters out tabs that no longer exist', async () => {
      mockedBrowser.storage.local.get.mockResolvedValueOnce({
        syncState: {
          isActive: true,
          linkedTabs: [1, 2, 3],
          connectionStatuses: {},
          lastActiveSyncedTabId: 1,
        },
      });
      mockedBrowser.tabs.query.mockResolvedValueOnce([
        createMockTab({ id: 1, title: 'One', url: 'https://one.test', favIconUrl: 'icon-1' }),
        createMockTab({ id: 2, title: 'Two', url: 'https://two.test', favIconUrl: 'icon-2' }),
      ]);

      await restoreSyncState();

      expect(syncState.linkedTabs).toEqual([1, 2]);
      const startCalls = mockedSendMessage.mock.calls.filter((call) => call[0] === 'scroll:start');
      expect(startCalls).toHaveLength(2);
      expect(startCalls[0]?.[1]).toEqual({ tabIds: [1, 2], mode: 'ratio', currentTabId: 1 });
      expect(startCalls[1]?.[1]).toEqual({ tabIds: [1, 2], mode: 'ratio', currentTabId: 2 });
    });

    it('sets connectionStatuses to connected on successful reconnection', async () => {
      mockedBrowser.storage.local.get.mockResolvedValueOnce({
        syncState: {
          isActive: true,
          linkedTabs: [11, 12],
          connectionStatuses: {},
          mode: 'element',
          lastActiveSyncedTabId: 11,
        },
      });
      mockedBrowser.tabs.query.mockResolvedValueOnce([
        createMockTab({ id: 11 }),
        createMockTab({ id: 12 }),
      ]);

      await restoreSyncState();

      expect(syncState.connectionStatuses).toEqual({
        11: 'connected',
        12: 'connected',
      });
    });

    it('sets connectionStatuses to error when a reconnection sendMessage fails', async () => {
      mockedBrowser.storage.local.get.mockResolvedValueOnce({
        syncState: {
          isActive: true,
          linkedTabs: [21, 22],
          connectionStatuses: {},
          lastActiveSyncedTabId: 21,
        },
      });
      mockedBrowser.tabs.query.mockResolvedValueOnce([
        createMockTab({ id: 21 }),
        createMockTab({ id: 22 }),
      ]);
      mockedSendMessage.mockImplementation((message, _payload, destination) => {
        if (
          message === 'scroll:start' &&
          typeof destination === 'object' &&
          destination !== null &&
          'tabId' in destination &&
          destination.tabId === 22
        ) {
          return Promise.reject(new Error('failed reconnect'));
        }

        return Promise.resolve(undefined);
      });

      await restoreSyncState();

      expect(syncState.connectionStatuses[21]).toBe('connected');
      expect(syncState.connectionStatuses[22]).toBe('error');
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to reconnect tab 22', {
        error: expect.any(Error),
      });
    });

    it('broadcasts sync:status after reconnection', async () => {
      mockedBrowser.storage.local.get.mockResolvedValueOnce({
        syncState: {
          isActive: true,
          linkedTabs: [31, 32],
          connectionStatuses: {},
          lastActiveSyncedTabId: 31,
        },
      });
      mockedBrowser.tabs.query.mockResolvedValue([
        createMockTab({ id: 31 }),
        createMockTab({ id: 32 }),
      ]);

      await restoreSyncState();

      const statusCalls = mockedSendMessage.mock.calls.filter((call) => call[0] === 'sync:status');
      expect(statusCalls).toHaveLength(2);
    });

    it('clears and persists syncState when remaining tabs drop below two', async () => {
      mockedBrowser.storage.local.get.mockResolvedValueOnce({
        syncState: {
          isActive: true,
          linkedTabs: [1, 2],
          connectionStatuses: {
            1: 'connected' as ConnectionStatus,
            2: 'connected' as ConnectionStatus,
          },
          lastActiveSyncedTabId: 1,
        },
      });
      mockedBrowser.tabs.query.mockResolvedValueOnce([createMockTab({ id: 1 })]);

      await restoreSyncState();

      expect(syncState.isActive).toBe(false);
      expect(syncState.linkedTabs).toEqual([]);
      expect(syncState.connectionStatuses).toEqual({});
      expect(mockedBrowser.storage.local.set).toHaveBeenCalledWith({ syncState });
      expect(mockedSendMessage).not.toHaveBeenCalled();
    });

    it('does not reconnect when restored state is inactive', async () => {
      mockedBrowser.storage.local.get.mockResolvedValueOnce({
        syncState: {
          isActive: false,
          linkedTabs: [41, 42],
          connectionStatuses: {},
          lastActiveSyncedTabId: null,
        },
      });

      await restoreSyncState();

      expect(mockedBrowser.tabs.query).not.toHaveBeenCalled();
      expect(mockedSendMessage).not.toHaveBeenCalled();
    });

    it('does not reconnect when restored state has fewer than two linked tabs', async () => {
      mockedBrowser.storage.local.get.mockResolvedValueOnce({
        syncState: {
          isActive: true,
          linkedTabs: [51],
          connectionStatuses: {},
          lastActiveSyncedTabId: 51,
        },
      });

      await restoreSyncState();

      expect(mockedBrowser.tabs.query).not.toHaveBeenCalled();
      expect(mockedSendMessage).not.toHaveBeenCalled();
    });

    it('uses restored mode when reconnecting tabs', async () => {
      mockedBrowser.storage.local.get.mockResolvedValueOnce({
        syncState: {
          isActive: true,
          linkedTabs: [61, 62],
          connectionStatuses: {},
          mode: 'element',
          lastActiveSyncedTabId: 61,
        },
      });
      mockedBrowser.tabs.query.mockResolvedValueOnce([
        createMockTab({ id: 61 }),
        createMockTab({ id: 62 }),
      ]);

      await restoreSyncState();

      const startCalls = mockedSendMessage.mock.calls.filter((call) => call[0] === 'scroll:start');
      expect(startCalls[0]?.[1]).toMatchObject({ mode: 'element' });
      expect(startCalls[1]?.[1]).toMatchObject({ mode: 'element' });
    });

    it('handles storage read errors gracefully', async () => {
      const storageError = new Error('storage get failed');
      mockedBrowser.storage.local.get.mockRejectedValueOnce(storageError);

      await expect(restoreSyncState()).resolves.toBeUndefined();
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to restore sync state', {
        error: storageError,
      });
    });
  });

  describe('broadcastSyncStatus', () => {
    beforeEach(() => {
      syncState.linkedTabs = [101, 102, 103];
      syncState.connectionStatuses = {
        101: 'connected',
        102: 'disconnected',
        103: 'error',
      };
    });

    it('queries current window tabs', async () => {
      mockedBrowser.tabs.query.mockResolvedValueOnce([
        createMockTab({ id: 101 }),
        createMockTab({ id: 102 }),
        createMockTab({ id: 103 }),
      ]);

      await broadcastSyncStatus();

      expect(mockedBrowser.tabs.query).toHaveBeenCalledWith({ currentWindow: true });
    });

    it('maps linkedTabs to tab info payload', async () => {
      mockedBrowser.tabs.query.mockResolvedValueOnce([
        createMockTab({ id: 101, title: 'Tab A', url: 'https://a.test', favIconUrl: 'icon-a' }),
        createMockTab({ id: 102, title: 'Tab B', url: 'https://b.test', favIconUrl: 'icon-b' }),
        createMockTab({ id: 103, title: 'Tab C', url: 'https://c.test', favIconUrl: 'icon-c' }),
      ]);

      await broadcastSyncStatus();

      const firstStatusCall = mockedSendMessage.mock.calls.find(
        (call) => call[0] === 'sync:status',
      );
      expect(firstStatusCall?.[1]).toMatchObject({
        linkedTabs: [
          { id: 101, title: 'Tab A', url: 'https://a.test', favIconUrl: 'icon-a', eligible: true },
          { id: 102, title: 'Tab B', url: 'https://b.test', favIconUrl: 'icon-b', eligible: true },
          { id: 103, title: 'Tab C', url: 'https://c.test', favIconUrl: 'icon-c', eligible: true },
        ],
      });
    });

    it('filters out linked tabs that are not found in query results', async () => {
      mockedBrowser.tabs.query.mockResolvedValueOnce([
        createMockTab({ id: 101, title: 'Tab A', url: 'https://a.test' }),
        createMockTab({ id: 103, title: 'Tab C', url: 'https://c.test' }),
      ]);

      await broadcastSyncStatus();

      const statusCalls = mockedSendMessage.mock.calls.filter((call) => call[0] === 'sync:status');
      expect(statusCalls[0]?.[1]).toMatchObject({
        linkedTabs: [
          { id: 101, title: 'Tab A', url: 'https://a.test', eligible: true },
          { id: 103, title: 'Tab C', url: 'https://c.test', eligible: true },
        ],
      });
    });

    it('uses fallback title and url when tab metadata is missing', async () => {
      mockedBrowser.tabs.query.mockResolvedValueOnce([
        createMockTab({ id: 101 }),
        createMockTab({ id: 102 }),
        createMockTab({ id: 103 }),
      ]);

      await broadcastSyncStatus();

      const statusCall = mockedSendMessage.mock.calls.find((call) => call[0] === 'sync:status');
      expect(statusCall?.[1]).toMatchObject({
        linkedTabs: [
          { id: 101, title: 'Untitled', url: '', eligible: true },
          { id: 102, title: 'Untitled', url: '', eligible: true },
          { id: 103, title: 'Untitled', url: '', eligible: true },
        ],
      });
    });

    it('sends sync:status to each linked tab with currentTabId', async () => {
      mockedBrowser.tabs.query.mockResolvedValueOnce([
        createMockTab({ id: 101 }),
        createMockTab({ id: 102 }),
        createMockTab({ id: 103 }),
      ]);

      await broadcastSyncStatus();

      const statusCalls = mockedSendMessage.mock.calls.filter((call) => call[0] === 'sync:status');
      expect(statusCalls).toHaveLength(3);
      expect(statusCalls.map((call) => call[1])).toEqual([
        expect.objectContaining({ currentTabId: 101 }),
        expect.objectContaining({ currentTabId: 102 }),
        expect.objectContaining({ currentTabId: 103 }),
      ]);
      expect(statusCalls.map((call) => call[2])).toEqual([
        { context: 'content-script', tabId: 101 },
        { context: 'content-script', tabId: 102 },
        { context: 'content-script', tabId: 103 },
      ]);
    });

    it('includes current connectionStatuses in status payload', async () => {
      mockedBrowser.tabs.query.mockResolvedValueOnce([
        createMockTab({ id: 101 }),
        createMockTab({ id: 102 }),
        createMockTab({ id: 103 }),
      ]);

      await broadcastSyncStatus();

      const statusCall = mockedSendMessage.mock.calls.find((call) => call[0] === 'sync:status');
      expect(statusCall?.[1]).toMatchObject({
        connectionStatuses: {
          101: 'connected',
          102: 'disconnected',
          103: 'error',
        },
      });
    });

    it('handles sendMessage failures gracefully without throwing', async () => {
      mockedBrowser.tabs.query.mockResolvedValueOnce([
        createMockTab({ id: 101 }),
        createMockTab({ id: 102 }),
        createMockTab({ id: 103 }),
      ]);
      mockedSendMessage.mockRejectedValue(new Error('status send failed'));

      await expect(broadcastSyncStatus()).resolves.toBeUndefined();
      expect(loggerMock.debug).toHaveBeenCalledWith('Failed to send sync status to tab 101', {
        error: expect.any(Error),
      });
    });
  });
});
