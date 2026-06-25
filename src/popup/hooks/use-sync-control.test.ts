import { act, createElement } from 'react';

import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendMessage } from 'webext-bridge/popup';
import browser from 'webextension-polyfill';

import { getFileSchemeAccessInfo } from '~/shared/lib/file-scheme-access';

import { useSyncControl } from './use-sync-control';

import type { TabInfo } from '../types';

const { sendMessageMock, tabsCreateMock, tabsReloadMock, getFileSchemeAccessInfoMock } = vi.hoisted(
  () => ({
    sendMessageMock: vi.fn(),
    tabsCreateMock: vi.fn(),
    tabsReloadMock: vi.fn(),
    getFileSchemeAccessInfoMock: vi.fn(),
  }),
);

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

describe('useSyncControl local file failures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enableReactActEnvironment();
    vi.mocked(sendMessage).mockImplementation(async (message) => {
      if (message === 'sync:get-status') {
        return { success: true, isActive: false };
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
        return { success: true, isActive: false };
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
});
