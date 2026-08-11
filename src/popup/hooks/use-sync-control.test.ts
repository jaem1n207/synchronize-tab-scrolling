import { act, createElement } from 'react';

import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendMessage } from 'webext-bridge/popup';
import browser from 'webextension-polyfill';

import { getFileSchemeAccessInfo } from '~/shared/lib/file-scheme-access';
import type { ConnectionStatus } from '~/shared/types/messages';
import type { SyncStatusResponseMessage } from '~/shared/types/sync-session';

import { useSyncControl } from './use-sync-control';

import type { TabInfo } from '../types';

const {
  sendMessageMock,
  tabsCreateMock,
  tabsQueryMock,
  tabsReloadMock,
  getFileSchemeAccessInfoMock,
} = vi.hoisted(() => ({
  sendMessageMock: vi.fn(),
  tabsCreateMock: vi.fn(),
  tabsQueryMock: vi.fn(),
  tabsReloadMock: vi.fn(),
  getFileSchemeAccessInfoMock: vi.fn(),
}));

vi.mock('webext-bridge/popup', () => ({
  sendMessage: sendMessageMock,
}));

vi.mock('webextension-polyfill', () => ({
  default: {
    tabs: {
      create: tabsCreateMock,
      query: tabsQueryMock,
      reload: tabsReloadMock,
    },
  },
}));

vi.mock('~/shared/lib/file-scheme-access', () => ({
  getFileSchemeAccessInfo: getFileSchemeAccessInfoMock,
}));

vi.mock('~/shared/lib/storage', () => ({
  loadSelectedTabIds: vi.fn().mockResolvedValue([]),
}));

vi.mock('~/shared/i18n', () => ({
  t: (key: string, substitutions?: string | string[]): string => {
    if (Array.isArray(substitutions)) {
      return `${key}:${substitutions.join(',')}`;
    }
    return key;
  },
}));

vi.mock('~/shared/lib/logger', () => ({
  ExtensionLogger: vi.fn().mockImplementation(() => ({
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

interface HookResult<T> {
  current: T;
}

interface RenderHookResult<T> {
  result: HookResult<T>;
  unmount: () => void;
}

interface SearchInputRef {
  current: { focus: () => void } | null;
}

function enableReactActEnvironment(): void {
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
    configurable: true,
    value: true,
    writable: true,
  });
}

function renderHook<T>(hook: () => T): RenderHookResult<T> {
  const container = document.createElement('div');
  const root = createRoot(container);
  let value: T;

  function HookHost(): null {
    value = hook();
    return null;
  }

  act(() => {
    root.render(createElement(HookHost));
  });

  return {
    result: {
      get current() {
        return value;
      },
    },
    unmount: () => {
      act(() => {
        root.unmount();
      });
    },
  };
}

async function waitFor(assertion: () => void): Promise<void> {
  const timeoutAt = Date.now() + 1_000;
  while (Date.now() < timeoutAt) {
    try {
      assertion();
      return;
    } catch {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
    }
  }
  assertion();
}

function renderUseSyncControl(tabs: Array<TabInfo>) {
  const searchInputRef: SearchInputRef = { current: { focus: vi.fn() } };
  return renderHook(() =>
    useSyncControl({
      selectedTabIds: tabs.map((tab) => tab.id),
      tabs,
      searchInputRef,
      onSelectedTabIdsChange: vi.fn(),
    }),
  );
}

function createInactiveStatus(revision: number): SyncStatusResponseMessage {
  return {
    status: 'inactive',
    revision,
    sessionEpoch: 2,
  };
}

function createActiveStatus(
  revision: number,
  linkedTabIds: Array<number>,
  connectionStatuses: Record<number, ConnectionStatus>,
): SyncStatusResponseMessage {
  return {
    status: 'active',
    snapshot: {
      revision,
      sessionEpoch: 2,
      mode: 'ratio',
      linkedTabIds,
      tabs: linkedTabIds.map((tabId) => ({
        availability: 'available',
        tabId,
        title: `Tab ${tabId}`,
        windowId: tabId === 1 ? 4 : 9,
        location: tabId === 1 ? 'current-tab' : 'other-window',
        connectionStatus: connectionStatuses[tabId] ?? 'error',
      })),
    },
  };
}

beforeEach(() => {
  tabsQueryMock.mockResolvedValue([
    {
      id: 1,
      windowId: 4,
      index: 0,
      highlighted: false,
      active: true,
      pinned: false,
      incognito: false,
    },
  ]);
});

describe('useSyncControl local file failures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enableReactActEnvironment();
    vi.mocked(sendMessage).mockImplementation(async (message) => {
      if (message === 'sync:get-status') {
        return createInactiveStatus(0);
      }

      return {
        success: false,
        connectedTabs: [],
        connectionResults: {
          1: { success: false, error: 'Could not establish connection' },
          2: { success: false, error: 'Could not establish connection' },
        },
        error: 'Failed to connect to at least 2 tabs',
      };
    });
    vi.mocked(getFileSchemeAccessInfo).mockResolvedValue({
      canCheck: true,
      allowed: false,
      settingsUrl: 'chrome://extensions/?id=test-id',
    });
    vi.mocked(browser.tabs.create).mockResolvedValue({
      id: 99,
      index: 0,
      highlighted: false,
      active: true,
      pinned: false,
      incognito: false,
    });
  });

  it('shows file access guidance when selected local file tabs fail to connect', async () => {
    const { result, unmount } = renderUseSyncControl([
      { id: 1, title: 'one.md', url: 'file:///Users/me/one.md', eligible: true },
      { id: 2, title: 'two.md', url: 'file:///Users/me/two.md', eligible: true },
    ]);

    await act(async () => {
      result.current.handleStart();
    });

    await waitFor(() => expect(result.current.error?.message).toBe('fileAccessConnectionFailed'));
    expect(result.current.error?.action?.label).toBe('openExtensionSettings');

    act(() => {
      result.current.error?.action?.handler();
    });

    expect(browser.tabs.create).toHaveBeenCalledWith({
      url: 'chrome://extensions/?id=test-id',
    });

    unmount();
  });

  it('keeps the generic retry action for non-file connection failures', async () => {
    const { result, unmount } = renderUseSyncControl([
      { id: 1, title: 'one', url: 'https://example.com/one', eligible: true },
      { id: 2, title: 'two', url: 'https://example.com/two', eligible: true },
    ]);

    await act(async () => {
      result.current.handleStart();
    });

    await waitFor(() =>
      expect(result.current.error?.message).toBe('Failed to connect to at least 2 tabs'),
    );
    expect(result.current.error?.action?.label).toBe('retry');

    unmount();
  });

  it('keeps the generic retry action when only a non-file tab fails in a mixed selection', async () => {
    vi.mocked(sendMessage).mockImplementation(async (message) => {
      if (message === 'sync:get-status') {
        return createInactiveStatus(0);
      }

      return {
        success: false,
        connectedTabs: [1],
        connectionResults: {
          1: { success: true },
          2: { success: false, error: 'Could not establish connection' },
        },
        error: 'HTTPS tab failed',
      };
    });

    const { result, unmount } = renderUseSyncControl([
      { id: 1, title: 'one.md', url: 'file:///Users/me/one.md', eligible: true },
      { id: 2, title: 'two', url: 'https://example.com/two', eligible: true },
    ]);

    await act(async () => {
      result.current.handleStart();
    });

    await waitFor(() => expect(result.current.error?.message).toBe('HTTPS tab failed'));
    expect(result.current.error?.action?.label).toBe('retry');
    expect(getFileSchemeAccessInfo).not.toHaveBeenCalled();

    unmount();
  });

  it('keeps the generic retry action when local file access is already allowed', async () => {
    vi.mocked(getFileSchemeAccessInfo).mockResolvedValue({
      canCheck: true,
      allowed: true,
      settingsUrl: 'chrome://extensions/?id=test-id',
    });

    const { result, unmount } = renderUseSyncControl([
      { id: 1, title: 'one.md', url: 'file:///Users/me/one.md', eligible: true },
      { id: 2, title: 'two.md', url: 'file:///Users/me/two.md', eligible: true },
    ]);

    await act(async () => {
      result.current.handleStart();
    });

    await waitFor(() =>
      expect(result.current.error?.message).toBe('Failed to connect to at least 2 tabs'),
    );
    expect(result.current.error?.action?.label).toBe('retry');
    expect(browser.tabs.create).not.toHaveBeenCalled();

    unmount();
  });

  it('shows auto-sync recovery warning without claiming success after a rejected Start', async () => {
    vi.mocked(sendMessage).mockImplementation(async (message) => {
      if (message === 'sync:get-status') {
        return createInactiveStatus(0);
      }

      return {
        success: false,
        connectedTabs: [],
        connectionResults: {
          1: { success: false, error: 'Invalid acknowledgement' },
          2: { success: false, error: 'Invalid acknowledgement' },
        },
        error: 'Failed to start synchronization',
        warning: 'auto-sync-degraded',
      };
    });

    const { result, unmount } = renderUseSyncControl([
      { id: 1, title: 'one', url: 'https://example.com/one', eligible: true },
      { id: 2, title: 'two', url: 'https://example.com/two', eligible: true },
    ]);

    await act(async () => {
      result.current.handleStart();
    });

    await waitFor(() => expect(result.current.error?.message).toBe('autoSyncRecoveryDegraded'));
    expect(result.current.error?.severity).toBe('warning');
    expect(result.current.syncStatus.isActive).toBe(false);

    unmount();
  });

  it('keeps a degraded rollback warning visible when rejected local-file tabs also need access', async () => {
    vi.mocked(sendMessage).mockImplementation(async (message) => {
      if (message === 'sync:get-status') {
        return createInactiveStatus(0);
      }

      return {
        success: false,
        connectedTabs: [],
        connectionResults: {
          1: { success: false, error: 'Could not establish connection' },
          2: { success: false, error: 'Could not establish connection' },
        },
        error: 'Failed to start synchronization',
        warning: 'auto-sync-degraded',
      };
    });

    const { result, unmount } = renderUseSyncControl([
      { id: 1, title: 'one.md', url: 'file:///Users/me/one.md', eligible: true },
      { id: 2, title: 'two.md', url: 'file:///Users/me/two.md', eligible: true },
    ]);

    await act(async () => {
      result.current.handleStart();
    });

    await waitFor(() => expect(result.current.error?.message).toBe('autoSyncRecoveryDegraded'));
    expect(result.current.error?.severity).toBe('warning');
    expect(result.current.syncStatus.isActive).toBe(false);
    expect(getFileSchemeAccessInfo).not.toHaveBeenCalled();

    unmount();
  });

  it('keeps committed Start state but surfaces auto-sync recovery warning', async () => {
    vi.mocked(sendMessage).mockImplementation(async (message) => {
      if (message === 'sync:get-status') {
        return createInactiveStatus(0);
      }

      return {
        success: true,
        connectedTabs: [1, 2],
        connectionResults: {
          1: { success: true },
          2: { success: true },
        },
        revision: 1,
        warning: 'auto-sync-degraded',
      };
    });

    const { result, unmount } = renderUseSyncControl([
      { id: 1, title: 'one', url: 'https://example.com/one', eligible: true },
      { id: 2, title: 'two', url: 'https://example.com/two', eligible: true },
    ]);
    await waitFor(() =>
      expect(sendMessageMock).toHaveBeenCalledWith(
        'sync:get-status',
        { source: 'popup', viewerTabId: 1, viewerWindowId: 4 },
        'background',
      ),
    );

    await act(async () => {
      result.current.handleStart();
    });

    await waitFor(() => expect(result.current.error?.message).toBe('autoSyncRecoveryDegraded'));
    expect(result.current.error?.severity).toBe('warning');
    expect(result.current.syncStatus).toEqual({
      isActive: true,
      connectedTabs: [1, 2],
      connectionStatuses: { 1: 'connected', 2: 'connected' },
      revision: 1,
    });

    unmount();
  });
});

describe('useSyncControl revision-aware lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enableReactActEnvironment();
    vi.mocked(getFileSchemeAccessInfo).mockResolvedValue({
      canCheck: true,
      allowed: true,
      settingsUrl: 'chrome://extensions/?id=test-id',
    });
  });

  it('restores the authoritative inactive revision instead of retaining the initial zero', async () => {
    vi.mocked(sendMessage).mockResolvedValue(createInactiveStatus(7));

    const { result, unmount } = renderUseSyncControl([
      { id: 1, title: 'one', url: 'https://example.com/one', eligible: true },
      { id: 2, title: 'two', url: 'https://example.com/two', eligible: true },
    ]);

    await waitFor(() => expect(result.current.syncStatus.revision).toBe(7));
    expect(result.current.syncStatus.isActive).toBe(false);

    unmount();
  });

  it('keeps initial state unknown and reports unavailable restore as retryable', async () => {
    vi.mocked(sendMessage).mockResolvedValue({
      status: 'error',
      reason: 'storage-error',
    });

    const { result, unmount } = renderUseSyncControl([
      { id: 1, title: 'one', url: 'https://example.com/one', eligible: true },
    ]);

    await waitFor(() => expect(result.current.error?.message).toBe('manualSyncStateUnavailable'));
    expect(result.current.syncStatus).toEqual({
      isActive: false,
      connectedTabs: [],
      connectionStatuses: {},
      revision: 0,
    });
    expect(result.current.error?.action?.label).toBe('retry');
    unmount();
  });

  it('sends the exact viewer request and preserves cross-window and unavailable topology', async () => {
    vi.mocked(sendMessage).mockResolvedValue({
      status: 'active',
      snapshot: {
        revision: 8,
        sessionEpoch: 3,
        mode: 'ratio',
        linkedTabIds: [1, 22, 33],
        tabs: [
          {
            availability: 'available',
            tabId: 1,
            title: 'Current tab',
            windowId: 4,
            location: 'current-tab',
            connectionStatus: 'connected',
          },
          {
            availability: 'available',
            tabId: 22,
            title: 'Other window',
            windowId: 9,
            location: 'other-window',
            connectionStatus: 'disconnected',
          },
          {
            availability: 'unavailable',
            tabId: 33,
            connectionStatus: 'error',
          },
        ],
      },
    });

    const { result, unmount } = renderUseSyncControl([
      { id: 1, title: 'one', url: 'https://example.com/one', eligible: true },
    ]);

    await waitFor(() => expect(result.current.syncStatus.revision).toBe(8));
    expect(browser.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
    expect(sendMessageMock).toHaveBeenCalledWith(
      'sync:get-status',
      { source: 'popup', viewerTabId: 1, viewerWindowId: 4 },
      'background',
    );
    expect(result.current.syncStatus).toEqual({
      isActive: true,
      connectedTabs: [1, 22, 33],
      connectionStatuses: { 1: 'connected', 22: 'disconnected', 33: 'error' },
      revision: 8,
    });
    expect(sendMessageMock).not.toHaveBeenCalledWith(
      'scroll:stop',
      expect.anything(),
      'background',
    );

    unmount();
  });

  it('preserves active state when a later popup viewer lookup is unavailable', async () => {
    tabsQueryMock
      .mockResolvedValueOnce([
        {
          id: 1,
          windowId: 4,
          index: 0,
          highlighted: false,
          active: true,
          pinned: false,
          incognito: false,
        },
      ])
      .mockResolvedValueOnce([]);
    vi.mocked(sendMessage).mockImplementation(async (message) => {
      if (message === 'sync:get-status') {
        return createActiveStatus(8, [1, 22], { 1: 'connected', 22: 'connected' });
      }
      return { status: 'rejected', reason: 'stale-revision' };
    });
    const { result, unmount } = renderUseSyncControl([
      { id: 1, title: 'one', url: 'https://example.com/one', eligible: true },
    ]);
    await waitFor(() => expect(result.current.syncStatus.revision).toBe(8));

    await act(async () => result.current.handleStop());

    expect(result.current.syncStatus).toEqual({
      isActive: true,
      connectedTabs: [1, 22],
      connectionStatuses: { 1: 'connected', 22: 'connected' },
      revision: 8,
    });
    expect(result.current.error?.message).toBe('manualSyncStateUnavailable');
    expect(result.current.error?.action?.label).toBe('retry');
    unmount();
  });

  it('stores the committed revision returned by Start', async () => {
    vi.mocked(sendMessage).mockImplementation(async (message) => {
      if (message === 'sync:get-status') {
        return createInactiveStatus(4);
      }

      return {
        success: true,
        connectedTabs: [1, 2],
        connectionResults: {
          1: { success: true },
          2: { success: true },
        },
        revision: 5,
      };
    });

    const { result, unmount } = renderUseSyncControl([
      { id: 1, title: 'one', url: 'https://example.com/one', eligible: true },
      { id: 2, title: 'two', url: 'https://example.com/two', eligible: true },
    ]);

    await waitFor(() => expect(result.current.syncStatus.revision).toBe(4));
    await act(async () => {
      result.current.handleStart();
    });

    await waitFor(() => expect(result.current.syncStatus.revision).toBe(5));
    expect(result.current.syncStatus.isActive).toBe(true);

    unmount();
  });

  it('sends the committed revision and preserves active truth after a rejected Stop', async () => {
    let statusRequestCount = 0;
    vi.mocked(sendMessage).mockImplementation(async (message) => {
      if (message === 'sync:get-status') {
        statusRequestCount += 1;
        return createActiveStatus(statusRequestCount === 1 ? 9 : 10, [1, 2], {
          1: 'connected',
          2: 'connected',
        });
      }

      return { status: 'rejected', reason: 'stale-revision' };
    });

    const { result, unmount } = renderUseSyncControl([
      { id: 1, title: 'one', url: 'https://example.com/one', eligible: true },
      { id: 2, title: 'two', url: 'https://example.com/two', eligible: true },
    ]);

    await waitFor(() => expect(result.current.syncStatus.revision).toBe(9));
    await act(async () => {
      await result.current.handleStop();
    });

    expect(sendMessageMock).toHaveBeenCalledWith(
      'scroll:stop',
      { expectedRevision: 9 },
      'background',
    );
    await waitFor(() => expect(result.current.syncStatus.revision).toBe(10));
    expect(result.current.syncStatus.isActive).toBe(true);
    expect(result.current.error?.severity).toBe('warning');

    unmount();
  });

  it('preserves active truth when stale Stop refresh is unavailable', async () => {
    let statusRequests = 0;
    vi.mocked(sendMessage).mockImplementation(async (message) => {
      if (message === 'sync:get-status') {
        statusRequests += 1;
        return statusRequests === 1
          ? createActiveStatus(9, [1, 2], { 1: 'connected', 2: 'connected' })
          : { status: 'error', reason: 'storage-error' };
      }
      return { status: 'rejected', reason: 'stale-revision' };
    });

    const { result, unmount } = renderUseSyncControl([
      { id: 1, title: 'one', url: 'https://example.com/one', eligible: true },
      { id: 2, title: 'two', url: 'https://example.com/two', eligible: true },
    ]);
    await waitFor(() => expect(result.current.syncStatus.revision).toBe(9));
    await act(async () => result.current.handleStop());

    expect(result.current.syncStatus.isActive).toBe(true);
    expect(result.current.syncStatus.connectedTabs).toEqual([1, 2]);
    expect(result.current.error?.message).toBe('manualSyncStateUnavailable');
    unmount();
  });

  it('commits inactive local truth and surfaces incomplete cleanup after Stop', async () => {
    vi.mocked(sendMessage).mockImplementation(async (message) => {
      if (message === 'sync:get-status') {
        return createActiveStatus(12, [1, 2], { 1: 'connected', 2: 'connected' });
      }

      return { status: 'committed', revision: 13, warning: 'cleanup-incomplete' };
    });

    const { result, unmount } = renderUseSyncControl([
      { id: 1, title: 'one', url: 'https://example.com/one', eligible: true },
      { id: 2, title: 'two', url: 'https://example.com/two', eligible: true },
    ]);

    await waitFor(() => expect(result.current.syncStatus.revision).toBe(12));
    await act(async () => {
      await result.current.handleStop();
    });

    expect(result.current.syncStatus).toEqual({
      isActive: false,
      connectedTabs: [],
      connectionStatuses: {},
      revision: 13,
    });
    expect(result.current.error).toMatchObject({
      message: 'warningStopSyncFailed:cleanup-incomplete',
      severity: 'warning',
    });

    unmount();
  });

  it('reconnects with the committed revision and stores the returned revision', async () => {
    vi.mocked(sendMessage).mockImplementation(async (message) => {
      if (message === 'sync:get-status') {
        return createActiveStatus(21, [1, 2], { 1: 'error', 2: 'connected' });
      }

      return { status: 'committed', revision: 22 };
    });

    const { result, unmount } = renderUseSyncControl([
      { id: 1, title: 'one', url: 'https://example.com/one', eligible: true },
      { id: 2, title: 'two', url: 'https://example.com/two', eligible: true },
    ]);

    await waitFor(() => expect(result.current.syncStatus.revision).toBe(21));
    await act(async () => {
      await result.current.handleResync();
    });

    expect(sendMessageMock).toHaveBeenCalledWith(
      'sync:reconnect-session',
      { expectedRevision: 21 },
      'background',
    );
    expect(result.current.syncStatus.revision).toBe(22);
    expect(result.current.syncStatus.connectionStatuses).toEqual({
      1: 'connected',
      2: 'connected',
    });

    unmount();
  });

  it.each([
    {
      name: '3-to-2 topology removal',
      refreshed: createActiveStatus(22, [2, 3], { 2: 'connected', 3: 'connected' }),
      expected: {
        isActive: true,
        connectedTabs: [2, 3],
        connectionStatuses: { 2: 'connected', 3: 'connected' },
        revision: 22,
      },
    },
    {
      name: '2-to-inactive durable Stop',
      refreshed: createInactiveStatus(22),
      expected: {
        isActive: false,
        connectedTabs: [],
        connectionStatuses: {},
        revision: 22,
      },
    },
  ])('refreshes authoritative popup truth after $name', async ({ refreshed, expected }) => {
    let statusRequests = 0;
    vi.mocked(sendMessage).mockImplementation(async (message) => {
      if (message === 'sync:get-status') {
        statusRequests += 1;
        return statusRequests === 1
          ? createActiveStatus(21, [1, 2, 3], {
              1: 'error',
              2: 'connected',
              3: 'connected',
            })
          : refreshed;
      }
      return { status: 'refresh-required', revision: 22 };
    });

    const { result, unmount } = renderUseSyncControl([
      { id: 1, title: 'one', url: 'https://example.com/one', eligible: true },
      { id: 2, title: 'two', url: 'https://example.com/two', eligible: true },
      { id: 3, title: 'three', url: 'https://example.com/three', eligible: true },
    ]);

    await waitFor(() => expect(result.current.syncStatus.revision).toBe(21));
    await act(async () => {
      await result.current.handleResync();
    });

    expect(statusRequests).toBe(2);
    expect(result.current.syncStatus).toEqual(expected);
    unmount();
  });

  it('preserves active truth when reconnect refresh is unavailable', async () => {
    let statusRequests = 0;
    vi.mocked(sendMessage).mockImplementation(async (message) => {
      if (message === 'sync:get-status') {
        statusRequests += 1;
        return statusRequests === 1
          ? createActiveStatus(21, [1, 2], { 1: 'error', 2: 'connected' })
          : { status: 'error', reason: 'invalid-state' };
      }
      return { status: 'refresh-required', revision: 22 };
    });
    const { result, unmount } = renderUseSyncControl([
      { id: 1, title: 'one', url: 'https://example.com/one', eligible: true },
      { id: 2, title: 'two', url: 'https://example.com/two', eligible: true },
    ]);
    await waitFor(() => expect(result.current.syncStatus.revision).toBe(21));
    await act(async () => result.current.handleResync());

    expect(result.current.syncStatus).toEqual({
      isActive: true,
      connectedTabs: [1, 2],
      connectionStatuses: { 1: 'error', 2: 'connected' },
      revision: 21,
    });
    expect(result.current.error?.message).toBe('manualSyncStateUnavailable');
    unmount();
  });

  it.each([
    { name: '3-to-2 removal', connectedTabs: [1, 2, 3] },
    { name: '2-to-inactive Stop', connectedTabs: [1, 2] },
  ])(
    'does not show reconnect success when missing-tab $name persistence fails',
    async ({ connectedTabs }) => {
      let statusRequests = 0;
      const connectionStatuses: Record<number, ConnectionStatus> = {};
      for (const tabId of connectedTabs) {
        connectionStatuses[tabId] = tabId === 1 ? 'error' : 'connected';
      }
      vi.mocked(sendMessage).mockImplementation(async (message) => {
        if (message === 'sync:get-status') {
          statusRequests += 1;
          return createActiveStatus(30, connectedTabs, connectionStatuses);
        }
        return { status: 'rejected', reason: 'persistence-failed' };
      });
      const { result, unmount } = renderUseSyncControl(
        connectedTabs.map((id) => ({
          id,
          title: `tab-${id}`,
          url: `https://example.com/${id}`,
          eligible: true,
        })),
      );
      await waitFor(() => expect(result.current.syncStatus.revision).toBe(30));
      await act(async () => result.current.handleResync());

      expect(statusRequests).toBe(2);
      expect(result.current.syncStatus.isActive).toBe(true);
      expect(result.current.syncStatus.connectedTabs).toEqual(connectedTabs);
      expect(result.current.error?.message).toBe('reconnectionFailed');
      expect(result.current.error?.severity).toBe('warning');
      unmount();
    },
  );
});
