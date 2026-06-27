import { useState, useCallback, useEffect, useRef } from 'react';

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
  const stateVersionRef = useRef({ enabled: 0, mode: 0, notice: 0 });

  const advanceStateVersion = useCallback((keys: Array<'enabled' | 'mode' | 'notice'>) => {
    keys.forEach((key) => {
      stateVersionRef.current[key] += 1;
    });
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadUrlSyncPreferences = async () => {
      const loadVersion = { ...stateVersionRef.current };

      try {
        const [enabled, modeRepairResult] = await Promise.all([
          loadUrlSyncEnabled(),
          repairUrlSyncMode(),
        ]);

        if (!isMounted) {
          return;
        }

        const currentVersion = stateVersionRef.current;
        const shouldApplyEnabled = currentVersion.enabled === loadVersion.enabled;
        const shouldApplyMode = currentVersion.mode === loadVersion.mode;
        const shouldApplyNotice =
          currentVersion.notice === loadVersion.notice && currentVersion.mode === loadVersion.mode;

        if (shouldApplyEnabled) {
          setUrlSyncEnabled(enabled);
        }

        if (modeRepairResult.status === 'success') {
          if (shouldApplyMode) {
            setUrlSyncMode(modeRepairResult.mode);
          }

          if (shouldApplyNotice) {
            setUrlSyncNotice(modeRepairResult.notice ?? null);
          }
          return;
        }

        if (shouldApplyNotice) {
          setUrlSyncNotice(modeRepairResult.notice);
        }
      } catch (error) {
        await logger.warn('[useUrlSync] Failed to load URL sync preferences:', error);
      }
    };

    loadUrlSyncPreferences();

    const clearSettingFailedNotice = () => {
      setUrlSyncNotice((current) =>
        current?.key === 'urlSyncSettingSaveFailedNotice' ||
        current?.key === 'urlSyncSettingReadFailedNotice'
          ? null
          : current,
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
      if (enabledChange) {
        advanceStateVersion(['enabled', 'notice']);
        setUrlSyncEnabled(
          typeof enabledChange.newValue === 'boolean' ? enabledChange.newValue : true,
        );
        clearSettingFailedNotice();
      }

      const modeChange = changes.urlSyncMode;
      if (!modeChange) {
        return;
      }

      if (isUrlSyncMode(modeChange.newValue)) {
        advanceStateVersion(['mode', 'notice']);
        setUrlSyncMode(modeChange.newValue);
        clearSettingFailedNotice();
        return;
      }

      if (modeChange.newValue === undefined) {
        advanceStateVersion(['mode', 'notice']);
        setUrlSyncMode(DEFAULT_URL_SYNC_MODE);
        clearSettingFailedNotice();
        return;
      }

      advanceStateVersion(['mode', 'notice']);
      const repairVersion = { ...stateVersionRef.current };
      repairUrlSyncMode()
        .then((modeRepairResult) => {
          if (
            stateVersionRef.current.mode !== repairVersion.mode ||
            stateVersionRef.current.notice !== repairVersion.notice
          ) {
            return;
          }

          if (modeRepairResult.status === 'success') {
            setUrlSyncMode(modeRepairResult.mode);
            setUrlSyncNotice(modeRepairResult.notice ?? URL_SYNC_MODE_RESET_NOTICE);
            return;
          }

          setUrlSyncNotice(modeRepairResult.notice);
        })
        .catch((error) => {
          logger.warn('[useUrlSync] Failed to repair invalid external URL sync mode:', error);
        });
    };

    browser.storage.onChanged.addListener(handleStorageChange);

    return () => {
      isMounted = false;
      browser.storage.onChanged.removeListener(handleStorageChange);
    };
  }, [advanceStateVersion]);

  const handleUrlSyncChange = useCallback(
    async (enabled: boolean) => {
      const saved = await saveUrlSyncEnabled(enabled);
      if (!saved) {
        advanceStateVersion(['notice']);
        setUrlSyncNotice(URL_SYNC_SAVE_FAILED_NOTICE);
        return;
      }

      advanceStateVersion(['enabled', 'notice']);
      setUrlSyncEnabled(enabled);
      setUrlSyncNotice(null);
      sendMessage('sync:url-enabled-changed', { enabled }, 'background').catch((err) => {
        logger.warn('[useUrlSync] Failed to notify background of URL sync change:', err);
      });
    },
    [advanceStateVersion],
  );

  const handleUrlSyncModeChange = useCallback(
    async (mode: UrlSyncMode) => {
      const saved = await saveUrlSyncMode(mode);
      if (!saved) {
        advanceStateVersion(['notice']);
        setUrlSyncNotice(URL_SYNC_SAVE_FAILED_NOTICE);
        return;
      }

      advanceStateVersion(['mode', 'notice']);
      setUrlSyncMode(mode);
      setUrlSyncNotice(null);
      sendMessage('sync:url-mode-changed', { mode }, 'background').catch((err) => {
        logger.warn('[useUrlSync] Failed to notify background of URL sync mode change:', err);
      });
    },
    [advanceStateVersion],
  );

  const dismissUrlSyncNotice = useCallback(() => {
    advanceStateVersion(['notice']);
    setUrlSyncNotice(null);
  }, [advanceStateVersion]);

  return {
    urlSyncEnabled,
    urlSyncMode,
    urlSyncNotice,
    handleUrlSyncChange,
    handleUrlSyncModeChange,
    dismissUrlSyncNotice,
  };
}
