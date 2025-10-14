import { useState, useCallback, useEffect, useMemo } from 'react';

import { sendMessage } from 'webext-bridge/popup';
import browser from 'webextension-polyfill';

import { useKeyboardShortcuts } from '~/shared/hooks/useKeyboardShortcuts';
import { usePersistentState } from '~/shared/hooks/usePersistentState';
import { loadSelectedTabIds, saveSelectedTabIds } from '~/shared/lib/storage';
import {
  sortTabsWithDomainGrouping,
  sortTabsByRecentVisits,
  filterTabsBySameDomain,
} from '~/shared/lib/tab-similarity';
import { isForbiddenUrl } from '~/shared/lib/url-utils';

import { DEFAULT_PREFERENCES } from '../types/filters';

import { ActionsMenu } from './ActionsMenu';
import { ErrorNotification } from './ErrorNotification';
import { FooterInfo } from './FooterInfo';
import { SyncControlButtons } from './SyncControlButtons';
import { SyncStatusHeader } from './SyncStatusHeader';
import { TabCommandPalette } from './TabCommandPalette';

import type { TabInfo, SyncStatus, ConnectionStatus, ErrorState } from '../types';
import type { SortOption } from '../types/filters';

export function ScrollSyncPopup() {
  const [selectedTabIds, setSelectedTabIds] = useState<Array<number>>([]);
  const [tabs, setTabs] = useState<Array<TabInfo>>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isActive: false,
    connectedTabs: [],
    connectionStatuses: {},
  });
  const [currentTabId, setCurrentTabId] = useState<number>();
  const [error, setError] = useState<ErrorState | null>(null);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);

  // Persistent preferences
  const [sortBy, setSortBy] = usePersistentState<SortOption>(
    'popup-sort-by',
    DEFAULT_PREFERENCES.sortBy,
  );
  const [sameDomainFilter, setSameDomainFilter] = usePersistentState<boolean>(
    'popup-same-domain-filter',
    DEFAULT_PREFERENCES.filters.sameDomainOnly,
  );

  useEffect(() => {
    const initialize = async () => {
      try {
        // Query background for current sync status
        let hasActiveSync = false;
        try {
          const syncStatusResponse = await sendMessage('sync:get-status', {}, 'background');
          const response = syncStatusResponse as {
            success: boolean;
            isActive: boolean;
            connectedTabs?: Array<number>;
            connectionStatuses?: Record<number, ConnectionStatus>;
          };
          if (response?.isActive) {
            console.log('[ScrollSyncPopup] Restoring sync state from background:', response);
            hasActiveSync = true;
            setSyncStatus({
              isActive: true,
              connectedTabs: response.connectedTabs || [],
              connectionStatuses: response.connectionStatuses || {},
            });
            setSelectedTabIds(response.connectedTabs || []);
          }
        } catch (error) {
          console.log('[ScrollSyncPopup] No active sync to restore:', error);
        }

        // Load saved state
        const savedTabIds = await loadSelectedTabIds();

        // Get all tabs in current window
        const browserTabs = await browser.tabs.query({ currentWindow: true });

        // Get current active tab
        const [currentTab] = await browser.tabs.query({ active: true, currentWindow: true });
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
              lastAccessed: tab.lastAccessed,
            };
          });

        console.log(
          '[ScrollSyncPopup] Loaded tabs:',
          tabInfos.map((t) => ({ id: t.id, title: t.title })),
        );
        setTabs(tabInfos);

        // Restore previously selected tabs only if not already syncing
        if (!hasActiveSync) {
          const validTabIds = tabInfos.map((tab) => tab.id);
          const restoredSelection = savedTabIds.filter((id) => validTabIds.includes(id));
          if (restoredSelection.length > 0) {
            setSelectedTabIds(restoredSelection);
          }
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

  // Filter and sort tabs based on preferences
  const filteredAndSortedTabs = useMemo(() => {
    let processedTabs = [...tabs];

    // Apply same domain filter
    if (sameDomainFilter) {
      processedTabs = filterTabsBySameDomain(processedTabs, currentTabId);
    }

    // Apply sort
    if (sortBy === 'similarity') {
      processedTabs = sortTabsWithDomainGrouping(processedTabs, currentTabId);
    } else if (sortBy === 'recent') {
      processedTabs = sortTabsByRecentVisits(processedTabs);
    }

    return processedTabs;
  }, [tabs, sameDomainFilter, sortBy, currentTabId]);

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
      console.log('[ScrollSyncPopup] Starting sync with tab IDs:', selectedTabIds);

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

  const handleDismissError = useCallback(() => {
    setError(null);
  }, []);

  // Actions Menu handlers
  const handleSelectAll = useCallback(() => {
    if (!syncStatus.isActive) {
      const eligibleTabIds = filteredAndSortedTabs
        .filter((tab) => tab.eligible)
        .map((tab) => tab.id);
      setSelectedTabIds(eligibleTabIds);
      saveSelectedTabIds(eligibleTabIds);
    }
  }, [syncStatus.isActive, filteredAndSortedTabs]);

  const handleClearAll = useCallback(() => {
    if (!syncStatus.isActive) {
      setSelectedTabIds([]);
      saveSelectedTabIds([]);
    }
  }, [syncStatus.isActive]);

  // Keyboard shortcuts - using custom hook
  useKeyboardShortcuts(
    [
      {
        key: 's',
        mod: true,
        handler: () => {
          if (syncStatus.isActive) {
            handleStop();
          } else if (selectedTabIds.length >= 2) {
            handleStart();
          }
        },
      },
      {
        key: 'a',
        mod: true,
        handler: handleSelectAll,
        enabled: !syncStatus.isActive,
      },
      {
        key: 'x',
        mod: true,
        shift: true,
        handler: handleClearAll,
        enabled: !syncStatus.isActive,
      },
      {
        key: 'd',
        mod: true,
        handler: () => {
          setSameDomainFilter((prev) => !prev);
        },
      },
      {
        key: '1',
        mod: true,
        handler: () => {
          setSortBy('similarity');
        },
      },
      {
        key: '2',
        mod: true,
        handler: () => {
          setSortBy('recent');
        },
      },
    ],
    [
      syncStatus.isActive,
      selectedTabIds,
      handleStart,
      handleStop,
      handleSelectAll,
      handleClearAll,
      setSortBy,
    ],
  );

  const hasConnectionError = Object.values(syncStatus.connectionStatuses).some(
    (status) => status === 'disconnected' || status === 'error',
  );

  return (
    <div className="w-480px flex flex-col h-full">
      {error && (
        <div className="p-4">
          <ErrorNotification error={error} onDismiss={handleDismissError} />
        </div>
      )}

      <div className="flex-1 p-4 space-y-4 overflow-hidden flex flex-col">
        {/* Sync Status Header */}
        <SyncStatusHeader
          connectedTabs={syncStatus.connectedTabs}
          connectionStatuses={syncStatus.connectionStatuses}
          isActive={syncStatus.isActive}
          tabs={tabs}
        />

        {/* Tab Selection */}
        <section aria-labelledby="tab-selection-heading" className="flex-1 flex flex-col min-h-0">
          <TabCommandPalette
            currentTabId={currentTabId}
            isSyncActive={syncStatus.isActive}
            selectedTabIds={selectedTabIds}
            tabs={filteredAndSortedTabs}
            onToggleTab={handleToggleTab}
          />
        </section>

        {/* Control Buttons and Actions Menu */}
        <div className="flex items-center gap-2">
          <SyncControlButtons
            hasConnectionError={hasConnectionError}
            isActive={syncStatus.isActive}
            selectedCount={selectedTabIds.length}
            onResync={handleResync}
            onStart={handleStart}
            onStop={handleStop}
          />
          <ActionsMenu
            isSyncActive={syncStatus.isActive}
            open={actionsMenuOpen}
            sameDomainFilter={sameDomainFilter}
            selectedCount={selectedTabIds.length}
            sortBy={sortBy}
            onClearAll={handleClearAll}
            onOpenChange={setActionsMenuOpen}
            onSameDomainFilterChange={setSameDomainFilter}
            onSelectAll={handleSelectAll}
            onSortChange={setSortBy}
            onStartSync={handleStart}
            onStopSync={handleStop}
          />
        </div>
      </div>

      {/* Footer Hints */}
      <FooterInfo />
    </div>
  );
}
