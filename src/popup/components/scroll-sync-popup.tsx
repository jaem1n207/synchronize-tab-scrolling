import { useCallback, useEffect, useState } from 'react';

import { UrlSyncSettings } from '~/shared/components/url-sync-settings';
import { useKeyboardShortcuts } from '~/shared/hooks/use-keyboard-shortcuts';
import { t } from '~/shared/i18n';
import { saveSelectedTabIds } from '~/shared/lib/storage';

import {
  useAutoSync,
  useDomainExclusions,
  useManualSyncSession,
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

  const session = useManualSyncSession();
  const isInactive = session.state.status === 'inactive';
  const isActive = session.state.status === 'active';

  const { autoSyncEnabled, autoSyncTabCount, handleAutoSyncChange } = useAutoSync();
  const {
    urlSyncEnabled,
    urlSyncMode,
    urlSyncNotice,
    handleUrlSyncChange,
    handleUrlSyncModeChange,
  } = useUrlSync();
  const { excludedDomains, addDomain, removeDomain, previewDomain } = useDomainExclusions();
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
    error: syncError,
    handleStart,
    handleDismissError,
  } = useSyncControl({
    selectedTabIds,
    tabs,
    searchInputRef,
    onSelectedTabIdsChange: setSelectedTabIds,
    onSessionChange: session.refetch,
  });

  const error = tabDiscoveryError ?? syncError;
  const dismissError = tabDiscoveryError ? dismissTabDiscoveryError : handleDismissError;
  const activeSnapshot = session.state.status === 'active' ? session.state.snapshot : undefined;
  const activeTabCount = activeSnapshot?.linkedTabIds.length ?? 0;
  const hasConnectionError =
    activeSnapshot?.tabs.some(
      (tab) => tab.connectionStatus === 'disconnected' || tab.connectionStatus === 'error',
    ) ?? false;

  useEffect(() => {
    if (!isInactive || excludedDomainsOpen) {
      return;
    }

    const focusTimer = setTimeout(() => searchInputRef.current?.focus(), 100);
    return () => clearTimeout(focusTimer);
  }, [excludedDomainsOpen, isInactive, searchInputRef]);

  const handleOpenExcludedDomains = useCallback(() => {
    setExcludedDomainsOpen(true);
  }, []);

  const handleSelectAll = useCallback(() => {
    if (!isInactive) {
      return;
    }

    const eligibleTabIds = filteredAndSortedTabs.filter((tab) => tab.eligible).map((tab) => tab.id);
    setSelectedTabIds(eligibleTabIds);
    saveSelectedTabIds(eligibleTabIds);
  }, [filteredAndSortedTabs, isInactive, setSelectedTabIds]);

  const handleClearAll = useCallback(() => {
    if (!isInactive) {
      return;
    }

    setSelectedTabIds([]);
    saveSelectedTabIds([]);
  }, [isInactive, setSelectedTabIds]);

  const handleToggleAllTabs = useCallback(() => {
    if (!isInactive) {
      return;
    }

    if (selectedTabIds.length > 0) {
      handleClearAll();
    } else {
      handleSelectAll();
    }
  }, [handleClearAll, handleSelectAll, isInactive, selectedTabIds.length]);

  useKeyboardShortcuts(
    [
      {
        key: 's',
        mod: true,
        handler: () => {
          if (session.isMutating) {
            return;
          }

          if (isActive) {
            void session.stop();
          } else if (isInactive && selectedTabIds.length >= 2) {
            handleStart();
          }
        },
        enabled: !session.isMutating,
      },
      {
        key: 'x',
        mod: true,
        shift: true,
        handler: handleToggleAllTabs,
        enabled: isInactive,
      },
      {
        key: 'd',
        mod: true,
        handler: () => {
          setSameDomainFilter((previous) => !previous);
        },
        enabled: isInactive,
      },
      {
        key: '1',
        mod: true,
        handler: () => {
          setSortBy('similarity');
        },
        enabled: isInactive,
      },
      {
        key: '2',
        mod: true,
        handler: () => {
          setSortBy('recent');
        },
        enabled: isInactive,
      },
    ],
    [
      handleStart,
      handleToggleAllTabs,
      isActive,
      isInactive,
      selectedTabIds,
      session,
      setSameDomainFilter,
      setSortBy,
    ],
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

      {session.warning === 'cleanup-incomplete' && (
        <div aria-live="polite" className="absolute top-0 left-0 right-0 z-40 p-4" role="alert">
          {t('syncCleanupIncomplete')}
        </div>
      )}

      <div className="flex-1 p-4 gap-3 overflow-hidden flex flex-col min-h-0">
        {session.state.status === 'loading' && (
          <div
            aria-atomic="true"
            aria-live="polite"
            className="flex min-h-0 flex-1 items-center justify-center"
            role="status"
          >
            {t('loading')}
          </div>
        )}

        {session.state.status === 'error' && (
          <section
            aria-atomic="true"
            aria-live="assertive"
            className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3"
            role="alert"
          >
            <p>{t('manualSyncStateUnavailable')}</p>
            <button
              className="focus-visible:ring-ring rounded-md px-3 py-2 focus-visible:ring-2 focus-visible:outline-none"
              type="button"
              onClick={() => {
                void session.refetch();
              }}
            >
              {t('retryStatusCheck')}
            </button>
          </section>
        )}

        {isInactive && (
          <section
            aria-labelledby="tab-selection-heading"
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <TabCommandPalette
              ref={searchInputRef}
              allTabs={tabs}
              currentTabId={currentTabId}
              isSyncActive={false}
              sameDomainFilter={sameDomainFilter}
              selectedTabIds={selectedTabIds}
              selectionSummary={
                <SelectedTabsChips
                  isSyncActive={false}
                  tabs={selectedTabsInfo}
                  onRemoveTab={handleToggleTab}
                />
              }
              tabs={filteredAndSortedTabs}
              totalTabCount={tabs.length}
              onClearFilter={() => setSameDomainFilter(false)}
              onToggleTab={handleToggleTab}
            />
          </section>
        )}

        {isActive && (
          <section
            aria-labelledby="active-sync-heading"
            className="flex min-h-0 flex-1 items-center justify-center"
          >
            <div aria-live="polite" role="status">
              <h2 id="active-sync-heading">{t('syncActive')}</h2>
            </div>
          </section>
        )}

        {(isInactive || isActive) && (
          <>
            <UrlSyncSettings
              enabled={urlSyncEnabled}
              mode={urlSyncMode}
              notice={urlSyncNotice}
              variant="inline-collapsible"
              onEnabledChange={handleUrlSyncChange}
              onModeChange={handleUrlSyncModeChange}
            />

            <div className="flex shrink-0 items-center justify-end gap-2">
              <SyncControlButtons
                hasConnectionError={hasConnectionError}
                isActive={isActive}
                isReconnecting={session.isReconnecting}
                isStopping={session.isStopping}
                selectedCount={isActive ? activeTabCount : selectedTabIds.length}
                onResync={() => {
                  if (!session.isMutating) {
                    void session.reconnect();
                  }
                }}
                onStart={handleStart}
                onStop={() => {
                  if (!session.isMutating) {
                    void session.stop();
                  }
                }}
              />
              <ActionsMenu
                autoSyncEnabled={autoSyncEnabled}
                autoSyncTabCount={autoSyncTabCount}
                excludedDomainsCount={excludedDomains.length}
                isSyncActive={isActive}
                isSyncMutationPending={session.isMutating}
                open={actionsMenuOpen}
                sameDomainFilter={sameDomainFilter}
                selectedCount={isActive ? activeTabCount : selectedTabIds.length}
                sortBy={sortBy}
                onAutoSyncChange={handleAutoSyncChange}
                onOpenChange={setActionsMenuOpen}
                onOpenExcludedDomains={handleOpenExcludedDomains}
                onSameDomainFilterChange={setSameDomainFilter}
                onSortChange={setSortBy}
                onStartSync={handleStart}
                onStopSync={() => {
                  if (!session.isMutating) {
                    void session.stop();
                  }
                }}
                onToggleAllTabs={handleToggleAllTabs}
              />
            </div>
          </>
        )}
      </div>

      <FooterInfo />

      <ExcludedDomainsDialog
        excludedDomains={excludedDomains}
        open={excludedDomainsOpen}
        onAddDomain={addDomain}
        onOpenChange={setExcludedDomainsOpen}
        onPreviewDomain={previewDomain}
        onRemoveDomain={removeDomain}
      />
    </div>
  );
}
