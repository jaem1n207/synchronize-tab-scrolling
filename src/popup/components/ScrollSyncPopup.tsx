import { useState, useCallback, useEffect } from 'react';

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
      const mockTabs: Array<TabInfo> = [
        {
          id: 1,
          title: 'Example Document - Translation',
          url: 'https://example.com/doc1',
          favIconUrl: 'https://example.com/favicon.ico',
          eligible: true,
        },
        {
          id: 2,
          title: 'Example Document - Original',
          url: 'https://example.com/doc2',
          favIconUrl: 'https://example.com/favicon.ico',
          eligible: true,
        },
        {
          id: 3,
          title: 'Chrome Web Store',
          url: 'https://chrome.google.com/webstore',
          eligible: false,
          ineligibleReason: 'Web store pages cannot be synchronized due to security restrictions',
        },
        {
          id: 4,
          title: 'Google Drive',
          url: 'https://drive.google.com',
          eligible: false,
          ineligibleReason: 'Google services pages have restrictions that prevent synchronization',
        },
      ];

      setTabs(mockTabs);
      setCurrentTabId(1);
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

  const handleStart = useCallback(() => {
    const statuses: Record<number, ConnectionStatus> = {};
    selectedTabIds.forEach((id) => {
      statuses[id] = 'connected';
    });

    setSyncStatus({
      isActive: true,
      connectedTabs: selectedTabIds,
      connectionStatuses: statuses,
    });
  }, [selectedTabIds]);

  const handleStop = useCallback(() => {
    setSyncStatus({
      isActive: false,
      connectedTabs: [],
      connectionStatuses: {},
    });
  }, []);

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

  const handleSwitchToTab = useCallback((tabId: number) => {
    // TODO: Implement tab switching via browser API
    // browser.tabs.update(tabId, { active: true });
    console.log('Switch to tab:', tabId);
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
