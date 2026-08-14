import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendMessage } from 'webext-bridge/background';
import browser from 'webextension-polyfill';

import { loadUrlSyncEnabled } from '~/shared/lib/storage';

import {
  broadcastAutoSyncGroupUpdate,
  getAutoSyncGroupKeyForTab,
  refreshAutoSyncGroupMetadata,
  removeTabFromAllAutoSyncGroups,
  updateAutoSyncGroup,
} from '../lib/auto-sync-groups';
import { toggleAutoSync } from '../lib/auto-sync-lifecycle';
import {
  addTabSuggestedTabs,
  autoSyncState,
  dismissedUrlGroups,
  manualSyncOverriddenTabs,
  pendingSuggestions,
} from '../lib/auto-sync-state';
import { showAddTabSuggestion, showSyncSuggestion } from '../lib/auto-sync-suggestions';
import {
  isContentScriptAlive,
  reinjectContentScript,
  reinjectManualReconnect,
} from '../lib/content-script-manager';
import {
  clearPendingUrlSyncContextualHint,
  hasPendingUrlSyncContextualHint,
} from '../lib/contextual-hint-state';
import { stopKeepAlive } from '../lib/keep-alive';
import { sendMessageWithTimeout } from '../lib/messaging';
import { createQuickSyncCandidateStore } from '../lib/quick-sync-candidate';
import { createQuickSyncCoordinator } from '../lib/quick-sync-coordinator';
import { createQuickSyncHandshakeRegistry } from '../lib/quick-sync-feedback';
import {
  broadcastSyncStatus,
  commitSyncState,
  getSyncStateSnapshot,
  persistSyncState,
  syncState,
} from '../lib/sync-state';
import { syncTransitionGate } from '../lib/sync-transition-gate';

import { registerTabEventHandlers } from './tab-event-handlers';

import type { QuickSyncPort } from '../lib/quick-sync-feedback';
import type { SyncTransitionGate } from '../lib/sync-transition-gate';

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
const originalUserAgent = navigator.userAgent;

const { quickSyncCoordinatorMock, waitForBackgroundInitializationMock } = vi.hoisted(() => ({
  quickSyncCoordinatorMock: {
    invalidateCandidateForTab: vi.fn().mockResolvedValue(false),
  },
  waitForBackgroundInitializationMock: vi.fn(),
}));

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

vi.mock('~/shared/lib/storage', () => ({
  loadUrlSyncEnabled: vi.fn(),
}));

vi.mock('../lib/auto-sync-groups', () => ({
  removeTabFromAllAutoSyncGroups: vi.fn(),
  updateAutoSyncGroup: vi.fn(),
  broadcastAutoSyncGroupUpdate: vi.fn(),
  refreshAutoSyncGroupMetadata: vi.fn(),
  getAutoSyncGroupKeyForTab: vi.fn(),
}));

vi.mock('../lib/background-initialization', () => ({
  waitForBackgroundInitialization: waitForBackgroundInitializationMock,
}));

vi.mock('../lib/auto-sync-lifecycle', () => ({
  toggleAutoSync: vi.fn(),
}));

vi.mock('../lib/auto-sync-state', () => ({
  autoSyncState: {
    enabled: false,
    groups: new Map<
      string,
      {
        tabIds: Set<number>;
        isActive: boolean;
        matchKind?: 'same-url' | 'translated-page' | 'possible-translation';
        matchConfidence?: 'high' | 'medium' | 'low';
        tabUrls?: Map<number, string>;
      }
    >(),
    excludedUrls: [],
  },
  manualSyncOverriddenTabs: new Set<number>(),
  dismissedUrlGroups: new Set<string>(),
  pendingSuggestions: new Set<string>(),
  addTabSuggestedTabs: new Set<number>(),
  withAutoSyncLock: vi.fn(async (operation: () => Promise<unknown>) => operation()),
}));

vi.mock('../lib/auto-sync-suggestions', () => ({
  showSyncSuggestion: vi.fn(),
  sendSuggestionToSingleTab: vi.fn(),
  showAddTabSuggestion: vi.fn(),
  isDomainSnoozed: vi.fn().mockReturnValue(false),
  isDomainPermanentlyExcluded: vi.fn().mockReturnValue(false),
}));

vi.mock('../lib/contextual-hint-state', () => ({
  clearPendingUrlSyncContextualHint: vi.fn(),
  hasPendingUrlSyncContextualHint: vi.fn(),
}));

vi.mock('../lib/content-script-manager', () => ({
  isContentScriptAlive: vi.fn(),
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

vi.mock('./quick-sync-command-handler', () => ({
  quickSyncCoordinator: quickSyncCoordinatorMock,
}));

function getListener<K extends keyof EventListeners>(key: K): NonNullable<EventListeners[K]> {
  const listener = eventListeners[key];
  expect(listener).toBeDefined();
  return listener as NonNullable<EventListeners[K]>;
}

const readyBackground = {
  manual: { status: 'ready' as const },
  auto: { status: 'ready' as const },
};

function createSerialGate(): SyncTransitionGate {
  let tail: Promise<void> = Promise.resolve();
  let operationGeneration = 0;
  return {
    run(transition) {
      const result = tail.then(() =>
        transition({
          operationGeneration: ++operationGeneration,
          expectedRevision: 0,
        }),
      );
      tail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  };
}

describe('registerTabEventHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    Object.defineProperty(navigator, 'userAgent', {
      value:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      configurable: true,
    });

    for (const key of Object.keys(eventListeners) as Array<keyof EventListeners>) {
      delete eventListeners[key];
    }

    syncState.isActive = false;
    syncState.linkedTabs = [];
    syncState.connectionStatuses = {};
    syncState.mode = undefined;
    syncState.lastActiveSyncedTabId = null;
    syncState.revision = 0;
    syncState.sessionEpoch = 0;

    autoSyncState.enabled = false;
    autoSyncState.groups.clear();
    autoSyncState.excludedUrls = [];
    manualSyncOverriddenTabs.clear();
    dismissedUrlGroups.clear();
    pendingSuggestions.clear();
    addTabSuggestedTabs.clear();

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

    vi.mocked(loadUrlSyncEnabled).mockResolvedValue(true);
    vi.mocked(hasPendingUrlSyncContextualHint).mockReturnValue(false);

    vi.mocked(removeTabFromAllAutoSyncGroups).mockResolvedValue();
    vi.mocked(broadcastAutoSyncGroupUpdate).mockResolvedValue();
    vi.mocked(updateAutoSyncGroup).mockResolvedValue(null);
    vi.mocked(refreshAutoSyncGroupMetadata).mockReturnValue(false);
    vi.mocked(getAutoSyncGroupKeyForTab).mockReturnValue(null);
    vi.mocked(sendMessage).mockResolvedValue(undefined);
    vi.mocked(sendMessageWithTimeout).mockImplementation(async (_, __, destination) => ({
      success: true,
      tabId: destination.tabId,
    }));
    vi.mocked(isContentScriptAlive).mockResolvedValue(true);
    vi.mocked(reinjectContentScript).mockResolvedValue(true);
    vi.mocked(reinjectManualReconnect).mockImplementation(async (token, isSessionCurrent) => {
      const success = await vi.mocked(reinjectContentScript)(token.tabId, {
        startMessage: token.startMessage,
        isSessionCurrent,
      });
      return { success, tabId: token.tabId };
    });
    vi.mocked(stopKeepAlive).mockImplementation(() => {});
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
    vi.mocked(showAddTabSuggestion).mockResolvedValue();
    vi.mocked(showSyncSuggestion).mockResolvedValue();
    vi.mocked(toggleAutoSync).mockResolvedValue();
    waitForBackgroundInitializationMock.mockResolvedValue(readyBackground);
    vi.mocked(syncTransitionGate.run).mockImplementation(async (transition) =>
      transition({
        operationGeneration: 1,
        expectedRevision: syncState.revision,
      }),
    );

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

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(navigator, 'userAgent', {
      value: originalUserAgent,
      configurable: true,
    });
  });

  describe('background readiness', () => {
    it('gates every tab and storage listener on initialization', async () => {
      await getListener('tabs.onRemoved')(1);
      await getListener('tabs.onCreated')({ id: 2 });
      await getListener('tabs.onUpdated')(3, {}, { id: 3 });
      await getListener('tabs.onActivated')({ tabId: 4 });
      await getListener('storage.onChanged')({}, 'local');

      expect(waitForBackgroundInitializationMock).toHaveBeenCalledTimes(5);
    });

    it('does not mutate removed-tab state before readiness resolves', async () => {
      const release = Promise.withResolvers<typeof readyBackground>();
      waitForBackgroundInitializationMock.mockReturnValue(release.promise);
      manualSyncOverriddenTabs.add(7);

      const result = getListener('tabs.onRemoved')(7);
      await Promise.resolve();

      expect(manualSyncOverriddenTabs.has(7)).toBe(true);
      expect(clearPendingUrlSyncContextualHint).not.toHaveBeenCalled();

      release.resolve(readyBackground);
      await result;

      expect(manualSyncOverriddenTabs.has(7)).toBe(false);
      expect(clearPendingUrlSyncContextualHint).toHaveBeenCalledWith(7);
    });

    it('captures created-tab identity before awaiting readiness', async () => {
      const release = Promise.withResolvers<typeof readyBackground>();
      waitForBackgroundInitializationMock.mockReturnValue(release.promise);
      autoSyncState.enabled = true;
      const tab = { id: 7, url: 'https://example.com/original' };

      const result = getListener('tabs.onCreated')(tab);
      tab.id = 8;
      tab.url = 'https://example.com/mutated';
      release.resolve(readyBackground);
      await result;

      expect(updateAutoSyncGroup).toHaveBeenCalledWith(
        7,
        'https://example.com/original',
        true,
        true,
      );
    });

    it('captures updated-tab identity before awaiting readiness', async () => {
      const release = Promise.withResolvers<typeof readyBackground>();
      waitForBackgroundInitializationMock.mockReturnValue(release.promise);
      autoSyncState.enabled = true;
      const changeInfo = { url: 'https://example.com/original' };
      const tab = { id: 9, url: 'https://example.com/original', title: 'Original' };

      const result = getListener('tabs.onUpdated')(9, changeInfo, tab);
      changeInfo.url = 'https://example.com/mutated';
      tab.url = 'https://example.com/mutated';
      release.resolve(readyBackground);
      await result;

      expect(updateAutoSyncGroup).toHaveBeenCalledWith(9, 'https://example.com/original');
    });

    it('captures storage change values before awaiting readiness', async () => {
      const release = Promise.withResolvers<typeof readyBackground>();
      waitForBackgroundInitializationMock.mockReturnValue(release.promise);
      const changes = {
        autoSyncEnabled: {
          oldValue: false,
          newValue: true,
        },
      };

      const result = getListener('storage.onChanged')(changes, 'local');
      changes.autoSyncEnabled.newValue = false;
      release.resolve(readyBackground);
      await result;

      expect(toggleAutoSync).toHaveBeenCalledWith(true);
    });
  });

  describe('tabs.onRemoved', () => {
    it('invalidates only a candidate owned by the removed tab through the transition gate', async () => {
      await getListener('tabs.onRemoved')(7);

      expect(quickSyncCoordinatorMock.invalidateCandidateForTab).toHaveBeenCalledWith(
        expect.objectContaining({ operationGeneration: 1 }),
        7,
      );
    });

    it('removes tab from manualSyncOverriddenTabs', async () => {
      manualSyncOverriddenTabs.add(7);

      await getListener('tabs.onRemoved')(7);

      expect(manualSyncOverriddenTabs.has(7)).toBe(false);
    });

    it('clears pending URL Sync contextual hints for removed tabs', async () => {
      await getListener('tabs.onRemoved')(17);

      expect(clearPendingUrlSyncContextualHint).toHaveBeenCalledWith(17);
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
      expect(sendMessageWithTimeout).toHaveBeenCalledWith(
        'scroll:stop',
        { tabIds: [20], isAutoSync: false },
        { context: 'content-script', tabId: 20 },
        1_000,
      );
      expect(stopKeepAlive).toHaveBeenCalledTimes(1);
      expect(persistSyncState).toHaveBeenCalledTimes(1);
      expect(manualSyncOverriddenTabs.has(20)).toBe(false);
    });

    it('continues sync and persists state when two or more tabs remain', async () => {
      syncState.isActive = true;
      syncState.linkedTabs = [1, 2, 3];
      syncState.connectionStatuses = { 1: 'connected', 2: 'connected', 3: 'connected' };
      syncState.revision = 4;

      await getListener('tabs.onRemoved')(1);

      expect(syncState.linkedTabs).toEqual([2, 3]);
      expect(syncState.connectionStatuses[1]).toBeUndefined();
      expect(syncState.isActive).toBe(true);
      expect(syncState.revision).toBe(5);
      expect(persistSyncState).toHaveBeenCalledTimes(1);
      expect(broadcastSyncStatus).toHaveBeenCalledTimes(1);
      expect(stopKeepAlive).not.toHaveBeenCalled();
    });

    it('keeps linked membership active when closed-tab persistence fails', async () => {
      syncState.isActive = true;
      syncState.linkedTabs = [1, 2];
      syncState.connectionStatuses = { 1: 'connected', 2: 'connected' };
      syncState.mode = 'ratio';
      syncState.revision = 6;
      syncState.sessionEpoch = 3;
      vi.mocked(persistSyncState).mockResolvedValue({ status: 'storage-error' });

      await getListener('tabs.onRemoved')(1);

      expect(syncState).toMatchObject({
        isActive: true,
        linkedTabs: [1, 2],
        connectionStatuses: { 1: 'connected', 2: 'connected' },
        revision: 6,
        sessionEpoch: 3,
      });
      expect(stopKeepAlive).not.toHaveBeenCalled();
      expect(sendMessageWithTimeout).not.toHaveBeenCalledWith(
        'scroll:stop',
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
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

  describe('Quick Sync navigation invalidation', () => {
    it.each([
      ['HTTPS path', 'https://example.com/app/next'],
      ['HTTPS hash', 'https://example.com/app#section'],
      ['browser-readable local file', 'file:///Users/test/notes.html'],
    ])('retains a candidate after an eligible %s update', async (_, url) => {
      await getListener('tabs.onUpdated')(7, { url }, { id: 7, url });

      expect(quickSyncCoordinatorMock.invalidateCandidateForTab).not.toHaveBeenCalled();
    });

    it('retains the real candidate HUD and Port until the original deadline', async () => {
      vi.useFakeTimers();
      let now = 10_000;
      const candidateStore = createQuickSyncCandidateStore();
      const handshakeRegistry = createQuickSyncHandshakeRegistry({ now: () => now });
      const transitionGate = createSerialGate();
      const feedback: Array<{ tabId: number; outcome: string }> = [];
      const port: QuickSyncPort = {
        disconnect: vi.fn(),
        onDisconnect: {
          addListener: vi.fn(),
        },
      };
      const coordinator = createQuickSyncCoordinator({
        candidateStore,
        handshakeRegistry,
        transitionGate,
        now: () => now,
        getState: () => ({
          isActive: false,
          linkedTabs: [],
          connectionStatuses: {},
          lastActiveSyncedTabId: null,
          revision: 0,
          sessionEpoch: 0,
        }),
        ensureContentScript: async () => true,
        revalidateInvocationTab: async () => undefined,
        sendFeedback: async (tabId, message) => {
          feedback.push({ tabId, outcome: message.outcome });
          if (message.outcome === 'candidate-selected') {
            handshakeRegistry.bindPort({
              generation: message.generation,
              senderTabId: tabId,
              port,
            });
          }
          return { status: 'ready', generation: message.generation };
        },
        startManualSession: async () => ({
          status: 'committed',
          connectedTabIds: [7, 8],
          revision: 1,
          sessionEpoch: 1,
        }),
        addTabToManualSession: async () => ({
          status: 'committed',
          linkedTabIds: [7, 8, 9],
          revision: 1,
          sessionEpoch: 1,
        }),
        setRecentOutcome: () => undefined,
        showUnsupportedBadge: async () => undefined,
        setTimer: setTimeout,
      });
      vi.mocked(syncTransitionGate.run).mockImplementation((transition) =>
        transitionGate.run(transition),
      );
      quickSyncCoordinatorMock.invalidateCandidateForTab.mockImplementation((context, tabId) =>
        coordinator.invalidateCandidateForTab(context, tabId),
      );

      await transitionGate.run((context) =>
        coordinator.handle(context, {
          commandReceivedAt: 10_000,
          tabId: 7,
          windowId: 1,
        }),
      );
      now = 15_000;

      await getListener('tabs.onUpdated')(
        7,
        { url: 'https://example.com/app#section' },
        { id: 7, url: 'https://example.com/app#section' },
      );

      expect(candidateStore.read()).toEqual({
        tabId: 7,
        generation: 1,
        expiresAt: 20_000,
      });
      expect(port.disconnect).not.toHaveBeenCalled();
      expect(feedback).not.toContainEqual({ tabId: 7, outcome: 'clear' });

      now = 20_000;
      await vi.advanceTimersByTimeAsync(10_000);
      expect(candidateStore.read()).toBeNull();
      expect(port.disconnect).toHaveBeenCalledOnce();
      expect(feedback.at(-1)).toEqual({ tabId: 7, outcome: 'clear' });
    });

    it.each([
      ['browser-internal page', 'chrome://settings'],
      ['unsupported local document', 'file:///Users/test/report.pdf'],
    ])('invalidates a candidate after a restricted %s update', async (_, url) => {
      await getListener('tabs.onUpdated')(7, { url }, { id: 7, url });

      expect(quickSyncCoordinatorMock.invalidateCandidateForTab).toHaveBeenCalledWith(
        expect.objectContaining({ operationGeneration: 1 }),
        7,
      );
    });

    it.each([
      ['missing tab ID', { url: 'https://example.com/next' }],
      ['mismatched tab ID', { id: 8, url: 'https://example.com/next' }],
      ['missing current URL', { id: 7 }],
      ['mismatched current URL', { id: 7, url: 'https://example.com/stale' }],
      ['malformed current URL', { id: 7, url: 'not a url' }],
    ])('fails closed for %s metadata', async (_, tab) => {
      await getListener('tabs.onUpdated')(7, { url: 'https://example.com/next' }, tab);

      expect(quickSyncCoordinatorMock.invalidateCandidateForTab).toHaveBeenCalledWith(
        expect.objectContaining({ operationGeneration: 1 }),
        7,
      );
    });

    it('serializes restricted navigation with a reservation and expiry transition', async () => {
      let tail: Promise<void> = Promise.resolve();
      let operationGeneration = 0;
      const order: Array<string> = [];
      const releaseReservation = Promise.withResolvers<void>();
      vi.mocked(syncTransitionGate.run).mockImplementation((transition) => {
        const result = tail.then(() =>
          transition({
            operationGeneration: ++operationGeneration,
            expectedRevision: syncState.revision,
          }),
        );
        tail = result.then(
          () => undefined,
          () => undefined,
        );
        return result;
      });
      quickSyncCoordinatorMock.invalidateCandidateForTab.mockImplementation(async () => {
        order.push('navigation');
        return true;
      });

      const reservation = syncTransitionGate.run(async () => {
        order.push('reservation');
        await releaseReservation.promise;
      });
      const navigation = getListener('tabs.onUpdated')(
        7,
        { url: 'chrome://settings' },
        { id: 7, url: 'chrome://settings' },
      );
      await Promise.resolve();
      const expiry = syncTransitionGate.run(async () => {
        order.push('expiry');
      });

      expect(order).toEqual(['reservation']);

      releaseReservation.resolve();
      await Promise.all([reservation, navigation, expiry]);
      expect(order).toEqual(['reservation', 'navigation', 'expiry']);
    });

    it('does not invalidate a candidate for a status-only update', async () => {
      await getListener('tabs.onUpdated')(
        7,
        { status: 'complete' },
        { id: 7, url: 'https://example.com/current' },
      );

      expect(quickSyncCoordinatorMock.invalidateCandidateForTab).not.toHaveBeenCalled();
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

    it('uses translated canonical key for delayed suggestion lookup', async () => {
      vi.useFakeTimers();
      autoSyncState.enabled = true;
      vi.mocked(updateAutoSyncGroup).mockResolvedValueOnce('https://example.com/docs/install');
      autoSyncState.groups.set('https://example.com/docs/install', {
        tabIds: new Set([7, 8]),
        isActive: false,
        matchKind: 'translated-page',
        matchConfidence: 'high',
      });

      const promise = getListener('tabs.onCreated')({
        id: 8,
        url: 'https://example.com/tr/docs/install',
      });
      await vi.advanceTimersByTimeAsync(500);
      await promise;

      expect(showSyncSuggestion).toHaveBeenCalledWith('https://example.com/docs/install');
    });

    it('uses returned candidate group key for delayed suggestion lookup', async () => {
      vi.useFakeTimers();
      autoSyncState.enabled = true;
      const groupKey = 'https://example.com/getting-started';
      vi.mocked(updateAutoSyncGroup).mockResolvedValueOnce(groupKey);
      autoSyncState.groups.set(groupKey, {
        tabIds: new Set([7, 8]),
        isActive: false,
        matchKind: 'possible-translation',
        matchConfidence: 'medium',
      });

      const promise = getListener('tabs.onCreated')({
        id: 8,
        url: 'https://example.com/tr/baslangic',
      });
      await vi.advanceTimersByTimeAsync(500);
      await promise;

      expect(showSyncSuggestion).toHaveBeenCalledWith(groupKey);
      expect(showSyncSuggestion).not.toHaveBeenCalledWith('https://example.com/baslangic');
    });
  });

  describe('tabs.onUpdated', () => {
    it('does not relay a stale URL event into a replacement manual session', async () => {
      const urlSyncEnabled = Promise.withResolvers<boolean>();
      syncState.isActive = true;
      syncState.linkedTabs = [1, 2];
      syncState.connectionStatuses = { 1: 'connected', 2: 'connected' };
      syncState.mode = 'ratio';
      syncState.sessionEpoch = 3;
      vi.mocked(loadUrlSyncEnabled).mockReturnValue(urlSyncEnabled.promise);

      const event = getListener('tabs.onUpdated')(
        1,
        { url: 'https://example.com/stale' },
        { id: 1, url: 'https://example.com/stale', title: 'Stale' },
      );
      await Promise.resolve();

      syncState.linkedTabs = [10, 11];
      syncState.connectionStatuses = { 10: 'connected', 11: 'connected' };
      syncState.mode = 'element';
      syncState.sessionEpoch = 4;
      urlSyncEnabled.resolve(true);
      await event;

      expect(sendMessage).not.toHaveBeenCalledWith(
        'url:sync',
        expect.anything(),
        expect.anything(),
      );
      expect(syncState.linkedTabs).toEqual([10, 11]);
      expect(syncState.connectionStatuses).toEqual({ 10: 'connected', 11: 'connected' });
    });

    it('does not mutate a replacement session after a stale reconnect acknowledgement', async () => {
      const reconnect = Promise.withResolvers<{ success: boolean; tabId: number }>();
      syncState.isActive = true;
      syncState.linkedTabs = [1, 2];
      syncState.connectionStatuses = { 1: 'error', 2: 'connected' };
      syncState.mode = 'ratio';
      syncState.sessionEpoch = 5;
      vi.mocked(sendMessage).mockReturnValue(reconnect.promise);

      const event = getListener('tabs.onUpdated')(
        1,
        { status: 'complete' },
        { id: 1, url: 'https://example.com/reload', title: 'Reloaded' },
      );
      await Promise.resolve();

      syncState.linkedTabs = [10, 11];
      syncState.connectionStatuses = { 10: 'connected', 11: 'connected' };
      syncState.mode = 'element';
      syncState.sessionEpoch = 6;
      reconnect.resolve({ success: true, tabId: 1 });
      await event;

      expect(syncState.linkedTabs).toEqual([10, 11]);
      expect(syncState.connectionStatuses).toEqual({ 10: 'connected', 11: 'connected' });
      expect(persistSyncState).not.toHaveBeenCalled();
      expect(broadcastSyncStatus).not.toHaveBeenCalled();
    });

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
        {
          isAutoSync: false,
          sessionEpoch: 0,
          sourceTabId: 1,
          url: 'https://example.com/next',
        },
        { context: 'content-script', tabId: 2 },
      );
      expect(sendMessage).toHaveBeenCalledWith(
        'url:sync',
        {
          isAutoSync: false,
          sessionEpoch: 0,
          sourceTabId: 1,
          url: 'https://example.com/next',
        },
        { context: 'content-script', tabId: 3 },
      );
    });

    it('does not echo a URL Sync navigation back to the source tab', async () => {
      const readiness = Promise.withResolvers<typeof readyBackground>();
      let hasPendingNavigation = true;
      syncState.isActive = true;
      syncState.linkedTabs = [1, 2];
      syncState.connectionStatuses = { 1: 'connected', 2: 'connected' };
      waitForBackgroundInitializationMock.mockReturnValueOnce(readiness.promise);
      vi.mocked(hasPendingUrlSyncContextualHint).mockImplementation(() => hasPendingNavigation);

      const event = getListener('tabs.onUpdated')(
        2,
        { url: 'https://example.com/relayed' },
        { id: 2, url: 'https://example.com/relayed', title: 'Relayed' },
      );
      hasPendingNavigation = false;
      readiness.resolve(readyBackground);
      await event;

      expect(hasPendingUrlSyncContextualHint).toHaveBeenCalledWith(2);
      expect(sendMessage).not.toHaveBeenCalledWith(
        'url:sync',
        expect.anything(),
        expect.anything(),
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

      expect(sendMessageWithTimeout).toHaveBeenCalledWith(
        'scroll:start',
        {
          tabIds: [1, 2],
          mode: 'ratio',
          currentTabId: 1,
          isAutoSync: false,
          sessionEpoch: 0,
        },
        { context: 'content-script', tabId: 1 },
        3_000,
      );
      expect(syncState.connectionStatuses[1]).toBe('connected');
      expect(persistSyncState).toHaveBeenCalledTimes(1);
      expect(broadcastSyncStatus).toHaveBeenCalledTimes(1);
    });

    it('detects new tab with same URL as synced tab and shows add-tab suggestion', async () => {
      syncState.isActive = true;
      syncState.linkedTabs = [10];
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
        { url: 'https://example.com/match?utm_source=mail' },
        { id: 20, url: 'https://example.com/match?utm_source=mail', title: 'Candidate tab' },
      );

      expect(showAddTabSuggestion).toHaveBeenCalledWith(
        20,
        'Candidate tab',
        'https://example.com/match',
        'same-url',
        'low',
      );
    });

    it('detects translated page variant of active synced tab and shows add-tab suggestion', async () => {
      syncState.isActive = true;
      syncState.linkedTabs = [10];
      vi.mocked(browser.tabs.get).mockResolvedValue({
        id: 10,
        index: 0,
        highlighted: false,
        active: false,
        pinned: false,
        incognito: false,
        url: 'https://example.com/en/docs',
      } as browser.Tabs.Tab);

      await getListener('tabs.onUpdated')(
        20,
        { url: 'https://example.com/tr/docs' },
        { id: 20, url: 'https://example.com/tr/docs', title: 'Turkish docs' },
      );

      expect(showAddTabSuggestion).toHaveBeenCalledWith(
        20,
        'Turkish docs',
        'https://example.com/docs',
        'translated-page',
        'high',
      );
    });

    it('uses metadata alternates for medium-confidence translated slug active sync suggestions', async () => {
      syncState.isActive = true;
      syncState.linkedTabs = [10];
      vi.mocked(browser.tabs.get).mockResolvedValue({
        id: 10,
        index: 0,
        highlighted: false,
        active: false,
        pinned: false,
        incognito: false,
        url: 'https://example.com/en/getting-started',
      } as browser.Tabs.Tab);
      vi.mocked(sendMessageWithTimeout).mockImplementation(async (_message, _payload, target) => {
        const targetTabId = (target as { tabId?: number }).tabId;

        if (targetTabId === 20) {
          return {
            success: true,
            url: 'https://example.com/tr/baslangic',
            alternateUrls: [{ hreflang: 'en', href: 'https://example.com/en/getting-started' }],
          };
        }

        if (targetTabId === 10) {
          return {
            success: true,
            url: 'https://example.com/en/getting-started',
            alternateUrls: [{ hreflang: 'tr', href: 'https://example.com/tr/baslangic' }],
          };
        }

        return { success: false, url: '', alternateUrls: [] };
      });

      await getListener('tabs.onUpdated')(
        20,
        { url: 'https://example.com/tr/baslangic' },
        { id: 20, url: 'https://example.com/tr/baslangic', title: 'Turkish getting started' },
      );

      expect(showAddTabSuggestion).toHaveBeenCalledWith(
        20,
        'Turkish getting started',
        'https://example.com/getting-started',
        'possible-translation',
        'medium',
      );
    });

    it('uses translated metadata when synced tab is localized and new tab is canonical', async () => {
      syncState.isActive = true;
      syncState.linkedTabs = [10];
      vi.mocked(browser.tabs.get).mockResolvedValue({
        id: 10,
        index: 0,
        highlighted: false,
        active: false,
        pinned: false,
        incognito: false,
        url: 'https://example.com/en/docs',
      } as browser.Tabs.Tab);

      await getListener('tabs.onUpdated')(
        20,
        { url: 'https://example.com/docs' },
        { id: 20, url: 'https://example.com/docs', title: 'Canonical docs' },
      );

      expect(showAddTabSuggestion).toHaveBeenCalledWith(
        20,
        'Canonical docs',
        'https://example.com/docs',
        'translated-page',
        'high',
      );
    });

    it('uses translated metadata when canonical synced tab is listed before localized synced tab', async () => {
      syncState.isActive = true;
      syncState.linkedTabs = [10, 11];
      vi.mocked(browser.tabs.get).mockImplementation(async (tabId) => {
        const url = tabId === 10 ? 'https://example.com/docs' : 'https://example.com/en/docs';

        return {
          id: tabId,
          index: 0,
          highlighted: false,
          active: false,
          pinned: false,
          incognito: false,
          url,
        } as browser.Tabs.Tab;
      });

      await getListener('tabs.onUpdated')(
        20,
        { url: 'https://example.com/docs' },
        { id: 20, url: 'https://example.com/docs', title: 'Canonical docs' },
      );

      expect(showAddTabSuggestion).toHaveBeenCalledWith(
        20,
        'Canonical docs',
        'https://example.com/docs',
        'translated-page',
        'high',
      );
    });

    it('does not show add-tab suggestion twice for the same tab (deduplication)', async () => {
      syncState.isActive = true;
      syncState.linkedTabs = [10];
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
        { url: 'https://example.com/match?utm_source=mail' },
        { id: 20, url: 'https://example.com/match?utm_source=mail', title: 'First event' },
      );

      expect(showAddTabSuggestion).toHaveBeenCalledTimes(1);
      expect(addTabSuggestedTabs.has(20)).toBe(true);

      await getListener('tabs.onUpdated')(
        20,
        { status: 'loading', url: undefined },
        { id: 20, url: 'https://example.com/match?utm_source=mail', title: 'Second event' },
      );

      expect(showAddTabSuggestion).toHaveBeenCalledTimes(1);
    });

    it('does not show sync suggestion for tab already in active sync (BLOCK B guard)', async () => {
      autoSyncState.enabled = true;
      syncState.isActive = true;
      syncState.linkedTabs = [50, 51];

      const normalizedUrl = 'https://example.com/synced';
      autoSyncState.groups.set(normalizedUrl, {
        tabIds: new Set([50, 51]),
        isActive: false,
      });

      await getListener('tabs.onUpdated')(
        50,
        { url: 'https://example.com/synced?v=2' },
        { id: 50, url: 'https://example.com/synced?v=2', title: 'Synced Tab' },
      );

      const { showSyncSuggestion } = await import('../lib/auto-sync-suggestions');
      expect(showSyncSuggestion).not.toHaveBeenCalled();
    });

    it('updates auto-sync group on URL change when auto-sync is enabled', async () => {
      autoSyncState.enabled = true;
      syncState.isActive = false;

      await getListener('tabs.onUpdated')(
        11,
        { url: 'https://example.com/group?abc=1' },
        { id: 11, url: 'https://example.com/group?abc=1', title: 'Group tab' },
      );

      expect(updateAutoSyncGroup).toHaveBeenCalledWith(11, 'https://example.com/group?abc=1');
    });

    it('uses translated canonical key when checking existing auto-sync groups', async () => {
      autoSyncState.enabled = true;
      autoSyncState.groups.set('https://example.com/docs/install', {
        tabIds: new Set([11]),
        isActive: false,
        matchKind: 'translated-page',
        matchConfidence: 'high',
      });

      await getListener('tabs.onUpdated')(
        11,
        { url: 'https://example.com/tr/docs/install' },
        { id: 11, url: 'https://example.com/tr/docs/install', title: 'Group tab' },
      );

      expect(updateAutoSyncGroup).not.toHaveBeenCalled();
    });

    it('uses current medium-confidence group membership when checking existing auto-sync groups', async () => {
      autoSyncState.enabled = true;
      const groupKey = 'https://example.com/getting-started';
      const tabUrl = 'https://example.com/tr/baslangic';
      autoSyncState.groups.set(groupKey, {
        tabIds: new Set([11, 12]),
        isActive: false,
        matchKind: 'possible-translation',
        matchConfidence: 'medium',
        tabUrls: new Map([
          [11, tabUrl],
          [12, 'https://example.com/en/getting-started'],
        ]),
      });
      vi.mocked(getAutoSyncGroupKeyForTab).mockReturnValueOnce(groupKey);

      await getListener('tabs.onUpdated')(
        11,
        { status: 'loading' },
        { id: 11, url: tabUrl, title: 'Turkish getting started' },
      );

      expect(updateAutoSyncGroup).not.toHaveBeenCalled();
      expect(refreshAutoSyncGroupMetadata).toHaveBeenCalledWith(groupKey, 11, tabUrl);
      expect(showSyncSuggestion).toHaveBeenCalledWith(groupKey);
      expect(showSyncSuggestion).not.toHaveBeenCalledWith('https://example.com/baslangic');
    });

    it('reprocesses singleton URL-derived groups on normal updates for candidate probing', async () => {
      autoSyncState.enabled = true;
      const tabUrl = 'https://example.com/tr/baslangic';
      autoSyncState.groups.set('https://example.com/baslangic', {
        tabIds: new Set([11]),
        isActive: false,
        matchKind: 'same-url',
        matchConfidence: 'low',
        tabUrls: new Map([[11, tabUrl]]),
      });
      autoSyncState.groups.set('https://example.com/getting-started', {
        tabIds: new Set([12]),
        isActive: false,
        matchKind: 'same-url',
        matchConfidence: 'low',
        tabUrls: new Map([[12, 'https://example.com/en/getting-started']]),
      });
      vi.mocked(getAutoSyncGroupKeyForTab).mockReturnValueOnce('https://example.com/baslangic');

      await getListener('tabs.onUpdated')(
        11,
        { status: 'loading' },
        { id: 11, url: tabUrl, title: 'Turkish getting started' },
      );

      expect(updateAutoSyncGroup).toHaveBeenCalledWith(11, tabUrl);
      expect(refreshAutoSyncGroupMetadata).not.toHaveBeenCalled();
    });

    it('refreshes metadata when same-key tab URL changes to a locale variant', async () => {
      autoSyncState.enabled = true;
      autoSyncState.groups.set('https://example.com/docs', {
        tabIds: new Set([11, 12]),
        isActive: false,
        matchKind: 'same-url',
        matchConfidence: 'low',
      });
      vi.mocked(refreshAutoSyncGroupMetadata).mockImplementationOnce(
        (normalizedUrl, tabId, url) => {
          const group = autoSyncState.groups.get(normalizedUrl);
          if (tabId === 11 && url === 'https://example.com/en/docs' && group) {
            group.matchKind = 'translated-page';
            group.matchConfidence = 'high';
            return true;
          }
          return false;
        },
      );

      await getListener('tabs.onUpdated')(
        11,
        { url: 'https://example.com/en/docs' },
        { id: 11, url: 'https://example.com/en/docs', title: 'English docs' },
      );

      expect(updateAutoSyncGroup).not.toHaveBeenCalled();
      expect(refreshAutoSyncGroupMetadata).toHaveBeenCalledWith(
        'https://example.com/docs',
        11,
        'https://example.com/en/docs',
      );
      expect(autoSyncState.groups.get('https://example.com/docs')).toMatchObject({
        matchKind: 'translated-page',
        matchConfidence: 'high',
      });
      expect(broadcastAutoSyncGroupUpdate).toHaveBeenCalledTimes(1);
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
        {
          tabIds: [15, 16],
          mode: 'ratio',
          currentTabId: 15,
          isAutoSync: false,
          sessionEpoch: 0,
        },
        { context: 'content-script', tabId: 15 },
        3_000,
      );
      expect(syncState.connectionStatuses[15]).toBe('connected');
      expect(persistSyncState).toHaveBeenCalledTimes(1);
      expect(broadcastSyncStatus).toHaveBeenCalledTimes(1);
      expect(reinjectContentScript).not.toHaveBeenCalled();
    });

    it('reinjects with the captured manual session and owns the successful status mutation', async () => {
      syncState.isActive = true;
      syncState.linkedTabs = [25, 26];
      syncState.mode = 'element';
      syncState.sessionEpoch = 4;
      syncState.connectionStatuses = { 25: 'error', 26: 'connected' };
      vi.mocked(isContentScriptAlive).mockResolvedValue(false);
      vi.mocked(sendMessageWithTimeout).mockRejectedValue(new Error('content script missing'));
      vi.mocked(reinjectContentScript).mockImplementation(async (_tabId, context) =>
        context.isSessionCurrent(),
      );

      await getListener('tabs.onActivated')({ tabId: 25 });

      expect(reinjectContentScript).toHaveBeenCalledWith(
        25,
        expect.objectContaining({
          startMessage: {
            tabIds: [25, 26],
            mode: 'element',
            currentTabId: 25,
            isAutoSync: false,
            sessionEpoch: 4,
          },
          isSessionCurrent: expect.any(Function),
        }),
      );
      expect(syncState.connectionStatuses[25]).toBe('connected');
      expect(persistSyncState).toHaveBeenCalledTimes(1);
      expect(broadcastSyncStatus).toHaveBeenCalledTimes(1);
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

    it('enters the transition gate before applying a stored disable', async () => {
      const events: Array<string> = [];
      vi.mocked(syncTransitionGate.run).mockImplementationOnce(async (transition) => {
        events.push('gate:enter');
        const result = await transition({
          operationGeneration: 2,
          expectedRevision: syncState.revision,
        });
        events.push('gate:exit');
        return result;
      });
      vi.mocked(toggleAutoSync).mockImplementationOnce(async () => {
        events.push('toggle');
      });

      await getListener('storage.onChanged')(
        {
          autoSyncEnabled: {
            oldValue: true,
            newValue: false,
          },
        },
        'local',
      );

      expect(events).toEqual(['gate:enter', 'toggle', 'gate:exit']);
    });

    it('serializes concurrent stored enable and disable requests in arrival order', async () => {
      let tail: Promise<void> = Promise.resolve();
      let operationGeneration = 0;
      vi.mocked(syncTransitionGate.run).mockImplementation((transition) => {
        const result = tail.then(() =>
          transition({
            operationGeneration: ++operationGeneration,
            expectedRevision: syncState.revision,
          }),
        );
        tail = result.then(
          () => undefined,
          () => undefined,
        );
        return result;
      });
      const firstToggle = Promise.withResolvers<void>();
      vi.mocked(toggleAutoSync).mockImplementation(async (enabled: boolean) => {
        if (enabled) {
          await firstToggle.promise;
        }
        autoSyncState.enabled = enabled;
      });

      const enable = getListener('storage.onChanged')(
        {
          autoSyncEnabled: {
            oldValue: false,
            newValue: true,
          },
        },
        'local',
      );
      const disable = getListener('storage.onChanged')(
        {
          autoSyncEnabled: {
            oldValue: true,
            newValue: false,
          },
        },
        'local',
      );
      await Promise.resolve();
      await Promise.resolve();
      const callsBeforeFirstToggleSettled = [...vi.mocked(toggleAutoSync).mock.calls];

      firstToggle.resolve();
      await enable;
      await disable;
      expect(callsBeforeFirstToggleSettled).toEqual([[true]]);
      expect(toggleAutoSync).toHaveBeenNthCalledWith(2, false);
      expect(autoSyncState.enabled).toBe(false);
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
