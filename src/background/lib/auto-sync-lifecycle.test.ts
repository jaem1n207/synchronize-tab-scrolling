import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AutoSyncGroup, AutoSyncState } from '~/shared/types/auto-sync-state';

const {
  sendMessageMock,
  tabsQueryMock,
  executeScriptMock,
  loggerInfoMock,
  loggerWarnMock,
  loggerErrorMock,
  loadAutoSyncEnabledMock,
  loadAutoSyncExcludedUrlsMock,
  saveAutoSyncEnabledMock,
  updateAutoSyncGroupMock,
  stopAutoSyncForGroupMock,
  broadcastAutoSyncGroupUpdateMock,
  showSyncSuggestionMock,
  autoSyncStateMock,
  autoSyncRetryTimersMock,
  dismissedUrlGroupsMock,
  pendingSuggestionsMock,
  autoSyncFlagsMock,
} = vi.hoisted(() => ({
  sendMessageMock: vi.fn(),
  tabsQueryMock: vi.fn(),
  executeScriptMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loadAutoSyncEnabledMock: vi.fn(),
  loadAutoSyncExcludedUrlsMock: vi.fn(),
  saveAutoSyncEnabledMock: vi.fn(),
  updateAutoSyncGroupMock: vi.fn(),
  stopAutoSyncForGroupMock: vi.fn(),
  broadcastAutoSyncGroupUpdateMock: vi.fn(),
  showSyncSuggestionMock: vi.fn(),
  autoSyncStateMock: {
    enabled: false as boolean,
    groups: new Map<string, AutoSyncGroup>(),
    excludedUrls: [] as Array<string>,
  } as AutoSyncState,
  autoSyncRetryTimersMock: new Map<string, ReturnType<typeof setTimeout>>(),
  dismissedUrlGroupsMock: new Set<string>(),
  pendingSuggestionsMock: new Set<string>(),
  autoSyncFlagsMock: {
    isToggling: false as boolean,
    isInitializing: false as boolean,
    pendingToggleRequest: null as boolean | null,
  },
}));

vi.mock('webext-bridge/background', () => ({
  sendMessage: sendMessageMock,
}));

vi.mock('webextension-polyfill', () => ({
  default: {
    tabs: {
      query: tabsQueryMock,
    },
    scripting: {
      executeScript: executeScriptMock,
    },
  },
}));

vi.mock('~/shared/lib/logger', () => ({
  ExtensionLogger: vi.fn().mockImplementation(() => ({
    info: loggerInfoMock,
    debug: vi.fn(),
    warn: loggerWarnMock,
    error: loggerErrorMock,
  })),
}));

vi.mock('~/shared/lib/storage', () => ({
  loadAutoSyncEnabled: loadAutoSyncEnabledMock,
  loadAutoSyncExcludedUrls: loadAutoSyncExcludedUrlsMock,
  saveAutoSyncEnabled: saveAutoSyncEnabledMock,
}));

vi.mock('./auto-sync-groups', () => ({
  updateAutoSyncGroup: updateAutoSyncGroupMock,
  stopAutoSyncForGroup: stopAutoSyncForGroupMock,
  broadcastAutoSyncGroupUpdate: broadcastAutoSyncGroupUpdateMock,
}));

vi.mock('./auto-sync-state', () => ({
  autoSyncState: autoSyncStateMock,
  autoSyncRetryTimers: autoSyncRetryTimersMock,
  dismissedUrlGroups: dismissedUrlGroupsMock,
  pendingSuggestions: pendingSuggestionsMock,
  autoSyncFlags: autoSyncFlagsMock,
}));

vi.mock('./auto-sync-suggestions', () => ({
  showSyncSuggestion: showSyncSuggestionMock,
}));

import { initializeAutoSync, toggleAutoSync } from './auto-sync-lifecycle';

function createGroup(tabIds: Array<number>, isActive = false): AutoSyncGroup {
  return {
    tabIds: new Set(tabIds),
    isActive,
  };
}

async function flushAllTimers(): Promise<void> {
  await vi.runAllTimersAsync();
  await Promise.resolve();
}

describe('auto-sync-lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    autoSyncStateMock.enabled = false;
    autoSyncStateMock.excludedUrls = [];
    autoSyncStateMock.groups.clear();

    autoSyncRetryTimersMock.clear();
    dismissedUrlGroupsMock.clear();
    pendingSuggestionsMock.clear();

    autoSyncFlagsMock.isToggling = false;
    autoSyncFlagsMock.isInitializing = false;
    autoSyncFlagsMock.pendingToggleRequest = null;

    loadAutoSyncEnabledMock.mockResolvedValue(true);
    loadAutoSyncExcludedUrlsMock.mockResolvedValue(['https://excluded.example']);
    saveAutoSyncEnabledMock.mockResolvedValue(undefined);

    tabsQueryMock.mockResolvedValue([
      { id: 1, url: 'https://site-a.example/path' },
      { id: 2, url: 'https://site-a.example/path' },
      { id: 3, url: 'https://site-b.example/path' },
      { id: 4 },
      { url: 'https://site-c.example/path' },
    ]);

    executeScriptMock.mockResolvedValue(undefined);
    broadcastAutoSyncGroupUpdateMock.mockResolvedValue(undefined);
    showSyncSuggestionMock.mockResolvedValue(undefined);
    stopAutoSyncForGroupMock.mockResolvedValue(undefined);
    sendMessageMock.mockResolvedValue(undefined);

    updateAutoSyncGroupMock.mockImplementation(async (tabId: number, url: string) => {
      const existingGroup = autoSyncStateMock.groups.get(url) ?? createGroup([]);
      existingGroup.tabIds.add(tabId);
      autoSyncStateMock.groups.set(url, existingGroup);
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('initializeAutoSync', () => {
    it('skips when already initializing', async () => {
      autoSyncFlagsMock.isInitializing = true;

      await initializeAutoSync();

      expect(loadAutoSyncEnabledMock).not.toHaveBeenCalled();
      expect(loadAutoSyncExcludedUrlsMock).not.toHaveBeenCalled();
    });

    it('sets isInitializing during execution and resets after completion', async () => {
      loadAutoSyncEnabledMock.mockImplementation(async () => {
        expect(autoSyncFlagsMock.isInitializing).toBe(true);
        return true;
      });

      const promise = initializeAutoSync();
      expect(autoSyncFlagsMock.isInitializing).toBe(true);
      await flushAllTimers();
      await promise;

      expect(autoSyncFlagsMock.isInitializing).toBe(false);
    });

    it('loads enabled state from storage when no override is provided', async () => {
      loadAutoSyncEnabledMock.mockResolvedValue(false);

      await initializeAutoSync();

      expect(loadAutoSyncEnabledMock).toHaveBeenCalledTimes(1);
      expect(autoSyncStateMock.enabled).toBe(false);
    });

    it('uses override enabled value when provided', async () => {
      const promise = initializeAutoSync(true);
      await flushAllTimers();
      await promise;

      expect(loadAutoSyncEnabledMock).not.toHaveBeenCalled();
      expect(autoSyncStateMock.enabled).toBe(true);
    });

    it('loads excluded URLs from storage', async () => {
      const excludedUrls = ['https://one.example', 'https://two.example'];
      loadAutoSyncExcludedUrlsMock.mockResolvedValue(excludedUrls);

      const promise = initializeAutoSync();
      await flushAllTimers();
      await promise;

      expect(loadAutoSyncExcludedUrlsMock).toHaveBeenCalledTimes(1);
      expect(autoSyncStateMock.excludedUrls).toEqual(excludedUrls);
    });

    it('returns early when auto-sync is disabled', async () => {
      loadAutoSyncEnabledMock.mockResolvedValue(false);

      await initializeAutoSync();

      expect(tabsQueryMock).not.toHaveBeenCalled();
      expect(updateAutoSyncGroupMock).not.toHaveBeenCalled();
      expect(broadcastAutoSyncGroupUpdateMock).not.toHaveBeenCalled();
    });

    it('queries tabs and updates groups for each valid tab', async () => {
      const promise = initializeAutoSync();
      await flushAllTimers();
      await promise;

      expect(tabsQueryMock).toHaveBeenCalledWith({});
      expect(updateAutoSyncGroupMock).toHaveBeenCalledTimes(3);
      expect(updateAutoSyncGroupMock).toHaveBeenCalledWith(
        1,
        'https://site-a.example/path',
        true,
        true,
      );
      expect(updateAutoSyncGroupMock).toHaveBeenCalledWith(
        2,
        'https://site-a.example/path',
        true,
        true,
      );
      expect(updateAutoSyncGroupMock).toHaveBeenCalledWith(
        3,
        'https://site-b.example/path',
        true,
        true,
      );
    });

    it('skips tabs that do not have both id and url', async () => {
      tabsQueryMock.mockResolvedValue([{ id: 100 }, { url: 'https://missing-id.example' }, {}]);

      const promise = initializeAutoSync();
      await flushAllTimers();
      await promise;

      expect(updateAutoSyncGroupMock).not.toHaveBeenCalled();
    });

    it('passes skipStartSync and skipBroadcast as true during tab scan', async () => {
      tabsQueryMock.mockResolvedValue([{ id: 20, url: 'https://flags.example' }]);

      const promise = initializeAutoSync();
      await flushAllTimers();
      await promise;

      expect(updateAutoSyncGroupMock).toHaveBeenCalledWith(20, 'https://flags.example', true, true);
    });

    it('injects content scripts only for groups with at least two tabs', async () => {
      autoSyncStateMock.groups.set('https://pair.example', createGroup([10, 11]));
      autoSyncStateMock.groups.set('https://single.example', createGroup([12]));
      updateAutoSyncGroupMock.mockResolvedValue(undefined);
      tabsQueryMock.mockResolvedValue([]);

      const promise = initializeAutoSync(true);
      await flushAllTimers();
      await promise;

      expect(executeScriptMock).toHaveBeenCalledTimes(2);
      expect(executeScriptMock).toHaveBeenNthCalledWith(1, {
        target: { tabId: 10 },
        files: ['dist/contentScripts/index.global.js'],
      });
      expect(executeScriptMock).toHaveBeenNthCalledWith(2, {
        target: { tabId: 11 },
        files: ['dist/contentScripts/index.global.js'],
      });
    });

    it('removes tabs from a group when content script injection fails', async () => {
      autoSyncStateMock.groups.set('https://group.example', createGroup([31, 32, 33]));
      updateAutoSyncGroupMock.mockResolvedValue(undefined);
      tabsQueryMock.mockResolvedValue([]);
      executeScriptMock.mockImplementation(async ({ target }: { target: { tabId: number } }) => {
        if (target.tabId === 32) throw new Error('inject failed');
      });

      const promise = initializeAutoSync(true);
      await flushAllTimers();
      await promise;

      expect(autoSyncStateMock.groups.get('https://group.example')?.tabIds).toEqual(
        new Set([31, 33]),
      );
    });

    it('deletes groups that drop below two tabs after injection failures', async () => {
      autoSyncStateMock.groups.set('https://unstable.example', createGroup([40, 41]));
      updateAutoSyncGroupMock.mockResolvedValue(undefined);
      tabsQueryMock.mockResolvedValue([]);
      executeScriptMock.mockImplementation(async ({ target }: { target: { tabId: number } }) => {
        if (target.tabId === 40) throw new Error('cannot inject');
      });

      const promise = initializeAutoSync(true);
      await flushAllTimers();
      await promise;

      expect(autoSyncStateMock.groups.has('https://unstable.example')).toBe(false);
    });

    it('shows suggestions for eligible groups', async () => {
      autoSyncStateMock.groups.set('https://eligible.example', createGroup([50, 51], false));
      updateAutoSyncGroupMock.mockResolvedValue(undefined);
      tabsQueryMock.mockResolvedValue([]);

      const promise = initializeAutoSync(true);
      await flushAllTimers();
      await promise;

      expect(showSyncSuggestionMock).toHaveBeenCalledTimes(1);
      expect(showSyncSuggestionMock).toHaveBeenCalledWith('https://eligible.example');
    });

    it('does not show suggestions for active groups', async () => {
      autoSyncStateMock.groups.set('https://active.example', createGroup([60, 61], true));
      updateAutoSyncGroupMock.mockResolvedValue(undefined);
      tabsQueryMock.mockResolvedValue([]);

      const promise = initializeAutoSync(true);
      await flushAllTimers();
      await promise;

      expect(showSyncSuggestionMock).not.toHaveBeenCalled();
    });

    it('does not show suggestions for pending groups', async () => {
      autoSyncStateMock.groups.set('https://pending.example', createGroup([70, 71], false));
      pendingSuggestionsMock.add('https://pending.example');
      updateAutoSyncGroupMock.mockResolvedValue(undefined);
      tabsQueryMock.mockResolvedValue([]);

      const promise = initializeAutoSync(true);
      await flushAllTimers();
      await promise;

      expect(showSyncSuggestionMock).not.toHaveBeenCalled();
    });

    it('does not show suggestions for dismissed groups', async () => {
      autoSyncStateMock.groups.set('https://dismissed.example', createGroup([80, 81], false));
      dismissedUrlGroupsMock.add('https://dismissed.example');
      updateAutoSyncGroupMock.mockResolvedValue(undefined);
      tabsQueryMock.mockResolvedValue([]);

      const promise = initializeAutoSync(true);
      await flushAllTimers();
      await promise;

      expect(showSyncSuggestionMock).not.toHaveBeenCalled();
    });

    it('does not show suggestions for groups with fewer than two tabs', async () => {
      autoSyncStateMock.groups.set('https://solo.example', createGroup([90], false));
      updateAutoSyncGroupMock.mockResolvedValue(undefined);
      tabsQueryMock.mockResolvedValue([]);

      const promise = initializeAutoSync(true);
      await flushAllTimers();
      await promise;

      expect(showSyncSuggestionMock).not.toHaveBeenCalled();
    });

    it('broadcasts group updates after initialization completes', async () => {
      const promise = initializeAutoSync(true);
      await flushAllTimers();
      await promise;

      expect(broadcastAutoSyncGroupUpdateMock).toHaveBeenCalledTimes(1);
    });

    it('resets isInitializing even when an initialization error occurs', async () => {
      loadAutoSyncExcludedUrlsMock.mockRejectedValue(new Error('storage failure'));

      await initializeAutoSync(true);

      expect(autoSyncFlagsMock.isInitializing).toBe(false);
      expect(loggerErrorMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('toggleAutoSync', () => {
    it('queues request when toggling is already in progress', async () => {
      autoSyncFlagsMock.isToggling = true;

      await toggleAutoSync(true);

      expect(autoSyncFlagsMock.pendingToggleRequest).toBe(true);
      expect(saveAutoSyncEnabledMock).not.toHaveBeenCalled();
    });

    it('waits for initialization to complete before toggling', async () => {
      autoSyncFlagsMock.isInitializing = true;
      autoSyncStateMock.enabled = false;
      tabsQueryMock.mockResolvedValue([]);

      const promise = toggleAutoSync(true);
      await vi.advanceTimersByTimeAsync(250);
      expect(saveAutoSyncEnabledMock).not.toHaveBeenCalled();

      autoSyncFlagsMock.isInitializing = false;
      await vi.advanceTimersByTimeAsync(100);
      await flushAllTimers();
      await promise;

      expect(saveAutoSyncEnabledMock).toHaveBeenCalledWith(true);
    });

    it('times out waiting for initialization after 10 seconds and proceeds', async () => {
      autoSyncFlagsMock.isInitializing = true;
      autoSyncStateMock.enabled = false;
      tabsQueryMock.mockResolvedValue([]);

      const promise = toggleAutoSync(true);
      await vi.advanceTimersByTimeAsync(10_000);
      await flushAllTimers();
      await promise;

      expect(saveAutoSyncEnabledMock).toHaveBeenCalledWith(true);
      expect(loggerWarnMock).toHaveBeenCalledWith(
        '[AUTO-SYNC] toggleAutoSync timed out waiting for initialization',
      );
    });

    it('skips toggle when requested state matches current state', async () => {
      autoSyncStateMock.enabled = true;

      await toggleAutoSync(true);

      expect(saveAutoSyncEnabledMock).not.toHaveBeenCalled();
      expect(tabsQueryMock).not.toHaveBeenCalled();
    });

    it('sets isToggling during toggle and resets it after completion', async () => {
      autoSyncStateMock.enabled = false;
      tabsQueryMock.mockResolvedValue([]);
      saveAutoSyncEnabledMock.mockImplementation(async () => {
        expect(autoSyncFlagsMock.isToggling).toBe(true);
      });

      const promise = toggleAutoSync(true);
      expect(autoSyncFlagsMock.isToggling).toBe(true);
      await flushAllTimers();
      await promise;

      expect(autoSyncFlagsMock.isToggling).toBe(false);
    });

    it('resets isToggling even when saveAutoSyncEnabled throws', async () => {
      autoSyncStateMock.enabled = false;
      saveAutoSyncEnabledMock.mockRejectedValue(new Error('write failed'));

      await expect(toggleAutoSync(true)).rejects.toThrow('write failed');
      expect(autoSyncFlagsMock.isToggling).toBe(false);
    });

    it('enabling clears stale groups, sets, and retry timers', async () => {
      autoSyncStateMock.enabled = false;
      autoSyncStateMock.groups.set('https://old.example', createGroup([1, 2]));
      dismissedUrlGroupsMock.add('https://old.example');
      pendingSuggestionsMock.add('https://old.example');

      const timer = setTimeout(() => {}, 9999);
      autoSyncRetryTimersMock.set('https://old.example', timer);
      tabsQueryMock.mockResolvedValue([]);

      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

      const promise = toggleAutoSync(true);
      await flushAllTimers();
      await promise;

      expect(autoSyncStateMock.groups.size).toBe(0);
      expect(dismissedUrlGroupsMock.size).toBe(0);
      expect(pendingSuggestionsMock.size).toBe(0);
      expect(autoSyncRetryTimersMock.size).toBe(0);
      expect(clearTimeoutSpy).toHaveBeenCalledWith(timer);
    });

    it('enabling triggers initialization path and saves enabled state', async () => {
      autoSyncStateMock.enabled = false;
      tabsQueryMock.mockResolvedValue([]);

      const promise = toggleAutoSync(true);
      await flushAllTimers();
      await promise;

      expect(saveAutoSyncEnabledMock).toHaveBeenCalledWith(true);
      expect(loadAutoSyncEnabledMock).not.toHaveBeenCalled();
      expect(loadAutoSyncExcludedUrlsMock).toHaveBeenCalledTimes(1);
    });

    it('disabling clears retry timers and suggestion tracking sets', async () => {
      autoSyncStateMock.enabled = true;
      dismissedUrlGroupsMock.add('https://old.example');
      pendingSuggestionsMock.add('https://old.example');
      autoSyncRetryTimersMock.set(
        'retry-a',
        setTimeout(() => {}, 1000),
      );
      autoSyncRetryTimersMock.set(
        'retry-b',
        setTimeout(() => {}, 2000),
      );
      tabsQueryMock.mockResolvedValue([]);

      await toggleAutoSync(false);

      expect(autoSyncRetryTimersMock.size).toBe(0);
      expect(dismissedUrlGroupsMock.size).toBe(0);
      expect(pendingSuggestionsMock.size).toBe(0);
      expect(saveAutoSyncEnabledMock).toHaveBeenCalledWith(false);
    });

    it('disabling stops only active groups and then clears all groups', async () => {
      autoSyncStateMock.enabled = true;
      autoSyncStateMock.groups.set('https://active.example', createGroup([1, 2], true));
      autoSyncStateMock.groups.set('https://inactive.example', createGroup([3, 4], false));
      tabsQueryMock.mockResolvedValue([]);

      await toggleAutoSync(false);

      expect(stopAutoSyncForGroupMock).toHaveBeenCalledTimes(1);
      expect(stopAutoSyncForGroupMock).toHaveBeenCalledWith('https://active.example');
      expect(autoSyncStateMock.groups.size).toBe(0);
    });

    it('broadcasts status-changed message to tabs after toggle', async () => {
      autoSyncStateMock.enabled = false;
      tabsQueryMock.mockResolvedValue([{ id: 1 }, { id: 2 }, { url: 'https://no-id.example' }]);

      const promise = toggleAutoSync(true);
      await flushAllTimers();
      await promise;
      await flushAllTimers();

      expect(sendMessageMock).toHaveBeenCalledTimes(2);
      expect(sendMessageMock).toHaveBeenNthCalledWith(
        1,
        'auto-sync:status-changed',
        { enabled: true },
        { context: 'content-script', tabId: 1 },
      );
      expect(sendMessageMock).toHaveBeenNthCalledWith(
        2,
        'auto-sync:status-changed',
        { enabled: true },
        { context: 'content-script', tabId: 2 },
      );
    });

    it('continues broadcast when sendMessage rejects', async () => {
      autoSyncStateMock.enabled = false;
      tabsQueryMock.mockResolvedValue([{ id: 1 }, { id: 2 }]);
      sendMessageMock
        .mockRejectedValueOnce(new Error('tab missing content script'))
        .mockResolvedValueOnce(undefined);

      const promise = toggleAutoSync(true);
      await flushAllTimers();
      await promise;
      await flushAllTimers();

      expect(sendMessageMock).toHaveBeenCalledTimes(2);
    });

    it('processes a queued toggle request after the current toggle completes', async () => {
      autoSyncStateMock.enabled = false;
      tabsQueryMock.mockResolvedValue([]);

      let resolveFirstSave: (value: void | PromiseLike<void>) => void = () => undefined;
      saveAutoSyncEnabledMock.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveFirstSave = resolve;
          }),
      );

      const firstTogglePromise = toggleAutoSync(true);
      await Promise.resolve();
      await toggleAutoSync(false);

      expect(autoSyncFlagsMock.pendingToggleRequest).toBe(false);

      resolveFirstSave(undefined);
      await flushAllTimers();
      await firstTogglePromise;
      await flushAllTimers();

      expect(saveAutoSyncEnabledMock).toHaveBeenCalledTimes(2);
      expect(saveAutoSyncEnabledMock).toHaveBeenNthCalledWith(1, true);
      expect(saveAutoSyncEnabledMock).toHaveBeenNthCalledWith(2, false);
      expect(autoSyncStateMock.enabled).toBe(false);
      expect(autoSyncFlagsMock.pendingToggleRequest).toBe(null);
    });

    it('deduplicates queued request when queued state matches final state', async () => {
      autoSyncStateMock.enabled = false;
      tabsQueryMock.mockResolvedValue([]);

      let resolveFirstSave: (value: void | PromiseLike<void>) => void = () => undefined;
      saveAutoSyncEnabledMock.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveFirstSave = resolve;
          }),
      );

      const firstTogglePromise = toggleAutoSync(true);
      await Promise.resolve();
      await toggleAutoSync(true);

      expect(autoSyncFlagsMock.pendingToggleRequest).toBe(true);

      resolveFirstSave(undefined);
      await flushAllTimers();
      await firstTogglePromise;
      await flushAllTimers();

      expect(saveAutoSyncEnabledMock).toHaveBeenCalledTimes(1);
      expect(autoSyncFlagsMock.pendingToggleRequest).toBe(null);
      expect(autoSyncStateMock.enabled).toBe(true);
    });
  });
});
