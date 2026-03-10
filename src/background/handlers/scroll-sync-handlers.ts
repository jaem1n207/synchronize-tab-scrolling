import { onMessage, sendMessage } from 'webext-bridge/background';
import browser from 'webextension-polyfill';

import { ExtensionLogger } from '~/shared/lib/logger';

import {
  removeTabFromAllAutoSyncGroups,
  getAutoSyncGroupMembers,
  updateAutoSyncGroup,
} from '../lib/auto-sync-groups';
import {
  autoSyncState,
  manualSyncOverriddenTabs,
  pendingSuggestions,
  addTabSuggestedTabs,
} from '../lib/auto-sync-state';
import { startKeepAlive, stopKeepAlive } from '../lib/keep-alive';
import { sendMessageWithTimeout } from '../lib/messaging';
import { syncState, persistSyncState, broadcastSyncStatus } from '../lib/sync-state';

const logger = new ExtensionLogger({ scope: 'background/scroll-sync-handlers' });

export function registerScrollSyncHandlers(): void {
  logger.info('Registering scroll:start handler');
  onMessage('scroll:start', async ({ data }) => {
    logger.info('Received scroll:start message', { data });
    const payload = data;

    // If this is a manual sync (not auto-sync), handle conflict with auto-sync
    if (!payload.isAutoSync) {
      for (const tabId of payload.tabIds) {
        manualSyncOverriddenTabs.add(tabId);
        await removeTabFromAllAutoSyncGroups(tabId);
      }

      // Clean up stale pending suggestions for groups that no longer have enough tabs
      for (const normalizedUrl of [...pendingSuggestions]) {
        const group = autoSyncState.groups.get(normalizedUrl);
        if (!group || group.tabIds.size < 2) {
          pendingSuggestions.delete(normalizedUrl);
        }
      }

      logger.debug('Manual sync started, tabs excluded from auto-sync', {
        tabIds: payload.tabIds,
      });
    }

    // Initialize connection statuses as 'connecting'
    const connectionResults: Record<number, { success: boolean; error?: string }> = {};

    // Attempt to connect to each tab with timeout and acknowledgment validation
    logger.info(`Connecting to ${payload.tabIds.length} tabs`, { tabIds: payload.tabIds });

    const promises = payload.tabIds.map(async (tabId) => {
      try {
        // Verify tab exists first
        const tab = await browser.tabs.get(tabId);
        logger.debug(`Verified tab ${tabId} exists:`, { title: tab.title, url: tab.url });

        logger.debug(`Sending scroll:start to tab ${tabId}`);

        // Send message with timeout and capture acknowledgment
        const response = await sendMessageWithTimeout<{ success: boolean; tabId: number }>(
          'scroll:start',
          { ...payload, currentTabId: tabId },
          { context: 'content-script', tabId },
          1_000, // 1 second timeout
        );

        // Validate acknowledgment
        if (response && response.success && response.tabId === tabId) {
          logger.info(`Tab ${tabId} acknowledged connection successfully`);
          connectionResults[tabId] = { success: true };
          syncState.connectionStatuses[tabId] = 'connected';
        } else {
          logger.error(`Tab ${tabId} returned invalid acknowledgment`, { response });
          connectionResults[tabId] = { success: false, error: 'Invalid acknowledgment' };
          syncState.connectionStatuses[tabId] = 'error';
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to connect to tab ${tabId}`, { error: errorMessage });
        connectionResults[tabId] = { success: false, error: errorMessage };
        syncState.connectionStatuses[tabId] = 'error';
      }
    });

    await Promise.all(promises);

    // Check if at least 2 tabs connected successfully
    const successfulConnections = Object.entries(connectionResults).filter(
      ([, result]) => result.success,
    );
    const connectedTabIds = successfulConnections.map(([tabId]) => Number(tabId));

    logger.info('Connection results', {
      total: payload.tabIds.length,
      successful: successfulConnections.length,
      failed: payload.tabIds.length - successfulConnections.length,
      results: connectionResults,
    });

    if (connectedTabIds.length < 2) {
      // Not enough tabs connected, rollback
      logger.error('Failed to connect to enough tabs (need at least 2)');

      // Send stop messages to any tabs that did connect
      const stopPromises = connectedTabIds.map((tabId) =>
        sendMessage('scroll:stop', {}, { context: 'content-script', tabId }).catch((error) => {
          logger.error(`Failed to send rollback stop message to tab ${tabId}`, { error });
        }),
      );
      await Promise.all(stopPromises);

      // Don't update sync state
      syncState.isActive = false;
      syncState.linkedTabs = [];
      syncState.connectionStatuses = {};

      return {
        success: false,
        connectedTabs: connectedTabIds,
        connectionResults,
        error: 'Failed to connect to at least 2 tabs',
      };
    }

    // Update sync state with only successfully connected tabs
    syncState.isActive = true;
    syncState.linkedTabs = connectedTabIds;
    syncState.mode = payload.mode;

    // Start keep-alive mechanism to prevent service worker termination
    startKeepAlive();

    // Persist state to survive service worker restarts
    await persistSyncState();

    // Broadcast status update to all connected tabs
    logger.info('Broadcasting sync status to connected tabs');
    await broadcastSyncStatus();
    logger.info('Sync status broadcasted');

    return {
      success: true,
      connectedTabs: connectedTabIds,
      connectionResults,
    };
  });

  onMessage('scroll:stop', async ({ data }) => {
    logger.info('Stopping scroll sync for tabs', { data });
    const payload = data;
    const tabIds = payload.tabIds ?? [];

    // Broadcast stop message to all selected tabs
    const promises = tabIds.map((tabId) =>
      sendMessage('scroll:stop', data, { context: 'content-script', tabId }).catch((error) => {
        logger.error(`Failed to send stop message to tab ${tabId}`, { error });
      }),
    );

    await Promise.all(promises);

    // Also stop any auto-sync groups that contain these tabs
    // This ensures auto-sync state is cleared when user stops from popup
    for (const [normalizedUrl, group] of autoSyncState.groups.entries()) {
      if (group.isActive) {
        const hasStoppedTab = tabIds.some((tabId) => group.tabIds.has(tabId));
        if (hasStoppedTab) {
          logger.info('[AUTO-SYNC] Clearing auto-sync group due to manual stop', {
            normalizedUrl,
            stoppedTabIds: tabIds,
          });
          group.isActive = false;
        }
      }
    }

    // If this was a manual sync stop, re-add tabs to auto-sync groups
    if (!payload.isAutoSync && autoSyncState.enabled) {
      for (const tabId of tabIds) {
        // Remove from manually overridden set
        manualSyncOverriddenTabs.delete(tabId);

        // Re-add to auto-sync group based on current URL
        try {
          const tab = await browser.tabs.get(tabId);
          if (tab.url) {
            await updateAutoSyncGroup(tabId, tab.url);
          }
        } catch {
          // Tab may have been closed
        }
      }
      logger.debug('Manual sync stopped, tabs returned to auto-sync', {
        tabIds,
      });
    }

    stopKeepAlive();

    syncState.isActive = false;
    syncState.linkedTabs = [];
    syncState.connectionStatuses = {};
    syncState.mode = undefined;
    addTabSuggestedTabs.clear();

    await persistSyncState();

    return { success: true };
  });

  onMessage('scroll:sync', async ({ data, sender }) => {
    const payload = data;

    logger.debug('Relaying scroll sync message', { payload, sender });

    // Manual sync tabs (existing logic)
    let targetTabIds = syncState.linkedTabs.filter((tabId) => tabId !== payload.sourceTabId);

    // Also include auto-sync group members
    const autoSyncTargets = getAutoSyncGroupMembers(payload.sourceTabId);
    if (autoSyncTargets.length > 0) {
      logger.debug('Adding auto-sync group members to relay targets', {
        sourceTabId: payload.sourceTabId,
        autoSyncTargets,
      });
      // Merge and deduplicate
      targetTabIds = [...new Set([...targetTabIds, ...autoSyncTargets])];
    }

    if (targetTabIds.length === 0) {
      logger.debug('No target tabs to relay scroll sync to');
      return { success: true };
    }

    const promises = targetTabIds.map((tabId) =>
      sendMessage('scroll:sync', data, { context: 'content-script', tabId }).catch((error) => {
        logger.debug(`Failed to relay scroll sync to tab ${tabId}`, { error });
      }),
    );

    await Promise.all(promises);
    return { success: true };
  });

  onMessage('scroll:manual', async ({ data }) => {
    logger.debug('Manual scroll mode toggled', { data });
    const payload = data;

    // Send manual mode change to the specific tab only
    try {
      await sendMessage('scroll:manual', data, {
        context: 'content-script',
        tabId: payload.tabId,
      });
    } catch (error) {
      logger.debug(`Failed to send manual mode to tab ${payload.tabId}`, { error });
    }

    return { success: true };
  });

  onMessage('url:sync', async ({ data }) => {
    const payload = data;
    logger.info('Relaying URL sync message', { payload });

    // Broadcast to all synced tabs except the source
    const targetTabIds = syncState.linkedTabs.filter((tabId) => tabId !== payload.sourceTabId);
    const promises = targetTabIds.map((tabId) =>
      sendMessage('url:sync', data, { context: 'content-script', tabId }).catch((error) => {
        logger.debug(`Failed to relay URL sync to tab ${tabId}`, { error });
      }),
    );

    await Promise.all(promises);
    return { success: true };
  });

  // Handler for URL sync enabled state change broadcast
  onMessage('sync:url-enabled-changed', async ({ data, sender }) => {
    const payload = data;
    const sourceTabId = sender.tabId;
    logger.info('Relaying URL sync enabled change', { enabled: payload.enabled, sourceTabId });

    // Broadcast to all synced tabs except the source
    const targetTabIds = syncState.linkedTabs.filter((tabId) => tabId !== sourceTabId);
    const promises = targetTabIds.map((tabId) =>
      sendMessage('sync:url-enabled-changed', payload, { context: 'content-script', tabId }).catch(
        (error) => {
          logger.debug(`Failed to relay URL sync enabled to tab ${tabId}`, { error });
        },
      ),
    );

    await Promise.all(promises);
    return { success: true };
  });
}
