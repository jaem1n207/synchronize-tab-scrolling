import { onMessage, sendMessage } from 'webext-bridge/background';
import browser from 'webextension-polyfill';

import { t, type TranslationKey } from '~/shared/i18n';
import { ExtensionLogger } from '~/shared/lib/logger';
import { isRestrictedUrl } from '~/shared/types';

import type { SyncTab, SyncGroup, SyncState } from '~/shared/types';

const logger = new ExtensionLogger({ scope: 'background' });

// Log that background script is starting
logger.info('Background script initializing...');

// Sync state management
const syncState: SyncState = {
  groups: [],
  activeGroupId: null,
};

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

// Register message handlers immediately
try {
  // Message handlers
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

    // Notify all tabs in the group
    for (const tabId of tabIds) {
      try {
        await sendMessage('sync-started', { group }, { context: 'content-script', tabId });
      } catch (error) {
        logger.error(`Failed to notify tab ${tabId}`, error);
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

    if (!sourceTabId) {
      logger.error('No tab ID found for sync-scroll message');
      return;
    }

    const group = syncState.groups.find((g) => g.id === groupId);

    if (!group || !group.isActive) {
      return;
    }

    // Send scroll position to all other tabs in the group
    for (const tabId of group.tabs) {
      if (tabId !== sourceTabId) {
        try {
          await sendMessage(
            'apply-scroll',
            { position, syncMode: group.syncMode },
            { context: 'content-script', tabId },
          );
        } catch (error) {
          logger.error(`Failed to sync scroll to tab ${tabId}`, error);
        }
      }
    }
  });

  onMessage('update-sync-mode', async ({ data }) => {
    const { groupId, mode } = data;
    const group = syncState.groups.find((g) => g.id === groupId);

    if (group) {
      group.syncMode = mode;

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

  logger.info('All message handlers registered successfully');
} catch (error) {
  logger.error('Failed to register message handlers:', error);
}

// Browser event listeners
browser.runtime.onInstalled.addListener((): void => {
  logger.info('Extension installed');
});

browser.action.onClicked.addListener(() => {
  browser.runtime.openOptionsPage();
});

// Handle tab removal
browser.tabs.onRemoved.addListener((tabId) => {
  // Remove tab from all sync groups
  syncState.groups.forEach((group) => {
    const index = group.tabs.indexOf(tabId);
    if (index !== -1) {
      group.tabs.splice(index, 1);

      // If group has less than 2 tabs, deactivate it
      if (group.tabs.length < 2) {
        group.isActive = false;
        if (syncState.activeGroupId === group.id) {
          syncState.activeGroupId = null;
        }
      }
    }
  });

  // Clean up empty groups
  syncState.groups = syncState.groups.filter((g) => g.tabs.length > 0);
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

// Initialize storage
browser.runtime.onInstalled.addListener(async () => {
  try {
    // Store initial state
    await browser.storage.local.set({ syncState });
    logger.info('Extension initialized with sync state');
  } catch (error) {
    logger.error('Failed to initialize storage', error);
  }
});

// Restore state on startup
browser.runtime.onStartup.addListener(async () => {
  try {
    const stored = await browser.storage.local.get('syncState');
    if (stored.syncState) {
      Object.assign(syncState, stored.syncState);
      // Clear any active groups since tabs may have changed
      syncState.groups.forEach((g) => (g.isActive = false));
      syncState.activeGroupId = null;
    }
  } catch (error) {
    logger.error('Failed to restore state', error);
  }
});

// Log that all handlers are registered
logger.info('Background script initialization complete');
