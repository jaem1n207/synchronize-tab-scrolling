import { onMessage, sendMessage } from 'webext-bridge/background';
import browser from 'webextension-polyfill';

import { t, type TranslationKey } from '~/shared/i18n';
import { ExtensionLogger } from '~/shared/lib/logger';
import { isRestrictedUrl } from '~/shared/types';

import type { SyncTab, SyncGroup, SyncState } from '~/shared/types';

// Initialize logger first
const logger = new ExtensionLogger({ scope: 'background' });

// Log that background script is starting
logger.info('Background script initializing...');

// Sync state management
let syncState: SyncState = {
  groups: [],
  activeGroupId: null,
};

// Function to save state to storage
async function saveStateToStorage() {
  try {
    await browser.storage.local.set({ syncState });
    logger.debug('Sync state saved to storage');
  } catch (error) {
    logger.error('Failed to save state to storage', error);
  }
}

// Function to restore state from storage
async function restoreStateFromStorage() {
  try {
    const stored = await browser.storage.local.get('syncState');
    const restoredSyncState = stored.syncState as SyncState | undefined;
    if (restoredSyncState && restoredSyncState.groups && restoredSyncState.groups.length > 0) {
      syncState = restoredSyncState;
      logger.info(`Restored sync state from storage: ${syncState.groups.length} groups`);

      // Validate that tabs still exist and clean up orphaned groups
      const validGroups: SyncGroup[] = [];
      for (const group of syncState.groups) {
        const validTabs: number[] = [];
        for (const tabId of group.tabs) {
          try {
            await browser.tabs.get(tabId);
            validTabs.push(tabId);
          } catch {
            logger.info(`Tab ${tabId} no longer exists, removing from group ${group.id}`);
          }
        }

        if (validTabs.length >= 2) {
          group.tabs = validTabs;
          validGroups.push(group);
          logger.info(`Group ${group.id} restored with ${validTabs.length} valid tabs`);
        } else {
          logger.info(`Group ${group.id} removed - insufficient valid tabs (${validTabs.length})`);
        }
      }

      syncState.groups = validGroups;
      syncState.activeGroupId = validGroups.find((g) => g.isActive)?.id || null;

      // Save cleaned state back to storage
      await saveStateToStorage();
    } else {
      logger.info('No valid sync state found in storage, using empty state');
    }
  } catch (error) {
    logger.error('Failed to restore state from storage', error);
  }
}

// Restore state immediately on script initialization
restoreStateFromStorage();

// only on dev mode
if (import.meta.hot) {
  // @ts-expect-error for background HMR
  // eslint-disable-next-line import/no-unresolved
  import('/@vite/client');
  // load latest content script
  import('./contentScriptHMR');
}

// Get all tabs and check eligibility
async function getAllTabs(): Promise<SyncTab[]> {
  try {
    logger.info('Querying browser tabs...');
    const tabs = await browser.tabs.query({});
    logger.info(`Found ${tabs.length} tabs`);

    return tabs.map((tab) => {
      try {
        const { restricted, reasonKey } = isRestrictedUrl(tab.url || '');
        return {
          id: tab.id!,
          title: tab.title || 'Untitled',
          url: tab.url || '',
          favicon: tab.favIconUrl,
          isEligible: !restricted && tab.id !== undefined && tab.url !== undefined,
          ineligibilityReason: reasonKey ? t(reasonKey as TranslationKey) : undefined,
          windowId: tab.windowId!,
        };
      } catch (err) {
        logger.error(`Error processing tab ${tab.id}:`, err);
        return {
          id: tab.id!,
          title: tab.title || 'Untitled',
          url: tab.url || '',
          favicon: tab.favIconUrl,
          isEligible: false,
          ineligibilityReason: 'Error processing tab',
          windowId: tab.windowId!,
        };
      }
    });
  } catch (error) {
    logger.error('Failed to get tabs', error);
    return [];
  }
}

// Register message handlers at module level - IMPORTANT: This must happen synchronously when module loads
onMessage('get-tabs', async () => {
  logger.info('get-tabs message received');
  const tabs = await getAllTabs();
  logger.info(`Returning ${tabs.length} tabs`);
  return tabs;
});

onMessage('get-sync-state', async () => {
  logger.info('get-sync-state message received');
  return syncState;
});

onMessage('create-sync-group', async ({ data }) => {
  const { tabIds, syncMode, urlSync } = data;

  if (tabIds.length < 2) {
    throw new Error(t('errors.noTabs'));
  }

  // Create new sync group
  const group: SyncGroup = {
    id: `sync-${Date.now()}`,
    tabs: tabIds,
    isActive: true,
    syncMode,
    urlSync,
    createdAt: Date.now(),
  };

  // Deactivate other groups
  syncState.groups.forEach((g) => (g.isActive = false));

  // Add new group
  syncState.groups.push(group);
  syncState.activeGroupId = group.id;

  // Save state to storage
  await saveStateToStorage();

  // First, ensure content scripts are injected in all tabs
  for (const tabId of tabIds) {
    try {
      // Check if content script is already injected by trying to ping it
      try {
        await sendMessage('ping', {}, { context: 'content-script', tabId });
        logger.info(`Content script already injected in tab ${tabId}`);
      } catch {
        // Content script not injected, inject it now
        logger.info(`Injecting content script into tab ${tabId}`);
        await browser.scripting.executeScript({
          target: { tabId },
          files: ['dist/contentScripts/index.global.js'],
        });

        // Wait for the content script to initialize
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Verify injection
        try {
          await sendMessage('ping', {}, { context: 'content-script', tabId });
          logger.info(`Content script successfully injected and responsive in tab ${tabId}`);
        } catch (pingError) {
          logger.warn(`Content script may not be fully initialized in tab ${tabId}`, pingError);
          // Continue anyway, the message might still work
        }
      }
    } catch (error) {
      logger.error(`Failed to inject content script in tab ${tabId}`, error);
    }
  }

  // Now notify all tabs in the group
  for (const tabId of tabIds) {
    try {
      logger.info(`📨 About to send sync-started message to tab ${tabId}`);
      const result = await sendMessage(
        'sync-started',
        {
          group,
          showControlPanel: true, // Show control panel in all tabs
        },
        { context: 'content-script', tabId },
      );
      logger.info(`🟢 Notified tab ${tabId} about sync start (showControlPanel: true)`, {
        result,
        messageData: {
          groupId: group.id,
          tabCount: group.tabs.length,
          syncMode: group.syncMode,
        },
      });
    } catch (error) {
      logger.error(`❌ Failed to notify tab ${tabId}`, {
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  }

  return group;
});

onMessage('stop-sync', async ({ data }) => {
  const { groupId } = data;
  const group = syncState.groups.find((g) => g.id === groupId);

  if (!group) {
    throw new Error('Sync group not found');
  }

  group.isActive = false;
  if (syncState.activeGroupId === groupId) {
    syncState.activeGroupId = null;
  }

  // Save state to storage
  await saveStateToStorage();

  // Notify all tabs in the group
  for (const tabId of group.tabs) {
    try {
      await sendMessage('sync-stopped', { groupId }, { context: 'content-script', tabId });
    } catch (error) {
      logger.error(`Failed to notify tab ${tabId}`, error);
    }
  }
});

onMessage('sync-scroll', async ({ data, sender }) => {
  const { groupId, position } = data;
  // Use the actual sender's tab ID
  const sourceTabId = sender.tabId;

  logger.info('📥 RECEIVED sync-scroll message from content script', {
    sourceTabId,
    senderInfo: sender,
    groupId,
    scrollTop: position?.scrollTop,
    scrollHeight: position?.scrollHeight,
    clientHeight: position?.clientHeight,
    hasGroup: !!syncState.groups.find((g) => g.id === groupId),
    activeGroupId: syncState.activeGroupId,
    allGroups: syncState.groups.map((g) => ({
      id: g.id,
      isActive: g.isActive,
      tabs: g.tabs,
      syncMode: g.syncMode,
    })),
  });

  if (!sourceTabId) {
    logger.error('❌ No tab ID found for sync-scroll message', { sender });
    return;
  }

  const group = syncState.groups.find((g) => g.id === groupId);

  if (!group || !group.isActive) {
    logger.warn('⛔ Group not found or inactive', {
      groupId,
      groupExists: !!group,
      isActive: group?.isActive,
      activeGroupId: syncState.activeGroupId,
      availableGroups: syncState.groups.map((g) => ({ id: g.id, isActive: g.isActive })),
    });
    return;
  }

  // Verify sender tab is in the group
  if (!group.tabs.includes(sourceTabId)) {
    logger.error('⛔ Source tab not in sync group', {
      sourceTabId,
      groupTabs: group.tabs,
    });
    return;
  }

  logger.info('🔄 SYNCING scroll to other tabs', {
    groupId: group.id,
    syncMode: group.syncMode,
    groupTabs: group.tabs,
    sourceTabId,
    targetTabs: group.tabs.filter((id) => id !== sourceTabId),
    targetTabCount: group.tabs.filter((id) => id !== sourceTabId).length,
  });

  // Send scroll position to all other tabs in the group
  const targetTabs = group.tabs.filter((id) => id !== sourceTabId);
  for (const tabId of targetTabs) {
    try {
      logger.info(`📨 SENDING apply-scroll to tab ${tabId}`, {
        scrollTop: position.scrollTop,
        scrollHeight: position.scrollHeight,
        clientHeight: position.clientHeight,
        syncMode: group.syncMode,
        targetTabId: tabId,
        sourceTabId,
      });

      await sendMessage(
        'apply-scroll',
        { position, syncMode: group.syncMode },
        { context: 'content-script', tabId },
      );

      logger.info(`✅ Successfully sent apply-scroll to tab ${tabId}`, {
        targetTabId: tabId,
        scrollTop: position.scrollTop,
      });
    } catch (error) {
      logger.error(`❌ Failed to sync scroll to tab ${tabId}`, {
        error,
        targetTabId: tabId,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }

  logger.info('📤 Finished sending scroll to all target tabs', {
    targetCount: targetTabs.length,
    groupId: group.id,
  });
});

onMessage('update-sync-mode', async ({ data }) => {
  const { groupId, mode } = data;
  const group = syncState.groups.find((g) => g.id === groupId);

  if (group) {
    group.syncMode = mode;

    // Save state to storage
    await saveStateToStorage();

    // Notify all tabs about mode change
    for (const tabId of group.tabs) {
      try {
        await sendMessage('sync-mode-changed', { mode }, { context: 'content-script', tabId });
      } catch (error) {
        logger.error(`Failed to notify tab ${tabId} about mode change`, error);
      }
    }
  }
});

onMessage('toggle-url-sync', async ({ data }) => {
  const { groupId, enabled } = data;
  const group = syncState.groups.find((g) => g.id === groupId);

  if (group) {
    group.urlSync = enabled;

    // Save state to storage
    await saveStateToStorage();
  }
});

onMessage('switch-tab', async ({ data }) => {
  const { tabId } = data;
  try {
    await browser.tabs.update(tabId, { active: true });
    const tab = await browser.tabs.get(tabId);
    if (tab.windowId) {
      await browser.windows.update(tab.windowId, { focused: true });
    }
  } catch (error) {
    logger.error('Failed to switch tab', error);
  }
});

onMessage('get-current-tab', async () => {
  try {
    const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
    return {
      title: activeTab?.title,
    };
  } catch (error) {
    logger.error('Failed to get current tab', error);
    return {
      title: undefined,
    };
  }
});

// Handle ping messages for health checks
onMessage('ping', async () => {
  logger.info('Received ping from content script, responding with pong');
  return { response: 'pong', timestamp: Date.now() };
});

// Handle tab cleanup when tabs are closing or losing connection
onMessage('tab-cleanup', async ({ data }) => {
  const { groupId, reason } = data as { groupId: string; reason: string };
  logger.info(`Tab cleanup requested for group ${groupId}, reason: ${reason}`);

  const group = syncState.groups.find((g) => g.id === groupId);
  if (!group) {
    logger.warn(`Group ${groupId} not found for cleanup`);
    return;
  }

  // If this was an unexpected disconnection, we might want to keep the group
  // for a short period in case the tab reconnects
  if (reason === 'connection_lost') {
    logger.info(`Marking group ${groupId} as potentially disconnected`);
    // Could implement a grace period here
    return;
  }

  // For tab closure, clean up immediately
  if (reason === 'tab_closing') {
    logger.info(`Cleaning up group ${groupId} due to tab closure`);
    group.isActive = false;
    if (syncState.activeGroupId === groupId) {
      syncState.activeGroupId = null;
    }
  }
});

onMessage('get-tab-info', async ({ data }) => {
  const tabData = data as { tabId: number };
  const { tabId } = tabData;
  try {
    const tab = await browser.tabs.get(tabId);
    return {
      id: tab.id || tabId,
      title: tab.title || `Tab ${tabId}`,
    };
  } catch (error) {
    logger.error('Failed to get tab info', error);
    return {
      id: tabId,
      title: `Tab ${tabId}`,
    };
  }
});

logger.info('All message handlers registered successfully');

// Browser event listeners
browser.runtime.onInstalled.addListener((): void => {
  logger.info('Extension installed');
});

browser.action.onClicked.addListener(() => {
  browser.runtime.openOptionsPage();
});

// Handle tab removal
browser.tabs.onRemoved.addListener(async (tabId) => {
  logger.info(`Tab ${tabId} was removed, cleaning up sync groups`);

  // Remove tab from all sync groups and notify remaining tabs
  for (const group of syncState.groups) {
    const index = group.tabs.indexOf(tabId);
    if (index !== -1) {
      group.tabs.splice(index, 1);
      logger.info(
        `Removed tab ${tabId} from group ${group.id}, remaining tabs: ${group.tabs.length}`,
      );

      // If group has less than 2 tabs, deactivate it and notify remaining tabs
      if (group.tabs.length < 2) {
        logger.info(`Deactivating group ${group.id} - insufficient tabs`);
        group.isActive = false;
        if (syncState.activeGroupId === group.id) {
          syncState.activeGroupId = null;
        }

        // Notify remaining tabs that sync has stopped
        for (const remainingTabId of group.tabs) {
          try {
            await sendMessage(
              'sync-stopped',
              { groupId: group.id },
              { context: 'content-script', tabId: remainingTabId },
            );
          } catch (error) {
            logger.warn(`Failed to notify tab ${remainingTabId} about sync stop`, error);
          }
        }
      } else {
        // Group still has enough tabs, notify about tab removal
        for (const remainingTabId of group.tabs) {
          try {
            await sendMessage(
              'tab-removed',
              { groupId: group.id, removedTabId: tabId, remainingTabs: group.tabs },
              { context: 'content-script', tabId: remainingTabId },
            );
          } catch (error) {
            logger.warn(`Failed to notify tab ${remainingTabId} about tab removal`, error);
          }
        }
      }
    }
  }

  // Clean up empty groups
  const beforeCount = syncState.groups.length;
  syncState.groups = syncState.groups.filter((g) => g.tabs.length > 0);
  const removedGroups = beforeCount - syncState.groups.length;
  if (removedGroups > 0) {
    logger.info(`Cleaned up ${removedGroups} empty groups`);
  }

  // Save state to storage after cleanup
  await saveStateToStorage();
});

// Handle navigation for URL sync
browser.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.url) {
    const activeGroup = syncState.groups.find((g) => g.id === syncState.activeGroupId);

    if (activeGroup?.urlSync && activeGroup.tabs.includes(tabId)) {
      // Sync URL to other tabs
      for (const targetTabId of activeGroup.tabs) {
        if (targetTabId !== tabId) {
          try {
            await browser.tabs.update(targetTabId, { url: changeInfo.url });
          } catch (error) {
            logger.error(`Failed to sync URL to tab ${targetTabId}`, error);
          }
        }
      }
    }
  }
});

// Track previous tab for tab-prev functionality
let previousTabId = 0;

browser.tabs.onActivated.addListener(async ({ tabId }) => {
  if (!previousTabId) {
    previousTabId = tabId;
    return;
  }

  try {
    const tab = await browser.tabs.get(previousTabId);
    previousTabId = tabId;

    if (tab && tab.title) {
      logger.info('Previous tab:', tab.title);
      try {
        await sendMessage('tab-prev', { title: tab.title }, { context: 'content-script', tabId });
      } catch (e) {
        logger.error('Failed to send tab-prev message', e);
      }
    }
  } catch (error) {
    logger.error('Failed to get previous tab', error);
  }
});

// Handle extension installation - ensure clean state
browser.runtime.onInstalled.addListener(async () => {
  try {
    logger.info('Extension installed or updated');
    // State is already restored from restoreStateFromStorage() call at startup
  } catch (error) {
    logger.error('Failed to handle installation', error);
  }
});

// Log that all handlers are registered
logger.info('Background script initialization complete');
