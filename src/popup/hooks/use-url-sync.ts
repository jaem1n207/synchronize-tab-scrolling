import { useState, useCallback, useEffect } from 'react';

import { sendMessage } from 'webext-bridge/popup';

import { ExtensionLogger } from '~/shared/lib/logger';
import { loadUrlSyncEnabled, saveUrlSyncEnabled } from '~/shared/lib/storage';

const logger = new ExtensionLogger({ scope: 'popup' });

interface UseUrlSyncReturn {
  urlSyncEnabled: boolean;
  handleUrlSyncChange: (enabled: boolean) => Promise<void>;
}

export function useUrlSync(): UseUrlSyncReturn {
  const [urlSyncEnabled, setUrlSyncEnabled] = useState(true);

  useEffect(() => {
    loadUrlSyncEnabled()
      .then(setUrlSyncEnabled)
      .catch(() => {
        // Fallback to default (true) on storage read failure
      });
  }, []);

  const handleUrlSyncChange = useCallback(async (enabled: boolean) => {
    setUrlSyncEnabled(enabled);
    await saveUrlSyncEnabled(enabled);
    sendMessage('sync:url-enabled-changed', { enabled }, 'background').catch((err) => {
      logger.warn('[useUrlSync] Failed to notify background of URL sync change:', err);
    });
  }, []);

  return {
    urlSyncEnabled,
    handleUrlSyncChange,
  };
}
