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

vi.mock('webext-bridge/popup', () => ({
  sendMessage: vi.fn(),
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

describe('useUrlSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.mocked(loadUrlSyncEnabled).mockResolvedValue(true);
    vi.mocked(repairUrlSyncMode).mockResolvedValue({
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

  it('keeps mode state and skips broadcast when persistence fails', async () => {
    vi.mocked(saveUrlSyncMode).mockResolvedValue(false);
    const { result, unmount } = renderHook(() => useUrlSync());
    await waitFor(() => expect(result.current.urlSyncMode).toBe('follow-changed-tab'));

    await act(async () => {
      await result.current.handleUrlSyncModeChange('keep-each-tabs-website');
    });

    expect(result.current.urlSyncMode).toBe('follow-changed-tab');
    expect(result.current.urlSyncNotice).toEqual({
      key: 'urlSyncSettingSaveFailedNotice',
      severity: 'error',
    });
    expect(sendMessage).not.toHaveBeenCalled();

    unmount();
  });
});
