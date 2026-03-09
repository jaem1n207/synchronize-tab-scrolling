import { beforeEach, describe, expect, it, vi } from 'vitest';
import browser from 'webextension-polyfill';

import { normalizeUrlForAutoSync } from '~/shared/lib/auto-sync-url-utils';
import { loadUrlSyncEnabled } from '~/shared/lib/storage';

import { registerTabEventHandlers } from './tab-event-handlers';
import {
  broadcastAutoSyncGroupUpdate,
  removeTabFromAllAutoSyncGroups,
  updateAutoSyncGroup,
} from '../lib/auto-sync-groups';
import { toggleAutoSync } from '../lib/auto-sync-lifecycle';
import {
  autoSyncState,
  dismissedUrlGroups,
  manualSyncOverriddenTabs,
  pendingSuggestions,
} from '../lib/auto-sync-state';
import { showAddTabSuggestion } from '../lib/auto-sync-suggestions';
import { isContentScriptAlive, reinjectContentScript } from '../lib/content-script-manager';
import { stopKeepAlive } from '../lib/keep-alive';
import { sendMessageWithTimeout } from '../lib/messaging';
import { broadcastSyncStatus, persistSyncState, syncState } from '../lib/sync-state';
import { sendMessage } from 'webext-bridge/background';

type RemovedListener = (tabId: number) => Promise<void>;
type CreatedListener = (tab: { id?: number; url?: string }) => Promise<void>;
type UpdatedListener = (
  tabId: number,
  changeInfo: { url?: string; status?: string },
  tab: { id?: number; url?: string; title?: string },
) => Promise<void>;
type ActivatedListener = (activeInfo: { tabId: number }) => Promise<void>;
type StorageChangedListener = (
  changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
  areaName: string,
) => Promise<void>;

type EventListeners = {
  'tabs.onRemoved'?: RemovedListener;
  'tabs.onCreated'?: CreatedListener;
  'tabs.onUpdated'?: UpdatedListener;
  'tabs.onActivated'?: ActivatedListener;
  'storage.onChanged'?: StorageChangedListener;
};

const eventListeners: EventListeners = {};

vi.mock('webext-bridge/background', () => ({
  sendMessage: vi.fn(),
}));

vi.mock('webextension-polyfill', () => ({
  default: {
    tabs: {
      onRemoved: { addListener: vi.fn() },
      onCreated: { addListener: vi.fn() },
      onUpdated: { addListener: vi.fn() },
      onActivated: { addListener: vi.fn() },
      get: vi.fn(),
      query: vi.fn(),
    },
    storage: {
      onChanged: { addListener: vi.fn() },
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
  normalizeUrlForAutoSync: vi.fn(),
}));

vi.mock('~/shared/lib/storage', () => ({
  loadUrlSyncEnabled: vi.fn(),
}));

vi.mock('../lib/auto-sync-groups', () => ({
  removeTabFromAllAutoSyncGroups: vi.fn(),
  updateAutoSyncGroup: vi.fn(),
  broadcastAutoSyncGroupUpdate: vi.fn(),
}));

vi.mock('../lib/auto-sync-lifecycle', () => ({
  toggleAutoSync: vi.fn(),
}));

vi.mock('../lib/auto-sync-state', () => ({
  autoSyncState: {
    enabled: false,
    groups: new Map<string, { tabIds: Set<number>; isActive: boolean }>(),
    excludedUrls: [],
  },
  manualSyncOverriddenTabs: new Set<number>(),
  dismissedUrlGroups: new Set<string>(),
  pendingSuggestions: new Set<string>(),
}));

vi.mock('../lib/auto-sync-suggestions', () => ({
  showSyncSuggestion: vi.fn(),
  sendSuggestionToSingleTab: vi.fn(),
  showAddTabSuggestion: vi.fn(),
}));

vi.mock('../lib/content-script-manager', () => ({
  isContentScriptAlive: vi.fn(),
  reinjectContentScript: vi.fn(),
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
  },
  persistSyncState: vi.fn(),
  broadcastSyncStatus: vi.fn(),
}));

function getListener<K extends keyof EventListeners>(key: K): NonNullable<EventListeners[K]> {
  const listener = eventListeners[key];
  expect(listener).toBeDefined();
  return listener as NonNullable<EventListeners[K]>;
}

describe('registerTabEventHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();

    for (const key of Object.keys(eventListeners) as Array<keyof EventListeners>) {
      delete eventListeners[key];
    }

    syncState.isActive = false;
    syncState.linkedTabs = [];
    syncState.connectionStatuses = {};
    syncState.mode = undefined;
    syncState.lastActiveSyncedTabId = null;

    autoSyncState.enabled = false;
    autoSyncState.groups.clear();
    autoSyncState.excludedUrls = [];
    manualSyncOverriddenTabs.clear();
    dismissedUrlGroups.clear();
    pendingSuggestions.clear();

    vi.mocked(browser.tabs.get).mockResolvedValue({
      id: 1,
      index: 0,
      highlighted: false,
      active: false,
      pinned: false,
      incognito: false,
      url: 'https://example.com/page',
    } as browser.Tabs.Tab);
    vi.mocked(browser.tabs.query).mockResolvedValue([]);

    vi.mocked(normalizeUrlForAutoSync).mockImplementation((url: string) => {
      if (!url) return null;
      return url.split('?')[0].split('#')[0] ?? null;
    });
    vi.mocked(loadUrlSyncEnabled).mockResolvedValue(true);

    vi.mocked(removeTabFromAllAutoSyncGroups).mockResolvedValue();
    vi.mocked(broadcastAutoSyncGroupUpdate).mockResolvedValue();
    vi.mocked(updateAutoSyncGroup).mockResolvedValue(null);
    vi.mocked(sendMessage).mockResolvedValue(undefined);
    vi.mocked(sendMessageWithTimeout).mockResolvedValue({ success: true, tabId: 1 });
    vi.mocked(isContentScriptAlive).mockResolvedValue(true);
    vi.mocked(reinjectContentScript).mockResolvedValue(true);
    vi.mocked(stopKeepAlive).mockImplementation(() => {});
    vi.mocked(persistSyncState).mockResolvedValue();
    vi.mocked(broadcastSyncStatus).mockResolvedValue();
    vi.mocked(showAddTabSuggestion).mockResolvedValue();
    vi.mocked(toggleAutoSync).mockResolvedValue();

    vi.mocked(browser.tabs.onRemoved.addListener).mockImplementation((listener) => {
      eventListeners['tabs.onRemoved'] = listener as RemovedListener;
    });
    vi.mocked(browser.tabs.onCreated.addListener).mockImplementation((listener) => {
      eventListeners['tabs.onCreated'] = listener as CreatedListener;
    });
    vi.mocked(browser.tabs.onUpdated.addListener).mockImplementation((listener) => {
      eventListeners['tabs.onUpdated'] = listener as UpdatedListener;
    });
    vi.mocked(browser.tabs.onActivated.addListener).mockImplementation((listener) => {
      eventListeners['tabs.onActivated'] = listener as ActivatedListener;
    });
    vi.mocked(browser.storage.onChanged.addListener).mockImplementation((listener) => {
      eventListeners['storage.onChanged'] = listener as StorageChangedListener;
    });

    registerTabEventHandlers();
  });

  describe('tabs.onRemoved', () => {
    it('removes tab from manualSyncOverriddenTabs', async () => {
      manualSyncOverriddenTabs.add(7);

      await getListener('tabs.onRemoved')(7);

      expect(manualSyncOverriddenTabs.has(7)).toBe(false);
    });

    it('removes tab from auto-sync groups when enabled', async () => {
      autoSyncState.enabled = true;

      await getListener('tabs.onRemoved')(3);

      expect(removeTabFromAllAutoSyncGroups).toHaveBeenCalledWith(3);
      expect(broadcastAutoSyncGroupUpdate).toHaveBeenCalledTimes(1);
    });

    it('stops sync entirely when fewer than two tabs remain', async () => {
      syncState.isActive = true;
      syncState.linkedTabs = [10, 20];
      syncState.connectionStatuses = { 10: 'connected', 20: 'connected' };
      syncState.mode = 'ratio';
      manualSyncOverriddenTabs.add(20);

      await getListener('tabs.onRemoved')(10);

      expect(syncState.isActive).toBe(false);
      expect(syncState.linkedTabs).toEqual([]);
      expect(syncState.connectionStatuses).toEqual({});
      expect(syncState.mode).toBeUndefined();
      expect(sendMessage).toHaveBeenCalledWith(
        'scroll:stop',
        {},
        { context: 'content-script', tabId: 20 },
      );
      expect(stopKeepAlive).toHaveBeenCalledTimes(1);
      expect(persistSyncState).toHaveBeenCalledTimes(1);
      expect(manualSyncOverriddenTabs.has(20)).toBe(false);
    });

    it('continues sync and persists state when two or more tabs remain', async () => {
      syncState.isActive = true;
      syncState.linkedTabs = [1, 2, 3];
      syncState.connectionStatuses = { 1: 'connected', 2: 'connected', 3: 'connected' };

      await getListener('tabs.onRemoved')(1);

      expect(syncState.linkedTabs).toEqual([2, 3]);
      expect(syncState.connectionStatuses[1]).toBeUndefined();
      expect(syncState.isActive).toBe(true);
      expect(persistSyncState).toHaveBeenCalledTimes(1);
      expect(broadcastSyncStatus).toHaveBeenCalledTimes(1);
      expect(stopKeepAlive).not.toHaveBeenCalled();
    });

    it('does not change sync state for non-synced tab removal', async () => {
      syncState.isActive = true;
      syncState.linkedTabs = [1, 2];
      syncState.connectionStatuses = { 1: 'connected', 2: 'connected' };

      await getListener('tabs.onRemoved')(99);

      expect(syncState.linkedTabs).toEqual([1, 2]);
      expect(syncState.connectionStatuses).toEqual({ 1: 'connected', 2: 'connected' });
      expect(persistSyncState).not.toHaveBeenCalled();
      expect(broadcastSyncStatus).not.toHaveBeenCalled();
    });

    it('re-adds remaining tab to auto-sync groups when sync stops and auto-sync is enabled', async () => {
      autoSyncState.enabled = true;
      syncState.isActive = true;
      syncState.linkedTabs = [1, 2];
      syncState.connectionStatuses = { 1: 'connected', 2: 'connected' };
      vi.mocked(browser.tabs.get).mockResolvedValue({
        id: 2,
        index: 0,
        highlighted: false,
        active: false,
        pinned: false,
        incognito: false,
        url: 'https://example.com/rejoin',
      } as browser.Tabs.Tab);

      await getListener('tabs.onRemoved')(1);

      expect(updateAutoSyncGroup).toHaveBeenCalledWith(2, 'https://example.com/rejoin');
    });
  });

  describe('tabs.onCreated', () => {
    it('records lastActiveSyncedTabId when sync is active', async () => {
      syncState.isActive = true;
      syncState.linkedTabs = [42, 99];
      vi.mocked(browser.tabs.query).mockResolvedValue([
        {
          id: 42,
          index: 0,
          highlighted: false,
          active: true,
          pinned: false,
          incognito: false,
        } as browser.Tabs.Tab,
      ]);

      await getListener('tabs.onCreated')({ id: 77, url: 'https://new.example.com' });

      expect(syncState.lastActiveSyncedTabId).toBe(42);
    });

    it('adds created tab to auto-sync group when enabled', async () => {
      autoSyncState.enabled = true;

      await getListener('tabs.onCreated')({ id: 8, url: 'https://example.com/new' });

      expect(updateAutoSyncGroup).toHaveBeenCalledWith(8, 'https://example.com/new', true, true);
    });

    it('does nothing when auto-sync is disabled', async () => {
      autoSyncState.enabled = false;

      await getListener('tabs.onCreated')({ id: 12, url: 'https://example.com/skip' });

      expect(updateAutoSyncGroup).not.toHaveBeenCalled();
    });

    it('ignores about:blank and chrome://newtab/', async () => {
      autoSyncState.enabled = true;

      await getListener('tabs.onCreated')({ id: 5, url: 'about:blank' });
      await getListener('tabs.onCreated')({ id: 6, url: 'chrome://newtab/' });

      expect(updateAutoSyncGroup).not.toHaveBeenCalled();
    });
  });

  describe('tabs.onUpdated', () => {
    it('broadcasts URL sync to other linked tabs when URL sync is enabled', async () => {
      syncState.isActive = true;
      syncState.linkedTabs = [1, 2, 3];
      syncState.connectionStatuses = { 1: 'connected', 2: 'connected', 3: 'connected' };
      autoSyncState.enabled = false;
      vi.mocked(loadUrlSyncEnabled).mockResolvedValue(true);

      await getListener('tabs.onUpdated')(
        1,
        { url: 'https://example.com/next' },
        { id: 1, url: 'https://example.com/next', title: 'Tab 1' },
      );

      expect(sendMessage).toHaveBeenCalledWith(
        'url:sync',
        { url: 'https://example.com/next', sourceTabId: 1 },
        { context: 'content-script', tabId: 2 },
      );
      expect(sendMessage).toHaveBeenCalledWith(
        'url:sync',
        { url: 'https://example.com/next', sourceTabId: 1 },
        { context: 'content-script', tabId: 3 },
      );
    });

    it('reconnects synced tab when update status is complete', async () => {
      syncState.isActive = true;
      syncState.linkedTabs = [1, 2];
      syncState.mode = 'ratio';
      syncState.connectionStatuses = { 1: 'error', 2: 'connected' };

      await getListener('tabs.onUpdated')(
        1,
        { status: 'complete' },
        { id: 1, url: 'https://example.com/reload', title: 'Reloaded' },
      );

      expect(sendMessage).toHaveBeenCalledWith(
        'scroll:start',
        { tabIds: [1, 2], mode: 'ratio', currentTabId: 1 },
        { context: 'content-script', tabId: 1 },
      );
      expect(syncState.connectionStatuses[1]).toBe('connected');
      expect(persistSyncState).toHaveBeenCalledTimes(1);
      expect(broadcastSyncStatus).toHaveBeenCalledTimes(1);
    });

    it('detects new tab with same URL as synced tab and shows add-tab suggestion', async () => {
      syncState.isActive = true;
      syncState.linkedTabs = [10];
      vi.mocked(normalizeUrlForAutoSync).mockReturnValue('https://example.com/match');
      vi.mocked(browser.tabs.get).mockResolvedValue({
        id: 10,
        index: 0,
        highlighted: false,
        active: false,
        pinned: false,
        incognito: false,
        url: 'https://example.com/match',
      } as browser.Tabs.Tab);

      await getListener('tabs.onUpdated')(
        20,
        { url: 'https://example.com/match?x=1' },
        { id: 20, url: 'https://example.com/match?x=1', title: 'Candidate tab' },
      );

      expect(showAddTabSuggestion).toHaveBeenCalledWith(
        20,
        'Candidate tab',
        'https://example.com/match',
      );
    });

    it('updates auto-sync group on URL change when auto-sync is enabled', async () => {
      autoSyncState.enabled = true;
      syncState.isActive = false;
      vi.mocked(normalizeUrlForAutoSync).mockReturnValue('https://example.com/group');

      await getListener('tabs.onUpdated')(
        11,
        { url: 'https://example.com/group?abc=1' },
        { id: 11, url: 'https://example.com/group?abc=1', title: 'Group tab' },
      );

      expect(updateAutoSyncGroup).toHaveBeenCalledWith(11, 'https://example.com/group?abc=1');
    });
  });

  describe('tabs.onActivated', () => {
    it('updates lastActiveSyncedTabId for synced tab', async () => {
      syncState.isActive = true;
      syncState.linkedTabs = [2, 3];

      await getListener('tabs.onActivated')({ tabId: 3 });

      expect(syncState.lastActiveSyncedTabId).toBe(3);
    });

    it('does nothing for non-synced tab activation', async () => {
      syncState.isActive = true;
      syncState.linkedTabs = [1, 2];

      await getListener('tabs.onActivated')({ tabId: 9 });

      expect(isContentScriptAlive).not.toHaveBeenCalled();
      expect(sendMessageWithTimeout).not.toHaveBeenCalled();
      expect(reinjectContentScript).not.toHaveBeenCalled();
    });

    it('attempts recovery when content script is dead', async () => {
      syncState.isActive = true;
      syncState.linkedTabs = [15, 16];
      syncState.mode = 'ratio';
      syncState.connectionStatuses = { 15: 'error', 16: 'connected' };
      vi.mocked(isContentScriptAlive).mockResolvedValue(false);
      vi.mocked(sendMessageWithTimeout).mockResolvedValue({ success: true, tabId: 15 });

      await getListener('tabs.onActivated')({ tabId: 15 });

      expect(sendMessageWithTimeout).toHaveBeenCalledWith(
        'scroll:start',
        { tabIds: [15, 16], mode: 'ratio', currentTabId: 15 },
        { context: 'content-script', tabId: 15 },
        2_000,
      );
      expect(syncState.connectionStatuses[15]).toBe('connected');
      expect(persistSyncState).toHaveBeenCalledTimes(1);
      expect(broadcastSyncStatus).toHaveBeenCalledTimes(1);
      expect(reinjectContentScript).not.toHaveBeenCalled();
    });

    it('updates connection status when content script is alive', async () => {
      syncState.isActive = true;
      syncState.linkedTabs = [30];
      syncState.connectionStatuses = { 30: 'error' };
      vi.mocked(isContentScriptAlive).mockResolvedValue(true);

      await getListener('tabs.onActivated')({ tabId: 30 });

      expect(syncState.connectionStatuses[30]).toBe('connected');
      expect(persistSyncState).toHaveBeenCalledTimes(1);
      expect(broadcastSyncStatus).toHaveBeenCalledTimes(1);
    });
  });

  describe('storage.onChanged', () => {
    it('toggles auto-sync when autoSyncEnabled changes in local storage', async () => {
      await getListener('storage.onChanged')(
        {
          autoSyncEnabled: {
            oldValue: false,
            newValue: true,
          },
        },
        'local',
      );

      expect(toggleAutoSync).toHaveBeenCalledWith(true);
    });

    it('ignores storage changes outside local area', async () => {
      await getListener('storage.onChanged')(
        {
          autoSyncEnabled: {
            oldValue: false,
            newValue: true,
          },
        },
        'sync',
      );

      expect(toggleAutoSync).not.toHaveBeenCalled();
    });

    it('ignores autoSyncEnabled changes when value is unchanged', async () => {
      await getListener('storage.onChanged')(
        {
          autoSyncEnabled: {
            oldValue: true,
            newValue: true,
          },
        },
        'local',
      );

      expect(toggleAutoSync).not.toHaveBeenCalled();
    });
  });
});
