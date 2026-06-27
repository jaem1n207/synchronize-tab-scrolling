import { useState, useCallback, useEffect } from 'react';

import { sendMessage } from 'webext-bridge/popup';
import browser from 'webextension-polyfill';

import { ExtensionLogger } from '~/shared/lib/logger';
import {
  loadUrlSyncEnabled,
  repairUrlSyncMode,
  saveUrlSyncEnabled,
  saveUrlSyncMode,
} from '~/shared/lib/storage';
import {
  DEFAULT_URL_SYNC_MODE,
  isUrlSyncMode,
  type UrlSyncMode,
  type UrlSyncNotice,
} from '~/shared/types/url-sync';

const logger = new ExtensionLogger({ scope: 'popup' });
const URL_SYNC_SAVE_FAILED_NOTICE: UrlSyncNotice = {
  key: 'urlSyncSettingSaveFailedNotice',
  severity: 'error',
};
const URL_SYNC_MODE_RESET_NOTICE: UrlSyncNotice = {
  key: 'urlSyncModeResetNotice',
  severity: 'warning',
};

interface UseUrlSyncReturn {
  urlSyncEnabled: boolean;
  urlSyncMode: UrlSyncMode;
  urlSyncNotice: UrlSyncNotice | null;
  handleUrlSyncChange: (enabled: boolean) => Promise<void>;
  handleUrlSyncModeChange: (mode: UrlSyncMode) => Promise<void>;
  dismissUrlSyncNotice: () => void;
}

export function useUrlSync(): UseUrlSyncReturn {
  const [urlSyncEnabled, setUrlSyncEnabled] = useState(true);
  const [urlSyncMode, setUrlSyncMode] = useState<UrlSyncMode>(DEFAULT_URL_SYNC_MODE);
  const [urlSyncNotice, setUrlSyncNotice] = useState<UrlSyncNotice | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadUrlSyncPreferences = async () => {
      try {
        const [enabled, modeRepairResult] = await Promise.all([
          loadUrlSyncEnabled(),
          repairUrlSyncMode(),
        ]);

        if (!isMounted) {
          return;
        }

        setUrlSyncEnabled(enabled);
        setUrlSyncMode(modeRepairResult.mode);
        setUrlSyncNotice(modeRepairResult.notice ?? null);
      } catch (error) {
        await logger.warn('[useUrlSync] Failed to load URL sync preferences:', error);
      }
    };

    loadUrlSyncPreferences();

    const clearSaveFailedNotice = () => {
      setUrlSyncNotice((current) =>
        current?.key === 'urlSyncSettingSaveFailedNotice' ? null : current,
      );
    };

    const handleStorageChange = (
      changes: Record<string, browser.Storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName !== 'local') {
        return;
      }

      const enabledChange = changes.urlSyncEnabled;
      if (enabledChange && typeof enabledChange.newValue === 'boolean') {
        setUrlSyncEnabled(enabledChange.newValue);
        clearSaveFailedNotice();
      }

      const modeChange = changes.urlSyncMode;
      if (!modeChange) {
        return;
      }

      if (isUrlSyncMode(modeChange.newValue)) {
        setUrlSyncMode(modeChange.newValue);
        clearSaveFailedNotice();
        return;
      }

      setUrlSyncMode(DEFAULT_URL_SYNC_MODE);
      setUrlSyncNotice(URL_SYNC_MODE_RESET_NOTICE);
      repairUrlSyncMode().catch((error) => {
        logger.warn('[useUrlSync] Failed to repair invalid external URL sync mode:', error);
      });
    };

    browser.storage.onChanged.addListener(handleStorageChange);

    return () => {
      isMounted = false;
      browser.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  const handleUrlSyncChange = useCallback(async (enabled: boolean) => {
    const saved = await saveUrlSyncEnabled(enabled);
    if (!saved) {
      setUrlSyncNotice(URL_SYNC_SAVE_FAILED_NOTICE);
      return;
    }

    setUrlSyncEnabled(enabled);
    setUrlSyncNotice(null);
    sendMessage('sync:url-enabled-changed', { enabled }, 'background').catch((err) => {
      logger.warn('[useUrlSync] Failed to notify background of URL sync change:', err);
    });
  }, []);

  const handleUrlSyncModeChange = useCallback(async (mode: UrlSyncMode) => {
    const saved = await saveUrlSyncMode(mode);
    if (!saved) {
      setUrlSyncNotice(URL_SYNC_SAVE_FAILED_NOTICE);
      return;
    }

    setUrlSyncMode(mode);
    setUrlSyncNotice(null);
    sendMessage('sync:url-mode-changed', { mode }, 'background').catch((err) => {
      logger.warn('[useUrlSync] Failed to notify background of URL sync mode change:', err);
    });
  }, []);

  const dismissUrlSyncNotice = useCallback(() => {
    setUrlSyncNotice(null);
  }, []);

  return {
    urlSyncEnabled,
    urlSyncMode,
    urlSyncNotice,
    handleUrlSyncChange,
    handleUrlSyncModeChange,
    dismissUrlSyncNotice,
  };
}
