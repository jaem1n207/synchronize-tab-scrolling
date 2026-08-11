import { useCallback, useEffect, useState } from 'react';
import type { RefObject } from 'react';

import { UrlSyncSettings } from '~/shared/components/url-sync-settings';
import { useKeyboardShortcuts } from '~/shared/hooks/use-keyboard-shortcuts';
import { t } from '~/shared/i18n';
import { saveSelectedTabIds } from '~/shared/lib/storage';

import {
  useAutoSync,
  useDomainExclusions,
  useManualSyncSession,
  usePopupState,
  useQuickSyncShortcut,
  useSyncControl,
  useTabDiscovery,
  useUrlSync,
} from '../hooks';

import { ActionsMenu } from './actions-menu';
import { ActiveSyncSession } from './active-sync-session';
import { ErrorNotification } from './error-notification';
import { ExcludedDomainsDialog } from './excluded-domains-dialog';
import { FooterInfo } from './footer-info';
import { QuickSyncRecentOutcome } from './quick-sync-recent-outcome';
import { QuickSyncShortcutStatus } from './quick-sync-shortcut-status';
import { SelectedTabsChips } from './selected-tabs-chips';
import { SyncControlButtons } from './sync-control-buttons';
import { TabCommandPalette } from './tab-command-palette';

import type { QuickSyncShortcutState, ShortcutSettingsResult } from '../hooks';
import type { TabInfo } from '../types';
import type { TabCommandPaletteHandle } from './tab-command-palette';

function PopupSessionSkeleton() {
  return (
    <div
      aria-atomic="true"
      aria-live="polite"
      className="flex min-h-0 flex-1 flex-col gap-3"
      role="status"
    >
      <span className="sr-only">{t('loading')}</span>
      <div
        aria-hidden="true"
        className="h-6 w-36 animate-pulse rounded-md bg-muted motion-reduce:animate-none"
      />
      <div
        aria-hidden="true"
        className="h-12 animate-pulse rounded-lg bg-muted/70 motion-reduce:animate-none"
      />
      <div
        aria-hidden="true"
        className="min-h-0 flex-1 animate-pulse rounded-lg bg-muted/50 motion-reduce:animate-none"
      />
    </div>
  );
}

function ManualSyncStateError({ onRetry }: { onRetry: () => Promise<void> }) {
  return (
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
          void onRetry();
        }}
      >
        {t('retryStatusCheck')}
      </button>
    </section>
  );
}

interface InactiveSyncPickerProps {
  tabs: Array<TabInfo>;
  currentTabId?: number;
  filteredAndSortedTabs: Array<TabInfo>;
  selectedTabsInfo: Array<TabInfo>;
  selectedTabIds: Array<number>;
  sameDomainFilter: boolean;
  searchInputRef: RefObject<TabCommandPaletteHandle | null>;
  shortcut: QuickSyncShortcutState;
  shortcutSettingsResult: ShortcutSettingsResult;
  onOpenShortcutSettings: () => Promise<ShortcutSettingsResult>;
  onClearDomainFilter: () => void;
  onToggleTab: (tabId: number) => void;
}

function InactiveSyncPicker({
  tabs,
  currentTabId,
  filteredAndSortedTabs,
  selectedTabsInfo,
  selectedTabIds,
  sameDomainFilter,
  searchInputRef,
  shortcut,
  shortcutSettingsResult,
  onOpenShortcutSettings,
  onClearDomainFilter,
  onToggleTab,
}: InactiveSyncPickerProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
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
              onRemoveTab={onToggleTab}
            />
          }
          tabs={filteredAndSortedTabs}
          totalTabCount={tabs.length}
          onClearFilter={onClearDomainFilter}
          onToggleTab={onToggleTab}
        />
      </section>

      <QuickSyncShortcutStatus
        assignment={shortcut}
        settingsResult={shortcutSettingsResult}
        onOpenSettings={onOpenShortcutSettings}
      />
    </div>
  );
}

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
  const shortcut = useQuickSyncShortcut();
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
  const recentQuickSyncOutcome =
    session.state.status === 'loading' ||
    (session.state.status === 'error' && session.state.reason === 'transport-error')
      ? undefined
      : session.state.recentQuickSyncOutcome;

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
        handler: (event) => {
          if (event.isComposing || event.keyCode === 229 || session.isMutating) {
            return;
          }

          if (isActive) {
            event.preventDefault();
            event.stopPropagation();
            void session.stop();
          } else if (isInactive && selectedTabIds.length >= 2) {
            event.preventDefault();
            event.stopPropagation();
            handleStart();
          }
        },
        preventDefault: false,
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

      {session.warning === 'cleanup-incomplete' && !isActive && (
        <div aria-live="polite" className="absolute top-0 left-0 right-0 z-40 p-4" role="alert">
          {t('syncCleanupIncomplete')}
        </div>
      )}

      <div className="flex-1 p-4 gap-3 overflow-hidden flex flex-col min-h-0">
        {recentQuickSyncOutcome === undefined ? null : (
          <QuickSyncRecentOutcome
            outcome={recentQuickSyncOutcome}
            onAuthoritativeRefetch={session.refetch}
          />
        )}

        {session.state.status === 'loading' ? <PopupSessionSkeleton /> : null}

        {session.state.status === 'error' ? (
          <ManualSyncStateError onRetry={session.refetch} />
        ) : null}

        {isInactive ? (
          <InactiveSyncPicker
            currentTabId={currentTabId}
            filteredAndSortedTabs={filteredAndSortedTabs}
            sameDomainFilter={sameDomainFilter}
            searchInputRef={searchInputRef}
            selectedTabIds={selectedTabIds}
            selectedTabsInfo={selectedTabsInfo}
            shortcut={shortcut.assignment}
            shortcutSettingsResult={shortcut.settingsResult}
            tabs={tabs}
            onClearDomainFilter={() => setSameDomainFilter(false)}
            onOpenShortcutSettings={shortcut.openSettings}
            onToggleTab={handleToggleTab}
          />
        ) : null}

        {isActive && activeSnapshot !== undefined ? (
          <ActiveSyncSession
            isReconnecting={session.isReconnecting}
            isStopping={session.isStopping}
            shortcut={shortcut.assignment}
            snapshot={activeSnapshot}
            warning={session.warning}
            onOpenShortcutSettings={shortcut.openSettings}
            onReconnect={() => {
              if (!session.isMutating) {
                void session.reconnect();
              }
            }}
            onStop={() => {
              if (!session.isMutating) {
                void session.stop();
              }
            }}
          />
        ) : null}

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

            {isInactive ? (
              <div className="flex shrink-0 items-center justify-end gap-2">
                <SyncControlButtons
                  hasConnectionError={false}
                  isActive={false}
                  isReconnecting={false}
                  isStopping={false}
                  selectedCount={selectedTabIds.length}
                  onResync={() => undefined}
                  onStart={handleStart}
                  onStop={() => undefined}
                />
                <ActionsMenu
                  autoSyncEnabled={autoSyncEnabled}
                  autoSyncTabCount={autoSyncTabCount}
                  excludedDomainsCount={excludedDomains.length}
                  isSyncActive={false}
                  isSyncMutationPending={false}
                  open={actionsMenuOpen}
                  sameDomainFilter={sameDomainFilter}
                  selectedCount={selectedTabIds.length}
                  sortBy={sortBy}
                  onAutoSyncChange={handleAutoSyncChange}
                  onOpenChange={setActionsMenuOpen}
                  onOpenExcludedDomains={handleOpenExcludedDomains}
                  onSameDomainFilterChange={setSameDomainFilter}
                  onSortChange={setSortBy}
                  onStartSync={handleStart}
                  onStopSync={() => undefined}
                  onToggleAllTabs={handleToggleAllTabs}
                />
              </div>
            ) : null}
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
