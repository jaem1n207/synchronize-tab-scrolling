import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendMessage } from 'webext-bridge/popup';
import browser from 'webextension-polyfill';

import type {
  ManualReconnectResult,
  ManualStopResult,
  SyncStatusResponseMessage,
} from '~/shared/types/sync-session';

import { useManualSyncSession } from './use-manual-sync-session';

const { sendMessageMock, tabsQueryMock } = vi.hoisted(() => ({
  sendMessageMock: vi.fn(),
  tabsQueryMock: vi.fn(),
}));

vi.mock('webext-bridge/popup', () => ({
  sendMessage: sendMessageMock,
}));

vi.mock('webextension-polyfill', () => ({
  default: {
    tabs: {
      query: tabsQueryMock,
    },
  },
}));

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve: Deferred<T>['resolve'] = () => undefined;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

function createActiveStatus(
  revision: number,
  firstTabStatus: 'connected' | 'disconnected' | 'error' = 'connected',
): SyncStatusResponseMessage {
  return {
    status: 'active',
    snapshot: {
      revision,
      sessionEpoch: 4,
      mode: 'ratio',
      linkedTabIds: [11, 22, 33],
      tabs: [
        {
          availability: 'available',
          tabId: 11,
          title: 'Viewer tab',
          windowId: 3,
          location: 'current-tab',
          connectionStatus: firstTabStatus,
        },
        {
          availability: 'available',
          tabId: 22,
          title: 'Cross-window tab',
          windowId: 8,
          location: 'other-window',
          connectionStatus: 'connected',
        },
        {
          availability: 'unavailable',
          tabId: 33,
          connectionStatus: 'error',
        },
      ],
    },
  };
}

function createInactiveStatus(revision: number): SyncStatusResponseMessage {
  return {
    status: 'inactive',
    revision,
    sessionEpoch: 5,
  };
}

beforeEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  tabsQueryMock.mockResolvedValue([
    {
      id: 11,
      windowId: 3,
      index: 0,
      highlighted: false,
      active: true,
      pinned: false,
      incognito: false,
    },
  ]);
});

describe('useManualSyncSession status truth', () => {
  it('stays loading until the first authoritative status resolves', async () => {
    const status = createDeferred<SyncStatusResponseMessage>();
    sendMessageMock.mockReturnValue(status.promise);

    const { result } = renderHook(() => useManualSyncSession());

    expect(result.current.state).toEqual({ status: 'loading' });

    status.resolve(createInactiveStatus(2));
    await waitFor(() => expect(result.current.state.status).toBe('inactive'));
  });

  it('keeps a status transport failure distinct from inactive', async () => {
    sendMessageMock.mockRejectedValueOnce(new Error('worker unavailable'));

    const { result } = renderHook(() => useManualSyncSession());

    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: 'error',
        reason: 'transport-error',
      });
    });
  });

  it('keeps an explicit background status error distinct from transport failure', async () => {
    sendMessageMock.mockResolvedValueOnce({
      status: 'error',
      reason: 'storage-error',
    });

    const { result } = renderHook(() => useManualSyncSession());

    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: 'error',
        reason: 'storage-error',
      });
    });
  });

  it('uses the active tab only as viewer context and retains unavailable linked rows', async () => {
    sendMessageMock.mockResolvedValueOnce(createActiveStatus(7));

    const { result } = renderHook(() => useManualSyncSession());

    await waitFor(() => expect(result.current.state.status).toBe('active'));
    expect(browser.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
    expect(sendMessage).toHaveBeenCalledWith(
      'sync:get-status',
      { source: 'popup', viewerTabId: 11, viewerWindowId: 3 },
      'background',
    );
    expect(result.current.state).toEqual(createActiveStatus(7));
  });

  it('prevents an older refetch response from replacing a newer response', async () => {
    const olderStatus = createDeferred<SyncStatusResponseMessage>();
    sendMessageMock
      .mockReturnValueOnce(olderStatus.promise)
      .mockResolvedValueOnce(createActiveStatus(12));

    const { result } = renderHook(() => useManualSyncSession());
    await waitFor(() => expect(sendMessageMock).toHaveBeenCalledTimes(1));

    await act(async () => result.current.refetch());
    expect(result.current.state).toEqual(createActiveStatus(12));

    olderStatus.resolve(createInactiveStatus(11));
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.state).toEqual(createActiveStatus(12));
  });
});

describe('useManualSyncSession authoritative transitions', () => {
  it('refetches authoritative status after Stop and retains only a committed cleanup warning', async () => {
    sendMessageMock
      .mockResolvedValueOnce(createActiveStatus(8))
      .mockResolvedValueOnce({
        status: 'committed',
        revision: 9,
        warning: 'cleanup-incomplete',
      })
      .mockResolvedValueOnce(createInactiveStatus(9));

    const { result } = renderHook(() => useManualSyncSession());
    await waitFor(() => expect(result.current.state.status).toBe('active'));

    await act(async () => result.current.stop());

    expect(sendMessage).toHaveBeenCalledWith('scroll:stop', { expectedRevision: 8 }, 'background');
    expect(result.current.state).toEqual(createInactiveStatus(9));
    expect(result.current.warning).toBe('cleanup-incomplete');
    expect(result.current.isStopping).toBe(false);
  });

  it('does not optimistically change active topology while Stop is pending', async () => {
    const stopResult = createDeferred<ManualStopResult>();
    sendMessageMock
      .mockResolvedValueOnce(createActiveStatus(14))
      .mockReturnValueOnce(stopResult.promise)
      .mockResolvedValueOnce(createActiveStatus(15));

    const { result } = renderHook(() => useManualSyncSession());
    await waitFor(() => expect(result.current.state.status).toBe('active'));

    let stopPromise: Promise<void> | undefined;
    act(() => {
      stopPromise = result.current.stop();
    });

    expect(result.current.isStopping).toBe(true);
    expect(result.current.state).toEqual(createActiveStatus(14));

    stopResult.resolve({ status: 'rejected', reason: 'stale-revision' });
    await act(async () => stopPromise);

    expect(result.current.state).toEqual(createActiveStatus(15));
    expect(result.current.warning).toBeUndefined();
  });

  it('refetches and preserves active truth after Stop times out', async () => {
    vi.useFakeTimers();
    sendMessageMock
      .mockResolvedValueOnce(createActiveStatus(18))
      .mockReturnValueOnce(new Promise<ManualStopResult>(() => undefined))
      .mockResolvedValueOnce(createActiveStatus(19));

    const { result } = renderHook(() => useManualSyncSession());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.state).toEqual(createActiveStatus(18));

    let stopPromise = Promise.resolve();
    act(() => {
      stopPromise = result.current.stop();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
      await stopPromise;
    });

    expect(result.current.state).toEqual(createActiveStatus(19));
    expect(result.current.isStopping).toBe(false);
  });

  it.each<{
    name: string;
    operationResult: ManualReconnectResult | Promise<ManualReconnectResult>;
  }>([
    {
      name: 'committed',
      operationResult: { status: 'committed', revision: 22 },
    },
    {
      name: 'rejected',
      operationResult: { status: 'rejected', reason: 'persistence-failed' },
    },
    {
      name: 'refresh-required',
      operationResult: { status: 'refresh-required', revision: 22 },
    },
  ])(
    'refetches after a $name reconnect result without local status repair',
    async ({ operationResult }) => {
      sendMessageMock
        .mockResolvedValueOnce(createActiveStatus(21, 'error'))
        .mockResolvedValueOnce(operationResult)
        .mockResolvedValueOnce(createActiveStatus(22, 'disconnected'));

      const { result } = renderHook(() => useManualSyncSession());
      await waitFor(() => expect(result.current.state.status).toBe('active'));

      await act(async () => result.current.reconnect());

      expect(sendMessage).toHaveBeenCalledWith(
        'sync:reconnect-session',
        { expectedRevision: 21 },
        'background',
      );
      expect(result.current.state).toEqual(createActiveStatus(22, 'disconnected'));
      expect(result.current.isReconnecting).toBe(false);
    },
  );

  it('does not optimistically repair connection status while reconnect is pending', async () => {
    const reconnectResult = createDeferred<ManualReconnectResult>();
    sendMessageMock
      .mockResolvedValueOnce(createActiveStatus(24, 'error'))
      .mockReturnValueOnce(reconnectResult.promise)
      .mockResolvedValueOnce(createActiveStatus(25, 'connected'));

    const { result } = renderHook(() => useManualSyncSession());
    await waitFor(() => expect(result.current.state.status).toBe('active'));

    let reconnectPromise: Promise<void> | undefined;
    act(() => {
      reconnectPromise = result.current.reconnect();
    });

    expect(result.current.isReconnecting).toBe(true);
    expect(result.current.state).toEqual(createActiveStatus(24, 'error'));

    reconnectResult.resolve({ status: 'committed', revision: 25 });
    await act(async () => reconnectPromise);

    expect(result.current.state).toEqual(createActiveStatus(25, 'connected'));
  });

  it('refetches after reconnect times out', async () => {
    vi.useFakeTimers();
    sendMessageMock
      .mockResolvedValueOnce(createActiveStatus(27, 'error'))
      .mockReturnValueOnce(new Promise<ManualReconnectResult>(() => undefined))
      .mockResolvedValueOnce(createActiveStatus(28, 'error'));

    const { result } = renderHook(() => useManualSyncSession());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.state).toEqual(createActiveStatus(27, 'error'));

    let reconnectPromise = Promise.resolve();
    act(() => {
      reconnectPromise = result.current.reconnect();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
      await reconnectPromise;
    });

    expect(result.current.state).toEqual(createActiveStatus(28, 'error'));
  });

  it('does not issue Stop or reconnect without an active snapshot revision', async () => {
    sendMessageMock.mockResolvedValueOnce(createInactiveStatus(30));

    const { result } = renderHook(() => useManualSyncSession());
    await waitFor(() => expect(result.current.state.status).toBe('inactive'));

    await act(async () => {
      await result.current.stop();
      await result.current.reconnect();
    });

    expect(sendMessageMock).toHaveBeenCalledTimes(1);
  });
});

describe('useManualSyncSession recent Quick Sync outcome expiry', () => {
  it('preserves a recent outcome only until its absolute expiry', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(10_000));
    sendMessageMock.mockResolvedValueOnce({
      ...createInactiveStatus(31),
      recentQuickSyncOutcome: {
        tabId: 11,
        resultKind: 'start-failed',
        reason: 'connection-timeout',
        expiresAt: 10_100,
      },
    });

    const { result } = renderHook(() => useManualSyncSession());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      result.current.state.status === 'inactive'
        ? result.current.state.recentQuickSyncOutcome
        : undefined,
    ).toBeDefined();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(99);
    });
    expect(
      result.current.state.status === 'inactive'
        ? result.current.state.recentQuickSyncOutcome
        : undefined,
    ).toBeDefined();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(result.current.state).toEqual(createInactiveStatus(31));
  });

  it('does not let an older expiry timer clear a newer recent outcome', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(20_000));
    sendMessageMock
      .mockResolvedValueOnce({
        ...createInactiveStatus(40),
        recentQuickSyncOutcome: {
          tabId: 11,
          resultKind: 'candidate-failed',
          reason: 'hud-unavailable',
          expiresAt: 20_100,
        },
      })
      .mockResolvedValueOnce({
        ...createInactiveStatus(41),
        recentQuickSyncOutcome: {
          tabId: 11,
          resultKind: 'add-failed',
          reason: 'persistence-failed',
          expiresAt: 20_200,
        },
      });

    const { result } = renderHook(() => useManualSyncSession());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await result.current.refetch();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(
      result.current.state.status === 'inactive'
        ? result.current.state.recentQuickSyncOutcome?.expiresAt
        : undefined,
    ).toBe(20_200);
  });

  it('keeps an explicit status error after its recent outcome expires', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(30_000));
    sendMessageMock.mockResolvedValueOnce({
      status: 'error',
      reason: 'invalid-state',
      recentQuickSyncOutcome: {
        tabId: 11,
        resultKind: 'session-state-unavailable',
        reason: 'session-state-unavailable',
        expiresAt: 30_050,
      },
    });

    const { result } = renderHook(() => useManualSyncSession());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(50);
    });

    expect(result.current.state).toEqual({
      status: 'error',
      reason: 'invalid-state',
    });
  });
});
