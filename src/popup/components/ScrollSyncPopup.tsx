import { useState, useCallback, useEffect } from 'react';

import { sendMessage } from 'webext-bridge/popup';
import * as Browser from 'webextension-polyfill';

import {
  loadPanelMinimized,
  loadSelectedTabIds,
  savePanelMinimized,
  saveSelectedTabIds,
} from '~/shared/lib/storage';
import { isForbiddenUrl } from '~/shared/lib/url-utils';

import { DraggableControlPanel } from './DraggableControlPanel';
import { ErrorNotification } from './ErrorNotification';
import { LinkedSitesPanel } from './LinkedSitesPanel';
import { SyncControlButtons } from './SyncControlButtons';
import { TabSelectionList } from './TabSelectionList';

import type { TabInfo, SyncStatus, ConnectionStatus, ErrorState } from '../types';

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
  const [error, setError] = useState<ErrorState | null>(null);

  useEffect(() => {
    const initialize = async () => {
      try {
        // Load saved state
        const [savedMinimized, savedTabIds] = await Promise.all([
          loadPanelMinimized(),
          loadSelectedTabIds(),
        ]);

        setIsMinimized(savedMinimized);

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

        // Restore previously selected tabs if they still exist
        const validTabIds = tabInfos.map((tab) => tab.id);
        const restoredSelection = savedTabIds.filter((id) => validTabIds.includes(id));
        if (restoredSelection.length > 0) {
          setSelectedTabIds(restoredSelection);
        }
      } catch (error) {
        console.error('Failed to initialize popup:', error);
        setError({
          message: 'Failed to load tabs. Please refresh the extension.',
          severity: 'error',
          timestamp: Date.now(),
          action: {
            label: 'Retry',
            handler: () => {
              setError(null);
              initialize();
            },
          },
        });
        // Fallback to empty list on error
        setTabs([]);
      }
    };

    initialize();
  }, []);

  const handleToggleTab = useCallback((tabId: number) => {
    setSelectedTabIds((prev) => {
      const newSelection = prev.includes(tabId)
        ? prev.filter((id) => id !== tabId)
        : [...prev, tabId];

      // Save to storage
      saveSelectedTabIds(newSelection);

      return newSelection;
    });
  }, []);

  const handleToggleMinimize = useCallback(() => {
    setIsMinimized((prev) => {
      const newValue = !prev;
      // Save to storage
      savePanelMinimized(newValue);
      return newValue;
    });
  }, []);

  const handleStart = useCallback(async () => {
    // Clear any existing errors
    setError(null);

    // Validation: Check if at least 2 tabs are selected
    if (selectedTabIds.length < 2) {
      setError({
        message: 'Please select at least 2 tabs to synchronize.',
        severity: 'warning',
        timestamp: Date.now(),
      });
      return;
    }

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

      setError({
        message: `Successfully started synchronization for ${selectedTabIds.length} tabs.`,
        severity: 'info',
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('Failed to start sync:', error);
      setError({
        message: 'Failed to start synchronization. Please try again.',
        severity: 'error',
        timestamp: Date.now(),
        action: {
          label: 'Retry',
          handler: handleStart,
        },
      });
    }
  }, [selectedTabIds]);

  const handleStop = useCallback(async () => {
    setError(null);

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

      setError({
        message: 'Synchronization stopped successfully.',
        severity: 'info',
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('Failed to stop sync:', error);
      setError({
        message: 'Warning: Failed to properly stop sync. Local state has been cleared.',
        severity: 'warning',
        timestamp: Date.now(),
      });
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
      setError({
        message: 'Failed to switch to tab. The tab may have been closed.',
        severity: 'error',
        timestamp: Date.now(),
      });
    }
  }, []);

  const handleDismissError = useCallback(() => {
    setError(null);
  }, []);

  const linkedTabs = tabs.filter((tab) => syncStatus.connectedTabs.includes(tab.id));
  const hasConnectionError = Object.values(syncStatus.connectionStatuses).some(
    (status) => status === 'disconnected' || status === 'error',
  );

  return (
    <DraggableControlPanel isMinimized={isMinimized} onToggleMinimize={handleToggleMinimize}>
      <div className="space-y-4">
        {error && <ErrorNotification error={error} onDismiss={handleDismissError} />}
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
