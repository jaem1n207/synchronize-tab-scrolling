import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendMessage } from 'webext-bridge/background';
import browser from 'webextension-polyfill';

import type {
  ManualScrollMessage,
  ScrollSyncMessage,
  StartSyncMessage,
  StartSyncResponse,
  StopSyncMessage,
  SyncBaselineUpdateMessage,
  UrlSyncEnabledChangedMessage,
  UrlSyncModeChangedMessage,
  UrlSyncMessage,
} from '~/shared/types/messages';

import {
  getAutoSyncGroupMembers,
  removeTabFromAllAutoSyncGroups,
  updateAutoSyncGroup,
} from '../lib/auto-sync-groups';
import {
  addTabSuggestedTabs,
  autoSyncState,
  manualSyncOverriddenTabs,
  pendingSuggestions,
} from '../lib/auto-sync-state';
import {
  consumePendingUrlSyncContextualHint,
  savePendingUrlSyncContextualHint,
} from '../lib/contextual-hint-state';
import { startKeepAlive, stopKeepAlive } from '../lib/keep-alive';
import { sendMessageWithTimeout } from '../lib/messaging';
import { broadcastSyncStatus, persistCommittedSyncStateLegacy, syncState } from '../lib/sync-state';

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

const { isContextualHintDismissedMock } = vi.hoisted(() => ({
  isContextualHintDismissedMock: vi.fn(),
}));

const { getManualReadinessSnapshotMock, waitForBackgroundInitializationMock } = vi.hoisted(() => ({
  getManualReadinessSnapshotMock: vi.fn(),
  waitForBackgroundInitializationMock: vi.fn(),
}));

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

vi.mock('~/shared/lib/storage', () => ({
  isContextualHintDismissed: isContextualHintDismissedMock,
}));

vi.mock('../lib/auto-sync-groups', () => ({
  removeTabFromAllAutoSyncGroups: vi.fn(),
  getAutoSyncGroupMembers: vi.fn(),
  updateAutoSyncGroup: vi.fn(),
}));

vi.mock('../lib/background-initialization', () => ({
  getManualReadinessSnapshot: getManualReadinessSnapshotMock,
  waitForBackgroundInitialization: waitForBackgroundInitializationMock,
}));

vi.mock('../lib/auto-sync-state', () => ({
  autoSyncState: {
    enabled: false,
    groups: new Map<string, { tabIds: Set<number>; isActive: boolean }>(),
    excludedUrls: [],
  },
  manualSyncOverriddenTabs: new Set<number>(),
  pendingSuggestions: new Set<string>(),
  addTabSuggestedTabs: new Set<number>(),
}));

vi.mock('../lib/contextual-hint-state', () => ({
  consumePendingUrlSyncContextualHint: vi.fn(),
  savePendingUrlSyncContextualHint: vi.fn(),
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
    revision: 0,
    sessionEpoch: 0,
  },
  persistCommittedSyncStateLegacy: vi.fn(),
  broadcastSyncStatus: vi.fn(),
}));

function getHandler<TData>(messageId: string): RegisteredMessageHandler<TData> {
  const handler = messageHandlers.get(messageId);
  if (!handler) {
    throw new Error(`Handler not found: ${messageId}`);
  }

  return handler as RegisteredMessageHandler<TData>;
}

const readyBackground = {
  manual: { status: 'ready' as const },
  auto: { status: 'ready' as const },
};

async function expectImmediateUnavailable(result: Promise<unknown>): Promise<void> {
  const fallback = Promise.withResolvers<{ status: 'next-microtask' }>();
  const observedPromise = Promise.race([
    result.then((value) => ({ status: 'settled' as const, value })),
    fallback.promise,
  ]);
  queueMicrotask(() => {
    fallback.resolve({ status: 'next-microtask' });
  });
  const observed = await observedPromise;

  expect(observed).toEqual({
    status: 'settled',
    value: { success: false, reason: 'session-state-unavailable' },
  });
}

describe('registerScrollSyncHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    messageHandlers.clear();

    syncState.isActive = false;
    syncState.linkedTabs = [];
    syncState.connectionStatuses = {};
    syncState.mode = undefined;
    syncState.revision = 0;
    syncState.sessionEpoch = 0;

    autoSyncState.enabled = false;
    autoSyncState.groups.clear();
    manualSyncOverriddenTabs.clear();
    pendingSuggestions.clear();
    addTabSuggestedTabs.clear();

    onMessageMock.mockImplementation(
      (messageId: string, handler: (...args: never[]) => unknown) => {
        messageHandlers.set(messageId, handler);
      },
    );

    vi.mocked(sendMessage).mockResolvedValue({ success: true });
    vi.mocked(sendMessageWithTimeout).mockImplementation(async (_, __, destination) => ({
      success: true,
      tabId: destination.tabId,
      metrics: {
        tabId: destination.tabId,
        scrollHeight: 2000,
        clientHeight: 1000,
        scrollableHeight: 1000,
      },
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
    vi.mocked(persistCommittedSyncStateLegacy).mockResolvedValue({ status: 'persisted' });
    vi.mocked(broadcastSyncStatus).mockResolvedValue();
    isContextualHintDismissedMock.mockResolvedValue(false);
    vi.mocked(consumePendingUrlSyncContextualHint).mockReset();
    vi.mocked(consumePendingUrlSyncContextualHint).mockReturnValue(null);
    vi.mocked(savePendingUrlSyncContextualHint).mockReset();
    getManualReadinessSnapshotMock.mockReturnValue('ready');
    waitForBackgroundInitializationMock.mockResolvedValue(readyBackground);

    registerScrollSyncHandlers();
  });

  describe('background readiness', () => {
    it.each([
      {
        messageId: 'scroll:start',
        data: { tabIds: [1, 2], mode: 'ratio' },
      },
      {
        messageId: 'scroll:stop',
        data: { tabIds: [] },
      },
      {
        messageId: 'sync:url-enabled-changed',
        data: { enabled: true },
      },
      {
        messageId: 'sync:url-mode-changed',
        data: { mode: 'ratio' },
      },
    ])('$messageId waits for background initialization', async ({ messageId, data }) => {
      const handler = getHandler<unknown>(messageId);

      await handler({ data, sender: { tabId: 1 } });

      expect(waitForBackgroundInitializationMock).toHaveBeenCalledTimes(1);
    });

    it('does not start tab I/O before scroll:start readiness resolves', async () => {
      const release = Promise.withResolvers<typeof readyBackground>();
      waitForBackgroundInitializationMock.mockReturnValue(release.promise);
      const handler = getHandler<StartSyncMessage>('scroll:start');

      const result = handler({
        data: { tabIds: [1, 2], mode: 'ratio' },
        sender: { tabId: 1 },
      });
      await Promise.resolve();

      expect(browser.tabs.get).not.toHaveBeenCalled();
      expect(sendMessageWithTimeout).not.toHaveBeenCalled();

      release.resolve(readyBackground);
      await result;
    });

    it('rejects scroll:sync immediately while manual readiness is pending', async () => {
      getManualReadinessSnapshotMock.mockReturnValue('pending');
      waitForBackgroundInitializationMock.mockReturnValue(new Promise(() => undefined));
      syncState.linkedTabs = [1, 2];
      const handler = getHandler<ScrollSyncMessage>('scroll:sync');

      await expectImmediateUnavailable(
        handler({
          data: {
            isAutoSync: true,
            sourceTabId: 1,
            mode: 'ratio',
            scrollTop: 120,
            scrollHeight: 1000,
            clientHeight: 600,
            timestamp: 10,
          },
          sender: { tabId: 1 },
        }),
      );

      expect(waitForBackgroundInitializationMock).not.toHaveBeenCalled();
      expect(sendMessage).not.toHaveBeenCalled();
      expect(browser.tabs.get).not.toHaveBeenCalled();
      expect(persistCommittedSyncStateLegacy).not.toHaveBeenCalled();
    });

    it('rejects scroll:manual immediately while manual readiness is unavailable', async () => {
      getManualReadinessSnapshotMock.mockReturnValue('unavailable');
      waitForBackgroundInitializationMock.mockReturnValue(new Promise(() => undefined));
      const handler = getHandler<ManualScrollMessage>('scroll:manual');

      await expectImmediateUnavailable(
        handler({
          data: { isAutoSync: true, sourceTabId: 7, tabId: 7, enabled: true },
          sender: { tabId: 7 },
        }),
      );

      expect(waitForBackgroundInitializationMock).not.toHaveBeenCalled();
      expect(sendMessage).not.toHaveBeenCalled();
      expect(browser.tabs.get).not.toHaveBeenCalled();
      expect(persistCommittedSyncStateLegacy).not.toHaveBeenCalled();
    });

    it('rejects url:sync immediately while manual readiness is pending', async () => {
      getManualReadinessSnapshotMock.mockReturnValue('pending');
      waitForBackgroundInitializationMock.mockReturnValue(new Promise(() => undefined));
      syncState.linkedTabs = [8, 9];
      const handler = getHandler<UrlSyncMessage>('url:sync');

      await expectImmediateUnavailable(
        handler({
          data: {
            isAutoSync: true,
            sourceTabId: 8,
            url: 'https://example.com/private',
          },
          sender: { tabId: 8 },
        }),
      );

      expect(waitForBackgroundInitializationMock).not.toHaveBeenCalled();
      expect(sendMessage).not.toHaveBeenCalled();
      expect(browser.tabs.get).not.toHaveBeenCalled();
      expect(persistCommittedSyncStateLegacy).not.toHaveBeenCalled();
    });

    it('rejects baseline updates immediately while manual readiness is pending', async () => {
      getManualReadinessSnapshotMock.mockReturnValue('pending');
      const handler = getHandler<SyncBaselineUpdateMessage>('scroll:baseline-update');

      await expectImmediateUnavailable(
        handler({
          data: {
            baselineRatio: 0.4,
            isAutoSync: false,
            sessionEpoch: 2,
            sourceTabId: 8,
            timestamp: 10,
          },
          sender: { tabId: 8 },
        }),
      );

      expect(waitForBackgroundInitializationMock).not.toHaveBeenCalled();
      expect(sendMessage).not.toHaveBeenCalled();
      expect(browser.tabs.get).not.toHaveBeenCalled();
      expect(persistCommittedSyncStateLegacy).not.toHaveBeenCalled();
    });
  });

  describe('contextual-hint:save-pending-url-sync', () => {
    it('stores pending URL Sync hints by sender tab ID', async () => {
      const handler = getHandler<{ hintId: 'page-change-synced' }>(
        'contextual-hint:save-pending-url-sync',
      );

      const result = await handler({
        data: { hintId: 'page-change-synced' },
        sender: { tabId: 7 },
      });

      expect(result).toEqual({ status: 'success' });
      expect(savePendingUrlSyncContextualHint).toHaveBeenCalledWith(7, 'page-change-synced');
    });

    it('rejects pending URL Sync hints without sender tab ID', async () => {
      const handler = getHandler<{ hintId: 'page-change-synced' }>(
        'contextual-hint:save-pending-url-sync',
      );

      const result = await handler({
        data: { hintId: 'page-change-synced' },
        sender: {},
      });

      expect(result).toEqual({ status: 'failed' });
      expect(savePendingUrlSyncContextualHint).not.toHaveBeenCalled();
    });
  });

  describe('contextual-hint:consume-pending-url-sync', () => {
    it('consumes pending URL Sync hints by sender tab ID', async () => {
      const handler = getHandler<Record<string, never>>('contextual-hint:consume-pending-url-sync');
      vi.mocked(consumePendingUrlSyncContextualHint).mockReturnValue('keep-website-path-synced');

      const result = await handler({
        data: {},
        sender: { tabId: 12 },
      });

      expect(result).toEqual({
        status: 'success',
        hintId: 'keep-website-path-synced',
      });
      expect(consumePendingUrlSyncContextualHint).toHaveBeenCalledWith(12);
    });
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
      expect(persistCommittedSyncStateLegacy).toHaveBeenCalledTimes(1);
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
      expect(persistCommittedSyncStateLegacy).not.toHaveBeenCalled();
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

    it('prunes pendingSuggestions for groups below threshold on manual sync start', async () => {
      const handler = getHandler<StartSyncMessage>('scroll:start');

      autoSyncState.groups.set('https://enough.com', {
        tabIds: new Set([1, 2]),
        isActive: false,
      });
      autoSyncState.groups.set('https://not-enough.com', {
        tabIds: new Set([3]),
        isActive: false,
      });
      pendingSuggestions.add('https://enough.com');
      pendingSuggestions.add('https://not-enough.com');
      pendingSuggestions.add('https://missing.com');

      const payload: StartSyncMessage = {
        tabIds: [5, 6],
        mode: 'ratio',
        isAutoSync: false,
      };

      await handler({ data: payload, sender: {} });

      expect(pendingSuggestions.has('https://enough.com')).toBe(true);
      expect(pendingSuggestions.has('https://not-enough.com')).toBe(false);
      expect(pendingSuggestions.has('https://missing.com')).toBe(false);
    });

    it('does not prune pendingSuggestions on auto-sync start', async () => {
      const handler = getHandler<StartSyncMessage>('scroll:start');

      pendingSuggestions.add('https://some-url.com');
      autoSyncState.groups.set('https://some-url.com', {
        tabIds: new Set([1]),
        isActive: false,
      });

      const payload: StartSyncMessage = {
        tabIds: [7, 8],
        mode: 'ratio',
        isAutoSync: true,
      };

      await handler({ data: payload, sender: {} });

      expect(pendingSuggestions.has('https://some-url.com')).toBe(true);
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

    it('sends manual adjustment contextual hint when connected tab scroll metrics differ', async () => {
      const handler = getHandler<StartSyncMessage>('scroll:start');
      const payload: StartSyncMessage = {
        tabIds: [101, 102],
        mode: 'ratio',
        isAutoSync: true,
      };
      vi.mocked(sendMessageWithTimeout).mockImplementation(
        async (_, __, destination): Promise<StartSyncResponse> => {
          const scrollableHeight = destination.tabId === 101 ? 1000 : 2400;

          return {
            success: true,
            tabId: destination.tabId,
            metrics: {
              tabId: destination.tabId,
              scrollHeight: scrollableHeight + 1000,
              clientHeight: 1000,
              scrollableHeight,
            },
          };
        },
      );

      const result = await handler({ data: payload, sender: {} });

      expect(result).toMatchObject({ success: true, connectedTabs: [101, 102] });
      expect(isContextualHintDismissedMock).toHaveBeenCalledWith('manual-scroll-adjustment');
      expect(sendMessage).toHaveBeenCalledWith(
        'contextual-hint:show',
        {
          hintId: 'manual-scroll-adjustment',
          surface: 'webpage-overlay',
          source: 'sync-start',
        },
        { context: 'content-script', tabId: 101 },
      );
      expect(sendMessage).toHaveBeenCalledWith(
        'contextual-hint:show',
        {
          hintId: 'manual-scroll-adjustment',
          surface: 'webpage-overlay',
          source: 'sync-start',
        },
        { context: 'content-script', tabId: 102 },
      );
    });

    it('does not send manual adjustment contextual hint when dismissed', async () => {
      const handler = getHandler<StartSyncMessage>('scroll:start');
      isContextualHintDismissedMock.mockResolvedValue(true);
      vi.mocked(sendMessageWithTimeout).mockImplementation(
        async (_, __, destination): Promise<StartSyncResponse> => ({
          success: true,
          tabId: destination.tabId,
          metrics: {
            tabId: destination.tabId,
            scrollHeight: destination.tabId === 201 ? 2000 : 3400,
            clientHeight: 1000,
            scrollableHeight: destination.tabId === 201 ? 1000 : 2400,
          },
        }),
      );

      const result = await handler({
        data: { tabIds: [201, 202], mode: 'ratio', isAutoSync: true },
        sender: {},
      });

      expect(result).toMatchObject({ success: true, connectedTabs: [201, 202] });
      expect(sendMessage).not.toHaveBeenCalledWith(
        'contextual-hint:show',
        expect.anything(),
        expect.anything(),
      );
    });

    it('does not send manual adjustment contextual hint when scroll metrics are below threshold', async () => {
      const handler = getHandler<StartSyncMessage>('scroll:start');
      vi.mocked(sendMessageWithTimeout).mockImplementation(
        async (_, __, destination): Promise<StartSyncResponse> => ({
          success: true,
          tabId: destination.tabId,
          metrics: {
            tabId: destination.tabId,
            scrollHeight: destination.tabId === 301 ? 2000 : 2080,
            clientHeight: 1000,
            scrollableHeight: destination.tabId === 301 ? 1000 : 1080,
          },
        }),
      );

      const result = await handler({
        data: { tabIds: [301, 302], mode: 'ratio', isAutoSync: true },
        sender: {},
      });

      expect(result).toMatchObject({ success: true, connectedTabs: [301, 302] });
      expect(isContextualHintDismissedMock).not.toHaveBeenCalled();
      expect(sendMessage).not.toHaveBeenCalledWith(
        'contextual-hint:show',
        expect.anything(),
        expect.anything(),
      );
    });

    it('does not use inconsistent scroll metrics for manual adjustment hints', async () => {
      const handler = getHandler<StartSyncMessage>('scroll:start');
      vi.mocked(sendMessageWithTimeout).mockImplementation(
        async (_, __, destination): Promise<StartSyncResponse> => ({
          success: true,
          tabId: destination.tabId,
          metrics: {
            tabId: destination.tabId,
            scrollHeight: destination.tabId === 501 ? 2000 : 3400,
            clientHeight: 1000,
            scrollableHeight: destination.tabId === 501 ? 1000 : 9999,
          },
        }),
      );

      const result = await handler({
        data: { tabIds: [501, 502], mode: 'ratio', isAutoSync: true },
        sender: {},
      });

      expect(result).toMatchObject({ success: true, connectedTabs: [501, 502] });
      expect(isContextualHintDismissedMock).not.toHaveBeenCalled();
      expect(sendMessage).not.toHaveBeenCalledWith(
        'contextual-hint:show',
        expect.anything(),
        expect.anything(),
      );
    });

    it('does not fail sync start when manual adjustment contextual hint send fails', async () => {
      const handler = getHandler<StartSyncMessage>('scroll:start');
      vi.mocked(sendMessageWithTimeout).mockImplementation(
        async (_, __, destination): Promise<StartSyncResponse> => ({
          success: true,
          tabId: destination.tabId,
          metrics: {
            tabId: destination.tabId,
            scrollHeight: destination.tabId === 401 ? 2000 : 3400,
            clientHeight: 1000,
            scrollableHeight: destination.tabId === 401 ? 1000 : 2400,
          },
        }),
      );
      vi.mocked(sendMessage).mockImplementation(async (messageId) => {
        if (messageId === 'contextual-hint:show') {
          throw new Error('receiver not registered');
        }

        return { success: true };
      });

      const result = await handler({
        data: { tabIds: [401, 402], mode: 'ratio', isAutoSync: true },
        sender: {},
      });

      expect(result).toEqual({
        success: true,
        connectedTabs: [401, 402],
        connectionResults: {
          401: { success: true },
          402: { success: true },
        },
      });
      expect(persistCommittedSyncStateLegacy).toHaveBeenCalledTimes(1);
      expect(broadcastSyncStatus).toHaveBeenCalledTimes(1);
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
      expect(persistCommittedSyncStateLegacy).toHaveBeenCalledTimes(1);
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

    it('clears addTabSuggestedTabs on sync stop', async () => {
      const handler = getHandler<StopSyncMessage>('scroll:stop');
      syncState.isActive = true;
      syncState.linkedTabs = [1, 2];
      addTabSuggestedTabs.add(10);
      addTabSuggestedTabs.add(20);

      await handler({
        data: { tabIds: [1, 2], isAutoSync: true },
        sender: {},
      });

      expect(addTabSuggestedTabs.size).toBe(0);
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
    it.each([
      {
        name: 'staged but uncommitted Add tab',
        sender: { tabId: 3 },
        sourceTabId: 3,
        sessionEpoch: 4,
      },
      {
        name: 'wrong sender',
        sender: { tabId: 2 },
        sourceTabId: 1,
        sessionEpoch: 4,
      },
      {
        name: 'missing sender',
        sender: {},
        sourceTabId: 1,
        sessionEpoch: 4,
      },
      {
        name: 'stale epoch',
        sender: { tabId: 1 },
        sourceTabId: 1,
        sessionEpoch: 3,
      },
    ])('rejects $name without relay or state mutation', async (identity) => {
      const handler = getHandler<ScrollSyncMessage>('scroll:sync');
      syncState.isActive = true;
      syncState.linkedTabs = [1, 2];
      syncState.connectionStatuses = { 1: 'connected', 2: 'connected' };
      syncState.sessionEpoch = 4;
      const beforeStatuses = { ...syncState.connectionStatuses };

      const result = await handler({
        data: {
          isAutoSync: false,
          sourceTabId: identity.sourceTabId,
          sessionEpoch: identity.sessionEpoch,
          mode: 'ratio',
          scrollTop: 120,
          scrollHeight: 1000,
          clientHeight: 600,
          timestamp: 10,
        },
        sender: identity.sender,
      });

      expect(result).toEqual({ success: false, reason: 'unauthorized-session' });
      expect(sendMessage).not.toHaveBeenCalled();
      expect(getAutoSyncGroupMembers).not.toHaveBeenCalled();
      expect(syncState.connectionStatuses).toEqual(beforeStatuses);
    });

    it('relays scroll sync to linked tabs excluding the source tab', async () => {
      const handler = getHandler<ScrollSyncMessage>('scroll:sync');
      syncState.isActive = true;
      syncState.linkedTabs = [1, 2, 3];
      syncState.sessionEpoch = 5;
      const payload: ScrollSyncMessage = {
        isAutoSync: false,
        sessionEpoch: 5,
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
        isAutoSync: true,
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
      syncState.isActive = true;
      syncState.linkedTabs = [40];
      syncState.sessionEpoch = 6;
      const payload: ScrollSyncMessage = {
        isAutoSync: false,
        sessionEpoch: 6,
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
      syncState.isActive = true;
      syncState.linkedTabs = [55, 56];
      syncState.sessionEpoch = 7;
      const payload: ManualScrollMessage = {
        isAutoSync: false,
        sourceTabId: 55,
        sessionEpoch: 7,
        tabId: 55,
        enabled: true,
      };

      const result = await handler({ data: payload, sender: { tabId: 55 } });

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
      syncState.isActive = true;
      syncState.linkedTabs = [61, 62, 63];
      syncState.sessionEpoch = 8;
      const payload: UrlSyncMessage = {
        isAutoSync: false,
        sessionEpoch: 8,
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

  describe('sync:url-mode-changed', () => {
    it('relays URL sync mode changes to linked tabs except sender.tabId', async () => {
      const handler = getHandler<UrlSyncModeChangedMessage>('sync:url-mode-changed');
      syncState.linkedTabs = [81, 82, 83];
      const payload: UrlSyncModeChangedMessage = {
        mode: 'keep-each-tabs-website',
      };

      const result = await handler({ data: payload, sender: { tabId: 81 } });

      expect(result).toEqual({ success: true });
      expect(sendMessage).toHaveBeenCalledTimes(2);
      expect(sendMessage).toHaveBeenCalledWith('sync:url-mode-changed', payload, {
        context: 'content-script',
        tabId: 82,
      });
      expect(sendMessage).toHaveBeenCalledWith('sync:url-mode-changed', payload, {
        context: 'content-script',
        tabId: 83,
      });
    });

    it('relays popup mode changes to all linked tabs when sender has no tabId', async () => {
      const handler = getHandler<UrlSyncModeChangedMessage>('sync:url-mode-changed');
      syncState.linkedTabs = [91, 92];
      const payload: UrlSyncModeChangedMessage = {
        mode: 'follow-changed-tab',
        notice: { key: 'urlSyncModeResetNotice', severity: 'warning' },
      };

      const result = await handler({ data: payload, sender: {} });

      expect(result).toEqual({ success: true });
      expect(sendMessage).toHaveBeenCalledTimes(2);
      expect(sendMessage).toHaveBeenCalledWith('sync:url-mode-changed', payload, {
        context: 'content-script',
        tabId: 91,
      });
      expect(sendMessage).toHaveBeenCalledWith('sync:url-mode-changed', payload, {
        context: 'content-script',
        tabId: 92,
      });
    });
  });
});
