import { useState, useCallback } from 'react';

import { useKeyboardShortcuts } from '~/shared/hooks/use-keyboard-shortcuts';
import { saveSelectedTabIds } from '~/shared/lib/storage';

import {
  useAutoSync,
  useDomainExclusions,
  usePopupState,
  useSyncControl,
  useTabDiscovery,
  useUrlSync,
} from '../hooks';

import { ActionsMenu } from './actions-menu';
import { ErrorNotification } from './error-notification';
import { ExcludedDomainsDialog } from './excluded-domains-dialog';
import { FooterInfo } from './footer-info';
import { SelectedTabsChips } from './selected-tabs-chips';
import { SyncControlButtons } from './sync-control-buttons';
import { TabCommandPalette } from './tab-command-palette';

export function ScrollSyncPopup() {
  const {
    selectedTabIds,
    setSelectedTabIds,
    actionsMenuOpen,
    setActionsMenuOpen,
    searchInputRef,
    sortBy,
    setSortBy,
    sameDomainFilter,
    setSameDomainFilter,
    handleToggleTab,
    handleContainerClick,
  } = usePopupState();

  const { autoSyncEnabled, autoSyncTabCount, handleAutoSyncChange } = useAutoSync();
  const { urlSyncEnabled, handleUrlSyncChange } = useUrlSync();
  const { excludedDomains, addDomain, removeDomain } = useDomainExclusions();
  const [excludedDomainsOpen, setExcludedDomainsOpen] = useState(false);

  const {
    tabs,
    currentTabId,
    filteredAndSortedTabs,
    selectedTabsInfo,
    tabDiscoveryError,
    dismissTabDiscoveryError,
  } = useTabDiscovery({ selectedTabIds, sortBy, sameDomainFilter });

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

  const handleOpenExcludedDomains = useCallback(() => {
    setExcludedDomainsOpen(true);
  }, []);

  const handleSelectAll = useCallback(() => {
    if (!syncStatus.isActive) {
      const eligibleTabIds = filteredAndSortedTabs
        .filter((tab) => tab.eligible)
        .map((tab) => tab.id);
      setSelectedTabIds(eligibleTabIds);
      saveSelectedTabIds(eligibleTabIds);
    }
  }, [syncStatus.isActive, filteredAndSortedTabs, setSelectedTabIds]);

  const handleClearAll = useCallback(() => {
    if (!syncStatus.isActive) {
      setSelectedTabIds([]);
      saveSelectedTabIds([]);
    }
  }, [syncStatus.isActive, setSelectedTabIds]);

  const handleToggleAllTabs = useCallback(() => {
    if (!syncStatus.isActive) {
      if (selectedTabIds.length > 0) {
        handleClearAll();
      } else {
        handleSelectAll();
      }
    }
  }, [syncStatus.isActive, selectedTabIds.length, handleSelectAll, handleClearAll]);

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

  return (
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
        <SelectedTabsChips
          isSyncActive={syncStatus.isActive}
          tabs={selectedTabsInfo}
          onRemoveTab={handleToggleTab}
        />

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
            excludedDomainsCount={excludedDomains.length}
            isSyncActive={syncStatus.isActive}
            open={actionsMenuOpen}
            sameDomainFilter={sameDomainFilter}
            selectedCount={selectedTabIds.length}
            sortBy={sortBy}
            urlSyncEnabled={urlSyncEnabled}
            onAutoSyncChange={handleAutoSyncChange}
            onOpenChange={setActionsMenuOpen}
            onOpenExcludedDomains={handleOpenExcludedDomains}
            onSameDomainFilterChange={setSameDomainFilter}
            onSortChange={setSortBy}
            onStartSync={handleStart}
            onStopSync={handleStop}
            onToggleAllTabs={handleToggleAllTabs}
            onUrlSyncChange={handleUrlSyncChange}
          />
        </div>
      </div>

      <FooterInfo />

      <ExcludedDomainsDialog
        excludedDomains={excludedDomains}
        open={excludedDomainsOpen}
        onAddDomain={addDomain}
        onOpenChange={setExcludedDomainsOpen}
        onRemoveDomain={removeDomain}
      />
    </div>
  );
}
