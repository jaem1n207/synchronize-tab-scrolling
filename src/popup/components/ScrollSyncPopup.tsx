import { useState, useCallback, useEffect, useMemo, useRef } from 'react';

import { useHotkeys } from 'react-hotkeys-hook';
import { sendMessage } from 'webext-bridge/popup';
import browser from 'webextension-polyfill';

import { usePersistentState } from '~/shared/hooks/usePersistentState';
import { t } from '~/shared/i18n';
import {
  loadSelectedTabIds,
  saveSelectedTabIds,
  loadAutoSyncEnabled,
  saveAutoSyncEnabled,
  loadUrlSyncEnabled,
  saveUrlSyncEnabled,
} from '~/shared/lib/storage';
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
import { SelectedTabsChips } from './SelectedTabsChips';
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

  // Browser storage-based settings (cross-context)
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false);
  const [autoSyncTabCount, setAutoSyncTabCount] = useState(0);
  const [urlSyncEnabled, setUrlSyncEnabled] = useState(true);

  useEffect(() => {
    const initialize = async () => {
      try {
        // Load browser.storage-based settings
        const [autoSyncSetting, urlSyncSetting] = await Promise.all([
          loadAutoSyncEnabled(),
          loadUrlSyncEnabled(),
        ]);
        setAutoSyncEnabled(autoSyncSetting);
        setUrlSyncEnabled(urlSyncSetting);

        // Query background for current sync status
        let hasActiveSync = false;
        let syncedTabIds: Array<number> = [];
        try {
          const syncStatusResponse = await sendMessage('sync:get-status', {}, 'background');
          const response = syncStatusResponse as {
            success: boolean;
            isActive: boolean;
            connectedTabs?: Array<number>;
            connectionStatuses?: Record<number, ConnectionStatus>;
          };
          if (response?.isActive) {
            hasActiveSync = true;
            syncedTabIds = response.connectedTabs || [];
            setSyncStatus({
              isActive: true,
              connectedTabs: syncedTabIds,
              connectionStatuses: response.connectionStatuses || {},
            });
            setSelectedTabIds(syncedTabIds);
          }
        } catch {
          // No active sync to restore - this is expected on first load
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
                ineligibleReason = t('ineligibleWebStore');
              } else if (url.match(/^https?:\/\/(drive|docs|sheets|mail)\.google\.com/)) {
                ineligibleReason = t('ineligibleGoogleServices');
              } else if (
                url.match(/^(chrome|edge|about|firefox|moz-extension|chrome-extension):/)
              ) {
                ineligibleReason = t('ineligibleBrowserInternal');
              } else if (url.match(/^(view-source|data|javascript|file|blob):/)) {
                ineligibleReason = t('ineligibleSpecialProtocol');
              } else {
                ineligibleReason = t('ineligibleSecurityRestriction');
              }
            }

            return {
              id: tab.id!,
              title: tab.title || t('untitled'),
              url,
              favIconUrl: tab.favIconUrl,
              eligible: !isForbidden,
              ineligibleReason,
              lastAccessed: tab.lastAccessed,
            };
          });

        setTabs(tabInfos);

        // Validate selectedTabIds against available tabs
        if (hasActiveSync) {
          const availableTabIds = new Set(tabInfos.map((tab) => tab.id));
          const validSelectedIds = syncedTabIds.filter((id) => availableTabIds.has(id));

          // If some tabs are missing, update selectedTabIds to only include valid ones
          if (validSelectedIds.length !== syncedTabIds.length) {
            console.warn(
              '[ScrollSyncPopup] Some synced tabs no longer available, updating selection',
            );
            setSelectedTabIds(validSelectedIds);

            // If fewer than 2 valid tabs remain, sync state is inconsistent
            if (validSelectedIds.length < 2) {
              console.warn(
                '[ScrollSyncPopup] Sync state inconsistent: fewer than 2 tabs available. Resetting sync status.',
              );
              setSyncStatus({
                isActive: false,
                connectedTabs: [],
                connectionStatuses: {},
              });
              // Notify background to stop sync
              sendMessage('scroll:stop', { tabIds: syncedTabIds }, 'background').catch((err) => {
                console.warn('[ScrollSyncPopup] Failed to stop sync in background:', err);
              });
            }
          }
        } else {
          // Restore previously selected tabs only if not already syncing
          const validTabIds = tabInfos.map((tab) => tab.id);
          const restoredSelection = savedTabIds.filter((id) => validTabIds.includes(id));
          if (restoredSelection.length > 0) {
            setSelectedTabIds(restoredSelection);
          }
        }
      } catch (error) {
        console.error('Failed to initialize popup:', error);
        setError({
          message: t('errorLoadTabsFailed'),
          severity: 'error',
          timestamp: Date.now(),
          action: {
            label: t('retry'),
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

  // Get selected tabs info from unfiltered tabs (always show selected regardless of domain filter)
  const selectedTabsInfo = useMemo(
    () => tabs.filter((tab) => selectedTabIds.includes(tab.id)),
    [tabs, selectedTabIds],
  );

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
          message: t('errorMinTabsRequired'),
          severity: 'warning',
          timestamp: Date.now(),
        });
        return;
      }

      try {
        // If this is a retry, reload all selected tabs first
        if (isRetry) {
          setError({
            message: t('reloadingTabs', [String(selectedTabIds.length)]),
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

        // Show "Connecting..." feedback
        setError({
          message: t('connectingToTabs', [String(selectedTabIds.length)]),
          severity: 'info',
          timestamp: Date.now(),
        });

        // Send start message to background script and wait for connection results
        const response = (await sendMessage(
          'scroll:start',
          {
            tabIds: selectedTabIds,
            mode: 'ratio', // Default to ratio mode, can be made configurable later
            currentTabId: selectedTabIds[0], // Use first selected tab as current
          },
          'background',
        )) as {
          success: boolean;
          connectedTabs: Array<number>;
          connectionResults: Record<number, { success: boolean; error?: string }>;
          error?: string;
        };

        if (!response.success) {
          // Connection failed
          const failedTabs = Object.entries(response.connectionResults || {})
            .filter(([, result]) => !result.success)
            .map(([tabId, result]) => `Tab ${tabId}: ${result.error || 'Unknown error'}`);

          setError({
            message:
              response.error ||
              t('failedToConnectToTabs', [failedTabs.length > 0 ? failedTabs.join(', ') : '']),
            severity: 'error',
            timestamp: Date.now(),
            action: {
              label: t('retry'),
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
            message: t('connectedToTabs', [
              String(connectedCount),
              String(attemptedCount),
              String(failedCount),
            ]),
            severity: 'warning',
            timestamp: Date.now(),
          });
        } else {
          // All tabs connected successfully
          setError({
            message: t('successfullyConnectedToTabs', [String(connectedCount)]),
            severity: 'info',
            timestamp: Date.now(),
          });
        }
      } catch (error) {
        console.error('Failed to start sync:', error);
        setError({
          message: t('failedToStartSync', [error instanceof Error ? error.message : String(error)]),
          severity: 'error',
          timestamp: Date.now(),
          action: {
            label: t('retry'),
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
      message: t('stoppingSynchronization'),
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

      // Add timeout to prevent hanging - use symbol to identify timeout errors
      const TIMEOUT_SYMBOL = Symbol('timeout');
      await Promise.race([
        stopPromise,
        new Promise((_, reject) => setTimeout(() => reject(TIMEOUT_SYMBOL), 1_000)),
      ]);

      // Success - update state
      setSyncStatus({
        isActive: false,
        connectedTabs: [],
        connectionStatuses: {},
      });

      setError({
        message: t('successSyncStopped'),
        severity: 'info',
        timestamp: Date.now(),
      });
    } catch (error) {
      // Clear local state regardless of error
      setSyncStatus({
        isActive: false,
        connectedTabs: [],
        connectionStatuses: {},
      });

      // Timeout is expected behavior - treat as success since local state is cleared
      if (typeof error === 'symbol') {
        console.warn('Stop sync timed out, but local state was cleared successfully');
        setError({
          message: t('successSyncStopped'),
          severity: 'info',
          timestamp: Date.now(),
        });
      } else {
        // Actual error - show warning
        console.error('Failed to stop sync:', error);
        setError({
          message: t('warningStopSyncFailed', [
            error instanceof Error ? error.message : t('errorStopSyncFailed'),
          ]),
          severity: 'warning',
          timestamp: Date.now(),
        });
      }
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

  // Advanced feature toggle handlers
  const handleAutoSyncChange = useCallback(async (enabled: boolean) => {
    setAutoSyncEnabled(enabled);
    await saveAutoSyncEnabled(enabled);
    // Notify background script
    sendMessage('auto-sync:status-changed', { enabled }, 'background').catch((err) => {
      console.warn('[ScrollSyncPopup] Failed to notify background of auto-sync change:', err);
    });
  }, []);

  const handleUrlSyncChange = useCallback(async (enabled: boolean) => {
    setUrlSyncEnabled(enabled);
    await saveUrlSyncEnabled(enabled);
    // Notify background script
    sendMessage('sync:url-enabled-changed', { enabled }, 'background').catch((err) => {
      console.warn('[ScrollSyncPopup] Failed to notify background of URL sync change:', err);
    });
  }, []);

  // Keyboard shortcuts - using react-hotkeys-hook
  // Mod+S: Toggle sync start/stop
  useHotkeys(
    'mod+s',
    () => {
      if (syncStatus.isActive) {
        handleStop();
      } else if (selectedTabIds.length >= 2) {
        handleStart();
      }
    },
    { preventDefault: true },
    [syncStatus.isActive, selectedTabIds, handleStart, handleStop],
  );

  // Mod+A: Select all (only when sync is not active)
  useHotkeys('mod+a', handleSelectAll, { preventDefault: true, enabled: !syncStatus.isActive }, [
    syncStatus.isActive,
    handleSelectAll,
  ]);

  // Mod+Shift+X: Clear all (only when sync is not active)
  useHotkeys(
    'mod+shift+x',
    handleClearAll,
    { preventDefault: true, enabled: !syncStatus.isActive },
    [syncStatus.isActive, handleClearAll],
  );

  // Mod+D: Toggle same domain filter
  useHotkeys(
    'mod+d',
    () => {
      setSameDomainFilter((prev) => !prev);
    },
    { preventDefault: true },
    [setSameDomainFilter],
  );

  // Mod+1: Sort by similarity
  useHotkeys(
    'mod+1',
    () => {
      setSortBy('similarity');
    },
    { preventDefault: true },
    [setSortBy],
  );

  // Mod+2: Sort by recent
  useHotkeys(
    'mod+2',
    () => {
      setSortBy('recent');
    },
    { preventDefault: true },
    [setSortBy],
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

  // Fetch auto-sync detailed status when enabled
  useEffect(() => {
    const fetchAutoSyncStatus = async () => {
      if (!autoSyncEnabled) {
        setAutoSyncTabCount(0);
        return;
      }

      try {
        const response = await sendMessage('auto-sync:get-detailed-status', {}, 'background');

        if (response?.success) {
          // Use potentialSyncTabs (tabs in groups with 2+ same-URL tabs)
          // instead of totalSyncedTabs (only actively syncing tabs)
          setAutoSyncTabCount(response.potentialSyncTabs);
        }
      } catch {
        // Ignore errors - status is optional
      }
    };

    fetchAutoSyncStatus();

    // Poll for updates while auto-sync is enabled
    const interval = autoSyncEnabled ? setInterval(fetchAutoSyncStatus, 2000) : undefined;
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoSyncEnabled]);

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
        {/* Selected Tabs Chips */}
        <SelectedTabsChips
          isSyncActive={syncStatus.isActive}
          tabs={selectedTabsInfo}
          onRemoveTab={handleToggleTab}
        />

        {/* Tab Selection */}
        <section aria-labelledby="tab-selection-heading" className="flex-1 flex flex-col min-h-0">
          <TabCommandPalette
            ref={searchInputRef}
            allTabs={tabs}
            currentTabId={currentTabId}
            isSyncActive={syncStatus.isActive}
            sameDomainFilter={sameDomainFilter}
            selectedTabIds={selectedTabIds}
            tabs={filteredAndSortedTabs}
            totalTabCount={tabs.length}
            onClearFilter={() => setSameDomainFilter(false)}
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
            autoSyncEnabled={autoSyncEnabled}
            autoSyncTabCount={autoSyncTabCount}
            isSyncActive={syncStatus.isActive}
            open={actionsMenuOpen}
            sameDomainFilter={sameDomainFilter}
            selectedCount={selectedTabIds.length}
            sortBy={sortBy}
            urlSyncEnabled={urlSyncEnabled}
            onAutoSyncChange={handleAutoSyncChange}
            onClearAll={handleClearAll}
            onOpenChange={setActionsMenuOpen}
            onSameDomainFilterChange={setSameDomainFilter}
            onSelectAll={handleSelectAll}
            onSortChange={setSortBy}
            onStartSync={handleStart}
            onStopSync={handleStop}
            onUrlSyncChange={handleUrlSyncChange}
          />
        </div>
      </div>

      {/* Footer Hints */}
      <FooterInfo />
    </div>
  );
}
