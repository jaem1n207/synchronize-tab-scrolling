import { onMessage } from 'webext-bridge/background';
import browser from 'webextension-polyfill';

import { ExtensionLogger } from '~/shared/lib/logger';

import {
  removeTabFromAllAutoSyncGroups,
  getAutoSyncGroupMembers,
  isTabInActiveAutoSyncGroup,
} from '../lib/auto-sync-groups';
import { reinjectContentScript } from '../lib/content-script-manager';
import { sendMessageWithTimeout } from '../lib/messaging';
import { syncState, persistSyncState, broadcastSyncStatus } from '../lib/sync-state';

const logger = new ExtensionLogger({ scope: 'background/connection-handlers' });

export function registerConnectionHandlers(): void {
  onMessage('sync:get-status', async ({ sender }) => {
    if (!syncState.isActive) {
      return {
        success: false,
        isActive: false,
        linkedTabs: [],
        connectionStatuses: {},
      };
    }

    const tabs = await browser.tabs.query({ currentWindow: true });

    const tabInfoPromises = syncState.linkedTabs.map(async (tabId) => {
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab) return null;

      return {
        id: tab.id!,
        title: tab.title || 'Untitled',
        url: tab.url || '',
        favIconUrl: tab.favIconUrl,
        eligible: true,
      };
    });

    const linkedTabsInfo = (await Promise.all(tabInfoPromises)).filter(
      (info): info is NonNullable<typeof info> => info !== null,
    );

    return {
      success: true,
      isActive: true,
      linkedTabs: linkedTabsInfo,
      connectedTabs: syncState.linkedTabs,
      connectionStatuses: syncState.connectionStatuses,
      currentTabId: sender.tabId,
    };
  });

  onMessage('scroll:ping', async ({ data }) => {
    const payload = data;
    logger.debug('Received connection health ping', { payload });

    return { success: true, timestamp: Date.now(), tabId: payload.tabId };
  });

  onMessage('scroll:reconnect', async ({ data }) => {
    const payload = data;
    logger.info('Received reconnection request from content script', { payload });

    const isInManualSync = syncState.isActive && syncState.linkedTabs.includes(payload.tabId);
    const isInAutoSync = isTabInActiveAutoSyncGroup(payload.tabId);

    if (!isInManualSync && !isInAutoSync) {
      logger.debug('Tab not in any active sync, ignoring reconnection request', {
        tabId: payload.tabId,
        manualSyncActive: syncState.isActive,
        linkedTabs: syncState.linkedTabs,
        isInAutoSync,
      });
      return { success: false, reason: 'Sync not active' };
    }

    try {
      const tab = await browser.tabs.get(payload.tabId);
      logger.debug('Tab verified for reconnection', { tabId: tab.id, url: tab.url });
    } catch (error) {
      logger.error('Tab no longer exists, removing from sync', { tabId: payload.tabId, error });
      if (isInManualSync) {
        syncState.linkedTabs = syncState.linkedTabs.filter((id) => id !== payload.tabId);
        delete syncState.connectionStatuses[payload.tabId];
        await persistSyncState();
      }
      if (isInAutoSync) {
        await removeTabFromAllAutoSyncGroups(payload.tabId);
      }
      return { success: false, reason: 'Tab no longer exists' };
    }

    try {
      const tabIds = isInManualSync
        ? syncState.linkedTabs
        : Array.from(getAutoSyncGroupMembers(payload.tabId)).concat(payload.tabId);

      const response = await sendMessageWithTimeout<{ success: boolean; tabId: number }>(
        'scroll:start',
        {
          tabIds,
          mode: syncState.mode || 'ratio',
          currentTabId: payload.tabId,
          isAutoSync: isInAutoSync && !isInManualSync,
        },
        { context: 'content-script', tabId: payload.tabId },
        3_000,
      );

      if (response && response.success && response.tabId === payload.tabId) {
        if (isInManualSync) {
          syncState.connectionStatuses[payload.tabId] = 'connected';
          await persistSyncState();
          await broadcastSyncStatus();
        }
        logger.info(`Tab ${payload.tabId} reconnected successfully after idle recovery`, {
          isManualSync: isInManualSync,
          isAutoSync: isInAutoSync,
        });
        return { success: true };
      } else {
        logger.error('Invalid reconnection acknowledgment', { response });
        if (isInManualSync) {
          syncState.connectionStatuses[payload.tabId] = 'error';
          await persistSyncState();
        }
        return { success: false, reason: 'Invalid acknowledgment' };
      }
    } catch (error) {
      logger.error(`Failed to reconnect tab ${payload.tabId}`, { error });
      if (isInManualSync) {
        syncState.connectionStatuses[payload.tabId] = 'error';
        await persistSyncState();
      }
      return { success: false, reason: 'Connection failed' };
    }
  });

  onMessage('scroll:request-reinject', async ({ data }) => {
    const payload = data;
    logger.info('Received content script re-inject request', { tabId: payload.tabId });

    const isInManualSync = syncState.isActive && syncState.linkedTabs.includes(payload.tabId);
    const isInAutoSync = isTabInActiveAutoSyncGroup(payload.tabId);

    if (!isInManualSync && !isInAutoSync) {
      logger.debug('Tab not in any active sync, ignoring re-inject request', {
        tabId: payload.tabId,
      });
      return { success: false, reason: 'Tab not in sync' };
    }

    const success = await reinjectContentScript(payload.tabId);
    return { success };
  });
}
