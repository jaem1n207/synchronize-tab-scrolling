import { beforeEach, describe, expect, it, vi } from 'vitest';
import browser from 'webextension-polyfill';

import type { RecentQuickSyncOutcome } from '~/shared/types/quick-sync';

import {
  getAutoSyncActivationGenerationForTab,
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

interface MessageData {
  tabId?: number;
  expectedRevision?: number;
  source?: string;
  viewerTabId?: number;
  viewerWindowId?: number;
}

interface MessageSender {
  tabId?: number;
  context?: unknown;
}

interface HandlerRequest {
  data: MessageData;
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
  getAutoSyncActivationGenerationForTab: vi.fn(),
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

function findForbiddenSnapshotKeys(value: unknown): Array<string> {
  if (typeof value !== 'object' || value === null) {
    return [];
  }

  return Object.entries(value).flatMap(([key, nestedValue]) => {
    const forbiddenKey = key === 'title' || key === 'favIconUrl' || key === 'url' ? [key] : [];
    return [...forbiddenKey, ...findForbiddenSnapshotKeys(nestedValue)];
  });
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
    vi.mocked(getAutoSyncActivationGenerationForTab).mockReturnValue(1);
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
    it('returns an error discriminator without false inactive topology', async () => {
      waitForBackgroundInitializationMock.mockResolvedValue({
        manual: { status: 'storage-error' },
        auto: { status: 'ready' },
      });
      const handler = getHandler('sync:get-status');

      const result = await handler({
        data: { source: 'popup', viewerTabId: 1, viewerWindowId: 4 },
        sender: { context: 'popup' },
      });

      expect(result).toEqual({
        status: 'error',
        reason: 'storage-error',
      });
      expect(getSyncStateSnapshot).not.toHaveBeenCalled();
      expect(browser.tabs.get).not.toHaveBeenCalled();
    });

    it('returns canonical inactive status from one committed snapshot', async () => {
      syncState.revision = 8;
      syncState.sessionEpoch = 3;
      const handler = getHandler('sync:get-status');

      const result = await handler({
        data: { source: 'popup', viewerTabId: 1, viewerWindowId: 4 },
        sender: { context: 'popup' },
      });

      expect(result).toEqual({
        status: 'inactive',
        source: 'popup',
        revision: 8,
        sessionEpoch: 3,
      });
      expect(getSyncStateSnapshot).toHaveBeenCalledTimes(1);
      expect(browser.tabs.get).not.toHaveBeenCalled();
    });

    it('returns the authoritative active snapshot without URL fields', async () => {
      syncState.isActive = true;
      syncState.linkedTabs = [1, 2, 3];
      syncState.connectionStatuses = {
        1: 'connected',
        2: 'disconnected',
        3: 'error',
      };
      syncState.mode = 'ratio';
      syncState.revision = 5;
      syncState.sessionEpoch = 2;

      const tabs = new Map<number, browser.Tabs.Tab>([
        [
          1,
          {
            id: 1,
            windowId: 4,
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
            windowId: 9,
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
        if (tabId === 3) {
          throw new Error('Missing tab');
        }
        const tab = tabs.get(tabId);
        if (!tab) {
          throw new Error('Missing tab');
        }
        return tab;
      });

      const handler = getHandler('sync:get-status');
      const result = await handler({
        data: { source: 'popup', viewerTabId: 1, viewerWindowId: 4 },
        sender: { context: 'popup' },
      });

      expect(result).toEqual({
        status: 'active',
        source: 'popup',
        snapshot: {
          revision: 5,
          sessionEpoch: 2,
          mode: 'ratio',
          linkedTabIds: [1, 2, 3],
          tabs: [
            {
              availability: 'available',
              tabId: 1,
              title: 'Tab One',
              favIconUrl: 'one.ico',
              windowId: 4,
              location: 'current-tab',
              connectionStatus: 'connected',
            },
            {
              availability: 'available',
              tabId: 2,
              title: 'Tab Two',
              windowId: 9,
              location: 'other-window',
              connectionStatus: 'disconnected',
            },
            {
              availability: 'unavailable',
              tabId: 3,
              connectionStatus: 'error',
            },
          ],
        },
      });
      expect(JSON.stringify(result)).not.toContain('https://');
      expect(getSyncStateSnapshot).toHaveBeenCalledTimes(1);
    });

    it('returns a sanitized content snapshot without hydrating other linked tabs', async () => {
      syncState.isActive = true;
      syncState.linkedTabs = [1, 2];
      syncState.connectionStatuses = { 1: 'connected', 2: 'disconnected' };
      syncState.mode = 'ratio';
      syncState.revision = 6;
      syncState.sessionEpoch = 3;
      vi.mocked(browser.tabs.get).mockImplementation(async (tabId) => {
        if (tabId !== 1) {
          throw new Error('Content status must not hydrate another linked tab');
        }
        return {
          id: tabId,
          windowId: 4,
          index: 0,
          highlighted: false,
          active: true,
          pinned: false,
          incognito: false,
          title: 'Private viewer title',
          favIconUrl: 'private-viewer.ico',
          url: 'https://private.example/token',
        };
      });

      const handler = getHandler('sync:get-status');
      const result = await handler({
        data: { source: 'content-script' },
        sender: { context: 'content-script', tabId: 1 },
      });

      expect(result).toEqual({
        status: 'active',
        source: 'content-script',
        snapshot: {
          revision: 6,
          sessionEpoch: 3,
          mode: 'ratio',
          linkedTabCount: 2,
          tabs: [
            { location: 'current-tab', connectionStatus: 'connected' },
            { location: 'other-tab', connectionStatus: 'disconnected' },
          ],
        },
      });
      expect(browser.tabs.get).toHaveBeenCalledTimes(1);
      expect(browser.tabs.get).toHaveBeenCalledWith(1);
      expect(findForbiddenSnapshotKeys(result)).toEqual([]);
      expect(JSON.stringify(result)).not.toContain('Private viewer title');
      expect(JSON.stringify(result)).not.toContain('private-viewer.ico');
      expect(JSON.stringify(result)).not.toContain('https://private.example/token');
    });

    it('rejects a content script spoofing a popup request before topology access', async () => {
      syncState.isActive = true;
      syncState.linkedTabs = [1, 2];
      const handler = getHandler('sync:get-status');

      await expect(
        handler({
          data: { source: 'popup', viewerTabId: 1, viewerWindowId: 4 },
          sender: { context: 'content-script', tabId: 1 },
        }),
      ).resolves.toEqual({
        status: 'error',
        reason: 'invalid-viewer-context',
      });
      expect(getSyncStateSnapshot).not.toHaveBeenCalled();
      expect(browser.tabs.get).not.toHaveBeenCalled();
    });

    it('rejects a popup spoofing a content request before viewer hydration', async () => {
      const handler = getHandler('sync:get-status');

      await expect(
        handler({
          data: { source: 'content-script' },
          sender: { context: 'popup', tabId: 1 },
        }),
      ).resolves.toEqual({
        status: 'error',
        reason: 'invalid-viewer-context',
      });
      expect(getSyncStateSnapshot).not.toHaveBeenCalled();
      expect(browser.tabs.get).not.toHaveBeenCalled();
    });

    it.each([
      {
        name: 'missing context',
        data: { source: 'popup', viewerTabId: 1, viewerWindowId: 4 },
        sender: {},
      },
      {
        name: 'unknown context',
        data: { source: 'content-script' },
        sender: { context: 'sidebar', tabId: 1 },
      },
      {
        name: 'malformed context',
        data: { source: 'popup', viewerTabId: 1, viewerWindowId: 4 },
        sender: { context: 42 },
      },
    ])('rejects $name before topology access', async ({ data, sender }) => {
      const handler = getHandler('sync:get-status');

      await expect(handler({ data, sender })).resolves.toEqual({
        status: 'error',
        reason: 'invalid-viewer-context',
      });
      expect(getSyncStateSnapshot).not.toHaveBeenCalled();
      expect(browser.tabs.get).not.toHaveBeenCalled();
    });

    it.each([
      {
        name: 'missing popup tab id',
        data: { source: 'popup', viewerWindowId: 4 },
        sender: { context: 'popup' },
      },
      {
        name: 'non-positive popup tab id',
        data: { source: 'popup', viewerTabId: 0, viewerWindowId: 4 },
        sender: { context: 'popup' },
      },
      {
        name: 'unsafe popup window id',
        data: {
          source: 'popup',
          viewerTabId: 1,
          viewerWindowId: Number.MAX_SAFE_INTEGER + 1,
        },
        sender: { context: 'popup' },
      },
      {
        name: 'missing content sender',
        data: { source: 'content-script' },
        sender: { context: 'content-script' },
      },
    ])('rejects $name before reading or querying topology', async ({ data, sender }) => {
      const handler = getHandler('sync:get-status');

      await expect(handler({ data, sender })).resolves.toEqual({
        status: 'error',
        reason: 'invalid-viewer-context',
      });
      expect(getSyncStateSnapshot).not.toHaveBeenCalled();
      expect(browser.tabs.get).not.toHaveBeenCalled();
    });

    it('rejects mismatched content sender metadata before reading topology', async () => {
      vi.mocked(browser.tabs.get).mockResolvedValue({
        id: 2,
        windowId: 4,
        index: 0,
        highlighted: false,
        active: true,
        pinned: false,
        incognito: false,
      });
      const handler = getHandler('sync:get-status');

      await expect(
        handler({
          data: { source: 'content-script' },
          sender: { context: 'content-script', tabId: 1 },
        }),
      ).resolves.toEqual({
        status: 'error',
        reason: 'invalid-viewer-context',
      });
      expect(getSyncStateSnapshot).not.toHaveBeenCalled();
      expect(browser.tabs.get).toHaveBeenCalledTimes(1);
    });

    it('includes a non-expired recent outcome only for its popup viewer', async () => {
      const recentOutcome: RecentQuickSyncOutcome = {
        tabId: 1,
        resultKind: 'start-failed',
        reason: 'connection-timeout',
        expiresAt: 2_000,
      };
      messageHandlers.clear();
      registerConnectionHandlers({
        getRecentQuickSyncOutcome: () => recentOutcome,
        now: () => 1_000,
      });
      const handler = getHandler('sync:get-status');

      const matching = await handler({
        data: { source: 'popup', viewerTabId: 1, viewerWindowId: 4 },
        sender: { context: 'popup' },
      });
      const otherViewer = await handler({
        data: { source: 'popup', viewerTabId: 2, viewerWindowId: 4 },
        sender: { context: 'popup' },
      });
      const contentViewer = await handler({
        data: { source: 'content-script' },
        sender: { context: 'content-script', tabId: 1 },
      });

      expect(matching).toEqual({
        status: 'inactive',
        source: 'popup',
        revision: 0,
        sessionEpoch: 7,
        recentQuickSyncOutcome: recentOutcome,
      });
      expect(otherViewer).toEqual({
        status: 'inactive',
        source: 'popup',
        revision: 0,
        sessionEpoch: 7,
      });
      expect(contentViewer).toEqual({
        status: 'error',
        reason: 'invalid-viewer-context',
      });
    });

    it('does not include an expired matching popup outcome', async () => {
      const recentOutcome: RecentQuickSyncOutcome = {
        tabId: 1,
        resultKind: 'add-failed',
        reason: 'content-unreachable',
        expiresAt: 1_000,
      };
      messageHandlers.clear();
      registerConnectionHandlers({
        getRecentQuickSyncOutcome: () => recentOutcome,
        now: () => 1_000,
      });
      const handler = getHandler('sync:get-status');

      await expect(
        handler({
          data: { source: 'popup', viewerTabId: 1, viewerWindowId: 4 },
          sender: { context: 'popup' },
        }),
      ).resolves.toEqual({
        status: 'inactive',
        source: 'popup',
        revision: 0,
        sessionEpoch: 7,
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
      vi.mocked(browser.tabs.get).mockImplementation(async (tabId) => ({
        id: tabId,
        index: 0,
        highlighted: false,
        active: false,
        pinned: false,
        incognito: false,
      }));
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

    it.each([
      { linkedTabs: [1, 2, 3], expectedActive: true, expectedTabs: [2, 3] },
      { linkedTabs: [1, 2], expectedActive: false, expectedTabs: [] },
    ])(
      'returns refresh-required when a missing tab changes topology from $linkedTabs',
      async ({ linkedTabs, expectedActive, expectedTabs }) => {
        syncState.isActive = true;
        syncState.linkedTabs = linkedTabs;
        syncState.connectionStatuses = Object.fromEntries(
          linkedTabs.map((tabId) => [tabId, tabId === 1 ? 'error' : 'connected']),
        );
        syncState.revision = 9;
        vi.mocked(browser.tabs.get).mockRejectedValue(new Error('missing'));

        const handler = getHandler('sync:reconnect-session');
        const result = await handler({ data: { tabId: 0, expectedRevision: 9 }, sender: {} });

        expect(result).toEqual({ status: 'refresh-required', revision: 10 });
        expect(syncState.isActive).toBe(expectedActive);
        expect(syncState.linkedTabs).toEqual(expectedTabs);
      },
    );

    it.each([
      { linkedTabs: [1, 2, 3], name: '3-to-2 removal' },
      { linkedTabs: [1, 2], name: '2-to-inactive Stop' },
    ])(
      'returns persistence failure instead of refresh-required for failed $name',
      async ({ linkedTabs }) => {
        syncState.isActive = true;
        syncState.linkedTabs = linkedTabs;
        syncState.connectionStatuses = Object.fromEntries(
          linkedTabs.map((tabId) => [tabId, tabId === 1 ? 'error' : 'connected']),
        );
        syncState.revision = 9;
        vi.mocked(browser.tabs.get).mockRejectedValue(new Error('missing'));
        vi.mocked(persistSyncState).mockResolvedValue({ status: 'storage-error' });

        const handler = getHandler('sync:reconnect-session');
        const result = await handler({ data: { tabId: 0, expectedRevision: 9 }, sender: {} });

        expect(result).toEqual({ status: 'rejected', reason: 'persistence-failed' });
        expect(syncState.isActive).toBe(true);
        expect(syncState.linkedTabs).toEqual(linkedTabs);
        expect(syncState.revision).toBe(9);
      },
    );
  });

  describe('scroll:reconnect', () => {
    it.each([
      { name: 'missing sender', dataTabId: 5, sender: {} },
      { name: 'mismatched sender', dataTabId: 5, sender: { tabId: 6 } },
    ])('rejects $name before initialization or tab I/O', async ({ dataTabId, sender }) => {
      const handler = getHandler('scroll:reconnect');

      const result = await handler({ data: { tabId: dataTabId }, sender });

      expect(result).toEqual({ success: false, reason: 'Invalid tab identity' });
      expect(waitForBackgroundInitializationMock).not.toHaveBeenCalled();
      expect(browser.tabs.get).not.toHaveBeenCalled();
      expect(sendMessageWithTimeout).not.toHaveBeenCalled();
      expect(persistSyncState).not.toHaveBeenCalled();
    });

    it('accepts zero as an alias for the positive sender tab ID', async () => {
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
      });
      const handler = getHandler('scroll:reconnect');

      const result = await handler({ data: { tabId: 0 }, sender: { tabId: 5 } });

      expect(result).toEqual({ success: true });
      expect(browser.tabs.get).toHaveBeenCalledWith(5);
      expect(sendMessageWithTimeout).toHaveBeenCalledWith(
        'scroll:start',
        expect.objectContaining({ currentTabId: 5 }),
        { context: 'content-script', tabId: 5 },
        3_000,
      );
    });

    it('does not send a manual reconnect after tabs.get resolves into a replacement session', async () => {
      const tabLookup = Promise.withResolvers<browser.Tabs.Tab>();
      syncState.isActive = true;
      syncState.linkedTabs = [5, 6];
      syncState.connectionStatuses = { 5: 'error', 6: 'connected' };
      syncState.mode = 'ratio';
      syncState.sessionEpoch = 7;
      vi.mocked(browser.tabs.get).mockReturnValue(tabLookup.promise);

      const handler = getHandler('scroll:reconnect');
      const result = handler({ data: { tabId: 5 }, sender: { tabId: 5 } });
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
        const result = handler({ data: { tabId: 5 }, sender: { tabId: 5 } });
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
      const result = await handler({ data: { tabId: 5 }, sender: { tabId: 5 } });

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
      const result = await handler({ data: { tabId: 7 }, sender: { tabId: 7 } });

      expect(result).toEqual({ success: true });
      expect(vi.mocked(sendMessageWithTimeout)).toHaveBeenCalledWith(
        'scroll:start',
        {
          tabIds: [8, 9, 7],
          mode: 'ratio',
          currentTabId: 7,
          isAutoSync: true,
          autoSyncGeneration: 1,
        },
        { context: 'content-script', tabId: 7 },
        3_000,
      );
      expect(vi.mocked(persistSyncState)).not.toHaveBeenCalled();
      expect(vi.mocked(broadcastSyncStatus)).not.toHaveBeenCalled();
    });

    it('returns failure when tab is not in any sync', async () => {
      const handler = getHandler('scroll:reconnect');

      const result = await handler({ data: { tabId: 12 }, sender: { tabId: 12 } });

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
      const result = await handler({ data: { tabId: 4 }, sender: { tabId: 4 } });

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
      const result = await handler({ data: { tabId: 11 }, sender: { tabId: 11 } });

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
      const result = await handler({ data: { tabId: 21 }, sender: { tabId: 21 } });

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
      const result = await handler({ data: { tabId: 31 }, sender: { tabId: 31 } });

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
      const result = await handler({ data: { tabId: 40 }, sender: { tabId: 40 } });

      expect(result).toEqual({ success: true });
      expect(reinjectContentScript).toHaveBeenCalledWith(
        40,
        expect.objectContaining({
          startMessage: {
            tabIds: [41, 42, 40],
            mode: 'ratio',
            currentTabId: 40,
            isAutoSync: true,
            autoSyncGeneration: 1,
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
        const tabId = manual ? 31 : 40;
        const result = handler({ data: { tabId }, sender: { tabId } });
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

      const result = await handler({ data: { tabId: 99 }, sender: { tabId: 99 } });

      expect(result).toEqual({ success: false, reason: 'Tab not in sync' });
      expect(vi.mocked(reinjectContentScript)).not.toHaveBeenCalled();
    });
  });
});
