import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendMessage } from 'webext-bridge/background';
import browser from 'webextension-polyfill';

import type {
  ContentRuntimeDegradedMessage,
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
  broadcastAutoSyncGroupUpdate,
  getAutoSyncGroupMembers,
  removeTabFromAllAutoSyncGroups,
  stopAutoSyncForGroup,
  updateAutoSyncGroup,
} from '../lib/auto-sync-groups';
import {
  addTabSuggestedTabs,
  autoSyncState,
  manualSyncOverriddenTabs,
  pendingSuggestions,
  withAutoSyncLock,
} from '../lib/auto-sync-state';
import { isContentScriptAlive } from '../lib/content-script-manager';
import {
  consumePendingUrlSyncContextualHint,
  savePendingUrlSyncContextualHint,
} from '../lib/contextual-hint-state';
import { startKeepAlive, stopKeepAlive } from '../lib/keep-alive';
import { sendMessageWithTimeout } from '../lib/messaging';
import {
  broadcastSyncStatus,
  commitSyncState,
  getSyncStateSnapshot,
  persistSyncState,
  syncState,
} from '../lib/sync-state';
import { syncTransitionGate } from '../lib/sync-transition-gate';

import { registerScrollSyncHandlers } from './scroll-sync-handlers';

type MessageSender = { tabId?: number };
type MessageEnvelope<TData> = { data: TData; sender: MessageSender };
type RegisteredMessageHandler<TData = unknown> = (
  message: MessageEnvelope<TData>,
) => Promise<unknown>;

const {
  messageHandlers,
  onMessageMock,
  sendMessageMock,
  tabsGetMock,
  tabsQueryMock,
  executeScriptMock,
} = vi.hoisted(() => ({
  messageHandlers: new Map<string, (...args: never[]) => unknown>(),
  onMessageMock: vi.fn(),
  sendMessageMock: vi.fn(),
  tabsGetMock: vi.fn(),
  tabsQueryMock: vi.fn(),
  executeScriptMock: vi.fn(),
}));

const { isContextualHintDismissedMock } = vi.hoisted(() => ({
  isContextualHintDismissedMock: vi.fn(),
}));

const { getManualReadinessSnapshotMock, waitForBackgroundInitializationMock } = vi.hoisted(() => ({
  getManualReadinessSnapshotMock: vi.fn(),
  waitForBackgroundInitializationMock: vi.fn(),
}));

const { transitionEvents } = vi.hoisted((): { transitionEvents: Array<string> } => ({
  transitionEvents: [],
}));

const { quickSyncCoordinatorMock } = vi.hoisted(() => ({
  quickSyncCoordinatorMock: {
    invalidateCandidate: vi.fn().mockResolvedValue(false),
  },
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
    scripting: {
      executeScript: executeScriptMock,
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
  broadcastAutoSyncGroupUpdate: vi.fn(),
  removeTabFromAllAutoSyncGroups: vi.fn(),
  getAutoSyncGroupMembers: vi.fn(),
  stopAutoSyncForGroup: vi.fn(),
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
  withAutoSyncLock: vi.fn(async (operation: () => Promise<unknown>) => {
    transitionEvents.push('auto-lock');
    return operation();
  }),
}));

vi.mock('../lib/contextual-hint-state', () => ({
  consumePendingUrlSyncContextualHint: vi.fn(),
  savePendingUrlSyncContextualHint: vi.fn(),
}));

vi.mock('../lib/content-script-manager', () => ({
  isContentScriptAlive: vi.fn(),
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
  getSyncStateSnapshot: vi.fn(),
  commitSyncState: vi.fn(),
  persistSyncState: vi.fn(),
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
      ) => {
        transitionEvents.push('transition-gate');
        return transition({
          operationGeneration: 1,
          expectedRevision: syncState.revision,
        });
      },
    ),
  },
}));

vi.mock('./quick-sync-command-handler', () => ({
  quickSyncCoordinator: quickSyncCoordinatorMock,
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
    transitionEvents.splice(0);

    onMessageMock.mockImplementation(
      (messageId: string, handler: (...args: never[]) => unknown) => {
        messageHandlers.set(messageId, handler);
      },
    );

    sendMessageMock.mockImplementation(
      async (messageId: string, _data: unknown, destination: unknown) => {
        if (
          messageId === 'scroll:stop' &&
          typeof destination === 'object' &&
          destination !== null
        ) {
          const tabId = Reflect.get(destination, 'tabId');
          return { success: true, tabId };
        }
        return { success: true };
      },
    );
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
    vi.mocked(browser.scripting.executeScript).mockResolvedValue([]);
    vi.mocked(getAutoSyncGroupMembers).mockReturnValue([]);
    vi.mocked(broadcastAutoSyncGroupUpdate).mockResolvedValue();
    vi.mocked(removeTabFromAllAutoSyncGroups).mockResolvedValue();
    vi.mocked(stopAutoSyncForGroup).mockImplementation(async (groupKey) => {
      const group = autoSyncState.groups.get(groupKey);
      if (group) {
        group.isActive = false;
      }
    });
    vi.mocked(updateAutoSyncGroup).mockResolvedValue(null);
    vi.mocked(isContentScriptAlive).mockResolvedValue(true);
    vi.mocked(getSyncStateSnapshot).mockImplementation(() => ({
      ...syncState,
      linkedTabs: [...syncState.linkedTabs],
      connectionStatuses: { ...syncState.connectionStatuses },
    }));
    vi.mocked(commitSyncState).mockImplementation((nextState) => {
      syncState.isActive = nextState.isActive;
      syncState.linkedTabs = [...nextState.linkedTabs];
      syncState.connectionStatuses = { ...nextState.connectionStatuses };
      syncState.lastActiveSyncedTabId = nextState.lastActiveSyncedTabId;
      syncState.revision = nextState.revision;
      syncState.sessionEpoch = nextState.sessionEpoch;
      syncState.mode = nextState.mode;
    });
    vi.mocked(persistSyncState).mockResolvedValue({ status: 'persisted' });
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
            autoSyncGeneration: '11111111-1111-4111-8111-111111111111',
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
      expect(persistSyncState).not.toHaveBeenCalled();
    });

    it('rejects scroll:manual immediately while manual readiness is unavailable', async () => {
      getManualReadinessSnapshotMock.mockReturnValue('unavailable');
      waitForBackgroundInitializationMock.mockReturnValue(new Promise(() => undefined));
      const handler = getHandler<ManualScrollMessage>('scroll:manual');

      await expectImmediateUnavailable(
        handler({
          data: {
            isAutoSync: true,
            sourceTabId: 7,
            autoSyncGeneration: '11111111-1111-4111-8111-111111111111',
            tabId: 7,
            enabled: true,
          },
          sender: { tabId: 7 },
        }),
      );

      expect(waitForBackgroundInitializationMock).not.toHaveBeenCalled();
      expect(sendMessage).not.toHaveBeenCalled();
      expect(browser.tabs.get).not.toHaveBeenCalled();
      expect(persistSyncState).not.toHaveBeenCalled();
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
            autoSyncGeneration: '11111111-1111-4111-8111-111111111111',
            url: 'https://example.com/private',
          },
          sender: { tabId: 8 },
        }),
      );

      expect(waitForBackgroundInitializationMock).not.toHaveBeenCalled();
      expect(sendMessage).not.toHaveBeenCalled();
      expect(browser.tabs.get).not.toHaveBeenCalled();
      expect(persistSyncState).not.toHaveBeenCalled();
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
      expect(persistSyncState).not.toHaveBeenCalled();
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
    it('invalidates the candidate inside the committed popup Start transition', async () => {
      const handler = getHandler<StartSyncMessage>('scroll:start');

      await handler({
        data: { tabIds: [11, 22], mode: 'ratio' },
        sender: {},
      });

      expect(quickSyncCoordinatorMock.invalidateCandidate).toHaveBeenCalledWith(
        expect.objectContaining({ operationGeneration: 1 }),
        'consumed',
      );
      expect(syncTransitionGate.run).toHaveBeenCalledTimes(1);
    });

    it('retains the candidate when popup Start persistence is rejected', async () => {
      vi.mocked(persistSyncState).mockResolvedValue({ status: 'storage-error' });
      const handler = getHandler<StartSyncMessage>('scroll:start');

      await handler({
        data: { tabIds: [11, 22], mode: 'ratio' },
        sender: {},
      });

      expect(quickSyncCoordinatorMock.invalidateCandidate).not.toHaveBeenCalled();
    });

    it('runs popup manual Start through the transition gate before the auto lock', async () => {
      const handler = getHandler<StartSyncMessage>('scroll:start');

      const result = await handler({
        data: { tabIds: [11, 22], mode: 'ratio' },
        sender: {},
      });

      expect(result).toEqual({
        success: true,
        connectedTabs: [11, 22],
        connectionResults: {
          11: { success: true },
          22: { success: true },
        },
        revision: 1,
      });
      expect(transitionEvents.slice(0, 2)).toEqual(['transition-gate', 'auto-lock']);
      expect(syncTransitionGate.run).toHaveBeenCalledTimes(1);
      expect(withAutoSyncLock).toHaveBeenCalled();
      expect(persistSyncState).toHaveBeenCalledWith({
        isActive: true,
        linkedTabs: [11, 22],
        connectionStatuses: { 11: 'connected', 22: 'connected' },
        mode: 'ratio',
        lastActiveSyncedTabId: null,
        revision: 1,
        sessionEpoch: 1,
      });
      expect(sendMessageWithTimeout).toHaveBeenCalledWith(
        'scroll:start',
        {
          tabIds: [11, 22],
          mode: 'ratio',
          currentTabId: 11,
          isAutoSync: false,
          sessionEpoch: 1,
        },
        { context: 'content-script', tabId: 11 },
        1_000,
      );
    });

    it('preserves popup partial connection details while cleaning the rejected staged tab', async () => {
      const handler = getHandler<StartSyncMessage>('scroll:start');
      vi.mocked(sendMessageWithTimeout).mockImplementation(async (message, __, destination) =>
        message === 'scroll:start' && destination.tabId === 33
          ? { success: false, tabId: 33 }
          : { success: true, tabId: destination.tabId },
      );

      const result = await handler({
        data: { tabIds: [11, 22, 33], mode: 'ratio' },
        sender: {},
      });

      expect(result).toEqual({
        success: true,
        connectedTabs: [11, 22],
        connectionResults: {
          11: { success: true },
          22: { success: true },
          33: { success: false, error: 'Invalid acknowledgment' },
        },
        revision: 1,
      });
      expect(syncState.revision).toBe(1);
      expect(syncState.sessionEpoch).toBe(1);
      expect(sendMessageWithTimeout).toHaveBeenCalledWith(
        'scroll:stop',
        { tabIds: [33], isAutoSync: false },
        { context: 'content-script', tabId: 33 },
        1_000,
      );
    });

    it('passes through an invalid staged Stop acknowledgement as a degraded popup warning', async () => {
      const handler = getHandler<StartSyncMessage>('scroll:start');
      vi.mocked(sendMessageWithTimeout).mockImplementation(async (message, __, destination) => {
        if (message === 'scroll:start' && destination.tabId === 33) {
          return { success: false, tabId: 33 };
        }
        if (message === 'scroll:stop') {
          return { success: false, tabId: destination.tabId };
        }
        return { success: true, tabId: destination.tabId };
      });

      const result = await handler({
        data: { tabIds: [11, 22, 33], mode: 'ratio' },
        sender: {},
      });

      expect(result).toEqual({
        success: true,
        connectedTabs: [11, 22],
        connectionResults: {
          11: { success: true },
          22: { success: true },
          33: { success: false, error: 'Invalid acknowledgment' },
        },
        revision: 1,
        warning: 'auto-sync-degraded',
      });
      expect(syncState.linkedTabs).toEqual([11, 22]);
    });

    it('injects a missing content script before sending popup manual Start', async () => {
      const handler = getHandler<StartSyncMessage>('scroll:start');
      vi.mocked(isContentScriptAlive).mockResolvedValueOnce(false).mockResolvedValue(true);

      const result = await handler({
        data: { tabIds: [11, 22], mode: 'ratio' },
        sender: {},
      });

      expect(result).toMatchObject({ success: true, connectedTabs: [11, 22] });
      expect(browser.scripting.executeScript).toHaveBeenCalledWith({
        target: { tabId: 11 },
        files: ['dist/contentScripts/index.global.js'],
      });
      expect(sendMessageWithTimeout).toHaveBeenCalledWith(
        'scroll:start',
        expect.objectContaining({ currentTabId: 11, sessionEpoch: 1 }),
        { context: 'content-script', tabId: 11 },
        1_000,
      );
    });

    it('does not publish popup manual state when persistence fails', async () => {
      const handler = getHandler<StartSyncMessage>('scroll:start');
      vi.mocked(persistSyncState).mockResolvedValue({ status: 'storage-error' });

      const result = await handler({
        data: { tabIds: [11, 22], mode: 'ratio' },
        sender: {},
      });

      expect(result).toEqual({
        success: false,
        connectedTabs: [11, 22],
        connectionResults: {
          11: { success: true },
          22: { success: true },
        },
        revision: 0,
        error: 'Failed to persist synchronization state',
      });
      expect(syncState).toMatchObject({
        isActive: false,
        linkedTabs: [],
        connectionStatuses: {},
        revision: 0,
        sessionEpoch: 0,
      });
      expect(broadcastSyncStatus).not.toHaveBeenCalled();
      expect(startKeepAlive).not.toHaveBeenCalled();
    });

    it('rejects obsolete background auto-start requests without changing manual state', async () => {
      const handler = getHandler<StartSyncMessage>('scroll:start');
      const payload: StartSyncMessage = {
        tabIds: [1, 2, 3],
        mode: 'ratio',
        isAutoSync: true,
      };

      const result = await handler({ data: payload, sender: {} });

      expect(result).toEqual({
        success: false,
        connectedTabs: [],
        connectionResults: {},
        revision: 0,
        error: 'Accepted auto-sync must use the auto-sync adapter',
      });
      expect(syncState.isActive).toBe(false);
      expect(syncState.linkedTabs).toEqual([]);
      expect(syncState.connectionStatuses).toEqual({});
      expect(sendMessageWithTimeout).not.toHaveBeenCalled();
      expect(startKeepAlive).not.toHaveBeenCalled();
      expect(persistSyncState).not.toHaveBeenCalled();
      expect(broadcastSyncStatus).not.toHaveBeenCalled();
    });

    it('does not stage or roll back tabs for obsolete background auto-start requests', async () => {
      const handler = getHandler<StartSyncMessage>('scroll:start');
      const payload: StartSyncMessage = {
        tabIds: [10, 20],
        mode: 'ratio',
        isAutoSync: true,
      };

      const result = await handler({ data: payload, sender: {} });

      expect(result).toEqual({
        success: false,
        connectedTabs: [],
        connectionResults: {},
        revision: 0,
        error: 'Accepted auto-sync must use the auto-sync adapter',
      });
      expect(sendMessage).not.toHaveBeenCalled();
      expect(sendMessageWithTimeout).not.toHaveBeenCalled();
      expect(syncState.isActive).toBe(false);
      expect(syncState.linkedTabs).toEqual([]);
      expect(syncState.connectionStatuses).toEqual({});
      expect(startKeepAlive).not.toHaveBeenCalled();
      expect(persistSyncState).not.toHaveBeenCalled();
      expect(broadcastSyncStatus).not.toHaveBeenCalled();
    });

    it('marks manual sync tabs as overridden and removes their staged auto memberships', async () => {
      const handler = getHandler<StartSyncMessage>('scroll:start');
      const payload: StartSyncMessage = {
        tabIds: [5, 6],
        mode: 'ratio',
        isAutoSync: false,
      };
      autoSyncState.groups.set('manual-candidates', {
        tabIds: new Set([5, 6, 7]),
        isActive: true,
      });

      const result = await handler({ data: payload, sender: {} });

      expect(result).toMatchObject({ success: true, connectedTabs: [5, 6] });
      expect(manualSyncOverriddenTabs.has(5)).toBe(true);
      expect(manualSyncOverriddenTabs.has(6)).toBe(true);
      expect(autoSyncState.groups.get('manual-candidates')?.tabIds).toEqual(new Set([7]));
      expect(removeTabFromAllAutoSyncGroups).not.toHaveBeenCalled();
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

      expect(result).toMatchObject({
        success: false,
        error: 'Accepted auto-sync must use the auto-sync adapter',
      });
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
        isAutoSync: false,
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
        data: { tabIds: [201, 202], mode: 'ratio', isAutoSync: false },
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
        data: { tabIds: [301, 302], mode: 'ratio', isAutoSync: false },
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
        data: { tabIds: [501, 502], mode: 'ratio', isAutoSync: false },
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
        data: { tabIds: [401, 402], mode: 'ratio', isAutoSync: false },
        sender: {},
      });

      expect(result).toEqual({
        success: true,
        connectedTabs: [401, 402],
        connectionResults: {
          401: { success: true },
          402: { success: true },
        },
        revision: 1,
      });
      expect(persistSyncState).toHaveBeenCalledTimes(1);
      expect(broadcastSyncStatus).toHaveBeenCalledTimes(1);
    });
  });

  describe('scroll:stop', () => {
    it('ignores caller tab IDs and durably stops every committed linked tab', async () => {
      const handler = getHandler<{ expectedRevision: number; tabIds: Array<number> }>(
        'scroll:stop',
      );
      syncState.isActive = true;
      syncState.linkedTabs = [1, 2];
      syncState.connectionStatuses = { 1: 'connected', 2: 'connected' };
      syncState.mode = 'ratio';
      syncState.revision = 7;
      syncState.sessionEpoch = 4;

      const result = await handler({
        data: { expectedRevision: 7, tabIds: [999] },
        sender: {},
      });

      expect(result).toEqual({ status: 'committed', revision: 8 });
      expect(persistSyncState).toHaveBeenCalledWith({
        isActive: false,
        linkedTabs: [],
        connectionStatuses: {},
        lastActiveSyncedTabId: null,
        revision: 8,
        sessionEpoch: 4,
      });
      expect(sendMessageWithTimeout).toHaveBeenCalledWith(
        'scroll:stop',
        { tabIds: [1], isAutoSync: false },
        { context: 'content-script', tabId: 1 },
        1_000,
      );
      expect(sendMessageWithTimeout).toHaveBeenCalledWith(
        'scroll:stop',
        { tabIds: [2], isAutoSync: false },
        { context: 'content-script', tabId: 2 },
        1_000,
      );
      expect(stopKeepAlive).toHaveBeenCalledTimes(1);
      expect(syncState.isActive).toBe(false);
      expect(syncState.linkedTabs).toEqual([]);
      expect(syncState.connectionStatuses).toEqual({});
      expect(syncState.mode).toBeUndefined();
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

    it('rejects a stale popup Stop without sending content cleanup', async () => {
      const handler = getHandler<StopSyncMessage>('scroll:stop');
      syncState.isActive = true;
      syncState.linkedTabs = [1, 2];
      syncState.connectionStatuses = { 1: 'connected', 2: 'connected' };
      syncState.revision = 8;

      const result = await handler({
        data: { expectedRevision: 7 },
        sender: {},
      });

      expect(result).toEqual({ status: 'rejected', reason: 'stale-revision' });
      expect(persistSyncState).not.toHaveBeenCalled();
      expect(sendMessageWithTimeout).not.toHaveBeenCalledWith(
        'scroll:stop',
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
      expect(syncState.isActive).toBe(true);
    });

    it('preserves the active session when durable Stop persistence fails', async () => {
      const handler = getHandler<StopSyncMessage>('scroll:stop');
      syncState.isActive = true;
      syncState.linkedTabs = [11, 12];
      syncState.connectionStatuses = { 11: 'connected', 12: 'connected' };
      syncState.mode = 'ratio';
      syncState.revision = 9;
      syncState.sessionEpoch = 5;
      vi.mocked(persistSyncState).mockResolvedValue({ status: 'storage-error' });

      const result = await handler({ data: { expectedRevision: 9 }, sender: {} });

      expect(result).toEqual({ status: 'rejected', reason: 'persistence-failed' });
      expect(syncState).toMatchObject({
        isActive: true,
        linkedTabs: [11, 12],
        revision: 9,
        sessionEpoch: 5,
      });
      expect(stopKeepAlive).not.toHaveBeenCalled();
      expect(sendMessageWithTimeout).not.toHaveBeenCalledWith(
        'scroll:stop',
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
    });

    it('reports incomplete cleanup for a mismatched Stop acknowledgement', async () => {
      const handler = getHandler<StopSyncMessage>('scroll:stop');
      syncState.isActive = true;
      syncState.linkedTabs = [11, 12];
      syncState.connectionStatuses = { 11: 'connected', 12: 'connected' };
      syncState.mode = 'ratio';
      syncState.revision = 9;
      syncState.sessionEpoch = 5;
      vi.mocked(sendMessageWithTimeout).mockImplementation(async (message, _, destination) =>
        message === 'scroll:stop'
          ? { success: true, tabId: destination.tabId === 12 ? 99 : destination.tabId }
          : { success: true, tabId: destination.tabId },
      );

      const result = await handler({ data: { expectedRevision: 9 }, sender: {} });

      expect(result).toEqual({
        status: 'committed',
        revision: 10,
        warning: 'cleanup-incomplete',
      });
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
      const activationId = '11111111-1111-4111-8111-111111111111';
      autoSyncState.groups.set('group-a', {
        tabIds: new Set([21, 22, 30, 31]),
        isActive: true,
        activationGeneration: activationId,
      });
      vi.mocked(getAutoSyncGroupMembers).mockReturnValue([22, 30, 31]);
      const payload: ScrollSyncMessage = {
        isAutoSync: true,
        sourceTabId: 21,
        autoSyncGeneration: activationId,
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

    it('rejects a same-members auto scroll packet from the previous activation', async () => {
      const handler = getHandler<unknown>('scroll:sync');
      autoSyncState.groups.set('group-a', {
        tabIds: new Set([21, 22]),
        isActive: true,
        activationGeneration: '22222222-2222-4222-8222-222222222222',
      });
      vi.mocked(getAutoSyncGroupMembers).mockReturnValue([22]);

      const result = await handler({
        data: {
          isAutoSync: true,
          sourceTabId: 21,
          autoSyncGeneration: '11111111-1111-4111-8111-111111111111',
          mode: 'ratio',
          scrollTop: 300,
          scrollHeight: 1800,
          clientHeight: 700,
          timestamp: Date.now(),
        },
        sender: { tabId: 21 },
      });

      expect(result).toEqual({ success: false, reason: 'unauthorized-session' });
      expect(sendMessage).not.toHaveBeenCalled();
    });

    it('returns stale when a newer auto activation commits before deferred content delivery', async () => {
      const handler = getHandler<ScrollSyncMessage>('scroll:sync');
      const firstActivationId = '11111111-1111-4111-8111-111111111111';
      const replacementActivationId = '22222222-2222-4222-8222-222222222222';
      const delivery = Promise.withResolvers<{ success: false; reason: 'stale-operation' }>();
      autoSyncState.groups.set('group-a', {
        tabIds: new Set([21, 22]),
        isActive: true,
        activationGeneration: firstActivationId,
      });
      vi.mocked(getAutoSyncGroupMembers).mockReturnValue([22]);
      sendMessageMock.mockReturnValueOnce(delivery.promise);
      const payload: ScrollSyncMessage = {
        isAutoSync: true,
        sourceTabId: 21,
        autoSyncGeneration: firstActivationId,
        mode: 'ratio',
        scrollTop: 300,
        scrollHeight: 1800,
        clientHeight: 700,
        timestamp: Date.now(),
      };

      const relay = handler({ data: payload, sender: { tabId: 21 } });
      await vi.waitFor(() => {
        expect(sendMessage).toHaveBeenCalledWith('scroll:sync', payload, {
          context: 'content-script',
          tabId: 22,
        });
      });
      const group = autoSyncState.groups.get('group-a');
      if (!group) {
        throw new Error('Expected active auto group');
      }
      group.activationGeneration = replacementActivationId;
      delivery.resolve({ success: false, reason: 'stale-operation' });

      await expect(relay).resolves.toEqual({ success: false, reason: 'stale-operation' });
    });

    it.each([
      {
        name: 'missing activation identity',
        autoSyncGeneration: undefined,
      },
      {
        name: 'malformed activation identity',
        autoSyncGeneration: 'not-a-uuid',
      },
    ])('rejects an auto scroll packet with $name', async ({ autoSyncGeneration }) => {
      const handler = getHandler<unknown>('scroll:sync');
      autoSyncState.groups.set('group-a', {
        tabIds: new Set([21, 22]),
        isActive: true,
        activationGeneration: '11111111-1111-4111-8111-111111111111',
      });
      vi.mocked(getAutoSyncGroupMembers).mockReturnValue([22]);

      const result = await handler({
        data: {
          isAutoSync: true,
          sourceTabId: 21,
          ...(autoSyncGeneration === undefined ? {} : { autoSyncGeneration }),
          mode: 'ratio',
          scrollTop: 300,
          scrollHeight: 1800,
          clientHeight: 700,
          timestamp: Date.now(),
        },
        sender: { tabId: 21 },
      });

      expect(result).toEqual({ success: false, reason: 'unauthorized-session' });
      expect(sendMessage).not.toHaveBeenCalled();
    });

    it.each([
      {
        name: 'missing manual epoch',
        sessionEpoch: undefined,
      },
      {
        name: 'malformed manual epoch',
        sessionEpoch: 'four',
      },
    ])('rejects a manual scroll packet with $name', async ({ sessionEpoch }) => {
      const handler = getHandler<unknown>('scroll:sync');
      syncState.isActive = true;
      syncState.linkedTabs = [1, 2];
      syncState.sessionEpoch = 4;

      const result = await handler({
        data: {
          isAutoSync: false,
          sourceTabId: 1,
          ...(sessionEpoch === undefined ? {} : { sessionEpoch }),
          mode: 'ratio',
          scrollTop: 300,
          scrollHeight: 1800,
          clientHeight: 700,
          timestamp: Date.now(),
        },
        sender: { tabId: 1 },
      });

      expect(result).toEqual({ success: false, reason: 'unauthorized-session' });
      expect(sendMessage).not.toHaveBeenCalled();
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

    it('rejects a same-members auto manual packet from the previous activation', async () => {
      const handler = getHandler<unknown>('scroll:manual');
      autoSyncState.groups.set('group-a', {
        tabIds: new Set([55, 56]),
        isActive: true,
        activationGeneration: '22222222-2222-4222-8222-222222222222',
      });
      vi.mocked(getAutoSyncGroupMembers).mockReturnValue([56]);

      const result = await handler({
        data: {
          isAutoSync: true,
          sourceTabId: 55,
          autoSyncGeneration: '11111111-1111-4111-8111-111111111111',
          tabId: 55,
          enabled: true,
        },
        sender: { tabId: 55 },
      });

      expect(result).toEqual({ success: false, reason: 'unauthorized-session' });
      expect(sendMessage).not.toHaveBeenCalled();
    });

    it.each([
      {
        name: 'missing manual epoch',
        payload: {
          isAutoSync: false,
          sourceTabId: 55,
        },
      },
      {
        name: 'malformed auto activation identity',
        payload: {
          isAutoSync: true,
          sourceTabId: 55,
          autoSyncGeneration: 'not-a-uuid',
        },
      },
    ])('rejects a manual-mode packet with $name', async ({ payload }) => {
      const handler = getHandler<unknown>('scroll:manual');
      syncState.isActive = true;
      syncState.linkedTabs = [55, 56];
      syncState.sessionEpoch = 7;

      const result = await handler({
        data: {
          ...payload,
          tabId: 55,
          enabled: true,
        },
        sender: { tabId: 55 },
      });

      expect(result).toEqual({ success: false, reason: 'unauthorized-session' });
      expect(sendMessage).not.toHaveBeenCalled();
    });

    it('returns stale when a newer manual epoch commits before deferred content delivery', async () => {
      const handler = getHandler<ManualScrollMessage>('scroll:manual');
      const delivery = Promise.withResolvers<{ success: false; reason: 'stale-operation' }>();
      syncState.isActive = true;
      syncState.linkedTabs = [55, 56];
      syncState.sessionEpoch = 7;
      sendMessageMock.mockReturnValueOnce(delivery.promise);
      const payload: ManualScrollMessage = {
        isAutoSync: false,
        sourceTabId: 55,
        sessionEpoch: 7,
        tabId: 55,
        enabled: true,
      };

      const relay = handler({ data: payload, sender: { tabId: 55 } });
      await vi.waitFor(() => {
        expect(sendMessage).toHaveBeenCalledWith('scroll:manual', payload, {
          context: 'content-script',
          tabId: 55,
        });
      });
      syncState.sessionEpoch = 8;
      delivery.resolve({ success: false, reason: 'stale-operation' });

      await expect(relay).resolves.toEqual({ success: false, reason: 'stale-operation' });
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

    it('persists a current-epoch target reconciliation failure instead of returning success', async () => {
      const handler = getHandler<UrlSyncMessage>('url:sync');
      syncState.isActive = true;
      syncState.linkedTabs = [61, 62, 63];
      syncState.connectionStatuses = {
        61: 'connected',
        62: 'connected',
        63: 'connected',
      };
      syncState.mode = 'ratio';
      syncState.revision = 9;
      syncState.sessionEpoch = 8;
      const payload: UrlSyncMessage = {
        isAutoSync: false,
        sessionEpoch: 8,
        sourceTabId: 62,
        url: 'https://example.com/next-page',
      };
      sendMessageMock.mockImplementation(
        async (messageId: string, _data: unknown, destination: unknown) => {
          if (
            messageId === 'url:sync' &&
            typeof destination === 'object' &&
            destination !== null &&
            Reflect.get(destination, 'tabId') === 61
          ) {
            return { success: false, reason: 'offset-reconciliation-failed' };
          }
          return { success: true };
        },
      );

      const result = await handler({ data: payload, sender: { tabId: 62 } });

      expect(result).toEqual({
        success: false,
        reason: 'offset-reconciliation-failed',
        revision: 10,
      });
      expect(persistSyncState).toHaveBeenCalledWith({
        isActive: true,
        linkedTabs: [61, 62, 63],
        connectionStatuses: {
          61: 'error',
          62: 'connected',
          63: 'connected',
        },
        mode: 'ratio',
        lastActiveSyncedTabId: null,
        revision: 10,
        sessionEpoch: 8,
      });
      expect(syncState).toMatchObject({
        isActive: true,
        linkedTabs: [61, 62, 63],
        connectionStatuses: {
          61: 'error',
          62: 'connected',
          63: 'connected',
        },
        revision: 10,
        sessionEpoch: 8,
      });
      expect(broadcastSyncStatus).toHaveBeenCalledTimes(1);
    });

    it('does not let a delayed epoch-E reconciliation failure mutate epoch E+1', async () => {
      const handler = getHandler<UrlSyncMessage>('url:sync');
      const delayedFailure = Promise.withResolvers<{
        success: false;
        reason: 'offset-reconciliation-failed';
      }>();
      syncState.isActive = true;
      syncState.linkedTabs = [61, 62];
      syncState.connectionStatuses = {
        61: 'connected',
        62: 'connected',
      };
      syncState.mode = 'ratio';
      syncState.revision = 9;
      syncState.sessionEpoch = 8;
      const payload: UrlSyncMessage = {
        isAutoSync: false,
        sessionEpoch: 8,
        sourceTabId: 62,
        url: 'https://example.com/old-page',
      };
      sendMessageMock.mockReturnValueOnce(delayedFailure.promise);

      const oldRelay = handler({ data: payload, sender: { tabId: 62 } });
      await vi.waitFor(() => {
        expect(sendMessage).toHaveBeenCalledTimes(1);
      });

      syncState.isActive = true;
      syncState.linkedTabs = [71, 72];
      syncState.connectionStatuses = {
        71: 'connected',
        72: 'connected',
      };
      syncState.mode = 'element';
      syncState.revision = 10;
      syncState.sessionEpoch = 9;
      delayedFailure.resolve({
        success: false,
        reason: 'offset-reconciliation-failed',
      });

      await expect(oldRelay).resolves.toEqual({
        success: false,
        reason: 'stale-operation',
        revision: 10,
      });
      expect(syncState).toMatchObject({
        isActive: true,
        linkedTabs: [71, 72],
        connectionStatuses: {
          71: 'connected',
          72: 'connected',
        },
        mode: 'element',
        revision: 10,
        sessionEpoch: 9,
      });
      expect(persistSyncState).not.toHaveBeenCalled();
      expect(commitSyncState).not.toHaveBeenCalled();
      expect(broadcastSyncStatus).not.toHaveBeenCalled();
    });

    it('records a source runtime reconciliation failure in the authoritative session', async () => {
      const handler = getHandler<ContentRuntimeDegradedMessage>('sync:runtime-degraded');
      syncState.isActive = true;
      syncState.linkedTabs = [81, 82];
      syncState.connectionStatuses = {
        81: 'connected',
        82: 'connected',
      };
      syncState.mode = 'ratio';
      syncState.revision = 11;
      syncState.sessionEpoch = 10;
      const payload: ContentRuntimeDegradedMessage = {
        isAutoSync: false,
        sourceTabId: 81,
        sessionEpoch: 10,
        reason: 'offset-reconciliation-failed',
      };

      const result = await handler({ data: payload, sender: { tabId: 81 } });

      expect(result).toEqual({ success: true, revision: 12 });
      expect(syncState).toMatchObject({
        isActive: true,
        linkedTabs: [81, 82],
        connectionStatuses: {
          81: 'error',
          82: 'connected',
        },
        revision: 12,
        sessionEpoch: 10,
      });
    });

    it('deactivates the exact auto-sync group when a target reconciliation fails', async () => {
      const handler = getHandler<UrlSyncMessage>('url:sync');
      autoSyncState.groups.set('group-a', {
        tabIds: new Set([91, 92]),
        isActive: true,
        activationGeneration: '11111111-1111-4111-8111-111111111111',
      });
      autoSyncState.groups.set('group-b', {
        tabIds: new Set([93, 94]),
        isActive: true,
      });
      vi.mocked(getAutoSyncGroupMembers).mockReturnValue([92]);
      const payload: UrlSyncMessage = {
        isAutoSync: true,
        sourceTabId: 91,
        autoSyncGeneration: '11111111-1111-4111-8111-111111111111',
        url: 'https://example.com/auto-next',
      };
      sendMessageMock.mockResolvedValue({
        success: false,
        reason: 'offset-reconciliation-failed',
      });

      const result = await handler({ data: payload, sender: { tabId: 91 } });

      expect(result).toEqual({
        success: false,
        reason: 'offset-reconciliation-failed',
        revision: 0,
      });
      expect(autoSyncState.groups.get('group-a')?.isActive).toBe(false);
      expect(autoSyncState.groups.get('group-b')?.isActive).toBe(true);
      expect(stopAutoSyncForGroup).toHaveBeenCalledWith('group-a');
      expect(stopAutoSyncForGroup).toHaveBeenCalledTimes(1);
      expect(broadcastAutoSyncGroupUpdate).toHaveBeenCalledTimes(1);
      expect(persistSyncState).not.toHaveBeenCalled();
      expect(commitSyncState).not.toHaveBeenCalled();
    });

    it('does not let a pre-restart auto failure stop the rebuilt same-members activation', async () => {
      const handler = getHandler<UrlSyncMessage>('url:sync');
      const delayedFailure = Promise.withResolvers<{
        success: false;
        reason: 'offset-reconciliation-failed';
      }>();
      const previousWorkerGroup = {
        tabIds: new Set([91, 92]),
        isActive: true,
        activationGeneration: '11111111-1111-4111-8111-111111111111',
      };
      autoSyncState.groups.set('group-a', previousWorkerGroup);
      vi.mocked(getAutoSyncGroupMembers).mockReturnValue([92]);
      sendMessageMock.mockReturnValueOnce(delayedFailure.promise);
      const payload: UrlSyncMessage = {
        isAutoSync: true,
        sourceTabId: 91,
        autoSyncGeneration: '11111111-1111-4111-8111-111111111111',
        url: 'https://example.com/auto-old',
      };

      const oldRelay = handler({ data: payload, sender: { tabId: 91 } });
      await vi.waitFor(() => {
        expect(sendMessage).toHaveBeenCalledTimes(1);
      });

      const restartedWorkerGroup = {
        tabIds: new Set([91, 92]),
        isActive: true,
        activationGeneration: '22222222-2222-4222-8222-222222222222',
      };
      autoSyncState.groups.clear();
      autoSyncState.groups.set('group-a', restartedWorkerGroup);
      delayedFailure.resolve({
        success: false,
        reason: 'offset-reconciliation-failed',
      });

      await expect(oldRelay).resolves.toEqual({
        success: false,
        reason: 'stale-operation',
        revision: 0,
      });
      expect(previousWorkerGroup.isActive).toBe(true);
      expect(restartedWorkerGroup.isActive).toBe(true);
      expect(stopAutoSyncForGroup).not.toHaveBeenCalled();
      expect(broadcastAutoSyncGroupUpdate).not.toHaveBeenCalled();
    });

    it('does not let a pre-restart degradation message stop the rebuilt activation', async () => {
      const handler = getHandler<ContentRuntimeDegradedMessage>('sync:runtime-degraded');
      const restartedWorkerGroup = {
        tabIds: new Set([91, 92]),
        isActive: true,
        activationGeneration: '22222222-2222-4222-8222-222222222222',
      };
      autoSyncState.groups.set('group-a', restartedWorkerGroup);
      const payload: ContentRuntimeDegradedMessage = {
        isAutoSync: true,
        sourceTabId: 91,
        autoSyncGeneration: '11111111-1111-4111-8111-111111111111',
        reason: 'offset-reconciliation-failed',
      };

      await expect(handler({ data: payload, sender: { tabId: 91 } })).resolves.toEqual({
        success: false,
        reason: 'stale-operation',
        revision: 0,
      });
      expect(restartedWorkerGroup.isActive).toBe(true);
      expect(stopAutoSyncForGroup).not.toHaveBeenCalled();
      expect(broadcastAutoSyncGroupUpdate).not.toHaveBeenCalled();
    });

    it.each([
      {
        name: 'missing group identity and null payload identity',
        groupActivationGeneration: undefined,
        payloadActivationGeneration: null,
      },
      {
        name: 'malformed group and payload identities',
        groupActivationGeneration: 'not-a-uuid',
        payloadActivationGeneration: 'not-a-uuid',
      },
    ])(
      'fails closed for a direct auto degradation with $name',
      async ({ groupActivationGeneration, payloadActivationGeneration }) => {
        const handler = getHandler<unknown>('sync:runtime-degraded');
        autoSyncState.groups.set('group-a', {
          tabIds: new Set([91, 92]),
          isActive: true,
          ...(groupActivationGeneration === undefined
            ? {}
            : { activationGeneration: groupActivationGeneration }),
        });

        await expect(
          handler({
            data: {
              isAutoSync: true,
              sourceTabId: 91,
              autoSyncGeneration: payloadActivationGeneration,
              reason: 'offset-reconciliation-failed',
            },
            sender: { tabId: 91 },
          }),
        ).resolves.toEqual({
          success: false,
          reason: 'stale-operation',
          revision: 0,
        });
        expect(autoSyncState.groups.get('group-a')?.isActive).toBe(true);
        expect(stopAutoSyncForGroup).not.toHaveBeenCalled();
        expect(broadcastAutoSyncGroupUpdate).not.toHaveBeenCalled();
      },
    );
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
