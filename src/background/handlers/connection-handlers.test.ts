import { beforeEach, describe, expect, it, vi } from 'vitest';
import browser from 'webextension-polyfill';

import {
  getAutoSyncGroupMembers,
  isTabInActiveAutoSyncGroup,
  removeTabFromAllAutoSyncGroups,
} from '../lib/auto-sync-groups';
import { reinjectContentScript } from '../lib/content-script-manager';
import { sendMessageWithTimeout } from '../lib/messaging';
import { broadcastSyncStatus, persistSyncState, syncState } from '../lib/sync-state';

import { registerConnectionHandlers } from './connection-handlers';

interface TabPayload {
  tabId: number;
}

interface MessageSender {
  tabId?: number;
}

interface HandlerRequest {
  data: TabPayload;
  sender: MessageSender;
}

type MessageHandler = (request: HandlerRequest) => Promise<unknown>;

const { messageHandlers, onMessageMock } = vi.hoisted(() => ({
  messageHandlers: new Map<string, MessageHandler>(),
  onMessageMock: vi.fn(),
}));

vi.mock('webext-bridge/background', () => ({
  onMessage: onMessageMock,
}));

vi.mock('webextension-polyfill', () => ({
  default: {
    tabs: {
      get: vi.fn(),
      query: vi.fn(),
    },
  },
}));

vi.mock('~/shared/lib/logger', () => ({
  ExtensionLogger: vi.fn().mockImplementation(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock('../lib/auto-sync-groups', () => ({
  removeTabFromAllAutoSyncGroups: vi.fn(),
  getAutoSyncGroupMembers: vi.fn(),
  isTabInActiveAutoSyncGroup: vi.fn(),
}));

vi.mock('../lib/content-script-manager', () => ({
  reinjectContentScript: vi.fn(),
}));

vi.mock('../lib/messaging', () => ({
  sendMessageWithTimeout: vi.fn(),
}));

vi.mock('../lib/sync-state', () => ({
  syncState: {
    isActive: false,
    linkedTabs: [],
    connectionStatuses: {},
    mode: undefined,
    lastActiveSyncedTabId: null,
  },
  persistSyncState: vi.fn(),
  broadcastSyncStatus: vi.fn(),
}));

function getHandler(messageId: string): MessageHandler {
  const handler = messageHandlers.get(messageId);
  expect(handler).toBeDefined();
  return handler as MessageHandler;
}

describe('registerConnectionHandlers', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    messageHandlers.clear();

    onMessageMock.mockImplementation((messageId: string, handler: MessageHandler) => {
      messageHandlers.set(messageId, handler);
    });

    syncState.isActive = false;
    syncState.linkedTabs = [];
    syncState.connectionStatuses = {};
    syncState.mode = undefined;
    syncState.lastActiveSyncedTabId = null;

    vi.mocked(isTabInActiveAutoSyncGroup).mockReturnValue(false);
    vi.mocked(getAutoSyncGroupMembers).mockReturnValue([]);
    vi.mocked(reinjectContentScript).mockResolvedValue(true);
    vi.mocked(removeTabFromAllAutoSyncGroups).mockResolvedValue();
    vi.mocked(persistSyncState).mockResolvedValue();
    vi.mocked(broadcastSyncStatus).mockResolvedValue();

    registerConnectionHandlers();
  });

  describe('sync:get-status', () => {
    it('returns inactive status when sync is not active', async () => {
      const handler = getHandler('sync:get-status');

      const result = await handler({ data: { tabId: 1 }, sender: { tabId: 1 } });

      expect(result).toEqual({
        success: false,
        isActive: false,
        linkedTabs: [],
        connectionStatuses: {},
      });
      expect(vi.mocked(browser.tabs.query)).not.toHaveBeenCalled();
    });

    it('returns linked tabs and connection statuses when sync is active', async () => {
      syncState.isActive = true;
      syncState.linkedTabs = [1, 2];
      syncState.connectionStatuses = {
        1: 'connected',
        2: 'disconnected',
      };

      vi.mocked(browser.tabs.query).mockResolvedValue([
        {
          id: 1,
          index: 0,
          highlighted: false,
          active: true,
          pinned: false,
          incognito: false,
          title: 'Tab One',
          url: 'https://one.dev',
          favIconUrl: 'one.ico',
        },
        {
          id: 2,
          index: 1,
          highlighted: false,
          active: false,
          pinned: false,
          incognito: false,
          title: 'Tab Two',
          url: 'https://two.dev',
          favIconUrl: undefined,
        },
      ] as browser.Tabs.Tab[]);

      const handler = getHandler('sync:get-status');
      const result = await handler({ data: { tabId: 1 }, sender: { tabId: 9 } });

      expect(result).toEqual({
        success: true,
        isActive: true,
        linkedTabs: [
          {
            id: 1,
            title: 'Tab One',
            url: 'https://one.dev',
            favIconUrl: 'one.ico',
            eligible: true,
          },
          {
            id: 2,
            title: 'Tab Two',
            url: 'https://two.dev',
            favIconUrl: undefined,
            eligible: true,
          },
        ],
        connectedTabs: [1, 2],
        connectionStatuses: {
          1: 'connected',
          2: 'disconnected',
        },
        currentTabId: 9,
      });
    });

    it('skips missing tabs in queried results gracefully', async () => {
      syncState.isActive = true;
      syncState.linkedTabs = [1, 3];
      syncState.connectionStatuses = { 1: 'connected', 3: 'connected' };

      vi.mocked(browser.tabs.query).mockResolvedValue([
        {
          id: 1,
          index: 0,
          highlighted: false,
          active: true,
          pinned: false,
          incognito: false,
          title: 'Only Present Tab',
          url: 'https://present.dev',
          favIconUrl: undefined,
        },
      ] as browser.Tabs.Tab[]);

      const handler = getHandler('sync:get-status');
      const result = await handler({ data: { tabId: 1 }, sender: { tabId: 1 } });

      expect(result).toEqual({
        success: true,
        isActive: true,
        linkedTabs: [
          {
            id: 1,
            title: 'Only Present Tab',
            url: 'https://present.dev',
            favIconUrl: undefined,
            eligible: true,
          },
        ],
        connectedTabs: [1, 3],
        connectionStatuses: { 1: 'connected', 3: 'connected' },
        currentTabId: 1,
      });
    });
  });

  describe('scroll:ping', () => {
    it('returns success response with timestamp and tab id', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
      const handler = getHandler('scroll:ping');

      const result = await handler({ data: { tabId: 17 }, sender: {} });

      expect(result).toEqual({
        success: true,
        timestamp: 1_700_000_000_000,
        tabId: 17,
      });
    });
  });

  describe('scroll:reconnect', () => {
    it('reconnects tab in manual sync and updates connection status', async () => {
      syncState.isActive = true;
      syncState.linkedTabs = [5, 6];
      syncState.mode = 'ratio';
      syncState.connectionStatuses = { 5: 'error', 6: 'connected' };

      vi.mocked(browser.tabs.get).mockResolvedValue({
        id: 5,
        index: 0,
        highlighted: false,
        active: false,
        pinned: false,
        incognito: false,
        url: 'https://manual.dev',
      } as browser.Tabs.Tab);
      vi.mocked(sendMessageWithTimeout).mockResolvedValue({ success: true, tabId: 5 });

      const handler = getHandler('scroll:reconnect');
      const result = await handler({ data: { tabId: 5 }, sender: {} });

      expect(result).toEqual({ success: true });
      expect(vi.mocked(sendMessageWithTimeout)).toHaveBeenCalledWith(
        'scroll:start',
        {
          tabIds: [5, 6],
          mode: 'ratio',
          currentTabId: 5,
          isAutoSync: false,
        },
        { context: 'content-script', tabId: 5 },
        3_000,
      );
      expect(syncState.connectionStatuses[5]).toBe('connected');
      expect(vi.mocked(persistSyncState)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(broadcastSyncStatus)).toHaveBeenCalledTimes(1);
    });

    it('reconnects tab in active auto-sync group', async () => {
      vi.mocked(isTabInActiveAutoSyncGroup).mockReturnValue(true);
      vi.mocked(getAutoSyncGroupMembers).mockReturnValue([8, 9]);
      vi.mocked(browser.tabs.get).mockResolvedValue({
        id: 7,
        index: 0,
        highlighted: false,
        active: false,
        pinned: false,
        incognito: false,
        url: 'https://auto.dev',
      } as browser.Tabs.Tab);
      vi.mocked(sendMessageWithTimeout).mockResolvedValue({ success: true, tabId: 7 });

      const handler = getHandler('scroll:reconnect');
      const result = await handler({ data: { tabId: 7 }, sender: {} });

      expect(result).toEqual({ success: true });
      expect(vi.mocked(sendMessageWithTimeout)).toHaveBeenCalledWith(
        'scroll:start',
        {
          tabIds: [8, 9, 7],
          mode: 'ratio',
          currentTabId: 7,
          isAutoSync: true,
        },
        { context: 'content-script', tabId: 7 },
        3_000,
      );
      expect(vi.mocked(persistSyncState)).not.toHaveBeenCalled();
      expect(vi.mocked(broadcastSyncStatus)).not.toHaveBeenCalled();
    });

    it('returns failure when tab is not in any sync', async () => {
      const handler = getHandler('scroll:reconnect');

      const result = await handler({ data: { tabId: 12 }, sender: {} });

      expect(result).toEqual({ success: false, reason: 'Sync not active' });
      expect(vi.mocked(browser.tabs.get)).not.toHaveBeenCalled();
      expect(vi.mocked(sendMessageWithTimeout)).not.toHaveBeenCalled();
    });

    it('removes missing tab from sync and returns failure', async () => {
      syncState.isActive = true;
      syncState.linkedTabs = [4, 10];
      syncState.connectionStatuses = { 4: 'connected', 10: 'connected' };
      vi.mocked(isTabInActiveAutoSyncGroup).mockReturnValue(true);

      vi.mocked(browser.tabs.get).mockRejectedValue(new Error('No tab with id: 4'));

      const handler = getHandler('scroll:reconnect');
      const result = await handler({ data: { tabId: 4 }, sender: {} });

      expect(result).toEqual({ success: false, reason: 'Tab no longer exists' });
      expect(syncState.linkedTabs).toEqual([10]);
      expect(syncState.connectionStatuses[4]).toBeUndefined();
      expect(vi.mocked(persistSyncState)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(removeTabFromAllAutoSyncGroups)).toHaveBeenCalledWith(4);
    });

    it('marks manual sync tab as error for invalid acknowledgment', async () => {
      syncState.isActive = true;
      syncState.linkedTabs = [11, 12];
      syncState.connectionStatuses = { 11: 'connected' };
      vi.mocked(browser.tabs.get).mockResolvedValue({
        id: 11,
        index: 0,
        highlighted: false,
        active: false,
        pinned: false,
        incognito: false,
        url: 'https://ack.dev',
      } as browser.Tabs.Tab);
      vi.mocked(sendMessageWithTimeout).mockResolvedValue({ success: true, tabId: 999 });

      const handler = getHandler('scroll:reconnect');
      const result = await handler({ data: { tabId: 11 }, sender: {} });

      expect(result).toEqual({ success: false, reason: 'Invalid acknowledgment' });
      expect(syncState.connectionStatuses[11]).toBe('error');
      expect(vi.mocked(persistSyncState)).toHaveBeenCalledTimes(1);
    });

    it('marks manual sync tab as error when reconnection fails', async () => {
      syncState.isActive = true;
      syncState.linkedTabs = [21, 22];
      syncState.connectionStatuses = { 21: 'connected' };
      vi.mocked(browser.tabs.get).mockResolvedValue({
        id: 21,
        index: 0,
        highlighted: false,
        active: false,
        pinned: false,
        incognito: false,
        url: 'https://failure.dev',
      } as browser.Tabs.Tab);
      vi.mocked(sendMessageWithTimeout).mockRejectedValue(new Error('timeout'));

      const handler = getHandler('scroll:reconnect');
      const result = await handler({ data: { tabId: 21 }, sender: {} });

      expect(result).toEqual({ success: false, reason: 'Connection failed' });
      expect(syncState.connectionStatuses[21]).toBe('error');
      expect(vi.mocked(persistSyncState)).toHaveBeenCalledTimes(1);
    });
  });

  describe('scroll:request-reinject', () => {
    it('reinjects content script for tab in sync', async () => {
      syncState.isActive = true;
      syncState.linkedTabs = [31];
      vi.mocked(reinjectContentScript).mockResolvedValue(true);

      const handler = getHandler('scroll:request-reinject');
      const result = await handler({ data: { tabId: 31 }, sender: {} });

      expect(result).toEqual({ success: true });
      expect(vi.mocked(reinjectContentScript)).toHaveBeenCalledWith(31);
    });

    it('returns failure when tab is not in any sync group', async () => {
      const handler = getHandler('scroll:request-reinject');

      const result = await handler({ data: { tabId: 99 }, sender: {} });

      expect(result).toEqual({ success: false, reason: 'Tab not in sync' });
      expect(vi.mocked(reinjectContentScript)).not.toHaveBeenCalled();
    });
  });
});
