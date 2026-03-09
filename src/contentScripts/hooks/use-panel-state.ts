import * as React from 'react';

import { onMessage, sendMessage } from 'webext-bridge/content-script';

import { ExtensionLogger } from '~/shared/lib/logger';
import {
  loadAutoSyncEnabled,
  loadManualScrollOffsets,
  saveAutoSyncEnabled,
} from '~/shared/lib/storage';

import { getAutoSyncStatus } from '../scroll-sync';

export interface SyncedTab {
  id: number;
  title: string;
  offsetPixels: number;
  isCurrent: boolean;
}

interface UsePanelStateParams {
  wasDraggedRef: React.RefObject<boolean>;
}

interface UsePanelStateReturn {
  isOpen: boolean;
  syncedTabs: SyncedTab[];
  autoSyncEnabled: boolean;
  isAutoSyncActive: boolean;
  autoSyncGroupCount: number;
  ctrlOnlyRef: React.RefObject<boolean>;
  handleOpenChange: (open: boolean) => void;
  loadSyncedTabsWithOffsets: () => Promise<void>;
  fetchAutoSyncDetailedStatus: () => Promise<void>;
  handleAutoSyncToggle: (enabled: boolean) => Promise<void>;
}

const logger = new ExtensionLogger({ scope: 'sync-control-panel' });

export const usePanelState = ({ wasDraggedRef }: UsePanelStateParams): UsePanelStateReturn => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [syncedTabs, setSyncedTabs] = React.useState<SyncedTab[]>([]);
  const [autoSyncEnabled, setAutoSyncEnabled] = React.useState(false);
  const [isAutoSyncActive, setIsAutoSyncActive] = React.useState(false);
  const [autoSyncGroupCount, setAutoSyncGroupCount] = React.useState(0);

  const ctrlOnlyRef = React.useRef<boolean>(false);

  const handleOpenChange = React.useCallback(
    (open: boolean) => {
      if (open && wasDraggedRef.current) {
        return;
      }
      setIsOpen(open);
    },
    [wasDraggedRef],
  );

  const loadSyncedTabsWithOffsets = React.useCallback(async () => {
    try {
      const response = await sendMessage('sync:get-status', {}, 'background');
      const status = response as {
        success: boolean;
        linkedTabs?: Array<{ id: number; title: string; url: string; favIconUrl?: string }>;
        currentTabId?: number;
      } | null;

      if (!status?.success || !status.linkedTabs) {
        setSyncedTabs([]);
        return;
      }

      const offsets = await loadManualScrollOffsets();
      const tabs = status.linkedTabs.map((tab) => ({
        id: tab.id,
        title: tab.title,
        offsetPixels: offsets[tab.id]?.pixels || 0,
        isCurrent: tab.id === status.currentTabId,
      }));

      setSyncedTabs(tabs);
    } catch (error) {
      await logger.error('Failed to load synced tabs with offsets:', error);
      setSyncedTabs([]);
    }
  }, []);

  React.useEffect(() => {
    if (isOpen) {
      loadSyncedTabsWithOffsets();
    }
  }, [isOpen, loadSyncedTabsWithOffsets]);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Control') {
        ctrlOnlyRef.current = true;
        return;
      }

      if (e.ctrlKey && ctrlOnlyRef.current) {
        ctrlOnlyRef.current = false;
      }

      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control' && ctrlOnlyRef.current) {
        ctrlOnlyRef.current = false;
        setIsOpen((prev) => !prev);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [isOpen]);

  const fetchAutoSyncDetailedStatus = React.useCallback(async () => {
    try {
      const response = (await sendMessage('auto-sync:get-detailed-status', {}, 'background')) as {
        success: boolean;
        enabled: boolean;
        currentTabGroup?: { tabCount: number; isActive: boolean };
      };

      if (response?.success && response.currentTabGroup) {
        setIsAutoSyncActive(response.currentTabGroup.isActive);
        setAutoSyncGroupCount(Math.max(0, response.currentTabGroup.tabCount - 1));
      } else {
        setIsAutoSyncActive(false);
        setAutoSyncGroupCount(0);
      }
    } catch {
      const status = getAutoSyncStatus();
      setIsAutoSyncActive(status.isAutoSync && status.isActive);
      setAutoSyncGroupCount(0);
    }
  }, []);

  React.useEffect(() => {
    loadAutoSyncEnabled().then(setAutoSyncEnabled);
    fetchAutoSyncDetailedStatus();

    const unsubscribeStatusChanged = onMessage('auto-sync:status-changed', (message) => {
      const data = message.data as { enabled: boolean };
      setAutoSyncEnabled(data.enabled);
      fetchAutoSyncDetailedStatus();
    });

    const unsubscribeGroupUpdated = onMessage('auto-sync:group-updated', () => {
      fetchAutoSyncDetailedStatus();
    });

    return () => {
      unsubscribeStatusChanged();
      unsubscribeGroupUpdated();
    };
  }, [fetchAutoSyncDetailedStatus]);

  const handleAutoSyncToggle = React.useCallback(async (enabled: boolean) => {
    try {
      await saveAutoSyncEnabled(enabled);
      setAutoSyncEnabled(enabled);

      await sendMessage('auto-sync:status-changed', { enabled }, 'background');
    } catch (error) {
      await logger.error('Failed to toggle auto-sync:', error);
    }
  }, []);

  return {
    isOpen,
    syncedTabs,
    autoSyncEnabled,
    isAutoSyncActive,
    autoSyncGroupCount,
    ctrlOnlyRef,
    handleOpenChange,
    loadSyncedTabsWithOffsets,
    fetchAutoSyncDetailedStatus,
    handleAutoSyncToggle,
  };
};
