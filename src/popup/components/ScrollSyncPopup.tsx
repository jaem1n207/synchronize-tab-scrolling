import { useState, useCallback, useEffect } from 'react';

import { sendMessage } from 'webext-bridge/popup';
import * as Browser from 'webextension-polyfill';

import { isForbiddenUrl } from '~/shared/lib/url-utils';

import { DraggableControlPanel } from './DraggableControlPanel';
import { LinkedSitesPanel } from './LinkedSitesPanel';
import { SyncControlButtons } from './SyncControlButtons';
import { TabSelectionList } from './TabSelectionList';

import type { TabInfo, SyncStatus, ConnectionStatus } from '../types';

export function ScrollSyncPopup() {
  const [isMinimized, setIsMinimized] = useState(false);
  const [selectedTabIds, setSelectedTabIds] = useState<Array<number>>([]);
  const [tabs, setTabs] = useState<Array<TabInfo>>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isActive: false,
    connectedTabs: [],
    connectionStatuses: {},
  });
  const [currentTabId, setCurrentTabId] = useState<number>();

  useEffect(() => {
    const fetchTabs = async () => {
      try {
        // Get all tabs in current window
        const browserTabs = await Browser.tabs.query({ currentWindow: true });

        // Get current active tab
        const [currentTab] = await Browser.tabs.query({ active: true, currentWindow: true });
        if (currentTab?.id) {
          setCurrentTabId(currentTab.id);
        }

        // Convert browser tabs to TabInfo format with eligibility check
        const tabInfos: Array<TabInfo> = browserTabs
          .filter((tab) => tab.id !== undefined)
          .map((tab) => {
            const url = tab.url || '';
            const isForbidden = isForbiddenUrl(url);

            let ineligibleReason: string | undefined;
            if (isForbidden) {
              if (
                url.includes('chrome.google.com/webstore') ||
                url.includes('microsoftedge.microsoft.com/addons') ||
                url.includes('addons.mozilla.org')
              ) {
                ineligibleReason =
                  'Web store pages cannot be synchronized due to security restrictions';
              } else if (url.match(/^https?:\/\/(drive|docs|sheets|mail)\.google\.com/)) {
                ineligibleReason =
                  'Google services pages have restrictions that prevent synchronization';
              } else if (
                url.match(/^(chrome|edge|about|firefox|moz-extension|chrome-extension):/)
              ) {
                ineligibleReason =
                  'Browser internal pages cannot be synchronized due to security restrictions';
              } else if (url.match(/^(view-source|data|javascript|file|blob):/)) {
                ineligibleReason = 'Special protocol pages cannot be synchronized';
              } else {
                ineligibleReason = 'This page cannot be synchronized due to security restrictions';
              }
            }

            return {
              id: tab.id!,
              title: tab.title || 'Untitled',
              url,
              favIconUrl: tab.favIconUrl,
              eligible: !isForbidden,
              ineligibleReason,
            };
          });

        setTabs(tabInfos);
      } catch (error) {
        console.error('Failed to fetch tabs:', error);
        // Fallback to empty list on error
        setTabs([]);
      }
    };

    fetchTabs();
  }, []);

  const handleToggleTab = useCallback((tabId: number) => {
    setSelectedTabIds((prev) =>
      prev.includes(tabId) ? prev.filter((id) => id !== tabId) : [...prev, tabId],
    );
  }, []);

  const handleToggleMinimize = useCallback(() => {
    setIsMinimized((prev) => !prev);
  }, []);

  const handleStart = useCallback(async () => {
    try {
      // Send start message to background script
      await sendMessage(
        'scroll:start',
        {
          tabIds: selectedTabIds,
          mode: 'ratio', // Default to ratio mode, can be made configurable later
        },
        'background',
      );

      const statuses: Record<number, ConnectionStatus> = {};
      selectedTabIds.forEach((id) => {
        statuses[id] = 'connected';
      });

      setSyncStatus({
        isActive: true,
        connectedTabs: selectedTabIds,
        connectionStatuses: statuses,
      });
    } catch (error) {
      console.error('Failed to start sync:', error);
      // TODO: Show error to user
    }
  }, [selectedTabIds]);

  const handleStop = useCallback(async () => {
    try {
      // Send stop message to background script
      await sendMessage(
        'scroll:stop',
        {
          tabIds: syncStatus.connectedTabs,
        },
        'background',
      );

      setSyncStatus({
        isActive: false,
        connectedTabs: [],
        connectionStatuses: {},
      });
    } catch (error) {
      console.error('Failed to stop sync:', error);
      // Still update local state even if message fails
      setSyncStatus({
        isActive: false,
        connectedTabs: [],
        connectionStatuses: {},
      });
    }
  }, [syncStatus.connectedTabs]);

  const handleResync = useCallback(() => {
    const newStatuses = { ...syncStatus.connectionStatuses };
    Object.keys(newStatuses).forEach((key) => {
      const tabId = Number(key);
      if (newStatuses[tabId] === 'disconnected' || newStatuses[tabId] === 'error') {
        newStatuses[tabId] = 'connected';
      }
    });

    setSyncStatus((prev) => ({
      ...prev,
      connectionStatuses: newStatuses,
    }));
  }, [syncStatus.connectionStatuses]);

  const handleSwitchToTab = useCallback(async (tabId: number) => {
    try {
      await Browser.tabs.update(tabId, { active: true });
      setCurrentTabId(tabId);
    } catch (error) {
      console.error('Failed to switch to tab:', tabId, error);
    }
  }, []);

  const linkedTabs = tabs.filter((tab) => syncStatus.connectedTabs.includes(tab.id));
  const hasConnectionError = Object.values(syncStatus.connectionStatuses).some(
    (status) => status === 'disconnected' || status === 'error',
  );

  return (
    <DraggableControlPanel isMinimized={isMinimized} onToggleMinimize={handleToggleMinimize}>
      <div className="space-y-4">
        <section aria-labelledby="tab-selection-heading">
          <h3 className="text-sm font-medium mb-2" id="tab-selection-heading">
            Select Tabs to Sync
            {selectedTabIds.length > 0 && (
              <span className="ml-2 text-muted-foreground">({selectedTabIds.length} selected)</span>
            )}
          </h3>
          <TabSelectionList
            selectedTabIds={selectedTabIds}
            tabs={tabs}
            onToggleTab={handleToggleTab}
          />
        </section>

        <SyncControlButtons
          hasConnectionError={hasConnectionError}
          isActive={syncStatus.isActive}
          selectedCount={selectedTabIds.length}
          onResync={handleResync}
          onStart={handleStart}
          onStop={handleStop}
        />

        {syncStatus.isActive && (
          <LinkedSitesPanel
            connectionStatuses={syncStatus.connectionStatuses}
            currentTabId={currentTabId}
            linkedTabs={linkedTabs}
            onSwitchToTab={handleSwitchToTab}
          />
        )}
      </div>
    </DraggableControlPanel>
  );
}
