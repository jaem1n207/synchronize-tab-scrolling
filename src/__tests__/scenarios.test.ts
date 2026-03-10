import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const storageData = new Map<string, unknown>();
  const contentHandlers = new Map<
    string,
    (payload: { data: unknown }) => Promise<unknown> | unknown
  >();

  return {
    storageData,
    contentHandlers,
    sendMessageContentMock: vi.fn(),
    sendMessageBackgroundMock: vi.fn(),
    tabsGetMock: vi.fn(),
    tabsQueryMock: vi.fn(),
    executeScriptMock: vi.fn(),
    loggerInfoMock: vi.fn(),
    loggerDebugMock: vi.fn(),
    loggerWarnMock: vi.fn(),
    loggerErrorMock: vi.fn(),
    applyLocalePreservingSyncMock: vi.fn((sourceUrl: string) => sourceUrl),
  };
});

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      local: {
        get: vi.fn(async (key?: unknown) => {
          if (typeof key === 'string') {
            const value = mocks.storageData.get(key);
            return value !== undefined ? { [key]: value } : {};
          }

          if (Array.isArray(key)) {
            const result: Record<string, unknown> = {};
            for (const item of key) {
              if (typeof item === 'string' && mocks.storageData.has(item)) {
                result[item] = mocks.storageData.get(item);
              }
            }
            return result;
          }

          if (key && typeof key === 'object') {
            const defaults = key as Record<string, unknown>;
            const result: Record<string, unknown> = {};
            for (const [entryKey, entryValue] of Object.entries(defaults)) {
              result[entryKey] = mocks.storageData.has(entryKey)
                ? mocks.storageData.get(entryKey)
                : entryValue;
            }
            return result;
          }

          const result: Record<string, unknown> = {};
          for (const [entryKey, entryValue] of mocks.storageData.entries()) {
            result[entryKey] = entryValue;
          }
          return result;
        }),
        set: vi.fn(async (data: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(data)) {
            mocks.storageData.set(key, value);
          }
        }),
        clear: vi.fn(async () => {
          mocks.storageData.clear();
        }),
      },
    },
    tabs: {
      get: mocks.tabsGetMock,
      query: mocks.tabsQueryMock,
    },
    scripting: {
      executeScript: mocks.executeScriptMock,
    },
  },
}));

vi.mock('webext-bridge/content-script', () => ({
  onMessage: vi.fn(
    (messageId: string, handler: (payload: { data: unknown }) => Promise<unknown> | unknown) => {
      mocks.contentHandlers.set(messageId, handler);
    },
  ),
  sendMessage: mocks.sendMessageContentMock,
}));

vi.mock('webext-bridge/background', () => ({
  sendMessage: mocks.sendMessageBackgroundMock,
}));

vi.mock('~/shared/lib/logger', () => ({
  ExtensionLogger: vi.fn().mockImplementation(() => ({
    info: mocks.loggerInfoMock,
    debug: mocks.loggerDebugMock,
    warn: mocks.loggerWarnMock,
    error: mocks.loggerErrorMock,
  })),
}));

vi.mock('~/shared/lib/locale-utils', () => ({
  applyLocalePreservingSync: mocks.applyLocalePreservingSyncMock,
}));

vi.mock('~/contentScripts/keyboard-handler', () => ({
  initKeyboardHandler: vi.fn(),
  cleanupKeyboardHandler: vi.fn(),
}));

vi.mock('~/contentScripts/panel', () => ({
  showPanel: vi.fn(),
  hidePanel: vi.fn(),
  destroyPanel: vi.fn(),
}));

vi.mock('~/contentScripts/suggestion-toast', () => ({
  showSyncSuggestionToast: vi.fn(),
  showAddTabSuggestionToast: vi.fn(),
  hideSuggestionToasts: vi.fn(),
}));

import { updateAutoSyncGroup } from '~/background/lib/auto-sync-groups';
import { initializeAutoSync, toggleAutoSync } from '~/background/lib/auto-sync-lifecycle';
import {
  autoSyncFlags,
  autoSyncRetryTimers,
  autoSyncState,
  dismissedUrlGroups,
  manualSyncOverriddenTabs,
  pendingSuggestions,
} from '~/background/lib/auto-sync-state';
import { syncState } from '~/background/lib/sync-state';
import { initScrollSync } from '~/contentScripts/scroll-sync';
import { normalizeUrlForAutoSync } from '~/shared/lib/auto-sync-url-utils';
import { calculateScrollRatio, clampScrollOffset } from '~/shared/lib/scroll-math';
import {
  clearAllManualScrollOffsets,
  clearManualScrollOffset,
  getManualScrollOffset,
  loadUrlSyncEnabled,
  saveAutoSyncExcludedUrls,
  saveManualScrollOffset,
  saveUrlSyncEnabled,
} from '~/shared/lib/storage';
import type { AutoSyncGroup } from '~/shared/types/auto-sync-state';

interface MockMutationObserverInstance {
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  trigger: () => void;
}

const mutationObservers: Array<MockMutationObserverInstance> = [];

class MockMutationObserver {
  private readonly callback: MutationCallback;
  public readonly observe = vi.fn();
  public readonly disconnect = vi.fn();

  public constructor(callback: MutationCallback) {
    this.callback = callback;
    mutationObservers.push({
      observe: this.observe,
      disconnect: this.disconnect,
      trigger: () => {
        this.callback([], this as unknown as MutationObserver);
      },
    });
  }
}

function createGroup(tabIds: Array<number>, isActive = false): AutoSyncGroup {
  return { tabIds: new Set(tabIds), isActive };
}

async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function invokeContentMessage(messageId: string, data: unknown): Promise<unknown> {
  const handler = mocks.contentHandlers.get(messageId);
  if (!handler) {
    throw new Error(`Missing content message handler for ${messageId}`);
  }

  return handler({ data });
}

async function startContentSync(tabId: number): Promise<void> {
  await invokeContentMessage('scroll:start', {
    mode: 'ratio',
    currentTabId: tabId,
    linkedTabs: [tabId],
  });
}

async function stopContentSync(): Promise<void> {
  if (mocks.contentHandlers.has('scroll:stop')) {
    await invokeContentMessage('scroll:stop', {});
  }
}

async function triggerUrlChange(pathname: string): Promise<string> {
  history.pushState({}, '', pathname);
  const observer = mutationObservers.at(-1);
  if (!observer) {
    throw new Error('Expected MutationObserver to be registered');
  }
  observer.trigger();
  await flushAsync();
  return window.location.href;
}

function getBackgroundCalls(messageId: string) {
  return mocks.sendMessageBackgroundMock.mock.calls.filter((call) => call[0] === messageId);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.stubGlobal('MutationObserver', MockMutationObserver);

  mutationObservers.length = 0;
  mocks.storageData.clear();
  mocks.contentHandlers.clear();

  history.replaceState({}, '', '/start');

  autoSyncState.enabled = false;
  autoSyncState.groups.clear();
  autoSyncState.excludedUrls = [];

  autoSyncRetryTimers.clear();
  dismissedUrlGroups.clear();
  pendingSuggestions.clear();
  manualSyncOverriddenTabs.clear();

  autoSyncFlags.isInitializing = false;
  autoSyncFlags.isToggling = false;
  autoSyncFlags.pendingToggleRequest = null;

  syncState.isActive = false;
  syncState.linkedTabs = [];
  syncState.connectionStatuses = {};
  syncState.lastActiveSyncedTabId = null;

  mocks.tabsQueryMock.mockResolvedValue([]);
  mocks.tabsGetMock.mockImplementation(async (tabId: number) => ({
    id: tabId,
    title: `Tab ${tabId}`,
    active: false,
    highlighted: false,
    pinned: false,
    incognito: false,
    index: 0,
  }));
  mocks.executeScriptMock.mockResolvedValue([]);

  mocks.sendMessageContentMock.mockResolvedValue(undefined);
  mocks.sendMessageBackgroundMock.mockImplementation(
    async (
      messageId: string,
      _data: unknown,
      destination?: { context: 'content-script'; tabId: number },
    ) => {
      if (messageId === 'scroll:ping' && destination) {
        return { success: true, tabId: destination.tabId, isSyncActive: false };
      }
      return undefined;
    },
  );

  mocks.applyLocalePreservingSyncMock.mockImplementation((sourceUrl: string) => sourceUrl);

  initScrollSync();
});

afterEach(async () => {
  await stopContentSync();
  vi.unstubAllGlobals();
});

describe('Scenario: URL sync toggle behavior', () => {
  it('saveUrlSyncEnabled(true) -> loadUrlSyncEnabled() returns true', async () => {
    await saveUrlSyncEnabled(true);

    await expect(loadUrlSyncEnabled()).resolves.toBe(true);
  });

  it('saveUrlSyncEnabled(false) -> loadUrlSyncEnabled() returns false', async () => {
    await saveUrlSyncEnabled(false);

    await expect(loadUrlSyncEnabled()).resolves.toBe(false);
  });

  it('default value when never saved is true', async () => {
    await expect(loadUrlSyncEnabled()).resolves.toBe(true);
  });

  it('when URL sync is disabled, broadcastUrlChange still sends url:sync', async () => {
    await startContentSync(11);
    await saveUrlSyncEnabled(false);

    const changedUrl = await triggerUrlChange('/broadcast-disabled');

    expect(mocks.sendMessageContentMock).toHaveBeenCalledWith(
      'url:sync',
      { url: changedUrl, sourceTabId: 11 },
      'background',
    );
  });

  it('when URL sync is enabled, url:sync receiver navigates', async () => {
    await startContentSync(22);
    await saveUrlSyncEnabled(true);

    const targetUrl = `${window.location.origin}/start#enabled-target`;

    await invokeContentMessage('url:sync', {
      url: targetUrl,
      sourceTabId: 99,
    });

    expect(window.location.href).toBe(targetUrl);
  });

  it('when URL sync is disabled, url:sync receiver does not navigate', async () => {
    history.replaceState({}, '', '/no-navigation-start');
    const beforeNavigation = window.location.href;

    await startContentSync(33);
    await saveUrlSyncEnabled(false);

    await invokeContentMessage('url:sync', {
      url: 'http://localhost/no-navigation-target',
      sourceTabId: 88,
    });

    expect(window.location.href).toBe(beforeNavigation);
  });

  it('url:sync receiver ignores messages from its own source tab', async () => {
    history.replaceState({}, '', '/self-source-start');
    const beforeNavigation = window.location.href;

    await startContentSync(44);
    await saveUrlSyncEnabled(true);

    await invokeContentMessage('url:sync', {
      url: 'http://localhost/self-source-target',
      sourceTabId: 44,
    });

    expect(window.location.href).toBe(beforeNavigation);
  });

  it('toggle state persists across save/load cycles', async () => {
    await saveUrlSyncEnabled(false);
    await expect(loadUrlSyncEnabled()).resolves.toBe(false);

    await saveUrlSyncEnabled(true);
    await expect(loadUrlSyncEnabled()).resolves.toBe(true);

    await saveUrlSyncEnabled(false);
    await expect(loadUrlSyncEnabled()).resolves.toBe(false);
  });
});

describe('Scenario: sync suggestion toast triggering conditions', () => {
  it('when 2 tabs share same URL, toast is shown', async () => {
    autoSyncState.enabled = true;

    await updateAutoSyncGroup(1, 'https://example.com/page?q=1');
    await updateAutoSyncGroup(2, 'https://example.com/page?q=2');

    const toastCalls = getBackgroundCalls('sync-suggestion:show');
    expect(toastCalls.length).toBeGreaterThan(0);
  });

  it('when only 1 tab has URL, no toast is shown', async () => {
    autoSyncState.enabled = true;

    await updateAutoSyncGroup(1, 'https://example.com/page?q=1');

    expect(getBackgroundCalls('sync-suggestion:show')).toHaveLength(0);
  });

  it('when group is already active, no toast is shown', async () => {
    autoSyncState.enabled = true;
    const normalizedUrl = normalizeUrlForAutoSync('https://example.com/already-active')!;
    autoSyncState.groups.set(normalizedUrl, createGroup([1], true));

    await updateAutoSyncGroup(2, 'https://example.com/already-active');

    expect(getBackgroundCalls('sync-suggestion:show')).toHaveLength(0);
  });

  it('when URL was previously dismissed, no toast is shown', async () => {
    autoSyncState.enabled = true;
    const rawUrl = 'https://example.com/dismissed?q=1';
    const normalizedUrl = normalizeUrlForAutoSync(rawUrl)!;

    await updateAutoSyncGroup(1, rawUrl);
    dismissedUrlGroups.add(normalizedUrl);

    await updateAutoSyncGroup(2, 'https://example.com/dismissed?q=2');

    expect(getBackgroundCalls('sync-suggestion:show')).toHaveLength(0);
  });

  it('when suggestion is already pending, sends to single new tab instead', async () => {
    autoSyncState.enabled = true;
    const rawUrl = 'https://example.com/pending?q=1';
    const normalizedUrl = normalizeUrlForAutoSync(rawUrl)!;

    await updateAutoSyncGroup(1, rawUrl);
    pendingSuggestions.add(normalizedUrl);
    mocks.sendMessageBackgroundMock.mockClear();

    await updateAutoSyncGroup(2, 'https://example.com/pending?q=2');

    expect(mocks.sendMessageBackgroundMock).toHaveBeenCalledWith(
      'ping',
      {},
      { context: 'content-script', tabId: 2 },
    );
    expect(mocks.sendMessageBackgroundMock).toHaveBeenCalledWith(
      'sync-suggestion:show',
      expect.objectContaining({ normalizedUrl, tabCount: 2 }),
      { context: 'content-script', tabId: 2 },
    );
  });

  it('when tab is already syncing, no toast is shown', async () => {
    autoSyncState.enabled = true;

    mocks.sendMessageBackgroundMock.mockImplementation(
      async (
        messageId: string,
        _data: unknown,
        destination?: { context: 'content-script'; tabId: number },
      ) => {
        if (messageId === 'scroll:ping' && destination) {
          return {
            success: true,
            tabId: destination.tabId,
            isSyncActive: destination.tabId === 2,
          };
        }
        return undefined;
      },
    );

    await updateAutoSyncGroup(1, 'https://example.com/syncing');
    await updateAutoSyncGroup(2, 'https://example.com/syncing');

    expect(getBackgroundCalls('sync-suggestion:show')).toHaveLength(0);
  });

  it('when 3rd tab joins existing pending suggestion, sends to single new tab', async () => {
    autoSyncState.enabled = true;
    const rawUrl = 'https://example.com/third-tab?q=1';
    const normalizedUrl = normalizeUrlForAutoSync(rawUrl)!;

    await updateAutoSyncGroup(1, rawUrl);
    await updateAutoSyncGroup(2, 'https://example.com/third-tab?q=2');

    expect(pendingSuggestions.has(normalizedUrl)).toBe(true);

    mocks.sendMessageBackgroundMock.mockClear();
    await updateAutoSyncGroup(3, 'https://example.com/third-tab?q=3');

    expect(mocks.sendMessageBackgroundMock).toHaveBeenCalledWith(
      'sync-suggestion:show',
      expect.objectContaining({ tabCount: 3 }),
      { context: 'content-script', tabId: 3 },
    );
  });
});

describe('Scenario: same-URL automatic sync detection', () => {
  it('initializeAutoSync scans tabs and groups by normalized URL', async () => {
    mocks.tabsQueryMock.mockResolvedValue([
      { id: 1, url: 'https://example.com/page?a=1' },
      { id: 2, url: 'https://example.com/page?a=2' },
      { id: 3, url: 'https://another.com/page' },
    ]);

    await initializeAutoSync(true);

    expect(autoSyncState.groups.get('https://example.com/page')?.tabIds).toEqual(new Set([1, 2]));
    expect(autoSyncState.groups.get('https://another.com/page')?.tabIds).toEqual(new Set([3]));
  });

  it('query string differences still produce same group', async () => {
    mocks.tabsQueryMock.mockResolvedValue([
      { id: 10, url: 'https://example.com/page?q=1' },
      { id: 11, url: 'https://example.com/page?q=2' },
    ]);

    await initializeAutoSync(true);

    expect(autoSyncState.groups.size).toBe(1);
    expect(autoSyncState.groups.get('https://example.com/page')?.tabIds).toEqual(new Set([10, 11]));
  });

  it('tabs with forbidden URLs are excluded from groups', async () => {
    mocks.tabsQueryMock.mockResolvedValue([
      { id: 20, url: 'chrome://extensions' },
      { id: 21, url: 'https://example.com/safe' },
    ]);

    await initializeAutoSync(true);

    expect(autoSyncState.groups.has('chrome://extensions')).toBe(false);
    expect(autoSyncState.groups.get('https://example.com/safe')?.tabIds).toEqual(new Set([21]));
  });

  it('tabs with excluded URL patterns are not grouped', async () => {
    await saveAutoSyncExcludedUrls(['*blocked*']);
    mocks.tabsQueryMock.mockResolvedValue([
      { id: 30, url: 'https://example.com/blocked/path' },
      { id: 31, url: 'https://example.com/allowed/path' },
    ]);

    await initializeAutoSync(true);

    expect(autoSyncState.groups.has('https://example.com/blocked/path')).toBe(false);
    expect(autoSyncState.groups.get('https://example.com/allowed/path')?.tabIds).toEqual(
      new Set([31]),
    );
  });

  it('toggleAutoSync(false) clears all groups and stops active syncs', async () => {
    autoSyncState.enabled = true;
    autoSyncState.groups.set('https://example.com/active', createGroup([40, 41], true));
    autoSyncState.groups.set('https://example.com/inactive', createGroup([42], false));
    mocks.tabsQueryMock.mockResolvedValue([]);

    await toggleAutoSync(false);

    expect(autoSyncState.groups.size).toBe(0);
    expect(getBackgroundCalls('scroll:stop')).toHaveLength(2);
  });

  it('toggleAutoSync(true) re-scans tabs and rebuilds groups', async () => {
    autoSyncState.enabled = false;
    autoSyncState.groups.clear();
    mocks.tabsQueryMock.mockResolvedValue([
      { id: 50, url: 'https://example.com/rebuild?q=1' },
      { id: 51, url: 'https://example.com/rebuild?q=2' },
    ]);

    await toggleAutoSync(true);

    expect(autoSyncState.enabled).toBe(true);
    expect(autoSyncState.groups.get('https://example.com/rebuild')?.tabIds).toEqual(
      new Set([50, 51]),
    );
  });
});

describe('Scenario: manual scroll offset adjustment and scroll correctness', () => {
  it('saveManualScrollOffset then getManualScrollOffset returns stored ratio and pixels', async () => {
    await saveManualScrollOffset(1, 0.1, 50);

    await expect(getManualScrollOffset(1)).resolves.toEqual({ ratio: 0.1, pixels: 50 });
  });

  it('offset math applies source ratio plus offset ratio correctly', () => {
    const sourceRatio = calculateScrollRatio(500, 2000, 1000);
    const targetRatio = sourceRatio + 0.1;

    expect(sourceRatio).toBe(0.5);
    expect(targetRatio).toBe(0.6);
  });

  it('clampScrollOffset clamps values to +/-0.5', () => {
    expect(clampScrollOffset(0.7)).toBe(0.5);
    expect(clampScrollOffset(-0.8)).toBe(-0.5);
  });

  it('multiple tabs can keep independent offsets', async () => {
    await saveManualScrollOffset(2, 0.1, 10);
    await saveManualScrollOffset(3, -0.2, -40);

    await expect(getManualScrollOffset(2)).resolves.toEqual({ ratio: 0.1, pixels: 10 });
    await expect(getManualScrollOffset(3)).resolves.toEqual({ ratio: -0.2, pixels: -40 });
  });

  it('clearManualScrollOffset removes only the requested tab offset', async () => {
    await saveManualScrollOffset(4, 0.25, 80);
    await saveManualScrollOffset(5, -0.1, -20);

    await clearManualScrollOffset(4);

    await expect(getManualScrollOffset(4)).resolves.toEqual({ ratio: 0, pixels: 0 });
    await expect(getManualScrollOffset(5)).resolves.toEqual({ ratio: -0.1, pixels: -20 });
  });
});

describe('Scenario: manual offset reset when URL changes', () => {
  it('source tab offset is cleared when URL changes', async () => {
    await startContentSync(101);
    await saveUrlSyncEnabled(true);
    await saveManualScrollOffset(101, 0.15, 60);

    await triggerUrlChange('/source-url-change');

    await expect(getManualScrollOffset(101)).resolves.toEqual({ ratio: 0, pixels: 0 });
  });

  it('target tab offset is cleared when receiving url:sync', async () => {
    await startContentSync(202);
    await saveUrlSyncEnabled(true);
    await saveManualScrollOffset(202, -0.2, -70);

    const targetUrl = `${window.location.origin}/start#target-url-change`;

    await invokeContentMessage('url:sync', {
      url: targetUrl,
      sourceTabId: 999,
    });

    await expect(getManualScrollOffset(202)).resolves.toEqual({ ratio: 0, pixels: 0 });
  });

  it('clearManualScrollOffset is idempotent for non-existent tab offsets', async () => {
    await expect(clearManualScrollOffset(303)).resolves.toBeUndefined();
    await expect(clearManualScrollOffset(303)).resolves.toBeUndefined();
  });

  it('after clear, getManualScrollOffset returns default values', async () => {
    await saveManualScrollOffset(404, 0.12, 45);

    await clearManualScrollOffset(404);

    await expect(getManualScrollOffset(404)).resolves.toEqual({ ratio: 0, pixels: 0 });
  });

  it('clearAllManualScrollOffsets clears all tab offsets at once', async () => {
    await saveManualScrollOffset(501, 0.1, 10);
    await saveManualScrollOffset(502, -0.15, -35);

    await clearAllManualScrollOffsets();

    await expect(getManualScrollOffset(501)).resolves.toEqual({ ratio: 0, pixels: 0 });
    await expect(getManualScrollOffset(502)).resolves.toEqual({ ratio: 0, pixels: 0 });
  });
});
