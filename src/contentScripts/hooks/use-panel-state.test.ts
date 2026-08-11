import { act, createElement } from 'react';

import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendMessage } from 'webext-bridge/content-script';

import { usePanelState } from './use-panel-state';

const { sendMessageMock, onMessageMock } = vi.hoisted(() => ({
  sendMessageMock: vi.fn(),
  onMessageMock: vi.fn(() => vi.fn()),
}));

vi.mock('webext-bridge/content-script', () => ({
  sendMessage: sendMessageMock,
  onMessage: onMessageMock,
}));

vi.mock('~/shared/lib/storage', () => ({
  loadAutoSyncEnabled: vi.fn().mockResolvedValue(false),
  loadManualScrollOffsets: vi.fn(),
  saveAutoSyncEnabled: vi.fn(),
}));

vi.mock('~/shared/i18n', () => ({
  t: (key: string) => key,
}));

vi.mock('../scroll-sync', () => ({
  getAutoSyncStatus: vi.fn(() => ({ isAutoSync: false, isActive: false })),
}));

vi.mock('~/shared/lib/logger', () => ({
  ExtensionLogger: vi.fn(() => ({ error: vi.fn() })),
}));

interface PanelState {
  syncedTabs: Array<{
    location: 'current-tab' | 'other-tab';
    connectionStatus: 'connected' | 'disconnected' | 'error';
  }>;
  syncStatusError: 'manualSyncStateUnavailable' | null;
  loadSyncedTabs: () => Promise<void>;
}

function renderPanelState(): { current: () => PanelState; unmount: () => void } {
  const container = document.createElement('div');
  const root = createRoot(container);
  let state: PanelState;

  function Host(): null {
    state = usePanelState({ wasDraggedRef: { current: false } });
    return null;
  }

  act(() => {
    root.render(createElement(Host));
  });

  return {
    current: () => state,
    unmount: () => {
      act(() => root.unmount());
    },
  };
}

function mockStatusResponses(responses: Array<unknown>): void {
  let statusIndex = 0;
  vi.mocked(sendMessage).mockImplementation(async (message) => {
    if (message === 'sync:get-status') {
      const response = responses[statusIndex];
      statusIndex += 1;
      return response;
    }
    return { success: false };
  });
}

const activeResponse = {
  status: 'active',
  source: 'content-script',
  snapshot: {
    revision: 4,
    sessionEpoch: 2,
    mode: 'ratio',
    linkedTabCount: 3,
    tabs: [
      {
        location: 'other-tab',
        connectionStatus: 'connected',
      },
      {
        location: 'current-tab',
        connectionStatus: 'connected',
      },
      {
        location: 'other-tab',
        connectionStatus: 'error',
      },
    ],
  },
};

describe('usePanelState manual sync status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
      configurable: true,
      value: true,
      writable: true,
    });
  });

  it('requests canonical content status and applies only sanitized authoritative rows', async () => {
    mockStatusResponses([activeResponse]);
    const hook = renderPanelState();

    await act(async () => hook.current().loadSyncedTabs());

    expect(sendMessage).toHaveBeenCalledWith(
      'sync:get-status',
      { source: 'content-script' },
      'background',
    );
    expect(hook.current().syncedTabs).toEqual([
      { location: 'other-tab', connectionStatus: 'connected' },
      { location: 'current-tab', connectionStatus: 'connected' },
      { location: 'other-tab', connectionStatus: 'error' },
    ]);
    expect(hook.current().syncStatusError).toBeNull();
    hook.unmount();
  });

  it('clears tabs only for a canonical inactive response', async () => {
    mockStatusResponses([
      activeResponse,
      {
        status: 'inactive',
        source: 'content-script',
        revision: 5,
        sessionEpoch: 2,
      },
    ]);
    const hook = renderPanelState();
    await act(async () => hook.current().loadSyncedTabs());

    await act(async () => hook.current().loadSyncedTabs());

    expect(hook.current().syncedTabs).toEqual([]);
    expect(hook.current().syncStatusError).toBeNull();
    hook.unmount();
  });

  it('preserves prior tabs when authoritative status is an error', async () => {
    mockStatusResponses([activeResponse, { status: 'error', reason: 'storage-error' }]);
    const hook = renderPanelState();
    await act(async () => hook.current().loadSyncedTabs());
    const priorTabs = hook.current().syncedTabs;

    await act(async () => hook.current().loadSyncedTabs());

    expect(hook.current().syncedTabs).toEqual(priorTabs);
    expect(hook.current().syncStatusError).toBe('manualSyncStateUnavailable');
    hook.unmount();
  });

  it('preserves prior tabs when status transport fails', async () => {
    mockStatusResponses([activeResponse]);
    const hook = renderPanelState();
    await act(async () => hook.current().loadSyncedTabs());
    const priorTabs = hook.current().syncedTabs;
    vi.mocked(sendMessage).mockRejectedValueOnce(new Error('transport failed'));

    await act(async () => hook.current().loadSyncedTabs());

    expect(hook.current().syncedTabs).toEqual(priorTabs);
    expect(hook.current().syncStatusError).toBe('manualSyncStateUnavailable');
    hook.unmount();
  });
});
