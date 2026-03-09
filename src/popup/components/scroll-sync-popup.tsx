import { useState, useCallback, useEffect, useRef } from 'react';

import { useKeyboardShortcuts } from '~/shared/hooks/use-keyboard-shortcuts';
import { usePersistentState } from '~/shared/hooks/use-persistent-state';
import { saveSelectedTabIds } from '~/shared/lib/storage';

import { useAutoSync } from '../hooks/use-auto-sync';
import { useSyncControl } from '../hooks/use-sync-control';
import { useTabDiscovery } from '../hooks/use-tab-discovery';
import { useUrlSync } from '../hooks/use-url-sync';
import { DEFAULT_PREFERENCES } from '../types/filters';

import { ActionsMenu } from './actions-menu';
import { ErrorNotification } from './error-notification';
import { FooterInfo } from './footer-info';
import { SelectedTabsChips } from './selected-tabs-chips';
import { SyncControlButtons } from './sync-control-buttons';
import { TabCommandPalette, type TabCommandPaletteHandle } from './tab-command-palette';

import type { SortOption } from '../types/filters';

export function ScrollSyncPopup() {
  const [selectedTabIds, setSelectedTabIds] = useState<Array<number>>([]);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);

  const searchInputRef = useRef<TabCommandPaletteHandle>(null);

  const [sortBy, setSortBy] = usePersistentState<SortOption>(
    'popup-sort-by',
    DEFAULT_PREFERENCES.sortBy,
  );
  const [sameDomainFilter, setSameDomainFilter] = usePersistentState<boolean>(
    'popup-same-domain-filter',
    DEFAULT_PREFERENCES.filters.sameDomainOnly,
  );

  const { autoSyncEnabled, autoSyncTabCount, handleAutoSyncChange } = useAutoSync();
  const { urlSyncEnabled, handleUrlSyncChange } = useUrlSync();
  const {
    tabs,
    currentTabId,
    filteredAndSortedTabs,
    selectedTabsInfo,
    tabDiscoveryError,
    dismissTabDiscoveryError,
  } = useTabDiscovery({
    selectedTabIds,
    sortBy,
    sameDomainFilter,
  });
  const {
    syncStatus,
    error: syncError,
    hasConnectionError,
    handleStart,
    handleStop,
    handleResync,
    handleDismissError,
  } = useSyncControl({
    selectedTabIds,
    tabs,
    searchInputRef,
    onSelectedTabIdsChange: setSelectedTabIds,
  });

  const error = tabDiscoveryError ?? syncError;
  const dismissError = tabDiscoveryError ? dismissTabDiscoveryError : handleDismissError;

  const handleToggleTab = useCallback((tabId: number) => {
    setSelectedTabIds((prev) => {
      const newSelection = prev.includes(tabId)
        ? prev.filter((id) => id !== tabId)
        : [...prev, tabId];

      saveSelectedTabIds(newSelection);

      return newSelection;
    });
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

  const handleToggleAllTabs = useCallback(() => {
    if (!syncStatus.isActive) {
      if (selectedTabIds.length > 0) {
        // Has selections → clear all
        handleClearAll();
      } else {
        // No selections → select all
        handleSelectAll();
      }
    }
  }, [syncStatus.isActive, selectedTabIds.length, handleSelectAll, handleClearAll]);

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
        key: 'x',
        mod: true,
        shift: true,
        handler: handleToggleAllTabs,
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
    [syncStatus.isActive, selectedTabIds, handleStart, handleStop, handleToggleAllTabs, setSortBy],
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

    <div
      className="w-480px h-600px flex flex-col relative"
      role="none"
      onClick={handleContainerClick}
    >
      {error && (
        <div className="absolute top-0 left-0 right-0 z-50 p-4">
          <ErrorNotification error={error} onDismiss={dismissError} />
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
            onOpenChange={setActionsMenuOpen}
            onSameDomainFilterChange={setSameDomainFilter}
            onSortChange={setSortBy}
            onStartSync={handleStart}
            onStopSync={handleStop}
            onToggleAllTabs={handleToggleAllTabs}
            onUrlSyncChange={handleUrlSyncChange}
          />
        </div>
      </div>

      {/* Footer Hints */}
      <FooterInfo />
    </div>
  );
}
