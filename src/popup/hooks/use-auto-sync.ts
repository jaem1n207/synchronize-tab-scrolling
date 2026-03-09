import { useState, useCallback, useEffect } from 'react';

import { sendMessage } from 'webext-bridge/popup';

import { ExtensionLogger } from '~/shared/lib/logger';
import { loadAutoSyncEnabled, saveAutoSyncEnabled } from '~/shared/lib/storage';

const logger = new ExtensionLogger({ scope: 'popup' });

interface UseAutoSyncReturn {
  autoSyncEnabled: boolean;
  autoSyncTabCount: number;
  handleAutoSyncChange: (enabled: boolean) => Promise<void>;
}

export function useAutoSync(): UseAutoSyncReturn {
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false);
  const [autoSyncTabCount, setAutoSyncTabCount] = useState(0);

  useEffect(() => {
    loadAutoSyncEnabled()
      .then(setAutoSyncEnabled)
      .catch(() => {
        // Fallback to default (false) on storage read failure
      });
  }, []);

  useEffect(() => {
    const fetchAutoSyncStatus = async () => {
      if (!autoSyncEnabled) {
        setAutoSyncTabCount(0);
        return;
      }

      try {
        const response = await sendMessage('auto-sync:get-detailed-status', {}, 'background');

        if (response && typeof response === 'object' && 'potentialSyncTabs' in response) {
          setAutoSyncTabCount((response.potentialSyncTabs || 0) as number);
        }
      } catch {
        // Ignore errors - status is optional
      }
    };

    fetchAutoSyncStatus();

    const interval = autoSyncEnabled ? setInterval(fetchAutoSyncStatus, 2000) : undefined;
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoSyncEnabled]);

  const handleAutoSyncChange = useCallback(async (enabled: boolean) => {
    setAutoSyncEnabled(enabled);
    await saveAutoSyncEnabled(enabled);
    sendMessage('auto-sync:status-changed', { enabled }, 'background').catch((err) => {
      logger.warn('[useAutoSync] Failed to notify background of auto-sync change:', err);
    });
  }, []);

  return {
    autoSyncEnabled,
    autoSyncTabCount,
    handleAutoSyncChange,
  };
}
