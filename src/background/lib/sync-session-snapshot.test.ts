import { beforeEach, describe, expect, it, vi } from 'vitest';
import browser from 'webextension-polyfill';

import type { SyncState } from '~/shared/types/sync-state';

import { buildContentManualSyncSnapshot, buildManualSyncSnapshot } from './sync-session-snapshot';

vi.mock('webextension-polyfill', () => ({
  default: {
    tabs: {
      get: vi.fn(),
    },
  },
}));

const activeState: SyncState = {
  isActive: true,
  linkedTabs: [11, 22, 33],
  connectionStatuses: {
    11: 'connected',
    22: 'disconnected',
    33: 'error',
  },
  mode: 'ratio',
  lastActiveSyncedTabId: 11,
  revision: 5,
  sessionEpoch: 2,
};

const viewerContext = {
  viewerTabId: 11,
  viewerWindowId: 1,
};

function createTab(
  id: number,
  windowId: number,
  title: string,
  favIconUrl?: string,
): browser.Tabs.Tab {
  return {
    id,
    windowId,
    index: 0,
    highlighted: false,
    active: id === viewerContext.viewerTabId,
    pinned: false,
    incognito: false,
    title,
    url: `https://private-${id}.example/token`,
    favIconUrl,
  };
}

describe('buildManualSyncSnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(browser.tabs.get).mockImplementation(async (tabId) => {
      if (tabId === 11) {
        return createTab(11, 1, 'Current tab', 'current.ico');
      }
      if (tabId === 22) {
        return createTab(22, 1, 'Same window');
      }
      return createTab(33, 7, 'Other window', 'other.ico');
    });
  });

  it('returns every committed tab across windows in linked order', async () => {
    const snapshot = await buildManualSyncSnapshot(activeState, viewerContext);

    expect(browser.tabs.get).toHaveBeenNthCalledWith(1, 11);
    expect(browser.tabs.get).toHaveBeenNthCalledWith(2, 22);
    expect(browser.tabs.get).toHaveBeenNthCalledWith(3, 33);
    expect(snapshot).toEqual({
      revision: 5,
      sessionEpoch: 2,
      mode: 'ratio',
      linkedTabIds: [11, 22, 33],
      tabs: [
        {
          availability: 'available',
          tabId: 11,
          title: 'Current tab',
          favIconUrl: 'current.ico',
          windowId: 1,
          location: 'current-tab',
          connectionStatus: 'connected',
        },
        {
          availability: 'available',
          tabId: 22,
          title: 'Same window',
          windowId: 1,
          location: 'current-window',
          connectionStatus: 'disconnected',
        },
        {
          availability: 'available',
          tabId: 33,
          title: 'Other window',
          favIconUrl: 'other.ico',
          windowId: 7,
          location: 'other-window',
          connectionStatus: 'error',
        },
      ],
    });
  });

  it('preserves a missing linked tab as unavailable without guessing its window', async () => {
    vi.mocked(browser.tabs.get).mockRejectedValueOnce(new Error('No tab with id: 11'));

    const snapshot = await buildManualSyncSnapshot(activeState, viewerContext);

    expect(snapshot.linkedTabIds).toEqual([11, 22, 33]);
    expect(snapshot.tabs[0]).toEqual({
      availability: 'unavailable',
      tabId: 11,
      connectionStatus: 'connected',
    });
    expect(Object.keys(snapshot.tabs[0])).toEqual(['availability', 'tabId', 'connectionStatus']);
  });

  it('never copies URL or arbitrary browser tab fields into an available row', async () => {
    const snapshot = await buildManualSyncSnapshot(activeState, viewerContext);

    expect(Object.keys(snapshot.tabs[0]).sort()).toEqual([
      'availability',
      'connectionStatus',
      'favIconUrl',
      'location',
      'tabId',
      'title',
      'windowId',
    ]);
    expect(snapshot.tabs[0]).not.toHaveProperty('url');
    expect(snapshot.tabs[0]).not.toHaveProperty('index');
    expect(snapshot.tabs[0]).not.toHaveProperty('incognito');
  });
});

describe('buildContentManualSyncSnapshot', () => {
  it('returns only generic committed topology without browser tab hydration', () => {
    const snapshot = buildContentManualSyncSnapshot(activeState, 22);

    expect(browser.tabs.get).not.toHaveBeenCalled();
    expect(snapshot).toEqual({
      revision: 5,
      sessionEpoch: 2,
      mode: 'ratio',
      linkedTabCount: 3,
      tabs: [
        { location: 'other-tab', connectionStatus: 'connected' },
        { location: 'current-tab', connectionStatus: 'disconnected' },
        { location: 'other-tab', connectionStatus: 'error' },
      ],
    });
    expect(Object.keys(snapshot.tabs[0]).sort()).toEqual(['connectionStatus', 'location']);
  });
});
