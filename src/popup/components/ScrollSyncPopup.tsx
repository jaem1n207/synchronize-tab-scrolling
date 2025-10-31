import { useState, useCallback, useEffect, useMemo, useRef } from 'react';

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
import { TabCommandPalette, type TabCommandPaletteHandle } from './TabCommandPalette';

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

  // Ref for search input focus management
  const searchInputRef = useRef<TabCommandPaletteHandle>(null);

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

  const handleStartWithRetry = useCallback(
    async (isRetry = false) => {
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
        // If this is a retry, reload all selected tabs first
        if (isRetry) {
          console.log('[ScrollSyncPopup] Reloading tabs before retry:', selectedTabIds);
          setError({
            message: `Reloading ${selectedTabIds.length} tabs...`,
            severity: 'info',
            timestamp: Date.now(),
          });

          // Reload all selected tabs
          await Promise.all(
            selectedTabIds.map((tabId) =>
              browser.tabs.reload(tabId).catch((err) => {
                console.warn(`Failed to reload tab ${tabId}:`, err);
              }),
            ),
          );

          // Wait a bit for tabs to reload
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        console.log('[ScrollSyncPopup] Starting sync with tab IDs:', selectedTabIds);

        // Show "Connecting..." feedback
        setError({
          message: `Connecting to ${selectedTabIds.length} tabs...`,
          severity: 'info',
          timestamp: Date.now(),
        });

        // Send start message to background script and wait for connection results
        const response = (await sendMessage(
          'scroll:start',
          {
            tabIds: selectedTabIds,
            mode: 'ratio', // Default to ratio mode, can be made configurable later
          },
          'background',
        )) as {
          success: boolean;
          connectedTabs: Array<number>;
          connectionResults: Record<number, { success: boolean; error?: string }>;
          error?: string;
        };

        console.log('[ScrollSyncPopup] Connection response:', response);

        if (!response.success) {
          // Connection failed
          const failedTabs = Object.entries(response.connectionResults || {})
            .filter(([, result]) => !result.success)
            .map(([tabId, result]) => `Tab ${tabId}: ${result.error || 'Unknown error'}`);

          setError({
            message:
              response.error ||
              `Failed to connect to tabs. ${failedTabs.length > 0 ? failedTabs.join(', ') : ''}`,
            severity: 'error',
            timestamp: Date.now(),
            action: {
              label: 'Retry',
              handler: () => handleStartWithRetry(true),
            },
          });

          // Don't update sync status
          return;
        }

        // Success - update sync status with actually connected tabs
        const statuses: Record<number, ConnectionStatus> = {};
        response.connectedTabs.forEach((id) => {
          statuses[id] = 'connected';
        });

        setSyncStatus({
          isActive: true,
          connectedTabs: response.connectedTabs,
          connectionStatuses: statuses,
        });

        // Show success message
        const connectedCount = response.connectedTabs.length;
        const attemptedCount = selectedTabIds.length;

        if (connectedCount < attemptedCount) {
          // Some tabs failed to connect
          const failedCount = attemptedCount - connectedCount;
          setError({
            message: `Connected to ${connectedCount} of ${attemptedCount} tabs (${failedCount} failed).`,
            severity: 'warning',
            timestamp: Date.now(),
          });
        } else {
          // All tabs connected successfully
          setError({
            message: `Successfully connected to ${connectedCount} tabs.`,
            severity: 'info',
            timestamp: Date.now(),
          });
        }
      } catch (error) {
        console.error('Failed to start sync:', error);
        setError({
          message: `Failed to start synchronization: ${error instanceof Error ? error.message : String(error)}`,
          severity: 'error',
          timestamp: Date.now(),
          action: {
            label: 'Retry',
            handler: () => handleStartWithRetry(true),
          },
        });
      }
    },
    [selectedTabIds],
  );

  const handleStart = useCallback(() => {
    handleStartWithRetry(false);
    // Restore focus to search input after action
    setTimeout(() => searchInputRef.current?.focus(), 100);
  }, [handleStartWithRetry]);

  const handleStop = useCallback(async () => {
    setError(null);

    // Show stopping feedback
    setError({
      message: 'Stopping synchronization...',
      severity: 'info',
      timestamp: Date.now(),
    });

    try {
      // Send stop message to background script with timeout
      const stopPromise = sendMessage(
        'scroll:stop',
        {
          tabIds: syncStatus.connectedTabs,
        },
        'background',
      );

      // Add timeout to prevent hanging
      await Promise.race([
        stopPromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Stop operation timed out after 2 seconds')), 2_000),
        ),
      ]);

      // Success - update state
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

      // Clear local state regardless of error
      setSyncStatus({
        isActive: false,
        connectedTabs: [],
        connectionStatuses: {},
      });

      setError({
        message: `Warning: ${error instanceof Error ? error.message : 'Failed to stop sync properly'}. Local state has been cleared.`,
        severity: 'warning',
        timestamp: Date.now(),
      });
    }

    // Restore focus to search input after action
    setTimeout(() => searchInputRef.current?.focus(), 100);
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

    // Restore focus to search input after action
    setTimeout(() => searchInputRef.current?.focus(), 100);
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

  // Restore focus to search input when ActionsMenu closes
  useEffect(() => {
    if (!actionsMenuOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [actionsMenuOpen]);

  // Restore focus when clicking non-interactive areas
  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;

    // Check if clicked element is interactive (button, input, link, or has interactive role)
    // Note: [role="option"] removed to allow focus restoration after CommandItem clicks
    const isInteractive = target.closest(
      'button, input, a, textarea, select, [role="button"], [role="checkbox"], [role="switch"], [role="menuitem"]',
    );

    // If not interactive, restore focus to search input
    if (!isInteractive) {
      setTimeout(() => searchInputRef.current?.focus(), 0);
    }
  }, []);

  return (
    // Container for focus management - not directly interactive
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      className="w-480px h-600px flex flex-col relative"
      role="none"
      onClick={handleContainerClick}
    >
      {error && (
        <div className="absolute top-0 left-0 right-0 z-50 p-4">
          <ErrorNotification error={error} onDismiss={handleDismissError} />
        </div>
      )}

      <div className="flex-1 p-4 space-y-4 overflow-hidden flex flex-col min-h-0">
        {/* Tab Selection */}
        <section aria-labelledby="tab-selection-heading" className="flex-1 flex flex-col min-h-0">
          <TabCommandPalette
            ref={searchInputRef}
            currentTabId={currentTabId}
            isSyncActive={syncStatus.isActive}
            selectedTabIds={selectedTabIds}
            tabs={filteredAndSortedTabs}
            onToggleTab={handleToggleTab}
          />
        </section>

        {/* Control Buttons and Actions Menu */}
        <div className="flex items-center justify-end gap-2">
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
