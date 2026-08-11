import { useState, useCallback, useEffect, useRef } from 'react';

import { sendMessage } from 'webext-bridge/popup';
import browser from 'webextension-polyfill';

import { t } from '~/shared/i18n';
import { getFileSchemeAccessInfo } from '~/shared/lib/file-scheme-access';
import { ExtensionLogger } from '~/shared/lib/logger';
import { loadSelectedTabIds } from '~/shared/lib/storage';
import { isFileUrl } from '~/shared/lib/url-utils';
import type {
  LegacySyncStatusResponse,
  StartSyncBackgroundResponse,
  StopManualSyncMessage,
} from '~/shared/types/messages';

import type { TabInfo, SyncStatus, ConnectionStatus, ErrorState } from '../types';

const logger = new ExtensionLogger({ scope: 'popup' });

const INITIAL_SYNC_STATUS: SyncStatus = {
  isActive: false,
  connectedTabs: [],
  connectionStatuses: {},
  revision: 0,
};

type StartConnectionResults = Record<number, { success: boolean; error?: string }>;

function hasFailedSelectedFileTab(
  selectedTabIds: Array<number>,
  tabs: Array<TabInfo>,
  connectionResults: StartConnectionResults,
): boolean {
  const selectedTabIdSet = new Set(selectedTabIds);
  return tabs.some(
    (tab) =>
      selectedTabIdSet.has(tab.id) &&
      isFileUrl(tab.url) &&
      connectionResults[tab.id]?.success === false,
  );
}

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
  handleResync: () => Promise<void>;
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

  const applyLegacySyncStatus = useCallback(
    (response: LegacySyncStatusResponse): void => {
      if (response.status !== 'ready') {
        return;
      }
      if (response.isActive) {
        setSyncStatus({
          isActive: true,
          connectedTabs: [...response.connectedTabs],
          connectionStatuses: { ...response.connectionStatuses },
          revision: response.revision,
        });
        onSelectedTabIdsChange([...response.connectedTabs]);
        return;
      }

      setSyncStatus({
        isActive: false,
        connectedTabs: [],
        connectionStatuses: {},
        revision: response.revision,
      });
    },
    [onSelectedTabIdsChange],
  );

  const refreshSyncStatus = useCallback(async (): Promise<LegacySyncStatusResponse> => {
    const response = await sendMessage('sync:get-status', {}, 'background');
    if (response.status === 'unavailable') {
      setError({
        message: t('manualSyncStateUnavailable'),
        severity: 'error',
        timestamp: Date.now(),
        action: {
          label: t('retry'),
          handler: () => {
            refreshSyncStatus().catch((refreshError) => {
              logger.error('Failed to refresh unavailable manual sync state:', refreshError);
            });
          },
        },
      });
      return response;
    }
    applyLegacySyncStatus(response);
    setError((currentError) =>
      currentError?.message === t('manualSyncStateUnavailable') ? null : currentError,
    );
    return response;
  }, [applyLegacySyncStatus]);

  useEffect(() => {
    if (tabs.length === 0 || syncStateRestoredRef.current) return;
    syncStateRestoredRef.current = true;

    const restoreSyncState = async () => {
      try {
        let hasActiveSync = false;
        try {
          const response = await refreshSyncStatus();
          if (response.status === 'unavailable') {
            return;
          }
          if (response.isActive) {
            hasActiveSync = true;
          }
        } catch {
          // No active sync to restore - this is expected on first load
        }

        const savedTabIds = await loadSelectedTabIds();
        if (!hasActiveSync) {
          const availableTabIds = new Set(tabs.map((tab) => tab.id));
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
  }, [tabs, onSelectedTabIdsChange, refreshSyncStatus]);

  const handleStartWithRetry = useCallback(
    async (isRetry = false) => {
      setError(null);

      const showFileAccessGuidance = async (
        connectionResults: StartConnectionResults,
      ): Promise<boolean> => {
        if (!hasFailedSelectedFileTab(selectedTabIds, tabs, connectionResults)) {
          return false;
        }

        const fileSchemeAccessInfo = await getFileSchemeAccessInfo();
        if (!fileSchemeAccessInfo.canCheck || fileSchemeAccessInfo.allowed) {
          return false;
        }

        setError({
          message: t('fileAccessConnectionFailed'),
          severity: 'error',
          timestamp: Date.now(),
          action: {
            label: t('openExtensionSettings'),
            handler: () => {
              browser.tabs.create({ url: fileSchemeAccessInfo.settingsUrl }).catch((error) => {
                logger.warn('Failed to open extension settings:', error);
              });
            },
          },
        });

        return true;
      };

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

        const startResponse = await sendMessage(
          'scroll:start',
          {
            tabIds: selectedTabIds,
            mode: 'ratio',
            currentTabId: selectedTabIds[0],
          },
          'background',
        );
        if (!('connectedTabs' in startResponse) || !('connectionResults' in startResponse)) {
          throw new Error('Invalid background start response');
        }
        const response: StartSyncBackgroundResponse = startResponse;

        if (!response.success) {
          if (response.warning === 'auto-sync-degraded') {
            setError({
              message: t('autoSyncRecoveryDegraded'),
              severity: 'warning',
              timestamp: Date.now(),
            });
            return;
          }

          if (await showFileAccessGuidance(response.connectionResults || {})) {
            return;
          }

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
          revision: response.revision,
        });

        const connectedCount = response.connectedTabs.length;
        const attemptedCount = selectedTabIds.length;

        if (response.warning === 'auto-sync-degraded') {
          setError({
            message: t('autoSyncRecoveryDegraded'),
            severity: 'warning',
            timestamp: Date.now(),
          });
          return;
        }

        if (connectedCount < attemptedCount) {
          if (await showFileAccessGuidance(response.connectionResults || {})) {
            return;
          }

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
    [selectedTabIds, tabs],
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
      const stopMessage = {
        expectedRevision: syncStatus.revision,
      } satisfies StopManualSyncMessage;
      const stopPromise = sendMessage('scroll:stop', stopMessage, 'background');

      const TIMEOUT_SYMBOL = Symbol('timeout');
      const result = await Promise.race([
        stopPromise,
        new Promise<never>((_, reject) => setTimeout(() => reject(TIMEOUT_SYMBOL), 1_000)),
      ]);

      if (!('status' in result)) {
        throw new Error('Invalid background stop response');
      }

      if (result.status === 'rejected') {
        const refreshed = await refreshSyncStatus();
        if (refreshed.status === 'unavailable') {
          return;
        }
        setError({
          message: t('warningStopSyncFailed', [result.reason]),
          severity: 'warning',
          timestamp: Date.now(),
        });
      } else {
        setSyncStatus({
          ...INITIAL_SYNC_STATUS,
          revision: result.revision,
        });
        setError({
          message:
            result.warning === 'cleanup-incomplete'
              ? t('warningStopSyncFailed', [result.warning])
              : t('successSyncStopped'),
          severity: result.warning === 'cleanup-incomplete' ? 'warning' : 'info',
          timestamp: Date.now(),
        });
      }
    } catch (err) {
      if (typeof err === 'symbol') {
        logger.warn('Stop sync timed out before an authoritative response');
        setError({
          message: t('warningStopSyncFailed', ['timeout']),
          severity: 'warning',
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
  }, [syncStatus.revision, searchInputRef, refreshSyncStatus]);

  const handleResync = useCallback(async () => {
    setError({
      message: t('reconnecting'),
      severity: 'info',
      timestamp: Date.now(),
    });

    try {
      const result = await sendMessage(
        'sync:reconnect-session',
        { expectedRevision: syncStatus.revision },
        'background',
      );
      if (result.status === 'refresh-required') {
        const refreshed = await refreshSyncStatus();
        if (refreshed.status === 'unavailable') {
          return;
        }
        setError({
          message: t('reconnectionSuccessful'),
          severity: 'info',
          timestamp: Date.now(),
        });
        return;
      }
      if (result.status === 'rejected') {
        const refreshed = await refreshSyncStatus();
        if (refreshed.status === 'unavailable') {
          return;
        }
        setError({
          message: t('reconnectionFailed'),
          severity: 'warning',
          timestamp: Date.now(),
        });
        return;
      }

      setSyncStatus((previous) => {
        const connectionStatuses = { ...previous.connectionStatuses };
        for (const key of Object.keys(connectionStatuses)) {
          const tabId = Number(key);
          if (
            connectionStatuses[tabId] === 'disconnected' ||
            connectionStatuses[tabId] === 'error'
          ) {
            connectionStatuses[tabId] = 'connected';
          }
        }

        return {
          ...previous,
          connectionStatuses,
          revision: result.revision,
        };
      });
      setError({
        message: t('reconnectionSuccessful'),
        severity: 'info',
        timestamp: Date.now(),
      });
    } catch (reconnectError) {
      logger.error('Failed to reconnect sync:', reconnectError);
      setError({
        message: t('reconnectionFailed'),
        severity: 'warning',
        timestamp: Date.now(),
      });
    }

    setTimeout(() => searchInputRef.current?.focus(), 100);
  }, [syncStatus.revision, searchInputRef, refreshSyncStatus]);

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
