import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendMessage } from 'webext-bridge/background';
import browser from 'webextension-polyfill';

import type { AutoSyncGroup } from '~/shared/types/auto-sync-state';

import {
  autoSyncState,
  dismissedUrlGroups,
  pendingSuggestions,
  suggestionSnoozeUntil,
} from './auto-sync-state';
import {
  isDomainSnoozed,
  sendSuggestionToSingleTab,
  showAddTabSuggestion,
  showSyncSuggestion,
} from './auto-sync-suggestions';
import { sendMessageWithTimeout } from './messaging';
import { syncState } from './sync-state';

const { sendMessageMock, sendMessageWithTimeoutMock, tabsGetMock, executeScriptMock, loggerMock } =
  vi.hoisted(() => ({
    sendMessageMock: vi.fn(),
    sendMessageWithTimeoutMock: vi.fn(),
    tabsGetMock: vi.fn(),
    executeScriptMock: vi.fn(),
    loggerMock: {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  }));

vi.mock('webext-bridge/background', () => ({
  sendMessage: sendMessageMock,
}));

vi.mock('webextension-polyfill', () => ({
  default: {
    tabs: {
      get: tabsGetMock,
    },
    scripting: {
      executeScript: executeScriptMock,
    },
  },
}));

vi.mock('~/shared/lib/logger', () => ({
  ExtensionLogger: vi.fn().mockImplementation(() => loggerMock),
}));

vi.mock('./auto-sync-state', () => ({
  autoSyncState: {
    enabled: true,
    groups: new Map<string, AutoSyncGroup>(),
    excludedUrls: [] as Array<string>,
  },
  dismissedUrlGroups: new Set<string>(),
  pendingSuggestions: new Set<string>(),
  suggestionSnoozeUntil: new Map<string, number>(),
}));

vi.mock('./messaging', () => ({
  sendMessageWithTimeout: sendMessageWithTimeoutMock,
}));

vi.mock('./sync-state', () => ({
  syncState: {
    isActive: false,
    linkedTabs: [] as Array<number>,
    connectionStatuses: {} as Record<number, 'connected' | 'disconnected' | 'error'>,
    lastActiveSyncedTabId: null as number | null,
  },
}));

const { normalizeUrlForAutoSyncMock, extractDomainFromUrlMock } = vi.hoisted(() => ({
  normalizeUrlForAutoSyncMock: vi.fn(),
  extractDomainFromUrlMock: vi.fn(),
}));

vi.mock('~/shared/lib/auto-sync-url-utils', () => ({
  normalizeUrlForAutoSync: normalizeUrlForAutoSyncMock,
  extractDomainFromUrl: extractDomainFromUrlMock,
}));

function createGroup(tabIds: Array<number>, isActive: boolean = false): AutoSyncGroup {
  return {
    tabIds: new Set(tabIds),
    isActive,
  };
}

function createMockTab(
  tabId: number,
  title: string = 'Tab Title',
  url: string = 'https://example.test/page',
) {
  return {
    id: tabId,
    title,
    url,
    index: 0,
    highlighted: false,
    active: false,
    pinned: false,
    incognito: false,
  };
}

describe('auto-sync-suggestions', () => {
  const mockedSendMessage = vi.mocked(sendMessage);
  const mockedSendMessageWithTimeout = vi.mocked(sendMessageWithTimeout);
  const mockedBrowser = vi.mocked(browser, true);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();

    autoSyncState.enabled = true;
    autoSyncState.groups.clear();
    autoSyncState.excludedUrls = [];
    dismissedUrlGroups.clear();
    pendingSuggestions.clear();
    suggestionSnoozeUntil.clear();

    syncState.isActive = false;
    syncState.linkedTabs = [];
    syncState.connectionStatuses = {};
    syncState.lastActiveSyncedTabId = null;

    normalizeUrlForAutoSyncMock.mockImplementation((url: string) => {
      if (!url) return null;
      return url.split('?')[0].split('#')[0] ?? null;
    });
    extractDomainFromUrlMock.mockImplementation((url: string) => {
      try {
        return new URL(url).hostname;
      } catch {
        return null;
      }
    });

    mockedBrowser.tabs.get.mockImplementation(async (tabId: number) => createMockTab(tabId));
    mockedBrowser.scripting.executeScript.mockResolvedValue([]);

    mockedSendMessage.mockResolvedValue(undefined);
    mockedSendMessageWithTimeout.mockResolvedValue({
      success: true,
      tabId: 1,
      isSyncActive: false,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('isDomainSnoozed', () => {
    it('returns false when domain has no snooze entry', () => {
      expect(isDomainSnoozed('https://example.test/page')).toBe(false);
    });

    it('returns false and deletes expired snooze entry', () => {
      suggestionSnoozeUntil.set('example.test', Date.now() - 1000);

      expect(isDomainSnoozed('https://example.test/page')).toBe(false);
      expect(suggestionSnoozeUntil.has('example.test')).toBe(false);
    });

    it('returns true when domain snooze has not expired', () => {
      suggestionSnoozeUntil.set('example.test', Date.now() + 60000);

      expect(isDomainSnoozed('https://example.test/page')).toBe(true);
    });

    it('returns false when extractDomainFromUrl returns null', () => {
      extractDomainFromUrlMock.mockReturnValueOnce(null);

      expect(isDomainSnoozed('https://example.test/page')).toBe(false);
    });
  });

  describe('showSyncSuggestion', () => {
    it('returns early when group does not exist', async () => {
      await showSyncSuggestion('https://missing.test');

      expect(mockedBrowser.tabs.get).not.toHaveBeenCalled();
      expect(mockedSendMessageWithTimeout).not.toHaveBeenCalled();
      expect(pendingSuggestions.size).toBe(0);
    });

    it('returns early when group has fewer than 2 tabs', async () => {
      autoSyncState.groups.set('https://single.test', createGroup([1]));

      await showSyncSuggestion('https://single.test');

      expect(mockedBrowser.tabs.get).not.toHaveBeenCalled();
      expect(mockedSendMessageWithTimeout).not.toHaveBeenCalled();
      expect(pendingSuggestions.size).toBe(0);
    });

    it('returns early when normalized url is dismissed', async () => {
      const normalizedUrl = 'https://dismissed.test';
      autoSyncState.groups.set(normalizedUrl, createGroup([1, 2]));
      dismissedUrlGroups.add(normalizedUrl);

      await showSyncSuggestion(normalizedUrl);

      expect(mockedBrowser.tabs.get).not.toHaveBeenCalled();
      expect(mockedSendMessageWithTimeout).not.toHaveBeenCalled();
      expect(pendingSuggestions.has(normalizedUrl)).toBe(false);
    });

    it('returns early when suggestion is already pending', async () => {
      const normalizedUrl = 'https://pending.test';
      autoSyncState.groups.set(normalizedUrl, createGroup([1, 2]));
      pendingSuggestions.add(normalizedUrl);

      await showSyncSuggestion(normalizedUrl);

      expect(mockedBrowser.tabs.get).not.toHaveBeenCalled();
      expect(mockedSendMessageWithTimeout).not.toHaveBeenCalled();
      expect(pendingSuggestions.has(normalizedUrl)).toBe(true);
    });

    it('returns early when domain is snoozed', async () => {
      const normalizedUrl = 'https://snoozed-show.test/page';
      autoSyncState.groups.set(normalizedUrl, createGroup([1, 2]));
      suggestionSnoozeUntil.set('snoozed-show.test', Date.now() + 60000);

      await showSyncSuggestion(normalizedUrl);

      expect(mockedSendMessageWithTimeout).not.toHaveBeenCalled();
      expect(pendingSuggestions.has(normalizedUrl)).toBe(false);
    });

    it('adds to pending suggestions before ping requests are sent', async () => {
      const normalizedUrl = 'https://order.test';
      autoSyncState.groups.set(normalizedUrl, createGroup([1, 2]));

      mockedSendMessageWithTimeout.mockImplementation(async (...args: unknown[]) => {
        const messageId = args[0] as string;
        if (messageId === 'scroll:ping') {
          expect(pendingSuggestions.has(normalizedUrl)).toBe(true);
          return { success: true, tabId: 1, isSyncActive: false };
        }

        return { success: true, tabId: 0, isSyncActive: false };
      });

      await showSyncSuggestion(normalizedUrl);

      expect(pendingSuggestions.has(normalizedUrl)).toBe(true);
    });

    it('gets tab titles for all tabs in group', async () => {
      const normalizedUrl = 'https://titles.test';
      autoSyncState.groups.set(normalizedUrl, createGroup([1, 2, 3]));
      mockedBrowser.tabs.get
        .mockResolvedValueOnce(createMockTab(1, 'One'))
        .mockResolvedValueOnce(createMockTab(2, 'Two'))
        .mockResolvedValueOnce(createMockTab(3, 'Three'));

      await showSyncSuggestion(normalizedUrl);

      expect(mockedBrowser.tabs.get).toHaveBeenCalledTimes(3);
      const showCalls = mockedSendMessageWithTimeout.mock.calls.filter(
        (call) => call[0] === 'sync-suggestion:show',
      );
      expect(showCalls[0]?.[1]).toMatchObject({ tabTitles: ['One', 'Two', 'Three'] });
    });

    it('falls back to Untitled when browser.tabs.get throws', async () => {
      const normalizedUrl = 'https://untitled.test';
      autoSyncState.groups.set(normalizedUrl, createGroup([1, 2]));
      mockedBrowser.tabs.get
        .mockResolvedValueOnce(createMockTab(1, 'Title 1'))
        .mockRejectedValueOnce(new Error('tab inaccessible'));

      await showSyncSuggestion(normalizedUrl);

      const showCalls = mockedSendMessageWithTimeout.mock.calls.filter(
        (call) => call[0] === 'sync-suggestion:show',
      );
      expect(showCalls[0]?.[1]).toMatchObject({ tabTitles: ['Title 1', 'Untitled'] });
    });

    it('pings all tabs in the group with 500ms timeout', async () => {
      const normalizedUrl = 'https://ping.test';
      autoSyncState.groups.set(normalizedUrl, createGroup([5, 6, 7]));

      await showSyncSuggestion(normalizedUrl);

      const pingCalls = mockedSendMessageWithTimeout.mock.calls.filter(
        (call) => call[0] === 'scroll:ping',
      );
      expect(pingCalls).toHaveLength(3);
      expect(pingCalls.map((call) => call[2])).toEqual([
        { context: 'content-script', tabId: 5 },
        { context: 'content-script', tabId: 6 },
        { context: 'content-script', tabId: 7 },
      ]);
      expect(pingCalls.every((call) => call[3] === 500)).toBe(true);
    });

    it('skips suggestion when any tab is already syncing', async () => {
      const normalizedUrl = 'https://already-syncing.test';
      autoSyncState.groups.set(normalizedUrl, createGroup([8, 9]));

      mockedSendMessageWithTimeout.mockImplementation(async (...args: unknown[]) => {
        const messageId = args[0] as string;
        const destination = args[2] as { context: 'content-script'; tabId: number };
        if (messageId === 'scroll:ping') {
          return {
            success: true,
            tabId: destination.tabId,
            isSyncActive: destination.tabId === 9,
          };
        }

        return { success: true, tabId: destination.tabId, isSyncActive: false };
      });

      await showSyncSuggestion(normalizedUrl);

      const showCalls = mockedSendMessageWithTimeout.mock.calls.filter(
        (call) => call[0] === 'sync-suggestion:show',
      );
      expect(showCalls).toHaveLength(0);
      expect(pendingSuggestions.has(normalizedUrl)).toBe(false);
    });

    it('injects content scripts into tabs that do not respond to ping', async () => {
      const normalizedUrl = 'https://inject.test';
      autoSyncState.groups.set(normalizedUrl, createGroup([10, 11, 12]));

      mockedSendMessageWithTimeout.mockImplementation(async (...args: unknown[]) => {
        const messageId = args[0] as string;
        const destination = args[2] as { context: 'content-script'; tabId: number };
        if (messageId === 'scroll:ping' && destination.tabId !== 11) {
          throw new Error('no content script');
        }

        return { success: true, tabId: destination.tabId, isSyncActive: false };
      });

      await showSyncSuggestion(normalizedUrl);

      expect(mockedBrowser.scripting.executeScript).toHaveBeenCalledTimes(2);
      expect(mockedBrowser.scripting.executeScript).toHaveBeenCalledWith({
        target: { tabId: 10 },
        files: ['dist/contentScripts/index.global.js'],
      });
      expect(mockedBrowser.scripting.executeScript).toHaveBeenCalledWith({
        target: { tabId: 12 },
        files: ['dist/contentScripts/index.global.js'],
      });
    });

    it('waits 500ms after injection before sending suggestion toast', async () => {
      vi.useFakeTimers();
      const normalizedUrl = 'https://inject-wait.test';
      autoSyncState.groups.set(normalizedUrl, createGroup([20, 21]));

      mockedSendMessageWithTimeout.mockImplementation(async (...args: unknown[]) => {
        const messageId = args[0] as string;
        if (messageId === 'scroll:ping') {
          throw new Error('ping timeout');
        }

        return { success: true, tabId: 0, isSyncActive: false };
      });

      const promise = showSyncSuggestion(normalizedUrl);
      await vi.advanceTimersByTimeAsync(0);

      const getShowCallCount = () =>
        mockedSendMessageWithTimeout.mock.calls.filter((call) => call[0] === 'sync-suggestion:show')
          .length;

      expect(getShowCallCount()).toBe(0);

      await vi.advanceTimersByTimeAsync(499);
      expect(getShowCallCount()).toBe(0);

      await vi.advanceTimersByTimeAsync(1);
      await promise;
      expect(getShowCallCount()).toBe(2);
    });

    it('sends sync-suggestion:show to all tabs in group', async () => {
      const normalizedUrl = 'https://show-all.test';
      autoSyncState.groups.set(normalizedUrl, createGroup([30, 31, 32]));

      await showSyncSuggestion(normalizedUrl);

      const showCalls = mockedSendMessageWithTimeout.mock.calls.filter(
        (call) => call[0] === 'sync-suggestion:show',
      );
      expect(showCalls).toHaveLength(3);
      expect(showCalls.map((call) => call[2])).toEqual([
        { context: 'content-script', tabId: 30 },
        { context: 'content-script', tabId: 31 },
        { context: 'content-script', tabId: 32 },
      ]);
    });

    it('uses 2000ms timeout when sending suggestion to tabs', async () => {
      const normalizedUrl = 'https://timeout-2000.test';
      autoSyncState.groups.set(normalizedUrl, createGroup([40, 41]));

      await showSyncSuggestion(normalizedUrl);

      const showCalls = mockedSendMessageWithTimeout.mock.calls.filter(
        (call) => call[0] === 'sync-suggestion:show',
      );
      expect(showCalls.every((call) => call[3] === 2000)).toBe(true);
    });

    it('removes from pending suggestions when all sends fail', async () => {
      const normalizedUrl = 'https://all-fail.test';
      autoSyncState.groups.set(normalizedUrl, createGroup([50, 51]));

      mockedSendMessageWithTimeout.mockImplementation(async (...args: unknown[]) => {
        const messageId = args[0] as string;
        if (messageId === 'scroll:ping') {
          return { success: true, tabId: 50, isSyncActive: false };
        }

        throw new Error('send failed');
      });

      await showSyncSuggestion(normalizedUrl);

      expect(pendingSuggestions.has(normalizedUrl)).toBe(false);
    });

    it('keeps pending suggestion when at least one send succeeds', async () => {
      const normalizedUrl = 'https://partial-success.test';
      autoSyncState.groups.set(normalizedUrl, createGroup([60, 61]));

      mockedSendMessageWithTimeout.mockImplementation(async (...args: unknown[]) => {
        const messageId = args[0] as string;
        const destination = args[2] as { context: 'content-script'; tabId: number };
        if (messageId === 'scroll:ping') {
          return { success: true, tabId: destination.tabId, isSyncActive: false };
        }

        if (destination.tabId === 60) {
          throw new Error('send failed');
        }

        return { success: true, tabId: destination.tabId, isSyncActive: false };
      });

      await showSyncSuggestion(normalizedUrl);

      expect(pendingSuggestions.has(normalizedUrl)).toBe(true);
    });

    it('does not inject content scripts when all tabs respond to ping', async () => {
      const normalizedUrl = 'https://no-inject-needed.test';
      autoSyncState.groups.set(normalizedUrl, createGroup([70, 71]));

      await showSyncSuggestion(normalizedUrl);

      expect(mockedBrowser.scripting.executeScript).not.toHaveBeenCalled();
    });

    it('skips suggestion when syncState.isActive and synced tabs share normalized URL', async () => {
      const normalizedUrl = 'https://active-sync.test/page';
      autoSyncState.groups.set(normalizedUrl, createGroup([100, 101, 102]));

      syncState.isActive = true;
      syncState.linkedTabs = [100, 101];

      mockedBrowser.tabs.get.mockImplementation(async (tabId: number) =>
        createMockTab(tabId, `Tab ${tabId}`, `${normalizedUrl}?lang=ko`),
      );

      await showSyncSuggestion(normalizedUrl);

      expect(mockedSendMessageWithTimeout).not.toHaveBeenCalled();
      expect(pendingSuggestions.has(normalizedUrl)).toBe(false);
    });

    it('does not skip suggestion when syncState.isActive but no synced tab matches URL', async () => {
      const normalizedUrl = 'https://unmatched.test/page';
      autoSyncState.groups.set(normalizedUrl, createGroup([110, 111]));

      syncState.isActive = true;
      syncState.linkedTabs = [200, 201];

      mockedBrowser.tabs.get.mockImplementation(async (tabId: number) => {
        if (tabId === 200 || tabId === 201) {
          return createMockTab(tabId, `Tab ${tabId}`, 'https://other.test/different');
        }
        return createMockTab(tabId, `Tab ${tabId}`, normalizedUrl);
      });

      await showSyncSuggestion(normalizedUrl);

      expect(pendingSuggestions.has(normalizedUrl)).toBe(true);
    });

    it('skips suggestion via background check even when pings would time out', async () => {
      const normalizedUrl = 'https://throttled.test/page';
      autoSyncState.groups.set(normalizedUrl, createGroup([120, 121]));

      syncState.isActive = true;
      syncState.linkedTabs = [120, 121];

      mockedBrowser.tabs.get.mockImplementation(async (tabId: number) =>
        createMockTab(tabId, `Tab ${tabId}`, `${normalizedUrl}?ref=abc`),
      );

      mockedSendMessageWithTimeout.mockRejectedValue(new Error('ping timeout'));

      await showSyncSuggestion(normalizedUrl);

      expect(mockedSendMessageWithTimeout).not.toHaveBeenCalled();
      expect(pendingSuggestions.has(normalizedUrl)).toBe(false);
    });

    it('does not skip suggestion when syncState.isActive is false', async () => {
      const normalizedUrl = 'https://inactive.test/page';
      autoSyncState.groups.set(normalizedUrl, createGroup([130, 131]));

      syncState.isActive = false;
      syncState.linkedTabs = [];

      await showSyncSuggestion(normalizedUrl);

      expect(pendingSuggestions.has(normalizedUrl)).toBe(true);
    });

    it('continues sending suggestion even when some injections fail', async () => {
      const normalizedUrl = 'https://inject-fail.test';
      autoSyncState.groups.set(normalizedUrl, createGroup([80, 81]));

      mockedSendMessageWithTimeout.mockImplementation(async (...args: unknown[]) => {
        const messageId = args[0] as string;
        if (messageId === 'scroll:ping') {
          throw new Error('ping failed');
        }

        return { success: true, tabId: 0, isSyncActive: false };
      });

      mockedBrowser.scripting.executeScript
        .mockRejectedValueOnce(new Error('injection denied'))
        .mockResolvedValueOnce([]);

      await showSyncSuggestion(normalizedUrl);

      const showCalls = mockedSendMessageWithTimeout.mock.calls.filter(
        (call) => call[0] === 'sync-suggestion:show',
      );
      expect(showCalls).toHaveLength(2);
    });
  });

  describe('sendSuggestionToSingleTab', () => {
    it('returns early when domain is snoozed', async () => {
      const group = createGroup([1, 2]);
      suggestionSnoozeUntil.set('snoozed-single.test', Date.now() + 60000);

      await sendSuggestionToSingleTab(2, 'https://snoozed-single.test/page', group);

      expect(mockedSendMessage).not.toHaveBeenCalled();
    });

    it('gets tab titles for all tabs in the group', async () => {
      const group = createGroup([1, 2, 3]);
      mockedBrowser.tabs.get
        .mockResolvedValueOnce(createMockTab(1, 'One'))
        .mockResolvedValueOnce(createMockTab(2, 'Two'))
        .mockResolvedValueOnce(createMockTab(3, 'Three'));

      await sendSuggestionToSingleTab(2, 'https://single.test', group);

      expect(mockedBrowser.tabs.get).toHaveBeenCalledTimes(3);
      expect(mockedSendMessage).toHaveBeenCalledWith(
        'sync-suggestion:show',
        {
          normalizedUrl: 'https://single.test',
          tabIds: [1, 2, 3],
          tabTitles: ['One', 'Two', 'Three'],
          tabCount: 3,
        },
        { context: 'content-script', tabId: 2 },
      );
    });

    it('falls back to Untitled title when browser.tabs.get fails', async () => {
      const group = createGroup([4, 5]);
      mockedBrowser.tabs.get
        .mockResolvedValueOnce(createMockTab(4, 'Tab Four'))
        .mockRejectedValueOnce(new Error('missing tab'));

      await sendSuggestionToSingleTab(4, 'https://fallback-single.test', group);

      expect(mockedSendMessage).toHaveBeenCalledWith(
        'sync-suggestion:show',
        expect.objectContaining({ tabTitles: ['Tab Four', 'Untitled'] }),
        { context: 'content-script', tabId: 4 },
      );
    });

    it('pings tab to check if content script is ready', async () => {
      const group = createGroup([10, 11]);

      await sendSuggestionToSingleTab(11, 'https://ping-single.test', group);

      expect(mockedSendMessage).toHaveBeenNthCalledWith(
        1,
        'ping',
        {},
        { context: 'content-script', tabId: 11 },
      );
    });

    it('injects content script when ping fails and waits 100ms before sending toast', async () => {
      vi.useFakeTimers();
      const group = createGroup([20, 21]);

      mockedSendMessage
        .mockRejectedValueOnce(new Error('no script'))
        .mockResolvedValueOnce(undefined);

      const promise = sendSuggestionToSingleTab(21, 'https://inject-single.test', group);
      await vi.advanceTimersByTimeAsync(0);

      const showCallsBeforeWait = mockedSendMessage.mock.calls.filter(
        (call) => call[0] === 'sync-suggestion:show',
      );
      expect(showCallsBeforeWait).toHaveLength(0);

      await vi.advanceTimersByTimeAsync(100);
      await promise;

      expect(mockedBrowser.scripting.executeScript).toHaveBeenCalledWith({
        target: { tabId: 21 },
        files: ['dist/contentScripts/index.global.js'],
      });
      const showCallsAfterWait = mockedSendMessage.mock.calls.filter(
        (call) => call[0] === 'sync-suggestion:show',
      );
      expect(showCallsAfterWait).toHaveLength(1);
    });

    it('does not inject content script when ping succeeds', async () => {
      const group = createGroup([30, 31]);

      await sendSuggestionToSingleTab(31, 'https://no-inject-single.test', group);

      expect(mockedBrowser.scripting.executeScript).not.toHaveBeenCalled();
      const showCalls = mockedSendMessage.mock.calls.filter(
        (call) => call[0] === 'sync-suggestion:show',
      );
      expect(showCalls).toHaveLength(1);
    });

    it('handles content script injection failure gracefully', async () => {
      const group = createGroup([40, 41]);

      mockedSendMessage.mockRejectedValueOnce(new Error('no script'));
      mockedBrowser.scripting.executeScript.mockRejectedValueOnce(new Error('cannot inject'));

      await expect(
        sendSuggestionToSingleTab(41, 'https://inject-fail-single.test', group),
      ).resolves.toBe(undefined);

      const showCalls = mockedSendMessage.mock.calls.filter(
        (call) => call[0] === 'sync-suggestion:show',
      );
      expect(showCalls).toHaveLength(0);
    });

    it('sends sync-suggestion:show to single target tab', async () => {
      const group = createGroup([50, 51, 52]);

      await sendSuggestionToSingleTab(52, 'https://send-single.test', group);

      expect(mockedSendMessage).toHaveBeenCalledWith(
        'sync-suggestion:show',
        expect.objectContaining({
          normalizedUrl: 'https://send-single.test',
          tabCount: 3,
        }),
        { context: 'content-script', tabId: 52 },
      );
    });

    it('handles send failure gracefully', async () => {
      const group = createGroup([60, 61]);

      mockedSendMessage
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('send failed'));

      await expect(
        sendSuggestionToSingleTab(61, 'https://send-fail-single.test', group),
      ).resolves.toBe(undefined);
    });
  });

  describe('showAddTabSuggestion', () => {
    it('returns early when domain is snoozed', async () => {
      syncState.linkedTabs = [1, 2];
      suggestionSnoozeUntil.set('snoozed-add-tab.test', Date.now() + 60000);

      await showAddTabSuggestion(3, 'New Tab', 'https://snoozed-add-tab.test/page');

      expect(mockedSendMessageWithTimeout).not.toHaveBeenCalled();
    });

    it('sends sync-suggestion:add-tab to all linked tabs plus new tab', async () => {
      syncState.linkedTabs = [1, 2];

      await showAddTabSuggestion(3, 'New Tab', 'https://add-tab.test');

      const addCalls = mockedSendMessageWithTimeout.mock.calls.filter(
        (call) => call[0] === 'sync-suggestion:add-tab',
      );
      expect(addCalls).toHaveLength(3);
      expect(addCalls.map((call) => call[2])).toEqual([
        { context: 'content-script', tabId: 1 },
        { context: 'content-script', tabId: 2 },
        { context: 'content-script', tabId: 3 },
      ]);
    });

    it('deduplicates target tabs when new tab already exists in linked tabs', async () => {
      syncState.linkedTabs = [7, 8, 9];

      await showAddTabSuggestion(8, 'Duplicate Tab', 'https://dedupe.test');

      const addCalls = mockedSendMessageWithTimeout.mock.calls.filter(
        (call) => call[0] === 'sync-suggestion:add-tab',
      );
      expect(addCalls).toHaveLength(3);
      expect(addCalls.map((call) => call[2])).toEqual([
        { context: 'content-script', tabId: 7 },
        { context: 'content-script', tabId: 8 },
        { context: 'content-script', tabId: 9 },
      ]);
    });

    it('returns early when unique target tab list becomes empty', async () => {
      syncState.linkedTabs = [1, 2];

      const OriginalSet = globalThis.Set;
      class EmptySet<T> extends OriginalSet<T> {
        constructor() {
          super();
        }
      }

      vi.stubGlobal('Set', EmptySet);

      await showAddTabSuggestion(3, 'No Targets', 'https://no-targets.test');

      expect(mockedSendMessageWithTimeout).not.toHaveBeenCalled();
    });

    it('uses 2000ms timeout for add-tab suggestion messages', async () => {
      syncState.linkedTabs = [10, 11];

      await showAddTabSuggestion(12, 'Timeout Tab', 'https://timeout-add-tab.test');

      const addCalls = mockedSendMessageWithTimeout.mock.calls.filter(
        (call) => call[0] === 'sync-suggestion:add-tab',
      );
      expect(addCalls.every((call) => call[3] === 2000)).toBe(true);
    });

    it('includes expected payload fields in add-tab message', async () => {
      syncState.linkedTabs = [20];

      await showAddTabSuggestion(21, 'Brand New', 'https://payload-add-tab.test');

      expect(mockedSendMessageWithTimeout).toHaveBeenCalledWith(
        'sync-suggestion:add-tab',
        {
          tabId: 21,
          tabTitle: 'Brand New',
          hasManualOffsets: false,
          normalizedUrl: 'https://payload-add-tab.test',
        },
        { context: 'content-script', tabId: 20 },
        2000,
      );
    });

    it('handles mixed success and failure results without throwing', async () => {
      syncState.linkedTabs = [30, 31];

      mockedSendMessageWithTimeout.mockImplementation(async (...args: unknown[]) => {
        const destination = args[2] as { context: 'content-script'; tabId: number };
        if (destination.tabId === 31) {
          throw new Error('tab unreachable');
        }

        return { success: true, tabId: destination.tabId, isSyncActive: false };
      });

      await expect(
        showAddTabSuggestion(32, 'Mixed Result', 'https://mixed-add-tab.test'),
      ).resolves.toBeUndefined();

      const addCalls = mockedSendMessageWithTimeout.mock.calls.filter(
        (call) => call[0] === 'sync-suggestion:add-tab',
      );
      expect(addCalls).toHaveLength(3);
    });

    it('handles all send failures without throwing', async () => {
      syncState.linkedTabs = [40, 41];
      mockedSendMessageWithTimeout.mockRejectedValue(new Error('all failed'));

      await expect(
        showAddTabSuggestion(42, 'All Failures', 'https://all-failures-add-tab.test'),
      ).resolves.toBeUndefined();
    });
  });
});
