import browser from 'webextension-polyfill';

import type { ManualScrollOffset } from '~/shared/lib/storage';
import type {
  AvailableManualSyncTab,
  ContentActiveManualSyncSnapshot,
  ContentManualSyncTab,
  PopupActiveManualSyncSnapshot,
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
): Promise<PopupActiveManualSyncSnapshot> {
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

export async function buildContentManualSyncSnapshot(
  state: SyncState,
  viewerTabId: number,
  manualOffsets: Readonly<Record<number, ManualScrollOffset>>,
): Promise<ContentActiveManualSyncSnapshot> {
  const tabs = await Promise.all(
    state.linkedTabs.map(async (tabId): Promise<ContentManualSyncTab> => {
      let displayTitle: string | null = null;
      try {
        const tab = await browser.tabs.get(tabId);
        if (typeof tab.title === 'string' && tab.title.length > 0) {
          displayTitle = tab.title;
        }
      } catch {
        // Unavailable tabs remain in committed order without exposing their identity.
      }

      return {
        displayTitle,
        isCurrent: tabId === viewerTabId,
        manualOffsetPixels: manualOffsets[tabId]?.pixels ?? 0,
        connectionStatus: state.connectionStatuses[tabId] ?? 'error',
      };
    }),
  );

  return {
    revision: state.revision,
    sessionEpoch: state.sessionEpoch,
    mode: state.mode ?? 'ratio',
    linkedTabCount: state.linkedTabs.length,
    tabs,
  };
}
