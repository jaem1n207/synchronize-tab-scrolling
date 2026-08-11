import { useCallback, useEffect, useRef, useState } from 'react';

import { sendMessage } from 'webext-bridge/popup';
import browser from 'webextension-polyfill';

import { t } from '~/shared/i18n';
import { getFileSchemeAccessInfo } from '~/shared/lib/file-scheme-access';
import { ExtensionLogger } from '~/shared/lib/logger';
import { loadSelectedTabIds } from '~/shared/lib/storage';
import { isFileUrl } from '~/shared/lib/url-utils';
import type { StartSyncBackgroundResponse } from '~/shared/types/messages';

import type { ErrorState, TabInfo } from '../types';

const logger = new ExtensionLogger({ scope: 'popup' });

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
    updater: Array<number> | ((previous: Array<number>) => Array<number>),
  ) => void;
  onSessionChange: () => Promise<void>;
}

interface UseSyncControlReturn {
  error: ErrorState | null;
  handleStart: () => void;
  handleDismissError: () => void;
}

export function useSyncControl({
  selectedTabIds,
  tabs,
  searchInputRef,
  onSelectedTabIdsChange,
  onSessionChange,
}: UseSyncControlParams): UseSyncControlReturn {
  const [error, setError] = useState<ErrorState | null>(null);
  const selectionRestoredRef = useRef(false);

  useEffect(() => {
    if (tabs.length === 0 || selectionRestoredRef.current) {
      return;
    }
    selectionRestoredRef.current = true;

    const restoreSelection = async (): Promise<void> => {
      try {
        const savedTabIds = await loadSelectedTabIds();
        const availableTabIds = new Set(tabs.map((tab) => tab.id));
        const restoredSelection = savedTabIds.filter((id) => availableTabIds.has(id));
        if (restoredSelection.length > 0) {
          onSelectedTabIdsChange(restoredSelection);
        }
      } catch (restoreError) {
        logger.error('Failed to restore selected tabs', {
          reason:
            restoreError instanceof Error
              ? 'selection-restore-rejected'
              : 'selection-restore-unknown-failure',
        });
      }
    };

    void restoreSelection();
  }, [onSelectedTabIdsChange, tabs]);

  const handleStartWithRetry = useCallback(
    async (isRetry = false): Promise<void> => {
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
              browser.tabs.create({ url: fileSchemeAccessInfo.settingsUrl }).catch((openError) => {
                logger.warn('Failed to open extension settings', {
                  reason:
                    openError instanceof Error
                      ? 'settings-open-rejected'
                      : 'settings-open-unknown-failure',
                });
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
              browser.tabs.reload(tabId).catch((reloadError) => {
                logger.warn('Failed to reload selected tab', {
                  tabId,
                  reason:
                    reloadError instanceof Error
                      ? 'tab-reload-rejected'
                      : 'tab-reload-unknown-failure',
                });
              }),
            ),
          );
          await new Promise((resolve) => setTimeout(resolve, 1_000));
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

          if (await showFileAccessGuidance(response.connectionResults)) {
            return;
          }

          const failedTabs = Object.entries(response.connectionResults)
            .filter(([, result]) => !result.success)
            .map(([tabId, result]) => `Tab ${tabId}: ${result.error ?? 'Unknown error'}`);

          setError({
            message:
              response.error ||
              t('failedToConnectToTabs', [failedTabs.length > 0 ? failedTabs.join(', ') : '']),
            severity: 'error',
            timestamp: Date.now(),
            action: {
              label: t('retry'),
              handler: () => {
                void handleStartWithRetry(true);
              },
            },
          });
          return;
        }

        await onSessionChange();

        if (response.warning === 'auto-sync-degraded') {
          setError({
            message: t('autoSyncRecoveryDegraded'),
            severity: 'warning',
            timestamp: Date.now(),
          });
          return;
        }

        const connectedCount = response.connectedTabs.length;
        const attemptedCount = selectedTabIds.length;
        if (connectedCount < attemptedCount) {
          if (await showFileAccessGuidance(response.connectionResults)) {
            return;
          }

          setError({
            message: t('connectedToTabs', [
              String(connectedCount),
              String(attemptedCount),
              String(attemptedCount - connectedCount),
            ]),
            severity: 'warning',
            timestamp: Date.now(),
          });
          return;
        }

        setError({
          message: t('successfullyConnectedToTabs', [String(connectedCount)]),
          severity: 'info',
          timestamp: Date.now(),
        });
      } catch (startError) {
        logger.error('Failed to start sync', {
          reason: startError instanceof Error ? 'start-rejected' : 'start-unknown-failure',
        });
        setError({
          message: t('failedToStartSync', [
            startError instanceof Error ? startError.message : String(startError),
          ]),
          severity: 'error',
          timestamp: Date.now(),
          action: {
            label: t('retry'),
            handler: () => {
              void handleStartWithRetry(true);
            },
          },
        });
      }
    },
    [onSessionChange, selectedTabIds, tabs],
  );

  const handleStart = useCallback((): void => {
    void handleStartWithRetry(false);
    setTimeout(() => searchInputRef.current?.focus(), 100);
  }, [handleStartWithRetry, searchInputRef]);

  const handleDismissError = useCallback((): void => {
    setError(null);
  }, []);

  return {
    error,
    handleStart,
    handleDismissError,
  };
}
