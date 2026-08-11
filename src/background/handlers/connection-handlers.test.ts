import { beforeEach, describe, expect, it, vi } from 'vitest';
import browser from 'webextension-polyfill';

import {
  getAutoSyncGroupMembers,
  isTabInActiveAutoSyncGroup,
  removeTabFromAllAutoSyncGroups,
} from '../lib/auto-sync-groups';
import { reinjectContentScript, reinjectManualReconnect } from '../lib/content-script-manager';
import { sendMessageWithTimeout } from '../lib/messaging';
import {
  broadcastSyncStatus,
  commitSyncState,
  getSyncStateSnapshot,
  persistSyncState,
  syncState,
} from '../lib/sync-state';

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

const { waitForBackgroundInitializationMock } = vi.hoisted(() => ({
  waitForBackgroundInitializationMock: vi.fn(),
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

vi.mock('../lib/auto-sync-state', () => ({
  manualSyncOverriddenTabs: new Set<number>(),
  withAutoSyncLock: vi.fn(async (operation: () => Promise<unknown>) => operation()),
}));

vi.mock('../lib/background-initialization', () => ({
  waitForBackgroundInitialization: waitForBackgroundInitializationMock,
}));

vi.mock('../lib/content-script-manager', () => ({
  reinjectContentScript: vi.fn(),
  reinjectManualReconnect: vi.fn(),
}));

vi.mock('../lib/keep-alive', () => ({
  stopKeepAlive: vi.fn(),
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
    revision: 0,
    sessionEpoch: 0,
  },
  getSyncStateSnapshot: vi.fn(),
  persistSyncState: vi.fn(),
  commitSyncState: vi.fn(),
  broadcastSyncStatus: vi.fn(),
}));

vi.mock('../lib/sync-transition-gate', () => ({
  syncTransitionGate: {
    run: vi.fn(
      async (
        transition: (context: {
          operationGeneration: number;
          expectedRevision: number;
        }) => Promise<unknown>,
      ) =>
        transition({
          operationGeneration: 1,
          expectedRevision: syncState.revision,
        }),
    ),
  },
}));

function getHandler(messageId: string): MessageHandler {
  const handler = messageHandlers.get(messageId);
  expect(handler).toBeDefined();
  return handler as MessageHandler;
}

const readyBackground = {
  manual: { status: 'ready' as const },
  auto: { status: 'ready' as const },
};

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
    syncState.revision = 0;
    syncState.sessionEpoch = 7;

    vi.mocked(isTabInActiveAutoSyncGroup).mockReturnValue(false);
    vi.mocked(getAutoSyncGroupMembers).mockReturnValue([]);
    vi.mocked(reinjectContentScript).mockResolvedValue(true);
    vi.mocked(reinjectManualReconnect).mockImplementation(async (token, isSessionCurrent) => {
      const success = await vi.mocked(reinjectContentScript)(token.tabId, {
        startMessage: token.startMessage,
        isSessionCurrent,
      });
      return { success, tabId: token.tabId };
    });
    vi.mocked(removeTabFromAllAutoSyncGroups).mockResolvedValue();
    vi.mocked(sendMessageWithTimeout).mockImplementation(async (_, __, destination) => ({
      success: true,
      tabId: destination.tabId,
    }));
    vi.mocked(getSyncStateSnapshot).mockImplementation(() => ({
      ...syncState,
      linkedTabs: [...syncState.linkedTabs],
      connectionStatuses: { ...syncState.connectionStatuses },
    }));
    vi.mocked(persistSyncState).mockResolvedValue({ status: 'persisted' });
    vi.mocked(commitSyncState).mockImplementation((nextState) => {
      syncState.isActive = nextState.isActive;
      syncState.linkedTabs = [...nextState.linkedTabs];
      syncState.connectionStatuses = { ...nextState.connectionStatuses };
      syncState.mode = nextState.mode;
      syncState.lastActiveSyncedTabId = nextState.lastActiveSyncedTabId;
      syncState.revision = nextState.revision;
      syncState.sessionEpoch = nextState.sessionEpoch;
    });
    vi.mocked(broadcastSyncStatus).mockResolvedValue();
    waitForBackgroundInitializationMock.mockResolvedValue(readyBackground);

    registerConnectionHandlers();
  });

  describe('background readiness', () => {
    it.each([
      'sync:get-status',
      'sync:reconnect-session',
      'scroll:reconnect',
      'scroll:request-reinject',
    ])('%s waits for initialization', async (messageId) => {
      const handler = getHandler(messageId);

      await handler({ data: { tabId: 14 }, sender: { tabId: 14 } });

      expect(waitForBackgroundInitializationMock).toHaveBeenCalledTimes(1);
    });

    it('captures reconnect tab identity before awaiting readiness', async () => {
      const release = Promise.withResolvers<typeof readyBackground>();
      waitForBackgroundInitializationMock.mockReturnValue(release.promise);
      syncState.isActive = true;
      syncState.linkedTabs = [5, 6];
      syncState.connectionStatuses = { 5: 'error', 6: 'connected' };
      vi.mocked(browser.tabs.get).mockResolvedValue({
        id: 5,
        index: 0,
        highlighted: false,
        active: false,
        pinned: false,
        incognito: false,
      } as browser.Tabs.Tab);
      vi.mocked(sendMessageWithTimeout).mockResolvedValue({ success: true, tabId: 5 });
      const request: HandlerRequest = {
        data: { tabId: 5 },
        sender: { tabId: 5 },
      };
      const handler = getHandler('scroll:reconnect');

      const result = handler(request);
      request.data.tabId = 99;
      release.resolve(readyBackground);
      await result;

      expect(browser.tabs.get).toHaveBeenCalledWith(5);
      expect(sendMessageWithTimeout).toHaveBeenCalledWith(
        'scroll:start',
        expect.objectContaining({ currentTabId: 5 }),
        { context: 'content-script', tabId: 5 },
        3_000,
      );
    });

    it('keeps the state-independent ping path unblocked', async () => {
      waitForBackgroundInitializationMock.mockReturnValue(new Promise(() => undefined));
      vi.spyOn(Date, 'now').mockReturnValue(1234);
      const handler = getHandler('scroll:ping');

      await expect(handler({ data: { tabId: 17 }, sender: {} })).resolves.toEqual({
        success: true,
        timestamp: 1234,
        tabId: 17,
      });
      expect(waitForBackgroundInitializationMock).not.toHaveBeenCalled();
    });
  });

  describe('sync:get-status', () => {
    it('returns inactive status when sync is not active', async () => {
      const handler = getHandler('sync:get-status');

      const result = await handler({ data: { tabId: 1 }, sender: { tabId: 1 } });

      expect(result).toEqual({
        success: false,
        isActive: false,
        revision: 0,
        linkedTabs: [],
        connectedTabs: [],
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

      const tabs = new Map<number, browser.Tabs.Tab>([
        [
          1,
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
        ],
        [
          2,
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
        ],
      ]);
      vi.mocked(browser.tabs.get).mockImplementation(async (tabId) => {
        const tab = tabs.get(tabId);
        if (!tab) {
          throw new Error('Missing tab');
        }
        return tab;
      });

      const handler = getHandler('sync:get-status');
      const result = await handler({ data: { tabId: 1 }, sender: { tabId: 9 } });

      expect(result).toEqual({
        success: true,
        isActive: true,
        revision: 0,
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

      vi.mocked(browser.tabs.get).mockImplementation(async (tabId) => {
        if (tabId !== 1) {
          throw new Error('Missing tab');
        }
        return {
          id: 1,
          index: 0,
          highlighted: false,
          active: true,
          pinned: false,
          incognito: false,
          title: 'Only Present Tab',
          url: 'https://present.dev',
          favIconUrl: undefined,
        };
      });

      const handler = getHandler('sync:get-status');
      const result = await handler({ data: { tabId: 1 }, sender: { tabId: 1 } });

      expect(result).toEqual({
        success: true,
        isActive: true,
        revision: 0,
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

  describe('sync:reconnect-session', () => {
    it('reconnects only unhealthy manual tabs with the frozen revision and epoch', async () => {
      syncState.isActive = true;
      syncState.linkedTabs = [5, 6, 7];
      syncState.connectionStatuses = {
        5: 'error',
        6: 'connected',
        7: 'disconnected',
      };
      syncState.mode = 'element';
      syncState.revision = 12;
      syncState.sessionEpoch = 8;
      vi.mocked(browser.tabs.get).mockImplementation(
        async (tabId) =>
          ({
            id: tabId,
            index: 0,
            highlighted: false,
            active: false,
            pinned: false,
            incognito: false,
          }) as browser.Tabs.Tab,
      );
      vi.mocked(sendMessageWithTimeout).mockImplementation(async (_, __, destination) => ({
        success: true,
        tabId: destination.tabId,
      }));
      const handler = getHandler('sync:reconnect-session');
      const data = { tabId: 0, expectedRevision: 12 };

      const result = await handler({ data, sender: {} });

      expect(result).toEqual({ status: 'committed', revision: 12 });
      expect(sendMessageWithTimeout).toHaveBeenCalledTimes(2);
      expect(sendMessageWithTimeout).toHaveBeenCalledWith(
        'scroll:start',
        {
          tabIds: [5, 6, 7],
          mode: 'element',
          currentTabId: 5,
          isAutoSync: false,
          sessionEpoch: 8,
        },
        { context: 'content-script', tabId: 5 },
        3_000,
      );
      expect(sendMessageWithTimeout).toHaveBeenCalledWith(
        'scroll:start',
        {
          tabIds: [5, 6, 7],
          mode: 'element',
          currentTabId: 7,
          isAutoSync: false,
          sessionEpoch: 8,
        },
        { context: 'content-script', tabId: 7 },
        3_000,
      );
    });

    it('rejects a stale popup reconnect before any tab I/O', async () => {
      syncState.isActive = true;
      syncState.linkedTabs = [5, 6];
      syncState.connectionStatuses = { 5: 'error', 6: 'connected' };
      syncState.revision = 13;
      const handler = getHandler('sync:reconnect-session');
      const data = { tabId: 0, expectedRevision: 12 };

      const result = await handler({ data, sender: {} });

      expect(result).toEqual({ status: 'rejected', reason: 'stale-revision' });
      expect(browser.tabs.get).not.toHaveBeenCalled();
      expect(sendMessageWithTimeout).not.toHaveBeenCalled();
    });
  });

  describe('scroll:reconnect', () => {
    it('does not send a manual reconnect after tabs.get resolves into a replacement session', async () => {
      const tabLookup = Promise.withResolvers<browser.Tabs.Tab>();
      syncState.isActive = true;
      syncState.linkedTabs = [5, 6];
      syncState.connectionStatuses = { 5: 'error', 6: 'connected' };
      syncState.mode = 'ratio';
      syncState.sessionEpoch = 7;
      vi.mocked(browser.tabs.get).mockReturnValue(tabLookup.promise);

      const handler = getHandler('scroll:reconnect');
      const result = handler({ data: { tabId: 5 }, sender: {} });
      await Promise.resolve();

      syncState.linkedTabs = [10, 11];
      syncState.connectionStatuses = { 10: 'connected', 11: 'connected' };
      syncState.mode = 'element';
      syncState.sessionEpoch = 8;
      tabLookup.resolve({
        id: 5,
        index: 0,
        highlighted: false,
        active: false,
        pinned: false,
        incognito: false,
      } satisfies browser.Tabs.Tab);
      await result;

      expect(sendMessageWithTimeout).not.toHaveBeenCalled();
      expect(syncState.connectionStatuses).toEqual({ 10: 'connected', 11: 'connected' });
      expect(persistSyncState).not.toHaveBeenCalled();
    });

    it.each([
      { name: 'successful', response: { success: true, tabId: 5 } },
      { name: 'failed', response: { success: false, tabId: 5 } },
    ])(
      'does not let a $name stale manual acknowledgement mutate its replacement session',
      async ({ response }) => {
        const acknowledgement = Promise.withResolvers<{ success: boolean; tabId: number }>();
        syncState.isActive = true;
        syncState.linkedTabs = [5, 6];
        syncState.connectionStatuses = { 5: 'error', 6: 'connected' };
        syncState.mode = 'ratio';
        syncState.sessionEpoch = 7;
        vi.mocked(browser.tabs.get).mockResolvedValue({
          id: 5,
          index: 0,
          highlighted: false,
          active: false,
          pinned: false,
          incognito: false,
        } satisfies browser.Tabs.Tab);
        vi.mocked(sendMessageWithTimeout).mockReturnValue(acknowledgement.promise);

        const handler = getHandler('scroll:reconnect');
        const result = handler({ data: { tabId: 5 }, sender: {} });
        await Promise.resolve();
        await Promise.resolve();

        syncState.linkedTabs = [10, 11];
        syncState.connectionStatuses = { 10: 'connected', 11: 'connected' };
        syncState.mode = 'element';
        syncState.sessionEpoch = 8;
        acknowledgement.resolve(response);
        await result;

        expect(sendMessageWithTimeout).not.toHaveBeenCalled();
        expect(syncState.connectionStatuses).toEqual({ 10: 'connected', 11: 'connected' });
        expect(persistSyncState).not.toHaveBeenCalled();
        expect(broadcastSyncStatus).not.toHaveBeenCalled();
      },
    );

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
          sessionEpoch: 7,
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
      expect(syncState.linkedTabs).toEqual([]);
      expect(syncState.connectionStatuses[4]).toBeUndefined();
      expect(vi.mocked(persistSyncState)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(removeTabFromAllAutoSyncGroups)).not.toHaveBeenCalled();
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

      expect(result).toEqual({ success: false, reason: 'invalid-acknowledgement' });
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

      expect(result).toEqual({ success: false, reason: 'connection-timeout' });
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
      expect(vi.mocked(reinjectContentScript)).toHaveBeenCalledWith(
        31,
        expect.objectContaining({
          startMessage: {
            tabIds: [31],
            mode: 'ratio',
            currentTabId: 31,
            isAutoSync: false,
            sessionEpoch: 7,
          },
          isSessionCurrent: expect.any(Function),
        }),
      );
      expect(syncState.connectionStatuses[31]).toBe('connected');
      expect(persistSyncState).toHaveBeenCalledTimes(1);
      expect(broadcastSyncStatus).toHaveBeenCalledTimes(1);
    });

    it('reinjects an auto-only tab with an epoch-free active-group payload', async () => {
      vi.mocked(isTabInActiveAutoSyncGroup).mockReturnValue(true);
      vi.mocked(getAutoSyncGroupMembers).mockReturnValue([41, 42]);
      vi.mocked(reinjectContentScript).mockResolvedValue(true);

      const handler = getHandler('scroll:request-reinject');
      const result = await handler({ data: { tabId: 40 }, sender: {} });

      expect(result).toEqual({ success: true });
      expect(reinjectContentScript).toHaveBeenCalledWith(
        40,
        expect.objectContaining({
          startMessage: {
            tabIds: [41, 42, 40],
            mode: 'ratio',
            currentTabId: 40,
            isAutoSync: true,
          },
          isSessionCurrent: expect.any(Function),
        }),
      );
    });

    it.each([
      { name: 'manual', manual: true },
      { name: 'automatic', manual: false },
    ])(
      'returns false when the captured $name reinjection session is replaced',
      async ({ manual }) => {
        const release = Promise.withResolvers<void>();
        let autoSessionCurrent = !manual;
        if (manual) {
          syncState.isActive = true;
          syncState.linkedTabs = [31, 32];
          syncState.sessionEpoch = 7;
        } else {
          vi.mocked(isTabInActiveAutoSyncGroup).mockImplementation(() => autoSessionCurrent);
          vi.mocked(getAutoSyncGroupMembers).mockReturnValue([41, 42]);
        }
        vi.mocked(reinjectContentScript).mockImplementation(async (_tabId, context) => {
          await release.promise;
          return context.isSessionCurrent();
        });

        const handler = getHandler('scroll:request-reinject');
        const result = handler({ data: { tabId: manual ? 31 : 40 }, sender: {} });
        await Promise.resolve();

        syncState.linkedTabs = [10, 11];
        syncState.sessionEpoch = 8;
        autoSessionCurrent = false;
        release.resolve();

        await expect(result).resolves.toEqual({ success: false });
        expect(persistSyncState).not.toHaveBeenCalled();
        expect(broadcastSyncStatus).not.toHaveBeenCalled();
      },
    );

    it('returns failure when tab is not in any sync group', async () => {
      const handler = getHandler('scroll:request-reinject');

      const result = await handler({ data: { tabId: 99 }, sender: {} });

      expect(result).toEqual({ success: false, reason: 'Tab not in sync' });
      expect(vi.mocked(reinjectContentScript)).not.toHaveBeenCalled();
    });
  });
});
