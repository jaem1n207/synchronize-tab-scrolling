import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendMessage } from 'webext-bridge/background';
import browser from 'webextension-polyfill';

import type {
  ManualScrollMessage,
  ScrollSyncMessage,
  StartSyncMessage,
  StopSyncMessage,
  UrlSyncEnabledChangedMessage,
  UrlSyncMessage,
} from '~/shared/types/messages';

import {
  getAutoSyncGroupMembers,
  removeTabFromAllAutoSyncGroups,
  updateAutoSyncGroup,
} from '../lib/auto-sync-groups';
import { autoSyncState, manualSyncOverriddenTabs } from '../lib/auto-sync-state';
import { startKeepAlive, stopKeepAlive } from '../lib/keep-alive';
import { sendMessageWithTimeout } from '../lib/messaging';
import { broadcastSyncStatus, persistSyncState, syncState } from '../lib/sync-state';

import { registerScrollSyncHandlers } from './scroll-sync-handlers';

type MessageSender = { tabId?: number };
type MessageEnvelope<TData> = { data: TData; sender: MessageSender };
type RegisteredMessageHandler<TData = unknown> = (
  message: MessageEnvelope<TData>,
) => Promise<unknown>;

const { messageHandlers, onMessageMock, sendMessageMock, tabsGetMock, tabsQueryMock } = vi.hoisted(
  () => ({
    messageHandlers: new Map<string, (...args: never[]) => unknown>(),
    onMessageMock: vi.fn(),
    sendMessageMock: vi.fn(),
    tabsGetMock: vi.fn(),
    tabsQueryMock: vi.fn(),
  }),
);

vi.mock('webext-bridge/background', () => ({
  onMessage: onMessageMock,
  sendMessage: sendMessageMock,
}));

vi.mock('webextension-polyfill', () => ({
  default: {
    tabs: {
      get: tabsGetMock,
      query: tabsQueryMock,
    },
  },
}));

vi.mock('~/shared/lib/logger', () => ({
  ExtensionLogger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock('../lib/auto-sync-groups', () => ({
  removeTabFromAllAutoSyncGroups: vi.fn(),
  getAutoSyncGroupMembers: vi.fn(),
  updateAutoSyncGroup: vi.fn(),
}));

vi.mock('../lib/auto-sync-state', () => ({
  autoSyncState: {
    enabled: false,
    groups: new Map<string, { tabIds: Set<number>; isActive: boolean }>(),
    excludedUrls: [],
  },
  manualSyncOverriddenTabs: new Set<number>(),
}));

vi.mock('../lib/keep-alive', () => ({
  startKeepAlive: vi.fn(),
  stopKeepAlive: vi.fn(),
}));

vi.mock('../lib/messaging', () => ({
  sendMessageWithTimeout: vi.fn(),
}));

vi.mock('../lib/sync-state', () => ({
  syncState: {
    isActive: false,
    linkedTabs: [] as Array<number>,
    connectionStatuses: {} as Record<number, 'connected' | 'disconnected' | 'error'>,
    lastActiveSyncedTabId: null as number | null,
    mode: undefined as 'ratio' | 'element' | undefined,
  },
  persistSyncState: vi.fn(),
  broadcastSyncStatus: vi.fn(),
}));

function getHandler<TData>(messageId: string): RegisteredMessageHandler<TData> {
  const handler = messageHandlers.get(messageId);
  if (!handler) {
    throw new Error(`Handler not found: ${messageId}`);
  }

  return handler as RegisteredMessageHandler<TData>;
}

describe('registerScrollSyncHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    messageHandlers.clear();

    syncState.isActive = false;
    syncState.linkedTabs = [];
    syncState.connectionStatuses = {};
    syncState.mode = undefined;

    autoSyncState.enabled = false;
    autoSyncState.groups.clear();
    manualSyncOverriddenTabs.clear();

    onMessageMock.mockImplementation(
      (messageId: string, handler: (...args: never[]) => unknown) => {
        messageHandlers.set(messageId, handler);
      },
    );

    vi.mocked(sendMessage).mockResolvedValue({ success: true });
    vi.mocked(sendMessageWithTimeout).mockImplementation(async (_, __, destination) => ({
      success: true,
      tabId: destination.tabId,
    }));
    vi.mocked(browser.tabs.get).mockImplementation(
      async (tabId: number) =>
        ({
          id: tabId,
          index: 0,
          highlighted: false,
          active: false,
          pinned: false,
          incognito: false,
          url: `https://example.com/${tabId}`,
          title: `Tab ${tabId}`,
        }) as browser.Tabs.Tab,
    );
    vi.mocked(browser.tabs.query).mockResolvedValue([]);
    vi.mocked(getAutoSyncGroupMembers).mockReturnValue([]);
    vi.mocked(removeTabFromAllAutoSyncGroups).mockResolvedValue();
    vi.mocked(updateAutoSyncGroup).mockResolvedValue(null);
    vi.mocked(persistSyncState).mockResolvedValue();
    vi.mocked(broadcastSyncStatus).mockResolvedValue();

    registerScrollSyncHandlers();
  });

  describe('scroll:start', () => {
    it('starts sync successfully when 2 or more tabs connect', async () => {
      const handler = getHandler<StartSyncMessage>('scroll:start');
      const payload: StartSyncMessage = {
        tabIds: [1, 2, 3],
        mode: 'ratio',
        isAutoSync: true,
      };

      const result = await handler({ data: payload, sender: {} });

      expect(result).toEqual({
        success: true,
        connectedTabs: [1, 2, 3],
        connectionResults: {
          1: { success: true },
          2: { success: true },
          3: { success: true },
        },
      });
      expect(syncState.isActive).toBe(true);
      expect(syncState.linkedTabs).toEqual([1, 2, 3]);
      expect(syncState.mode).toBe('ratio');
      expect(syncState.connectionStatuses).toEqual({
        1: 'connected',
        2: 'connected',
        3: 'connected',
      });
      expect(startKeepAlive).toHaveBeenCalledTimes(1);
      expect(persistSyncState).toHaveBeenCalledTimes(1);
      expect(broadcastSyncStatus).toHaveBeenCalledTimes(1);
    });

    it('rolls back when fewer than 2 tabs connect', async () => {
      const handler = getHandler<StartSyncMessage>('scroll:start');
      const payload: StartSyncMessage = {
        tabIds: [10, 20],
        mode: 'ratio',
        isAutoSync: true,
      };

      vi.mocked(sendMessageWithTimeout).mockImplementation(async (_, __, destination) => {
        if (destination.tabId === 10) {
          return { success: true, tabId: 10 };
        }
        throw new Error('Timeout after 1000ms');
      });

      const result = await handler({ data: payload, sender: {} });

      expect(result).toEqual({
        success: false,
        connectedTabs: [10],
        connectionResults: {
          10: { success: true },
          20: { success: false, error: 'Timeout after 1000ms' },
        },
        error: 'Failed to connect to at least 2 tabs',
      });
      expect(sendMessage).toHaveBeenCalledWith(
        'scroll:stop',
        {},
        {
          context: 'content-script',
          tabId: 10,
        },
      );
      expect(syncState.isActive).toBe(false);
      expect(syncState.linkedTabs).toEqual([]);
      expect(syncState.connectionStatuses).toEqual({});
      expect(startKeepAlive).not.toHaveBeenCalled();
      expect(persistSyncState).not.toHaveBeenCalled();
      expect(broadcastSyncStatus).not.toHaveBeenCalled();
    });

    it('marks manual sync tabs as overridden and removes them from auto-sync groups', async () => {
      const handler = getHandler<StartSyncMessage>('scroll:start');
      const payload: StartSyncMessage = {
        tabIds: [5, 6],
        mode: 'ratio',
        isAutoSync: false,
      };

      const result = await handler({ data: payload, sender: {} });

      expect(result).toMatchObject({ success: true, connectedTabs: [5, 6] });
      expect(manualSyncOverriddenTabs.has(5)).toBe(true);
      expect(manualSyncOverriddenTabs.has(6)).toBe(true);
      expect(removeTabFromAllAutoSyncGroups).toHaveBeenCalledTimes(2);
      expect(removeTabFromAllAutoSyncGroups).toHaveBeenNthCalledWith(1, 5);
      expect(removeTabFromAllAutoSyncGroups).toHaveBeenNthCalledWith(2, 6);
    });

    it('does not add tabs to manual overrides for auto-sync starts', async () => {
      const handler = getHandler<StartSyncMessage>('scroll:start');
      const payload: StartSyncMessage = {
        tabIds: [7, 8],
        mode: 'ratio',
        isAutoSync: true,
      };
      manualSyncOverriddenTabs.add(99);

      const result = await handler({ data: payload, sender: {} });

      expect(result).toMatchObject({ success: true, connectedTabs: [7, 8] });
      expect(manualSyncOverriddenTabs.has(7)).toBe(false);
      expect(manualSyncOverriddenTabs.has(8)).toBe(false);
      expect(manualSyncOverriddenTabs.has(99)).toBe(true);
      expect(removeTabFromAllAutoSyncGroups).not.toHaveBeenCalled();
    });
  });

  describe('scroll:stop', () => {
    it('stops sync and clears sync state', async () => {
      const handler = getHandler<StopSyncMessage>('scroll:stop');
      syncState.isActive = true;
      syncState.linkedTabs = [1, 2];
      syncState.connectionStatuses = { 1: 'connected', 2: 'connected' };
      syncState.mode = 'ratio';

      const result = await handler({
        data: { tabIds: [1, 2], isAutoSync: true },
        sender: {},
      });

      expect(result).toEqual({ success: true });
      expect(sendMessage).toHaveBeenCalledWith(
        'scroll:stop',
        { tabIds: [1, 2], isAutoSync: true },
        { context: 'content-script', tabId: 1 },
      );
      expect(sendMessage).toHaveBeenCalledWith(
        'scroll:stop',
        { tabIds: [1, 2], isAutoSync: true },
        { context: 'content-script', tabId: 2 },
      );
      expect(stopKeepAlive).toHaveBeenCalledTimes(1);
      expect(syncState.isActive).toBe(false);
      expect(syncState.linkedTabs).toEqual([]);
      expect(syncState.connectionStatuses).toEqual({});
      expect(syncState.mode).toBeUndefined();
      expect(persistSyncState).toHaveBeenCalledTimes(1);
    });

    it('deactivates auto-sync groups that include stopped tabs', async () => {
      const handler = getHandler<StopSyncMessage>('scroll:stop');
      autoSyncState.groups.set('https://group-a.com', {
        tabIds: new Set([1, 3]),
        isActive: true,
      });
      autoSyncState.groups.set('https://group-b.com', {
        tabIds: new Set([4, 5]),
        isActive: true,
      });
      autoSyncState.groups.set('https://group-c.com', {
        tabIds: new Set([2]),
        isActive: false,
      });

      await handler({ data: { tabIds: [1, 2], isAutoSync: true }, sender: {} });

      expect(autoSyncState.groups.get('https://group-a.com')?.isActive).toBe(false);
      expect(autoSyncState.groups.get('https://group-b.com')?.isActive).toBe(true);
      expect(autoSyncState.groups.get('https://group-c.com')?.isActive).toBe(false);
    });

    it('re-adds tabs to auto-sync groups on manual sync stop when auto-sync is enabled', async () => {
      const handler = getHandler<StopSyncMessage>('scroll:stop');
      autoSyncState.enabled = true;
      manualSyncOverriddenTabs.add(11);
      manualSyncOverriddenTabs.add(12);
      vi.mocked(browser.tabs.get).mockImplementation(
        async (tabId: number) =>
          ({
            id: tabId,
            index: 0,
            highlighted: false,
            active: false,
            pinned: false,
            incognito: false,
            url: `https://readd.com/${tabId}`,
            title: `Tab ${tabId}`,
          }) as browser.Tabs.Tab,
      );

      await handler({ data: { tabIds: [11, 12], isAutoSync: false }, sender: {} });

      expect(manualSyncOverriddenTabs.has(11)).toBe(false);
      expect(manualSyncOverriddenTabs.has(12)).toBe(false);
      expect(updateAutoSyncGroup).toHaveBeenCalledTimes(2);
      expect(updateAutoSyncGroup).toHaveBeenNthCalledWith(1, 11, 'https://readd.com/11');
      expect(updateAutoSyncGroup).toHaveBeenNthCalledWith(2, 12, 'https://readd.com/12');
    });
  });

  describe('scroll:sync', () => {
    it('relays scroll sync to linked tabs excluding the source tab', async () => {
      const handler = getHandler<ScrollSyncMessage>('scroll:sync');
      syncState.linkedTabs = [1, 2, 3];
      const payload: ScrollSyncMessage = {
        sourceTabId: 2,
        mode: 'ratio',
        scrollTop: 120,
        scrollHeight: 1000,
        clientHeight: 600,
        timestamp: Date.now(),
      };

      const result = await handler({ data: payload, sender: { tabId: 2 } });

      expect(result).toEqual({ success: true });
      expect(sendMessage).toHaveBeenCalledTimes(2);
      expect(sendMessage).toHaveBeenCalledWith('scroll:sync', payload, {
        context: 'content-script',
        tabId: 1,
      });
      expect(sendMessage).toHaveBeenCalledWith('scroll:sync', payload, {
        context: 'content-script',
        tabId: 3,
      });
    });

    it('includes active auto-sync group members when relaying scroll sync', async () => {
      const handler = getHandler<ScrollSyncMessage>('scroll:sync');
      syncState.linkedTabs = [21, 22];
      vi.mocked(getAutoSyncGroupMembers).mockReturnValue([22, 30, 31]);
      const payload: ScrollSyncMessage = {
        sourceTabId: 21,
        mode: 'ratio',
        scrollTop: 300,
        scrollHeight: 1800,
        clientHeight: 700,
        timestamp: Date.now(),
      };

      await handler({ data: payload, sender: { tabId: 21 } });

      expect(sendMessage).toHaveBeenCalledTimes(3);
      expect(sendMessage).toHaveBeenCalledWith('scroll:sync', payload, {
        context: 'content-script',
        tabId: 22,
      });
      expect(sendMessage).toHaveBeenCalledWith('scroll:sync', payload, {
        context: 'content-script',
        tabId: 30,
      });
      expect(sendMessage).toHaveBeenCalledWith('scroll:sync', payload, {
        context: 'content-script',
        tabId: 31,
      });
    });

    it('returns success without sending messages when there are no relay targets', async () => {
      const handler = getHandler<ScrollSyncMessage>('scroll:sync');
      syncState.linkedTabs = [40];
      const payload: ScrollSyncMessage = {
        sourceTabId: 40,
        mode: 'ratio',
        scrollTop: 1,
        scrollHeight: 2,
        clientHeight: 3,
        timestamp: Date.now(),
      };

      const result = await handler({ data: payload, sender: { tabId: 40 } });

      expect(result).toEqual({ success: true });
      expect(sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('scroll:manual', () => {
    it('forwards manual mode message to the requested tab', async () => {
      const handler = getHandler<ManualScrollMessage>('scroll:manual');
      const payload: ManualScrollMessage = {
        tabId: 55,
        enabled: true,
      };

      const result = await handler({ data: payload, sender: {} });

      expect(result).toEqual({ success: true });
      expect(sendMessage).toHaveBeenCalledWith('scroll:manual', payload, {
        context: 'content-script',
        tabId: 55,
      });
    });
  });

  describe('url:sync', () => {
    it('relays URL sync to linked tabs except the source tab', async () => {
      const handler = getHandler<UrlSyncMessage>('url:sync');
      syncState.linkedTabs = [61, 62, 63];
      const payload: UrlSyncMessage = {
        sourceTabId: 62,
        url: 'https://example.com/next-page',
      };

      const result = await handler({ data: payload, sender: { tabId: 62 } });

      expect(result).toEqual({ success: true });
      expect(sendMessage).toHaveBeenCalledTimes(2);
      expect(sendMessage).toHaveBeenCalledWith('url:sync', payload, {
        context: 'content-script',
        tabId: 61,
      });
      expect(sendMessage).toHaveBeenCalledWith('url:sync', payload, {
        context: 'content-script',
        tabId: 63,
      });
    });
  });

  describe('sync:url-enabled-changed', () => {
    it('relays URL sync enabled changes to linked tabs except sender.tabId', async () => {
      const handler = getHandler<UrlSyncEnabledChangedMessage>('sync:url-enabled-changed');
      syncState.linkedTabs = [71, 72, 73];
      const payload: UrlSyncEnabledChangedMessage = {
        enabled: false,
      };

      const result = await handler({ data: payload, sender: { tabId: 71 } });

      expect(result).toEqual({ success: true });
      expect(sendMessage).toHaveBeenCalledTimes(2);
      expect(sendMessage).toHaveBeenCalledWith('sync:url-enabled-changed', payload, {
        context: 'content-script',
        tabId: 72,
      });
      expect(sendMessage).toHaveBeenCalledWith('sync:url-enabled-changed', payload, {
        context: 'content-script',
        tabId: 73,
      });
    });
  });
});
