import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendMessage } from 'webext-bridge/popup';
import browser from 'webextension-polyfill';

import { getFileSchemeAccessInfo } from '~/shared/lib/file-scheme-access';
import { loadSelectedTabIds } from '~/shared/lib/storage';

import { useSyncControl } from './use-sync-control';

import type { TabInfo } from '../types';

const {
  getFileSchemeAccessInfoMock,
  loadSelectedTabIdsMock,
  sendMessageMock,
  tabsCreateMock,
  tabsReloadMock,
} = vi.hoisted(() => ({
  getFileSchemeAccessInfoMock: vi.fn(),
  loadSelectedTabIdsMock: vi.fn(),
  sendMessageMock: vi.fn(),
  tabsCreateMock: vi.fn(),
  tabsReloadMock: vi.fn(),
}));

vi.mock('webext-bridge/popup', () => ({
  sendMessage: sendMessageMock,
}));

vi.mock('webextension-polyfill', () => ({
  default: {
    tabs: {
      create: tabsCreateMock,
      reload: tabsReloadMock,
    },
  },
}));

vi.mock('~/shared/lib/file-scheme-access', () => ({
  getFileSchemeAccessInfo: getFileSchemeAccessInfoMock,
}));

vi.mock('~/shared/lib/storage', () => ({
  loadSelectedTabIds: loadSelectedTabIdsMock,
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

interface RenderSyncControlOptions {
  selectedTabIds?: Array<number>;
  onSelectedTabIdsChange?: (
    updater: Array<number> | ((previous: Array<number>) => Array<number>),
  ) => void;
  onSessionChange?: () => Promise<void>;
}

const webTabs: Array<TabInfo> = [
  { id: 1, title: 'one', url: 'https://example.com/one', eligible: true },
  { id: 2, title: 'two', url: 'https://example.com/two', eligible: true },
  { id: 3, title: 'three', url: 'https://example.com/three', eligible: true },
];

function renderSyncControl(tabs: Array<TabInfo>, options: RenderSyncControlOptions = {}) {
  const searchInputRef: React.RefObject<{ focus: () => void } | null> = {
    current: { focus: vi.fn() },
  };
  const onSelectedTabIdsChange = options.onSelectedTabIdsChange ?? vi.fn();
  const onSessionChange = options.onSessionChange ?? vi.fn().mockResolvedValue(undefined);

  const hook = renderHook(() =>
    useSyncControl({
      selectedTabIds: options.selectedTabIds ?? tabs.map((tab) => tab.id),
      tabs,
      searchInputRef,
      onSelectedTabIdsChange,
      onSessionChange,
    }),
  );

  return {
    ...hook,
    onSelectedTabIdsChange,
    onSessionChange,
    searchInputRef,
  };
}

beforeEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  loadSelectedTabIdsMock.mockResolvedValue([]);
  getFileSchemeAccessInfoMock.mockResolvedValue({
    canCheck: true,
    allowed: true,
    settingsUrl: 'chrome://extensions/?id=test-id',
  });
  tabsReloadMock.mockResolvedValue(undefined);
  tabsCreateMock.mockResolvedValue({
    id: 99,
    index: 0,
    highlighted: false,
    active: true,
    pinned: false,
    incognito: false,
  });
});

describe('useSyncControl inactive picker ownership', () => {
  it('restores only saved tab IDs that remain in the inactive picker input', async () => {
    loadSelectedTabIdsMock.mockResolvedValue([2, 9]);
    const onSelectedTabIdsChange = vi.fn();

    renderSyncControl(webTabs, { onSelectedTabIdsChange });

    await waitFor(() => expect(onSelectedTabIdsChange).toHaveBeenCalledWith([2]));
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('does not query or fabricate authoritative session status', async () => {
    const { result } = renderSyncControl(webTabs);

    await waitFor(() => expect(loadSelectedTabIds).toHaveBeenCalledOnce());

    expect(sendMessageMock).not.toHaveBeenCalledWith(
      'sync:get-status',
      expect.anything(),
      'background',
    );
    expect(Object.keys(result.current).sort()).toEqual([
      'error',
      'handleDismissError',
      'handleStart',
    ]);
  });

  it('keeps the existing minimum selection validation', async () => {
    const { result } = renderSyncControl([webTabs[0]], { selectedTabIds: [1] });

    act(() => result.current.handleStart());

    await waitFor(() => expect(result.current.error?.message).toBe('errorMinTabsRequired'));
    expect(sendMessage).not.toHaveBeenCalledWith('scroll:start', expect.anything(), 'background');
  });

  it('sends the existing popup manual Start request and refetches session truth after commit', async () => {
    sendMessageMock.mockResolvedValueOnce({
      success: true,
      connectedTabs: [1, 2],
      connectionResults: {
        1: { success: true },
        2: { success: true },
      },
      revision: 6,
    });
    const onSessionChange = vi.fn().mockResolvedValue(undefined);
    const { result } = renderSyncControl(webTabs.slice(0, 2), { onSessionChange });

    act(() => result.current.handleStart());

    await waitFor(() => expect(onSessionChange).toHaveBeenCalledOnce());
    expect(sendMessage).toHaveBeenCalledWith(
      'scroll:start',
      {
        tabIds: [1, 2],
        mode: 'ratio',
        currentTabId: 1,
      },
      'background',
    );
    expect(result.current.error).toMatchObject({
      message: 'successfullyConnectedToTabs:2',
      severity: 'info',
    });
  });

  it('preserves partial Start success and refetches the committed session', async () => {
    sendMessageMock.mockResolvedValueOnce({
      success: true,
      connectedTabs: [1, 2],
      connectionResults: {
        1: { success: true },
        2: { success: true },
        3: { success: false, error: 'unreachable' },
      },
      revision: 7,
    });
    const onSessionChange = vi.fn().mockResolvedValue(undefined);
    const { result } = renderSyncControl(webTabs, { onSessionChange });

    act(() => result.current.handleStart());

    await waitFor(() => expect(onSessionChange).toHaveBeenCalledOnce());
    expect(result.current.error).toMatchObject({
      message: 'connectedToTabs:2,3,1',
      severity: 'warning',
    });
  });

  it('renders the explicit recovery copy after a committed degraded Start', async () => {
    sendMessageMock.mockResolvedValueOnce({
      success: true,
      connectedTabs: [1, 2],
      connectionResults: {
        1: { success: true },
        2: { success: true },
      },
      revision: 8,
      warning: 'auto-sync-degraded',
    });
    const onSessionChange = vi.fn().mockResolvedValue(undefined);
    const { result } = renderSyncControl(webTabs.slice(0, 2), { onSessionChange });

    act(() => result.current.handleStart());

    await waitFor(() => expect(onSessionChange).toHaveBeenCalledOnce());
    expect(result.current.error).toEqual({
      message: 'autoSyncRecoveryDegraded',
      severity: 'warning',
      timestamp: expect.any(Number),
    });
  });

  it('does not claim success after a rejected degraded Start', async () => {
    sendMessageMock.mockResolvedValueOnce({
      success: false,
      connectedTabs: [],
      connectionResults: {
        1: { success: false, error: 'invalid acknowledgement' },
        2: { success: false, error: 'invalid acknowledgement' },
      },
      revision: 8,
      error: 'Failed to start synchronization',
      warning: 'auto-sync-degraded',
    });
    const onSessionChange = vi.fn().mockResolvedValue(undefined);
    const { result } = renderSyncControl(webTabs.slice(0, 2), { onSessionChange });

    act(() => result.current.handleStart());

    await waitFor(() => expect(result.current.error?.message).toBe('autoSyncRecoveryDegraded'));
    expect(result.current.error?.severity).toBe('warning');
    expect(onSessionChange).not.toHaveBeenCalled();
  });
});

describe('useSyncControl file access and retry', () => {
  const fileTabs: Array<TabInfo> = [
    { id: 1, title: 'one.md', url: 'file:///Users/me/one.md', eligible: true },
    { id: 2, title: 'two.md', url: 'file:///Users/me/two.md', eligible: true },
  ];

  beforeEach(() => {
    sendMessageMock.mockResolvedValue({
      success: false,
      connectedTabs: [],
      connectionResults: {
        1: { success: false, error: 'Could not establish connection' },
        2: { success: false, error: 'Could not establish connection' },
      },
      revision: 0,
      error: 'Failed to connect to at least 2 tabs',
    });
  });

  it('shows file access guidance only when selected local tabs fail and access is disabled', async () => {
    getFileSchemeAccessInfoMock.mockResolvedValue({
      canCheck: true,
      allowed: false,
      settingsUrl: 'chrome://extensions/?id=test-id',
    });
    const { result } = renderSyncControl(fileTabs);

    act(() => result.current.handleStart());

    await waitFor(() => expect(result.current.error?.message).toBe('fileAccessConnectionFailed'));
    expect(result.current.error?.action?.label).toBe('openExtensionSettings');

    act(() => result.current.error?.action?.handler());
    expect(browser.tabs.create).toHaveBeenCalledWith({
      url: 'chrome://extensions/?id=test-id',
    });
  });

  it('keeps generic retry for non-file connection failures', async () => {
    const { result } = renderSyncControl(webTabs.slice(0, 2));

    act(() => result.current.handleStart());

    await waitFor(() =>
      expect(result.current.error?.message).toBe('Failed to connect to at least 2 tabs'),
    );
    expect(result.current.error?.action?.label).toBe('retry');
    expect(getFileSchemeAccessInfo).not.toHaveBeenCalled();
  });

  it('reloads the selected tabs before retrying Start', async () => {
    vi.useFakeTimers();
    const { result } = renderSyncControl(webTabs.slice(0, 2));
    act(() => result.current.handleStart());
    await act(async () => {
      await Promise.resolve();
    });

    const retry = result.current.error?.action?.handler;
    expect(retry).toBeDefined();

    act(() => retry?.());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(browser.tabs.reload).toHaveBeenCalledWith(1);
    expect(browser.tabs.reload).toHaveBeenCalledWith(2);
    expect(sendMessageMock).toHaveBeenCalledTimes(2);
  });

  it('dismisses popup-local Start guidance', async () => {
    const { result } = renderSyncControl([webTabs[0]], { selectedTabIds: [1] });
    act(() => result.current.handleStart());
    await waitFor(() => expect(result.current.error).not.toBeNull());

    act(() => result.current.handleDismissError());

    expect(result.current.error).toBeNull();
  });
});
