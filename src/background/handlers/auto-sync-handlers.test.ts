import { describe, expect, it, beforeEach, vi } from 'vitest';
import browser from 'webextension-polyfill';

import { extractDomainFromUrl } from '~/shared/lib/auto-sync-url-utils';
import {
  loadExcludedDomains,
  saveExcludedDomains,
  saveSuggestionSnooze,
} from '~/shared/lib/storage';
import type { AutoSyncGroup } from '~/shared/types/auto-sync-state';

import { removeTabFromAllAutoSyncGroups, updateAutoSyncGroup } from '../lib/auto-sync-groups';
import { toggleAutoSync } from '../lib/auto-sync-lifecycle';
import {
  autoSyncState,
  addTabSuggestedTabs,
  dismissedUrlGroups,
  excludedDomains,
  manualSyncOverriddenTabs,
  pendingSuggestions,
  SUGGESTION_SNOOZE_DURATION_MS,
  suggestionSnoozeUntil,
  withAutoSyncLock,
} from '../lib/auto-sync-state';
import { startKeepAlive, stopKeepAlive } from '../lib/keep-alive';
import { sendMessageWithTimeout } from '../lib/messaging';
import {
  broadcastSyncStatus,
  commitSyncState,
  getSyncStateSnapshot,
  persistSyncState,
  syncState,
} from '../lib/sync-state';

import { registerAutoSyncHandlers } from './auto-sync-handlers';

type RegisteredMessageHandler = (payload: {
  data?: {
    enabled?: boolean;
    normalizedUrl?: string;
    accepted?: boolean;
    tabId?: number;
    snooze?: boolean;
    permanent?: boolean;
    expectedRevision?: number;
    domains?: Array<string>;
  };
  sender: { tabId?: number };
}) => Promise<unknown>;

const { messageHandlers, onMessageMock } = vi.hoisted(() => ({
  messageHandlers: new Map<string, RegisteredMessageHandler>(),
  onMessageMock: vi.fn(),
}));

const { waitForBackgroundInitializationMock } = vi.hoisted(() => ({
  waitForBackgroundInitializationMock: vi.fn(),
}));

const { quickSyncCoordinatorMock } = vi.hoisted(() => ({
  quickSyncCoordinatorMock: {
    invalidateCandidate: vi.fn().mockResolvedValue(false),
  },
}));

vi.mock('webext-bridge/background', () => ({
  onMessage: onMessageMock,
}));

vi.mock('webextension-polyfill', () => ({
  default: {
    tabs: {
      get: vi.fn(),
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

vi.mock('~/shared/lib/auto-sync-url-utils', () => ({
  extractDomainFromUrl: vi.fn(),
}));

vi.mock('~/shared/lib/storage', () => ({
  saveSuggestionSnooze: vi.fn().mockResolvedValue({}),
  saveExcludedDomains: vi.fn().mockResolvedValue(undefined),
  loadExcludedDomains: vi.fn().mockResolvedValue([]),
}));

vi.mock('../lib/auto-sync-groups', () => ({
  removeTabFromAllAutoSyncGroups: vi.fn(),
  updateAutoSyncGroup: vi.fn(),
}));

vi.mock('../lib/background-initialization', () => ({
  waitForBackgroundInitialization: waitForBackgroundInitializationMock,
}));

vi.mock('../lib/auto-sync-lifecycle', () => ({
  toggleAutoSync: vi.fn(),
}));

vi.mock('../lib/keep-alive', () => ({
  startKeepAlive: vi.fn(),
  stopKeepAlive: vi.fn(),
}));

vi.mock('../lib/auto-sync-state', () => ({
  autoSyncState: {
    enabled: false,
    groups: new Map<string, AutoSyncGroup>(),
  },
  addTabSuggestedTabs: new Set<number>(),
  manualSyncOverriddenTabs: new Set<number>(),
  dismissedUrlGroups: new Set<string>(),
  excludedDomains: new Set<string>(),
  pendingSuggestions: new Set<string>(),
  SUGGESTION_SNOOZE_DURATION_MS: 2 * 60 * 60 * 1000,
  suggestionSnoozeUntil: new Map<string, number>(),
  withAutoSyncLock: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

vi.mock('../lib/messaging', () => ({
  sendMessageWithTimeout: vi.fn(),
}));

vi.mock('../lib/sync-state', () => {
  const state = {
    isActive: false,
    linkedTabs: [] as Array<number>,
    connectionStatuses: {} as Record<number, 'connected' | 'disconnected' | 'error'>,
    lastActiveSyncedTabId: null,
    mode: undefined as 'ratio' | 'element' | undefined,
    revision: 0,
    sessionEpoch: 0,
  };

  return {
    syncState: state,
    getSyncStateSnapshot: vi.fn(() => ({
      ...state,
      linkedTabs: [...state.linkedTabs],
      connectionStatuses: { ...state.connectionStatuses },
    })),
    commitSyncState: vi.fn((nextState: typeof state) => {
      state.isActive = nextState.isActive;
      state.linkedTabs = [...nextState.linkedTabs];
      state.connectionStatuses = { ...nextState.connectionStatuses };
      state.lastActiveSyncedTabId = nextState.lastActiveSyncedTabId;
      state.mode = nextState.mode;
      state.revision = nextState.revision;
      state.sessionEpoch = nextState.sessionEpoch;
    }),
    persistSyncState: vi.fn(),
    broadcastSyncStatus: vi.fn(),
  };
});

vi.mock('./quick-sync-command-handler', () => ({
  quickSyncCoordinator: quickSyncCoordinatorMock,
}));

function getRequiredHandler(messageId: string): RegisteredMessageHandler {
  const handler = messageHandlers.get(messageId);
  if (!handler) {
    throw new Error(`Expected message handler to be registered: ${messageId}`);
  }
  return handler;
}

const readyBackground = {
  manual: { status: 'ready' as const },
  auto: { status: 'ready' as const },
};

describe('registerAutoSyncHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    messageHandlers.clear();
    syncState.sessionEpoch = 9;
    syncState.revision = 6;

    onMessageMock.mockImplementation((messageId: string, handler: RegisteredMessageHandler) => {
      messageHandlers.set(messageId, handler);
    });

    autoSyncState.enabled = false;
    autoSyncState.groups.clear();
    addTabSuggestedTabs.clear();
    manualSyncOverriddenTabs.clear();
    dismissedUrlGroups.clear();
    excludedDomains.clear();
    pendingSuggestions.clear();
    suggestionSnoozeUntil.clear();

    syncState.isActive = false;
    syncState.linkedTabs = [];
    syncState.connectionStatuses = {};
    syncState.mode = undefined;
    syncState.lastActiveSyncedTabId = null;

    vi.mocked(sendMessageWithTimeout).mockResolvedValue({ success: true });
    vi.mocked(toggleAutoSync).mockResolvedValue();
    vi.mocked(startKeepAlive).mockReset();
    vi.mocked(stopKeepAlive).mockReset();
    vi.mocked(extractDomainFromUrl).mockReset();
    vi.mocked(extractDomainFromUrl).mockImplementation((url: string) => {
      try {
        return new URL(url).hostname;
      } catch {
        return null;
      }
    });
    vi.mocked(saveSuggestionSnooze).mockReset();
    vi.mocked(saveSuggestionSnooze).mockResolvedValue({});
    vi.mocked(saveExcludedDomains).mockReset();
    vi.mocked(saveExcludedDomains).mockResolvedValue(undefined);
    vi.mocked(loadExcludedDomains).mockReset();
    vi.mocked(loadExcludedDomains).mockResolvedValue([]);
    vi.mocked(browser.tabs.get).mockResolvedValue({
      id: 1,
      index: 0,
      highlighted: false,
      active: false,
      pinned: false,
      incognito: false,
    } as browser.Tabs.Tab);
    vi.mocked(removeTabFromAllAutoSyncGroups).mockResolvedValue();
    vi.mocked(updateAutoSyncGroup).mockResolvedValue('https://example.com/page');
    vi.mocked(withAutoSyncLock).mockImplementation((fn: () => Promise<unknown>) => fn());
    vi.mocked(persistSyncState).mockResolvedValue({ status: 'persisted' });
    vi.mocked(commitSyncState).mockClear();
    vi.mocked(getSyncStateSnapshot).mockClear();
    vi.mocked(broadcastSyncStatus).mockResolvedValue();
    waitForBackgroundInitializationMock.mockResolvedValue(readyBackground);

    registerAutoSyncHandlers();
  });

  describe('background readiness', () => {
    it.each([
      { messageId: 'auto-sync:status-changed', data: { enabled: true } },
      { messageId: 'auto-sync:get-status' },
      { messageId: 'auto-sync:get-detailed-status' },
      {
        messageId: 'sync-suggestion:response',
        data: { accepted: false, normalizedUrl: 'https://example.com/page' },
      },
      {
        messageId: 'sync-suggestion:add-tab-response',
        data: { accepted: false, tabId: 7 },
      },
      {
        messageId: 'auto-sync:excluded-domains-changed',
        data: { domains: [] },
      },
      { messageId: 'auto-sync:get-excluded-domains' },
    ])('$messageId waits for initialization', async ({ messageId, data }) => {
      const handler = getRequiredHandler(messageId);

      await handler({ data, sender: { tabId: 7 } });

      expect(waitForBackgroundInitializationMock).toHaveBeenCalledTimes(1);
    });

    it('reads auto-sync status only after readiness resolves', async () => {
      const release = Promise.withResolvers<typeof readyBackground>();
      waitForBackgroundInitializationMock.mockReturnValue(release.promise);
      autoSyncState.enabled = false;
      const handler = getRequiredHandler('auto-sync:get-status');

      const response = handler({ sender: {} });
      autoSyncState.enabled = true;
      release.resolve(readyBackground);

      await expect(response).resolves.toMatchObject({ success: true, enabled: true });
    });

    it('fails closed instead of toggling auto-sync when initialization is degraded', async () => {
      waitForBackgroundInitializationMock.mockResolvedValue({
        manual: { status: 'storage-error' },
        auto: { status: 'degraded', reason: 'manual-state-unavailable' },
      });
      const handler = getRequiredHandler('auto-sync:status-changed');

      await expect(handler({ data: { enabled: true }, sender: {} })).resolves.toEqual({
        success: false,
        reason: 'initialization-unavailable',
      });
      expect(toggleAutoSync).not.toHaveBeenCalled();
    });
  });

  describe('auto-sync:status-changed', () => {
    it('calls toggleAutoSync with payload enabled and returns current state', async () => {
      vi.mocked(toggleAutoSync).mockImplementation(async (enabled: boolean) => {
        autoSyncState.enabled = enabled;
      });

      const handler = getRequiredHandler('auto-sync:status-changed');
      const response = await handler({ data: { enabled: true }, sender: {} });

      expect(toggleAutoSync).toHaveBeenCalledWith(true);
      expect(response).toEqual({ success: true, enabled: true });
    });
  });

  describe('auto-sync:get-status', () => {
    it('returns enabled state and serializes group tabIds as arrays', async () => {
      autoSyncState.enabled = true;
      autoSyncState.groups.set('https://example.com/a', {
        tabIds: new Set([1, 2]),
        isActive: true,
        matchKind: 'translated-page',
        matchConfidence: 'high',
      });
      autoSyncState.groups.set('https://example.com/b', { tabIds: new Set([3]), isActive: false });

      const handler = getRequiredHandler('auto-sync:get-status');
      const response = await handler({ sender: {} });

      expect(response).toEqual({
        success: true,
        enabled: true,
        groups: [
          {
            normalizedUrl: 'https://example.com/a',
            tabIds: [1, 2],
            isActive: true,
            matchKind: 'translated-page',
            matchConfidence: 'high',
          },
          {
            normalizedUrl: 'https://example.com/b',
            tabIds: [3],
            isActive: false,
            matchKind: undefined,
            matchConfidence: undefined,
          },
        ],
      });
    });
  });

  describe('auto-sync:get-detailed-status', () => {
    it('returns computed stats and currentTabGroup when sender tab belongs to a group', async () => {
      autoSyncState.enabled = true;
      autoSyncState.groups.set('https://example.com/a', {
        tabIds: new Set([1, 2]),
        isActive: true,
      });
      autoSyncState.groups.set('https://example.com/b', {
        tabIds: new Set([3, 4, 5]),
        isActive: false,
      });
      autoSyncState.groups.set('https://example.com/c', { tabIds: new Set([6]), isActive: true });

      const handler = getRequiredHandler('auto-sync:get-detailed-status');
      const response = await handler({ sender: { tabId: 2 } });

      expect(response).toEqual({
        success: true,
        enabled: true,
        activeGroupCount: 2,
        totalSyncedTabs: 3,
        potentialSyncTabs: 5,
        currentTabGroup: {
          tabCount: 2,
          isActive: true,
        },
      });
    });

    it('returns undefined currentTabGroup when sender tab is not in any group', async () => {
      autoSyncState.groups.set('https://example.com/a', {
        tabIds: new Set([10, 11]),
        isActive: true,
      });

      const handler = getRequiredHandler('auto-sync:get-detailed-status');
      const response = await handler({ sender: { tabId: 999 } });

      expect(response).toEqual({
        success: true,
        enabled: false,
        activeGroupCount: 1,
        totalSyncedTabs: 2,
        potentialSyncTabs: 2,
        currentTabGroup: undefined,
      });
    });
  });

  describe('sync-suggestion:response', () => {
    it('rejects stale acceptance without changing manual or auto suggestion state', async () => {
      const normalizedUrl = 'https://fixture.invalid/group';
      const group = { tabIds: new Set([10, 20]), isActive: false };
      autoSyncState.enabled = true;
      autoSyncState.groups.set(normalizedUrl, group);
      pendingSuggestions.add(normalizedUrl);
      syncState.isActive = true;
      syncState.linkedTabs = [1, 2];

      const handler = getRequiredHandler('sync-suggestion:response');
      const response = await handler({
        data: { normalizedUrl, accepted: true, expectedRevision: 5 },
        sender: {},
      });

      expect(response).toEqual({ success: false, reason: 'stale-revision' });
      expect(syncState.isActive).toBe(true);
      expect(syncState.linkedTabs).toEqual([1, 2]);
      expect(autoSyncState.groups.get(normalizedUrl)).toBe(group);
      expect(group.isActive).toBe(false);
      expect(pendingSuggestions.has(normalizedUrl)).toBe(true);
      expect(sendMessageWithTimeout).not.toHaveBeenCalled();
      expect(quickSyncCoordinatorMock.invalidateCandidate).not.toHaveBeenCalled();
    });

    it('accepted response starts auto sync, advances inactive revision, and broadcasts dismiss', async () => {
      const normalizedUrl = 'https://example.com/shared';
      autoSyncState.groups.set(normalizedUrl, { tabIds: new Set([10, 20]), isActive: false });
      autoSyncState.enabled = true;
      pendingSuggestions.add(normalizedUrl);

      vi.mocked(sendMessageWithTimeout).mockImplementation(
        async (
          messageId: string,
          _data: unknown,
          destination: { context: 'content-script'; tabId: number },
        ) => {
          if (messageId === 'scroll:start') {
            return { success: true, tabId: destination.tabId };
          }
          return { success: true, tabId: destination.tabId };
        },
      );

      const handler = getRequiredHandler('sync-suggestion:response');
      const response = await handler({
        data: { normalizedUrl, accepted: true, expectedRevision: 6 },
        sender: {},
      });

      expect(response).toEqual({ success: true, revision: 7 });
      expect(pendingSuggestions.has(normalizedUrl)).toBe(false);
      expect(manualSyncOverriddenTabs.has(10)).toBe(false);
      expect(manualSyncOverriddenTabs.has(20)).toBe(false);
      expect(autoSyncState.groups.get(normalizedUrl)?.isActive).toBe(true);
      expect(syncState.isActive).toBe(false);
      expect(syncState.linkedTabs).toEqual([]);
      expect(syncState.revision).toBe(7);
      expect(syncState.sessionEpoch).toBe(9);
      expect(sendMessageWithTimeout).toHaveBeenCalledWith(
        'scroll:start',
        expect.objectContaining({
          isAutoSync: true,
          autoSyncGeneration: expect.stringMatching(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
          ),
        }),
        expect.anything(),
        2_000,
      );
      expect(persistSyncState).toHaveBeenCalledTimes(1);
      expect(broadcastSyncStatus).not.toHaveBeenCalled();
      expect(quickSyncCoordinatorMock.invalidateCandidate).toHaveBeenCalledWith(
        expect.objectContaining({ expectedRevision: 6 }),
        'consumed',
      );
      expect(sendMessageWithTimeout).toHaveBeenCalledWith(
        'sync-suggestion:dismiss',
        { normalizedUrl },
        { context: 'content-script', tabId: 10 },
        1_000,
      );
      expect(sendMessageWithTimeout).toHaveBeenCalledWith(
        'sync-suggestion:dismiss',
        { normalizedUrl },
        { context: 'content-script', tabId: 20 },
        1_000,
      );
    });

    it('accepted response stops existing sync before starting new one', async () => {
      const newNormalizedUrl = 'https://new.test/page';
      autoSyncState.groups.set(newNormalizedUrl, { tabIds: new Set([10, 20]), isActive: false });
      pendingSuggestions.add(newNormalizedUrl);

      syncState.isActive = true;
      syncState.linkedTabs = [1, 2];
      syncState.connectionStatuses = { 1: 'connected', 2: 'connected' };
      syncState.mode = 'ratio';
      autoSyncState.enabled = true;

      vi.mocked(browser.tabs.get).mockImplementation(async (tabId: number) => {
        const urlByTabId = new Map([
          [1, 'https://old.test/one'],
          [2, 'https://old.test/two'],
        ]);

        return {
          id: tabId,
          index: 0,
          highlighted: false,
          active: false,
          pinned: false,
          incognito: false,
          url: urlByTabId.get(tabId),
        } as browser.Tabs.Tab;
      });

      vi.mocked(sendMessageWithTimeout).mockImplementation(
        async (
          messageId: string,
          _data: unknown,
          destination: { context: 'content-script'; tabId: number },
        ) => {
          if (messageId === 'scroll:stop') {
            return { success: true, tabId: destination.tabId };
          }
          if (messageId === 'scroll:start') {
            return { success: true, tabId: destination.tabId };
          }
          return { success: true, tabId: destination.tabId };
        },
      );

      const handler = getRequiredHandler('sync-suggestion:response');
      const response = await handler({
        data: { normalizedUrl: newNormalizedUrl, accepted: true, expectedRevision: 6 },
        sender: {},
      });

      expect(response).toEqual({ success: true, revision: 8 });

      // Verify scroll:stop was sent to old tabs
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

      // Verify accepted auto sync started while manual truth remains inactive
      expect(syncState.isActive).toBe(false);
      expect(syncState.linkedTabs).toEqual([]);
      expect(syncState.revision).toBe(8);
      expect(syncState.sessionEpoch).toBe(9);
      expect(autoSyncState.groups.get(newNormalizedUrl)?.isActive).toBe(true);

      // Verify old tabs are NOT in manualSyncOverriddenTabs
      expect(manualSyncOverriddenTabs.has(1)).toBe(false);
      expect(manualSyncOverriddenTabs.has(2)).toBe(false);
      expect(updateAutoSyncGroup).toHaveBeenCalledWith(1, 'https://old.test/one');
      expect(updateAutoSyncGroup).toHaveBeenCalledWith(2, 'https://old.test/two');

      // Accepted auto tabs are not manual overrides
      expect(manualSyncOverriddenTabs.has(10)).toBe(false);
      expect(manualSyncOverriddenTabs.has(20)).toBe(false);

      // Verify stopKeepAlive was called
      expect(stopKeepAlive).toHaveBeenCalled();

      // Verify addTabSuggestedTabs was cleared
      expect(addTabSuggestedTabs.size).toBe(0);

      // Verify pending suggestion was cleared
      expect(pendingSuggestions.has(newNormalizedUrl)).toBe(false);
    });

    it('marks accepted suggestion group active under the auto-sync lock', async () => {
      const normalizedUrl = 'https://locked-delete.test/page';
      autoSyncState.groups.set(normalizedUrl, { tabIds: new Set([10, 20]), isActive: false });
      autoSyncState.enabled = true;

      vi.mocked(sendMessageWithTimeout).mockImplementation(
        async (
          messageId: string,
          _data: unknown,
          destination: { context: 'content-script'; tabId: number },
        ) => {
          if (messageId === 'scroll:start') {
            return { success: true, tabId: destination.tabId };
          }
          return { success: true, tabId: destination.tabId };
        },
      );

      const handler = getRequiredHandler('sync-suggestion:response');
      await handler({
        data: { normalizedUrl, accepted: true, expectedRevision: 6 },
        sender: {},
      });

      expect(withAutoSyncLock).toHaveBeenCalled();
      expect(autoSyncState.groups.get(normalizedUrl)?.isActive).toBe(true);
    });

    it('rejected response adds URL to dismissed groups', async () => {
      const normalizedUrl = 'https://example.com/reject';
      autoSyncState.groups.set(normalizedUrl, { tabIds: new Set([1, 2]), isActive: false });

      const handler = getRequiredHandler('sync-suggestion:response');
      const response = await handler({ data: { normalizedUrl, accepted: false }, sender: {} });

      expect(response).toEqual({ success: true });
      expect(dismissedUrlGroups.has(normalizedUrl)).toBe(true);
      expect(persistSyncState).not.toHaveBeenCalled();
      expect(broadcastSyncStatus).not.toHaveBeenCalled();
    });

    it('keeps inactive manual truth when accepted auto start has fewer than two connections', async () => {
      const normalizedUrl = 'https://example.com/unstable';
      autoSyncState.groups.set(normalizedUrl, { tabIds: new Set([1, 2]), isActive: false });
      autoSyncState.enabled = true;

      vi.mocked(sendMessageWithTimeout).mockImplementation(
        async (
          messageId: string,
          _data: unknown,
          destination: { context: 'content-script'; tabId: number },
        ) => {
          if (messageId === 'scroll:start' && destination.tabId === 1) {
            return { success: true, tabId: 1 };
          }
          if (messageId === 'scroll:start' && destination.tabId === 2) {
            throw new Error('No response');
          }
          if (messageId === 'scroll:stop' && destination.tabId === 2) {
            return { success: true, tabId: 99 };
          }
          return { success: true, tabId: destination.tabId };
        },
      );

      const handler = getRequiredHandler('sync-suggestion:response');
      const response = await handler({
        data: { normalizedUrl, accepted: true, expectedRevision: 6 },
        sender: {},
      });

      expect(response).toEqual({
        success: false,
        reason: 'auto-start-failed',
        warning: 'auto-sync-degraded',
      });
      expect(syncState.isActive).toBe(false);
      expect(syncState.linkedTabs).toEqual([]);
      expect(syncState.connectionStatuses).toEqual({});
      expect(manualSyncOverriddenTabs.has(1)).toBe(false);
      expect(manualSyncOverriddenTabs.has(2)).toBe(false);
      expect(autoSyncState.groups.has(normalizedUrl)).toBe(true);
      expect(autoSyncState.groups.get(normalizedUrl)?.isActive).toBe(false);
      expect(sendMessageWithTimeout).toHaveBeenCalledWith(
        'scroll:stop',
        { isAutoSync: true },
        { context: 'content-script', tabId: 1 },
        1_000,
      );
      expect(sendMessageWithTimeout).toHaveBeenCalledWith(
        'scroll:stop',
        { isAutoSync: true },
        { context: 'content-script', tabId: 2 },
        1_000,
      );
      expect(persistSyncState).not.toHaveBeenCalled();
      expect(broadcastSyncStatus).not.toHaveBeenCalled();
    });

    it('rejects without clearing pending state when accepted suggestion group no longer exists', async () => {
      const normalizedUrl = 'https://example.com/missing';
      autoSyncState.enabled = true;
      pendingSuggestions.add(normalizedUrl);

      const handler = getRequiredHandler('sync-suggestion:response');
      const response = await handler({
        data: { normalizedUrl, accepted: true, expectedRevision: 6 },
        sender: {},
      });

      expect(response).toEqual({ success: false, reason: 'auto-start-failed' });
      expect(pendingSuggestions.has(normalizedUrl)).toBe(true);
      expect(sendMessageWithTimeout).not.toHaveBeenCalled();
    });

    it('saves domain snooze on explicit dismiss (snooze: true)', async () => {
      const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
      const normalizedUrl = 'https://github.com/pulls';

      const handler = getRequiredHandler('sync-suggestion:response');
      const response = await handler({
        data: { normalizedUrl, accepted: false, snooze: true },
        sender: {},
      });

      expect(response).toEqual({ success: true });
      expect(suggestionSnoozeUntil.get('github.com')).toBe(
        1_000_000 + SUGGESTION_SNOOZE_DURATION_MS,
      );
      expect(saveSuggestionSnooze).toHaveBeenCalledWith(
        'github.com',
        1_000_000 + SUGGESTION_SNOOZE_DURATION_MS,
      );

      nowSpy.mockRestore();
    });

    it('does not save snooze on auto-dismiss (snooze: false)', async () => {
      const handler = getRequiredHandler('sync-suggestion:response');
      const response = await handler({
        data: { normalizedUrl: 'https://example.com/page', accepted: false, snooze: false },
        sender: {},
      });

      expect(response).toEqual({ success: true });
      expect(saveSuggestionSnooze).not.toHaveBeenCalled();
      expect(suggestionSnoozeUntil.size).toBe(0);
    });

    it('does not save snooze when accepted', async () => {
      const normalizedUrl = 'https://example.com/accepted';
      autoSyncState.groups.set(normalizedUrl, { tabIds: new Set([1, 2]), isActive: false });
      autoSyncState.enabled = true;
      vi.mocked(sendMessageWithTimeout).mockImplementation(
        async (
          _messageId: string,
          _data: unknown,
          destination: { context: 'content-script'; tabId: number },
        ) => ({ success: true, tabId: destination.tabId }),
      );

      const handler = getRequiredHandler('sync-suggestion:response');
      const response = await handler({
        data: { normalizedUrl, accepted: true, expectedRevision: 6, snooze: true },
        sender: {},
      });

      expect(response).toEqual({ success: true, revision: 7 });
      expect(saveSuggestionSnooze).not.toHaveBeenCalled();
      expect(suggestionSnoozeUntil.size).toBe(0);
    });

    it('saves permanent domain exclusion when user clicks "don\'t show again"', async () => {
      pendingSuggestions.add('https://github.com/pulls');
      autoSyncState.groups.set('https://github.com/pulls', {
        tabIds: new Set([10, 20]),
        isActive: false,
      });

      const handler = getRequiredHandler('sync-suggestion:response');
      const response = await handler({
        data: {
          normalizedUrl: 'https://github.com/pulls',
          accepted: false,
          permanent: true,
        },
        sender: { tabId: 10 },
      });

      expect(response).toEqual({ success: true });
      expect(excludedDomains.has('github.com')).toBe(true);
      expect(saveExcludedDomains).toHaveBeenCalledWith(expect.arrayContaining(['github.com']));
    });

    it('does not save permanent exclusion when normalizedUrl is missing', async () => {
      const handler = getRequiredHandler('sync-suggestion:response');
      await handler({
        data: {
          normalizedUrl: undefined as unknown as string,
          accepted: false,
          permanent: true,
        },
        sender: { tabId: 10 },
      });

      expect(excludedDomains.size).toBe(0);
      expect(saveExcludedDomains).not.toHaveBeenCalled();
      expect(quickSyncCoordinatorMock.invalidateCandidate).not.toHaveBeenCalled();
    });
  });

  describe('sync-suggestion:add-tab-response', () => {
    it('rejects stale add acceptance without changing the active session', async () => {
      autoSyncState.enabled = true;
      syncState.isActive = true;
      syncState.linkedTabs = [1, 2];
      syncState.connectionStatuses = { 1: 'connected', 2: 'connected' };

      const handler = getRequiredHandler('sync-suggestion:add-tab-response');
      const response = await handler({
        data: { tabId: 3, accepted: true, expectedRevision: 5 },
        sender: {},
      });

      expect(response).toEqual({ success: false, reason: 'stale-revision' });
      expect(syncState.linkedTabs).toEqual([1, 2]);
      expect(sendMessageWithTimeout).not.toHaveBeenCalled();
      expect(removeTabFromAllAutoSyncGroups).not.toHaveBeenCalled();
      expect(quickSyncCoordinatorMock.invalidateCandidate).not.toHaveBeenCalled();
    });

    it('starts only the accepted new tab when adding it to the manual session', async () => {
      autoSyncState.enabled = true;
      syncState.isActive = true;
      syncState.linkedTabs = [1, 2];
      syncState.connectionStatuses = { 1: 'connected', 2: 'connected' };
      syncState.mode = 'ratio';
      vi.mocked(sendMessageWithTimeout).mockImplementation(
        async (
          messageId: string,
          _data: unknown,
          destination: { context: 'content-script'; tabId: number },
        ) => ({ success: true, tabId: destination.tabId, messageId }),
      );

      const handler = getRequiredHandler('sync-suggestion:add-tab-response');
      const response = await handler({
        data: { tabId: 3, accepted: true, expectedRevision: 6 },
        sender: {},
      });

      expect(response).toMatchObject({ success: true, revision: 7 });
      const startTargets = vi
        .mocked(sendMessageWithTimeout)
        .mock.calls.filter((call) => call[0] === 'scroll:start')
        .map((call) => Reflect.get(call[2], 'tabId'));
      expect(startTargets).toEqual([3]);
      expect(sendMessageWithTimeout).toHaveBeenCalledWith(
        'scroll:start',
        {
          tabIds: [1, 2, 3],
          mode: 'ratio',
          currentTabId: 3,
          isAutoSync: false,
          sessionEpoch: 9,
        },
        { context: 'content-script', tabId: 3 },
        1_000,
      );
      expect(quickSyncCoordinatorMock.invalidateCandidate).toHaveBeenCalledWith(
        expect.objectContaining({ expectedRevision: 6 }),
        'consumed',
      );
    });

    it('accepted response adds tab to existing sync and broadcasts dismiss', async () => {
      autoSyncState.enabled = true;
      syncState.isActive = true;
      syncState.linkedTabs = [1, 2];
      syncState.connectionStatuses = { 1: 'connected', 2: 'connected' };
      syncState.mode = 'ratio';
      vi.mocked(browser.tabs.get).mockResolvedValue({
        id: 3,
        index: 0,
        highlighted: false,
        active: false,
        pinned: false,
        incognito: false,
        title: 'New tab',
      } as browser.Tabs.Tab);

      vi.mocked(sendMessageWithTimeout).mockImplementation(
        async (
          messageId: string,
          _data: unknown,
          destination: { context: 'content-script'; tabId: number },
        ) => {
          if (messageId === 'scroll:start') {
            return { success: true, tabId: destination.tabId };
          }
          return { success: true, tabId: destination.tabId };
        },
      );

      const handler = getRequiredHandler('sync-suggestion:add-tab-response');
      const response = await handler({
        data: { tabId: 3, accepted: true, expectedRevision: 6 },
        sender: {},
      });

      expect(response).toEqual({ success: true, revision: 7 });
      expect(manualSyncOverriddenTabs.has(3)).toBe(true);
      expect(syncState.linkedTabs).toEqual([1, 2, 3]);
      expect(sendMessageWithTimeout).toHaveBeenCalledWith(
        'scroll:start',
        expect.objectContaining({
          isAutoSync: false,
          sessionEpoch: 9,
        }),
        expect.anything(),
        1_000,
      );
      expect(persistSyncState).toHaveBeenCalledTimes(1);
      expect(broadcastSyncStatus).toHaveBeenCalledTimes(1);
      expect(sendMessageWithTimeout).toHaveBeenCalledWith(
        'sync-suggestion:dismiss-add-tab',
        { tabId: 3 },
        { context: 'content-script', tabId: 1 },
        1_000,
      );
      expect(sendMessageWithTimeout).toHaveBeenCalledWith(
        'sync-suggestion:dismiss-add-tab',
        { tabId: 3 },
        { context: 'content-script', tabId: 2 },
        1_000,
      );
      expect(sendMessageWithTimeout).toHaveBeenCalledWith(
        'sync-suggestion:dismiss-add-tab',
        { tabId: 3 },
        { context: 'content-script', tabId: 3 },
        1_000,
      );
    });

    it('does not persist a new tab when its scroll start ack fails', async () => {
      autoSyncState.enabled = true;
      syncState.isActive = true;
      syncState.linkedTabs = [1, 2];
      syncState.connectionStatuses = { 1: 'connected', 2: 'connected' };
      syncState.mode = 'ratio';
      manualSyncOverriddenTabs.add(1);
      manualSyncOverriddenTabs.add(2);

      vi.mocked(browser.tabs.get).mockResolvedValue({
        id: 3,
        index: 0,
        highlighted: false,
        active: false,
        pinned: false,
        incognito: false,
      } as browser.Tabs.Tab);

      vi.mocked(sendMessageWithTimeout).mockImplementation(
        async (
          messageId: string,
          _data: unknown,
          destination: { context: 'content-script'; tabId: number },
        ) => {
          if (messageId === 'scroll:start' && destination.tabId === 3) {
            return { success: false, tabId: 3 };
          }
          if (messageId === 'scroll:start') {
            return { success: true, tabId: destination.tabId };
          }
          return { success: true, tabId: destination.tabId };
        },
      );

      const handler = getRequiredHandler('sync-suggestion:add-tab-response');
      const response = await handler({
        data: { tabId: 3, accepted: true, expectedRevision: 6 },
        sender: {},
      });

      expect(response).toEqual({ success: false, reason: 'invalid-acknowledgement' });
      expect(syncState.linkedTabs).toEqual([1, 2]);
      expect(syncState.connectionStatuses[3]).toBeUndefined();
      expect(manualSyncOverriddenTabs.has(1)).toBe(true);
      expect(manualSyncOverriddenTabs.has(2)).toBe(true);
      expect(manualSyncOverriddenTabs.has(3)).toBe(false);
      expect(persistSyncState).not.toHaveBeenCalled();
      expect(broadcastSyncStatus).not.toHaveBeenCalled();
    });

    it('rejected response dismisses toast without adding tab to sync', async () => {
      syncState.isActive = true;
      syncState.linkedTabs = [100, 200];

      const handler = getRequiredHandler('sync-suggestion:add-tab-response');
      const response = await handler({ data: { tabId: 300, accepted: false }, sender: {} });

      expect(response).toEqual({ success: true });
      expect(manualSyncOverriddenTabs.has(300)).toBe(false);
      expect(removeTabFromAllAutoSyncGroups).not.toHaveBeenCalled();
      expect(syncState.linkedTabs).toEqual([100, 200]);
      expect(persistSyncState).not.toHaveBeenCalled();
      expect(broadcastSyncStatus).not.toHaveBeenCalled();
      expect(sendMessageWithTimeout).toHaveBeenCalledTimes(3);
    });

    it('returns error when target tab is unavailable', async () => {
      autoSyncState.enabled = true;
      syncState.isActive = true;
      syncState.linkedTabs = [1, 2];
      syncState.connectionStatuses = { 1: 'connected', 2: 'connected' };
      vi.mocked(browser.tabs.get).mockRejectedValue(new Error('Tab no longer exists'));

      const handler = getRequiredHandler('sync-suggestion:add-tab-response');
      const response = await handler({
        data: { tabId: 99, accepted: true, expectedRevision: 6 },
        sender: {},
      });

      expect(response).toEqual({ success: false, reason: 'content-unreachable' });
      expect(removeTabFromAllAutoSyncGroups).not.toHaveBeenCalled();
      expect(syncState.linkedTabs).toEqual([1, 2]);
      expect(persistSyncState).not.toHaveBeenCalled();
      expect(broadcastSyncStatus).not.toHaveBeenCalled();
    });

    it('ignores duplicate accepted add-tab responses for an already linked tab', async () => {
      autoSyncState.enabled = true;
      syncState.isActive = true;
      syncState.linkedTabs = [1, 2, 3];
      syncState.connectionStatuses = { 1: 'connected', 2: 'connected', 3: 'connected' };
      manualSyncOverriddenTabs.add(3);

      const handler = getRequiredHandler('sync-suggestion:add-tab-response');
      const response = await handler({
        data: { tabId: 3, accepted: true, expectedRevision: 6 },
        sender: {},
      });

      expect(response).toEqual({ success: false, reason: 'invalid-acknowledgement' });
      expect(browser.tabs.get).not.toHaveBeenCalled();
      expect(removeTabFromAllAutoSyncGroups).not.toHaveBeenCalled();
      expect(syncState.linkedTabs).toEqual([1, 2, 3]);
      expect(persistSyncState).not.toHaveBeenCalled();
      expect(broadcastSyncStatus).not.toHaveBeenCalled();
    });

    it('saves domain snooze on explicit add-tab dismiss', async () => {
      const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(2_000_000);

      syncState.isActive = true;
      syncState.linkedTabs = [100, 200];

      const handler = getRequiredHandler('sync-suggestion:add-tab-response');
      const response = await handler({
        data: {
          tabId: 300,
          accepted: false,
          snooze: true,
          normalizedUrl: 'https://github.com/issues',
        },
        sender: {},
      });

      expect(response).toEqual({ success: true });
      expect(suggestionSnoozeUntil.get('github.com')).toBe(
        2_000_000 + SUGGESTION_SNOOZE_DURATION_MS,
      );
      expect(saveSuggestionSnooze).toHaveBeenCalledWith(
        'github.com',
        2_000_000 + SUGGESTION_SNOOZE_DURATION_MS,
      );

      nowSpy.mockRestore();
    });

    it('does not save snooze when normalizedUrl is missing', async () => {
      syncState.isActive = true;
      syncState.linkedTabs = [100, 200];

      const handler = getRequiredHandler('sync-suggestion:add-tab-response');
      const response = await handler({
        data: { tabId: 300, accepted: false, snooze: true },
        sender: {},
      });

      expect(response).toEqual({ success: true });
      expect(saveSuggestionSnooze).not.toHaveBeenCalled();
      expect(suggestionSnoozeUntil.size).toBe(0);
    });

    it('saves permanent domain exclusion on add-tab "don\'t show again"', async () => {
      syncState.isActive = true;
      syncState.linkedTabs = [100, 200];

      const handler = getRequiredHandler('sync-suggestion:add-tab-response');
      const response = await handler({
        data: {
          tabId: 300,
          accepted: false,
          permanent: true,
          normalizedUrl: 'https://github.com/issues',
        },
        sender: {},
      });

      expect(response).toEqual({ success: true });
      expect(excludedDomains.has('github.com')).toBe(true);
      expect(saveExcludedDomains).toHaveBeenCalledWith(expect.arrayContaining(['github.com']));
    });

    it('does not save permanent exclusion when add-tab normalizedUrl is missing', async () => {
      syncState.isActive = true;
      syncState.linkedTabs = [100, 200];

      const handler = getRequiredHandler('sync-suggestion:add-tab-response');
      await handler({
        data: { tabId: 300, accepted: false, permanent: true },
        sender: {},
      });

      expect(excludedDomains.size).toBe(0);
      expect(saveExcludedDomains).not.toHaveBeenCalled();
    });
  });

  describe('auto-sync:excluded-domains-changed', () => {
    it('updates excludedDomains set and saves to storage', async () => {
      const handler = getRequiredHandler('auto-sync:excluded-domains-changed');
      await handler({
        data: { domains: ['github.com', 'example.com'] },
        sender: {},
      });

      expect(excludedDomains.has('github.com')).toBe(true);
      expect(excludedDomains.has('example.com')).toBe(true);
      expect(excludedDomains.size).toBe(2);
      expect(saveExcludedDomains).toHaveBeenCalledWith(['github.com', 'example.com']);
    });

    it('clears existing domains before setting new ones', async () => {
      excludedDomains.add('old-domain.com');

      const handler = getRequiredHandler('auto-sync:excluded-domains-changed');
      await handler({
        data: { domains: ['new-domain.com'] },
        sender: {},
      });

      expect(excludedDomains.has('old-domain.com')).toBe(false);
      expect(excludedDomains.has('new-domain.com')).toBe(true);
      expect(excludedDomains.size).toBe(1);
    });
  });

  describe('auto-sync:get-excluded-domains', () => {
    it('returns domains from storage', async () => {
      vi.mocked(loadExcludedDomains).mockResolvedValue(['github.com', 'twitter.com']);

      const handler = getRequiredHandler('auto-sync:get-excluded-domains');
      const response = await handler({ sender: {} });

      expect(response).toEqual({ domains: ['github.com', 'twitter.com'] });
    });

    it('returns empty array when no domains excluded', async () => {
      vi.mocked(loadExcludedDomains).mockResolvedValue([]);

      const handler = getRequiredHandler('auto-sync:get-excluded-domains');
      const response = await handler({ sender: {} });

      expect(response).toEqual({ domains: [] });
    });
  });
});
