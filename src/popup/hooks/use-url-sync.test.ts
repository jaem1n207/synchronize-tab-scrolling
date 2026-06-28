import { act, createElement } from 'react';

import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendMessage } from 'webext-bridge/popup';

import {
  loadUrlSyncEnabled,
  repairUrlSyncMode,
  saveUrlSyncEnabled,
  saveUrlSyncMode,
} from '~/shared/lib/storage';

import { useUrlSync } from './use-url-sync';

const browserMocks = vi.hoisted(() => ({
  storageChangeListeners: new Set<
    (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>, areaName: string) => void
  >(),
}));

vi.mock('webext-bridge/popup', () => ({
  sendMessage: vi.fn(),
}));

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      onChanged: {
        addListener: vi.fn((listener) => {
          browserMocks.storageChangeListeners.add(listener);
        }),
        removeListener: vi.fn((listener) => {
          browserMocks.storageChangeListeners.delete(listener);
        }),
      },
    },
  },
}));

vi.mock('~/shared/lib/storage', () => ({
  loadUrlSyncEnabled: vi.fn(),
  repairUrlSyncMode: vi.fn(),
  saveUrlSyncEnabled: vi.fn(),
  saveUrlSyncMode: vi.fn(),
}));

vi.mock('~/shared/lib/logger', () => ({
  ExtensionLogger: vi.fn().mockImplementation(() => ({
    debug: vi.fn(),
    info: vi.fn(),
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

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
}

function renderHook<T>(hook: () => T): RenderHookResult<T> {
  const container = document.createElement('div');
  const root = createRoot(container);
  let value: T | undefined;

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
        if (value === undefined) {
          throw new Error('Hook result was read before initial render');
        }
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

function triggerStorageChange(
  changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
  areaName = 'local',
): void {
  for (const listener of browserMocks.storageChangeListeners) {
    listener(changes, areaName);
  }
}

describe('useUrlSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    browserMocks.storageChangeListeners.clear();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.mocked(loadUrlSyncEnabled).mockResolvedValue(true);
    vi.mocked(repairUrlSyncMode).mockResolvedValue({
      status: 'success',
      mode: 'follow-changed-tab',
      repaired: false,
    });
    vi.mocked(saveUrlSyncEnabled).mockResolvedValue(true);
    vi.mocked(saveUrlSyncMode).mockResolvedValue(true);
    vi.mocked(sendMessage).mockResolvedValue(undefined);
  });

  it('commits enabled changes only after persistence succeeds', async () => {
    const { result, unmount } = renderHook(() => useUrlSync());
    await waitFor(() => expect(result.current.urlSyncEnabled).toBe(true));

    await act(async () => {
      await result.current.handleUrlSyncChange(false);
    });

    expect(saveUrlSyncEnabled).toHaveBeenCalledWith(false);
    expect(result.current.urlSyncEnabled).toBe(false);
    expect(sendMessage).toHaveBeenCalledWith(
      'sync:url-enabled-changed',
      { enabled: false },
      'background',
    );

    unmount();
  });

  it('keeps enabled state and skips broadcast when persistence fails', async () => {
    vi.mocked(saveUrlSyncEnabled).mockResolvedValue(false);
    const { result, unmount } = renderHook(() => useUrlSync());
    await waitFor(() => expect(result.current.urlSyncEnabled).toBe(true));

    await act(async () => {
      await result.current.handleUrlSyncChange(false);
    });

    expect(result.current.urlSyncEnabled).toBe(true);
    expect(result.current.urlSyncNotice).toEqual({
      key: 'urlSyncSettingSaveFailedNotice',
      severity: 'error',
    });
    expect(sendMessage).not.toHaveBeenCalled();

    unmount();
  });

  it('commits mode changes only after persistence succeeds', async () => {
    const { result, unmount } = renderHook(() => useUrlSync());
    await waitFor(() => expect(result.current.urlSyncMode).toBe('follow-changed-tab'));

    let saved: boolean | undefined;
    await act(async () => {
      saved = await result.current.handleUrlSyncModeChange('keep-each-tabs-website');
    });

    expect(saved).toBe(true);
    expect(saveUrlSyncMode).toHaveBeenCalledWith('keep-each-tabs-website');
    expect(result.current.urlSyncMode).toBe('keep-each-tabs-website');
    expect(sendMessage).toHaveBeenCalledWith(
      'sync:url-mode-changed',
      { mode: 'keep-each-tabs-website' },
      'background',
    );

    unmount();
  });

  it('keeps mode state and skips broadcast when persistence fails', async () => {
    vi.mocked(saveUrlSyncMode).mockResolvedValue(false);
    const { result, unmount } = renderHook(() => useUrlSync());
    await waitFor(() => expect(result.current.urlSyncMode).toBe('follow-changed-tab'));

    let saved: boolean | undefined;
    await act(async () => {
      saved = await result.current.handleUrlSyncModeChange('keep-each-tabs-website');
    });

    expect(saved).toBe(false);
    expect(result.current.urlSyncMode).toBe('follow-changed-tab');
    expect(result.current.urlSyncNotice).toEqual({
      key: 'urlSyncSettingSaveFailedNotice',
      severity: 'error',
    });
    expect(sendMessage).not.toHaveBeenCalled();

    unmount();
  });

  it('updates enabled state from external local storage changes', async () => {
    vi.mocked(saveUrlSyncEnabled).mockResolvedValue(false);
    const { result, unmount } = renderHook(() => useUrlSync());
    await waitFor(() => expect(result.current.urlSyncEnabled).toBe(true));

    await act(async () => {
      await result.current.handleUrlSyncChange(false);
    });
    expect(result.current.urlSyncNotice).toEqual({
      key: 'urlSyncSettingSaveFailedNotice',
      severity: 'error',
    });

    act(() => {
      triggerStorageChange({
        urlSyncEnabled: { oldValue: true, newValue: false },
      });
    });

    expect(result.current.urlSyncEnabled).toBe(false);
    expect(result.current.urlSyncNotice).toBeNull();
    expect(sendMessage).not.toHaveBeenCalled();

    unmount();
  });

  it('updates mode state from external local storage changes', async () => {
    const { result, unmount } = renderHook(() => useUrlSync());
    await waitFor(() => expect(result.current.urlSyncMode).toBe('follow-changed-tab'));

    act(() => {
      triggerStorageChange({
        urlSyncMode: {
          oldValue: 'follow-changed-tab',
          newValue: 'keep-each-tabs-website',
        },
      });
    });

    expect(result.current.urlSyncMode).toBe('keep-each-tabs-website');
    expect(result.current.urlSyncNotice).toBeNull();
    expect(sendMessage).not.toHaveBeenCalled();

    unmount();
  });

  it('uses defaults when URL sync storage keys are removed', async () => {
    const { result, unmount } = renderHook(() => useUrlSync());
    await waitFor(() => expect(result.current.urlSyncMode).toBe('follow-changed-tab'));

    act(() => {
      triggerStorageChange({
        urlSyncEnabled: { oldValue: true, newValue: false },
        urlSyncMode: {
          oldValue: 'follow-changed-tab',
          newValue: 'keep-each-tabs-website',
        },
      });
    });

    expect(result.current.urlSyncEnabled).toBe(false);
    expect(result.current.urlSyncMode).toBe('keep-each-tabs-website');

    act(() => {
      triggerStorageChange({
        urlSyncEnabled: { oldValue: false, newValue: undefined },
        urlSyncMode: { oldValue: 'keep-each-tabs-website', newValue: undefined },
      });
    });

    expect(result.current.urlSyncEnabled).toBe(true);
    expect(result.current.urlSyncMode).toBe('follow-changed-tab');
    expect(result.current.urlSyncNotice).toBeNull();
    expect(repairUrlSyncMode).toHaveBeenCalledTimes(1);

    unmount();
  });

  it('resets mode and repairs storage when an external mode change is invalid', async () => {
    vi.mocked(repairUrlSyncMode).mockResolvedValue({
      status: 'success',
      mode: 'follow-changed-tab',
      repaired: true,
      notice: { key: 'urlSyncModeResetNotice', severity: 'warning' },
    });
    const { result, unmount } = renderHook(() => useUrlSync());
    await waitFor(() => expect(result.current.urlSyncMode).toBe('follow-changed-tab'));

    await act(async () => {
      triggerStorageChange({
        urlSyncMode: {
          oldValue: 'follow-changed-tab',
          newValue: 'unexpected-mode',
        },
      });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.urlSyncMode).toBe('follow-changed-tab');
      expect(result.current.urlSyncNotice).toEqual({
        key: 'urlSyncModeResetNotice',
        severity: 'warning',
      });
    });
    expect(repairUrlSyncMode).toHaveBeenCalledTimes(2);
    expect(sendMessage).not.toHaveBeenCalled();

    unmount();
  });

  it('does not overwrite newer storage state when the initial load resolves late', async () => {
    const enabledLoad = createDeferred<boolean>();
    const modeLoad = createDeferred<Awaited<ReturnType<typeof repairUrlSyncMode>>>();
    vi.mocked(loadUrlSyncEnabled).mockReturnValueOnce(enabledLoad.promise);
    vi.mocked(repairUrlSyncMode).mockReturnValueOnce(modeLoad.promise);

    const { result, unmount } = renderHook(() => useUrlSync());

    act(() => {
      triggerStorageChange({
        urlSyncMode: {
          oldValue: 'follow-changed-tab',
          newValue: 'keep-each-tabs-website',
        },
      });
    });

    expect(result.current.urlSyncMode).toBe('keep-each-tabs-website');

    await act(async () => {
      enabledLoad.resolve(true);
      modeLoad.resolve({
        status: 'success',
        mode: 'follow-changed-tab',
        repaired: false,
      });
      await Promise.resolve();
    });

    expect(result.current.urlSyncMode).toBe('keep-each-tabs-website');

    unmount();
  });

  it('shows a read failure notice without changing mode when initial mode repair fails', async () => {
    vi.mocked(repairUrlSyncMode).mockResolvedValueOnce({
      status: 'failed',
      reason: 'read-failed',
      repaired: false,
      notice: { key: 'urlSyncSettingReadFailedNotice', severity: 'error' },
    });

    const { result, unmount } = renderHook(() => useUrlSync());

    await waitFor(() => {
      expect(result.current.urlSyncNotice).toEqual({
        key: 'urlSyncSettingReadFailedNotice',
        severity: 'error',
      });
    });
    expect(result.current.urlSyncMode).toBe('follow-changed-tab');

    unmount();
  });
});
