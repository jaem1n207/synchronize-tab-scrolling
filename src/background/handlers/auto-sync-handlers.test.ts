import { describe, expect, it, beforeEach, vi } from 'vitest';
import browser from 'webextension-polyfill';

import { extractDomainFromUrl } from '~/shared/lib/auto-sync-url-utils';
import {
  loadExcludedDomains,
  saveExcludedDomains,
  saveSuggestionSnooze,
} from '~/shared/lib/storage';
import type { AutoSyncGroup } from '~/shared/types/auto-sync-state';

import { removeTabFromAllAutoSyncGroups } from '../lib/auto-sync-groups';
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
} from '../lib/auto-sync-state';
import { stopKeepAlive } from '../lib/keep-alive';
import { sendMessageWithTimeout } from '../lib/messaging';
import { broadcastSyncStatus, persistSyncState, syncState } from '../lib/sync-state';

import { registerAutoSyncHandlers } from './auto-sync-handlers';

type RegisteredMessageHandler = (payload: {
  data?: {
    enabled?: boolean;
    normalizedUrl?: string;
    accepted?: boolean;
    tabId?: number;
    snooze?: boolean;
    permanent?: boolean;
    domains?: Array<string>;
  };
  sender: { tabId?: number };
}) => Promise<unknown>;

const { messageHandlers, onMessageMock } = vi.hoisted(() => ({
  messageHandlers: new Map<string, RegisteredMessageHandler>(),
  onMessageMock: vi.fn(),
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
}));

vi.mock('../lib/auto-sync-lifecycle', () => ({
  toggleAutoSync: vi.fn(),
}));

vi.mock('../lib/keep-alive', () => ({
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
}));

vi.mock('../lib/messaging', () => ({
  sendMessageWithTimeout: vi.fn(),
}));

vi.mock('../lib/sync-state', () => ({
  syncState: {
    isActive: false,
    linkedTabs: [] as Array<number>,
    connectionStatuses: {} as Record<number, 'connected' | 'disconnected' | 'error'>,
    lastActiveSyncedTabId: null,
    mode: undefined as 'ratio' | 'element' | undefined,
  },
  persistSyncState: vi.fn(),
  broadcastSyncStatus: vi.fn(),
}));

function getRequiredHandler(messageId: string): RegisteredMessageHandler {
  const handler = messageHandlers.get(messageId);
  if (!handler) {
    throw new Error(`Expected message handler to be registered: ${messageId}`);
  }
  return handler;
}

describe('registerAutoSyncHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    messageHandlers.clear();

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
    vi.mocked(persistSyncState).mockResolvedValue();
    vi.mocked(broadcastSyncStatus).mockResolvedValue();

    registerAutoSyncHandlers();
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
      });
      autoSyncState.groups.set('https://example.com/b', { tabIds: new Set([3]), isActive: false });

      const handler = getRequiredHandler('auto-sync:get-status');
      const response = await handler({ sender: {} });

      expect(response).toEqual({
        success: true,
        enabled: true,
        groups: [
          { normalizedUrl: 'https://example.com/a', tabIds: [1, 2], isActive: true },
          { normalizedUrl: 'https://example.com/b', tabIds: [3], isActive: false },
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
          normalizedUrl: 'https://example.com/a',
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
    it('accepted response starts manual sync, clears pending suggestion, and broadcasts dismiss', async () => {
      const normalizedUrl = 'https://example.com/shared';
      autoSyncState.groups.set(normalizedUrl, { tabIds: new Set([10, 20]), isActive: false });
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
        data: { normalizedUrl, accepted: true },
        sender: {},
      });

      expect(response).toEqual({ success: true });
      expect(pendingSuggestions.has(normalizedUrl)).toBe(false);
      expect(manualSyncOverriddenTabs.has(10)).toBe(true);
      expect(manualSyncOverriddenTabs.has(20)).toBe(true);
      expect(autoSyncState.groups.has(normalizedUrl)).toBe(false);
      expect(syncState.isActive).toBe(true);
      expect(syncState.linkedTabs).toEqual([10, 20]);
      expect(persistSyncState).toHaveBeenCalledTimes(1);
      expect(broadcastSyncStatus).toHaveBeenCalledTimes(1);
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
      syncState.mode = 'ratio';

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
        data: { normalizedUrl: newNormalizedUrl, accepted: true },
        sender: {},
      });

      expect(response).toEqual({ success: true });

      // Verify scroll:stop was sent to old tabs
      expect(sendMessageWithTimeout).toHaveBeenCalledWith(
        'scroll:stop',
        { tabIds: [1, 2] },
        { context: 'content-script', tabId: 1 },
        1_000,
      );
      expect(sendMessageWithTimeout).toHaveBeenCalledWith(
        'scroll:stop',
        { tabIds: [1, 2] },
        { context: 'content-script', tabId: 2 },
        1_000,
      );

      // Verify new sync started with new tabs
      expect(syncState.isActive).toBe(true);
      expect(syncState.linkedTabs).toEqual([10, 20]);

      // Verify old tabs are NOT in manualSyncOverriddenTabs
      expect(manualSyncOverriddenTabs.has(1)).toBe(false);
      expect(manualSyncOverriddenTabs.has(2)).toBe(false);

      // Verify new tabs ARE in manualSyncOverriddenTabs
      expect(manualSyncOverriddenTabs.has(10)).toBe(true);
      expect(manualSyncOverriddenTabs.has(20)).toBe(true);

      // Verify stopKeepAlive was called
      expect(stopKeepAlive).toHaveBeenCalled();

      // Verify addTabSuggestedTabs was cleared
      expect(addTabSuggestedTabs.size).toBe(0);

      // Verify pending suggestion was cleared
      expect(pendingSuggestions.has(newNormalizedUrl)).toBe(false);
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

    it('clears sync state when accepted but fewer than two tabs connect', async () => {
      const normalizedUrl = 'https://example.com/unstable';
      autoSyncState.groups.set(normalizedUrl, { tabIds: new Set([1, 2]), isActive: false });

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
          return { success: true, tabId: destination.tabId };
        },
      );

      const handler = getRequiredHandler('sync-suggestion:response');
      const response = await handler({ data: { normalizedUrl, accepted: true }, sender: {} });

      expect(response).toEqual({ success: true });
      expect(syncState.isActive).toBe(false);
      expect(syncState.linkedTabs).toEqual([]);
      expect(syncState.connectionStatuses).toEqual({});
      expect(persistSyncState).not.toHaveBeenCalled();
      expect(broadcastSyncStatus).not.toHaveBeenCalled();
    });

    it('returns success when accepted suggestion group no longer exists', async () => {
      const normalizedUrl = 'https://example.com/missing';
      pendingSuggestions.add(normalizedUrl);

      const handler = getRequiredHandler('sync-suggestion:response');
      const response = await handler({ data: { normalizedUrl, accepted: true }, sender: {} });

      expect(response).toEqual({ success: true });
      expect(pendingSuggestions.has(normalizedUrl)).toBe(false);
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

      const handler = getRequiredHandler('sync-suggestion:response');
      const response = await handler({
        data: { normalizedUrl, accepted: true, snooze: true },
        sender: {},
      });

      expect(response).toEqual({ success: true });
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
    });
  });

  describe('sync-suggestion:add-tab-response', () => {
    it('accepted response adds tab to existing sync and broadcasts dismiss', async () => {
      syncState.isActive = true;
      syncState.linkedTabs = [1, 2];
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
      const response = await handler({ data: { tabId: 3, accepted: true }, sender: {} });

      expect(response).toEqual({ success: true });
      expect(manualSyncOverriddenTabs.has(3)).toBe(true);
      expect(removeTabFromAllAutoSyncGroups).toHaveBeenCalledWith(3);
      expect(syncState.linkedTabs).toEqual([1, 2, 3]);
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
      syncState.isActive = true;
      syncState.linkedTabs = [1, 2];
      vi.mocked(browser.tabs.get).mockRejectedValue(new Error('Tab no longer exists'));

      const handler = getRequiredHandler('sync-suggestion:add-tab-response');
      const response = await handler({ data: { tabId: 99, accepted: true }, sender: {} });

      expect(response).toEqual({ success: false, error: 'Error: Tab no longer exists' });
      expect(removeTabFromAllAutoSyncGroups).not.toHaveBeenCalled();
      expect(syncState.linkedTabs).toEqual([1, 2]);
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
