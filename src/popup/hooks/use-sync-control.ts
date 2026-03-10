import { useState, useCallback, useEffect, useRef } from 'react';

import { sendMessage } from 'webext-bridge/popup';
import browser from 'webextension-polyfill';

import { t } from '~/shared/i18n';
import { ExtensionLogger } from '~/shared/lib/logger';
import { loadSelectedTabIds } from '~/shared/lib/storage';

import type { TabInfo, SyncStatus, ConnectionStatus, ErrorState } from '../types';

const logger = new ExtensionLogger({ scope: 'popup' });

const INITIAL_SYNC_STATUS: SyncStatus = {
  isActive: false,
  connectedTabs: [],
  connectionStatuses: {},
};

interface UseSyncControlParams {
  selectedTabIds: Array<number>;
  tabs: Array<TabInfo>;
  searchInputRef: React.RefObject<{ focus: () => void } | null>;
  onSelectedTabIdsChange: (
    updater: Array<number> | ((prev: Array<number>) => Array<number>),
  ) => void;
}

interface UseSyncControlReturn {
  syncStatus: SyncStatus;
  error: ErrorState | null;
  hasConnectionError: boolean;
  handleStart: () => void;
  handleStop: () => Promise<void>;
  handleResync: () => void;
  handleDismissError: () => void;
}

export function useSyncControl({
  selectedTabIds,
  tabs,
  searchInputRef,
  onSelectedTabIdsChange,
}: UseSyncControlParams): UseSyncControlReturn {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(INITIAL_SYNC_STATUS);
  const [error, setError] = useState<ErrorState | null>(null);

  const syncStateRestoredRef = useRef(false);

  useEffect(() => {
    if (tabs.length === 0 || syncStateRestoredRef.current) return;
    syncStateRestoredRef.current = true;

    const restoreSyncState = async () => {
      try {
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
            onSelectedTabIdsChange(syncedTabIds);
          }
        } catch {
          // No active sync to restore - this is expected on first load
        }

        const savedTabIds = await loadSelectedTabIds();
        const availableTabIds = new Set(tabs.map((tab) => tab.id));

        if (hasActiveSync) {
          const validSelectedIds = syncedTabIds.filter((id) => availableTabIds.has(id));

          if (validSelectedIds.length !== syncedTabIds.length) {
            logger.warn(
              '[useSyncControl] Some synced tabs no longer available, updating selection',
            );
            onSelectedTabIdsChange(validSelectedIds);

            if (validSelectedIds.length < 2) {
              logger.warn(
                '[useSyncControl] Sync state inconsistent: fewer than 2 tabs available. Resetting sync status.',
              );
              setSyncStatus(INITIAL_SYNC_STATUS);
              sendMessage('scroll:stop', { tabIds: syncedTabIds }, 'background').catch((err) => {
                logger.warn('[useSyncControl] Failed to stop sync in background:', err);
              });
            }
          }
        } else {
          const restoredSelection = savedTabIds.filter((id) => availableTabIds.has(id));
          if (restoredSelection.length > 0) {
            onSelectedTabIdsChange(restoredSelection);
          }
        }
      } catch (err) {
        logger.error('Failed to restore sync state:', err);
      }
    };

    restoreSyncState();
  }, [tabs, onSelectedTabIdsChange]);

  const handleStartWithRetry = useCallback(
    async (isRetry = false) => {
      setError(null);

      if (selectedTabIds.length < 2) {
        setError({
          message: t('errorMinTabsRequired'),
          severity: 'warning',
          timestamp: Date.now(),
        });
        return;
      }

      try {
        if (isRetry) {
          setError({
            message: t('reloadingTabs', [String(selectedTabIds.length)]),
            severity: 'info',
            timestamp: Date.now(),
          });

          await Promise.all(
            selectedTabIds.map((tabId) =>
              browser.tabs.reload(tabId).catch((err) => {
                logger.warn(`Failed to reload tab ${tabId}:`, err);
              }),
            ),
          );

          await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        setError({
          message: t('connectingToTabs', [String(selectedTabIds.length)]),
          severity: 'info',
          timestamp: Date.now(),
        });

        const response = (await sendMessage(
          'scroll:start',
          {
            tabIds: selectedTabIds,
            mode: 'ratio',
            currentTabId: selectedTabIds[0],
          },
          'background',
        )) as {
          success: boolean;
          connectedTabs: Array<number>;
          connectionResults: Record<number, { success: boolean; error?: string }>;
          error?: string;
        };

        if (!response.success) {
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

          return;
        }

        const statuses: Record<number, ConnectionStatus> = {};
        response.connectedTabs.forEach((id) => {
          statuses[id] = 'connected';
        });

        setSyncStatus({
          isActive: true,
          connectedTabs: response.connectedTabs,
          connectionStatuses: statuses,
        });

        const connectedCount = response.connectedTabs.length;
        const attemptedCount = selectedTabIds.length;

        if (connectedCount < attemptedCount) {
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
          setError({
            message: t('successfullyConnectedToTabs', [String(connectedCount)]),
            severity: 'info',
            timestamp: Date.now(),
          });
        }
      } catch (err) {
        logger.error('Failed to start sync:', err);
        setError({
          message: t('failedToStartSync', [err instanceof Error ? err.message : String(err)]),
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
    setTimeout(() => searchInputRef.current?.focus(), 100);
  }, [handleStartWithRetry, searchInputRef]);

  const handleStop = useCallback(async () => {
    setError(null);

    setError({
      message: t('stoppingSynchronization'),
      severity: 'info',
      timestamp: Date.now(),
    });

    try {
      const stopPromise = sendMessage(
        'scroll:stop',
        { tabIds: syncStatus.connectedTabs },
        'background',
      );

      const TIMEOUT_SYMBOL = Symbol('timeout');
      await Promise.race([
        stopPromise,
        new Promise((_, reject) => setTimeout(() => reject(TIMEOUT_SYMBOL), 1_000)),
      ]);

      setSyncStatus(INITIAL_SYNC_STATUS);

      setError({
        message: t('successSyncStopped'),
        severity: 'info',
        timestamp: Date.now(),
      });
    } catch (err) {
      setSyncStatus(INITIAL_SYNC_STATUS);

      if (typeof err === 'symbol') {
        logger.warn('Stop sync timed out, but local state was cleared successfully');
        setError({
          message: t('successSyncStopped'),
          severity: 'info',
          timestamp: Date.now(),
        });
      } else {
        logger.error('Failed to stop sync:', err);
        setError({
          message: t('warningStopSyncFailed', [
            err instanceof Error ? err.message : t('errorStopSyncFailed'),
          ]),
          severity: 'warning',
          timestamp: Date.now(),
        });
      }
    }

    setTimeout(() => searchInputRef.current?.focus(), 100);
  }, [syncStatus.connectedTabs, searchInputRef]);

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

    setTimeout(() => searchInputRef.current?.focus(), 100);
  }, [syncStatus.connectionStatuses, searchInputRef]);

  const handleDismissError = useCallback(() => {
    setError(null);
  }, []);

  const hasConnectionError = Object.values(syncStatus.connectionStatuses).some(
    (status) => status === 'disconnected' || status === 'error',
  );

  return {
    syncStatus,
    error,
    hasConnectionError,
    handleStart,
    handleStop,
    handleResync,
    handleDismissError,
  };
}
