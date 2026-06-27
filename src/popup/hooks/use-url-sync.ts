import { useState, useCallback, useEffect } from 'react';

import { sendMessage } from 'webext-bridge/popup';

import { ExtensionLogger } from '~/shared/lib/logger';
import {
  loadUrlSyncEnabled,
  repairUrlSyncMode,
  saveUrlSyncEnabled,
  saveUrlSyncMode,
} from '~/shared/lib/storage';
import {
  DEFAULT_URL_SYNC_MODE,
  type UrlSyncMode,
  type UrlSyncNotice,
} from '~/shared/types/url-sync';

const logger = new ExtensionLogger({ scope: 'popup' });
const URL_SYNC_SAVE_FAILED_NOTICE: UrlSyncNotice = {
  key: 'urlSyncSettingSaveFailedNotice',
  severity: 'error',
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

    return () => {
      isMounted = false;
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
