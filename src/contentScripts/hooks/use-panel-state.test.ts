import { act, createElement } from 'react';

import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendMessage } from 'webext-bridge/content-script';

import { loadManualScrollOffsets } from '~/shared/lib/storage';

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

vi.mock('../scroll-sync', () => ({
  getAutoSyncStatus: vi.fn(() => ({ isAutoSync: false, isActive: false })),
}));

vi.mock('~/shared/lib/logger', () => ({
  ExtensionLogger: vi.fn(() => ({ error: vi.fn() })),
}));

interface PanelState {
  syncedTabs: Array<{
    id: number;
    title: string;
    offsetPixels: number;
    isCurrent: boolean;
  }>;
  syncStatusError: 'manualSyncStateUnavailable' | null;
  loadSyncedTabsWithOffsets: () => Promise<void>;
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
  status: 'ready',
  success: true,
  isActive: true,
  revision: 4,
  linkedTabs: [
    { id: 1, title: 'One', url: 'https://one.dev', eligible: true },
    { id: 2, title: 'Two', url: 'https://two.dev', eligible: true },
  ],
  connectedTabs: [1, 2],
  connectionStatuses: { 1: 'connected', 2: 'connected' },
  currentTabId: 2,
};

describe('usePanelState manual sync status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
      configurable: true,
      value: true,
      writable: true,
    });
    vi.mocked(loadManualScrollOffsets).mockResolvedValue({
      1: { pixels: 12, ratio: 0 },
    });
  });

  it('applies ready active tabs and offsets', async () => {
    mockStatusResponses([activeResponse]);
    const hook = renderPanelState();

    await act(async () => hook.current().loadSyncedTabsWithOffsets());

    expect(hook.current().syncedTabs).toEqual([
      { id: 1, title: 'One', offsetPixels: 12, isCurrent: false },
      { id: 2, title: 'Two', offsetPixels: 0, isCurrent: true },
    ]);
    expect(hook.current().syncStatusError).toBeNull();
    hook.unmount();
  });

  it('clears tabs only for a ready inactive response', async () => {
    mockStatusResponses([
      activeResponse,
      {
        status: 'ready',
        success: false,
        isActive: false,
        revision: 5,
        linkedTabs: [],
        connectedTabs: [],
        connectionStatuses: {},
      },
    ]);
    const hook = renderPanelState();
    await act(async () => hook.current().loadSyncedTabsWithOffsets());

    await act(async () => hook.current().loadSyncedTabsWithOffsets());

    expect(hook.current().syncedTabs).toEqual([]);
    expect(hook.current().syncStatusError).toBeNull();
    hook.unmount();
  });

  it('preserves prior tabs when authoritative status is unavailable', async () => {
    mockStatusResponses([activeResponse, { status: 'unavailable', reason: 'storage-error' }]);
    const hook = renderPanelState();
    await act(async () => hook.current().loadSyncedTabsWithOffsets());
    const priorTabs = hook.current().syncedTabs;

    await act(async () => hook.current().loadSyncedTabsWithOffsets());

    expect(hook.current().syncedTabs).toEqual(priorTabs);
    expect(hook.current().syncStatusError).toBe('manualSyncStateUnavailable');
    hook.unmount();
  });
});
