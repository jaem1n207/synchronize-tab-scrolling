import browser from 'webextension-polyfill';

import type {
  ActiveManualSyncSnapshot,
  AvailableManualSyncTab,
  SyncStatusViewerContext,
  UnavailableManualSyncTab,
} from '~/shared/types/sync-session';
import type { SyncState } from '~/shared/types/sync-state';

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function buildUnavailableTab(state: SyncState, tabId: number): UnavailableManualSyncTab {
  return {
    availability: 'unavailable',
    tabId,
    connectionStatus: state.connectionStatuses[tabId] ?? 'error',
  };
}

function getTabLocation(
  tabId: number,
  windowId: number,
  viewer: SyncStatusViewerContext,
): AvailableManualSyncTab['location'] {
  if (tabId === viewer.viewerTabId) {
    return 'current-tab';
  }
  return windowId === viewer.viewerWindowId ? 'current-window' : 'other-window';
}

export async function buildManualSyncSnapshot(
  state: SyncState,
  viewer: SyncStatusViewerContext,
): Promise<ActiveManualSyncSnapshot> {
  const tabs = await Promise.all(
    state.linkedTabs.map(
      async (tabId): Promise<AvailableManualSyncTab | UnavailableManualSyncTab> => {
        try {
          const tab = await browser.tabs.get(tabId);
          if (!isPositiveSafeInteger(tab.windowId)) {
            return buildUnavailableTab(state, tabId);
          }

          const availableTab: Omit<AvailableManualSyncTab, 'favIconUrl'> = {
            availability: 'available',
            tabId,
            title: typeof tab.title === 'string' && tab.title.length > 0 ? tab.title : 'Untitled',
            windowId: tab.windowId,
            location: getTabLocation(tabId, tab.windowId, viewer),
            connectionStatus: state.connectionStatuses[tabId] ?? 'error',
          };

          return typeof tab.favIconUrl === 'string' && tab.favIconUrl.length > 0
            ? { ...availableTab, favIconUrl: tab.favIconUrl }
            : availableTab;
        } catch {
          return buildUnavailableTab(state, tabId);
        }
      },
    ),
  );

  return {
    revision: state.revision,
    sessionEpoch: state.sessionEpoch,
    mode: state.mode ?? 'ratio',
    linkedTabIds: [...state.linkedTabs],
    tabs,
  };
}
