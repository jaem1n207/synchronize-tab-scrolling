import { captureException, startInactiveSpan, startSpan } from '@sentry/react';
import { onMessage, sendMessage } from 'webext-bridge/background';
import browser, { type Tabs } from 'webextension-polyfill';

import { t, type TranslationKey } from '~/shared/i18n';
import { ExtensionLogger } from '~/shared/lib/logger';
import { initializeSentry } from '~/shared/lib/sentry_init';
import { isRestrictedUrl } from '~/shared/types';

import type { Span } from '@sentry/react';
import type { SyncTab, SyncGroup, SyncState } from '~/shared/types';

// Sentry 초기화
initializeSentry();

const logger = new ExtensionLogger({ scope: 'background' });

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

browser.runtime.onInstalled.addListener((): void => {
  logger.info('Extension installed');
});

browser.action.onClicked.addListener(() => {
  browser.runtime.openOptionsPage();
});

// Get all tabs and check eligibility
async function getAllTabs(): Promise<SyncTab[]> {
  try {
    const tabs = await browser.tabs.query({});
    return tabs.map((tab) => {
      const { restricted, reasonKey } = isRestrictedUrl(tab.url || '');
      return {
        id: tab.id!,
        title: tab.title || 'Untitled',
        url: tab.url || '',
        favicon: tab.favIconUrl,
        isEligible: !restricted && tab.id !== undefined,
        ineligibilityReason: reasonKey ? t(reasonKey as TranslationKey) : undefined,
        windowId: tab.windowId!,
      };
    });
  } catch (error) {
    logger.error('Failed to get tabs', error);
    return [];
  }
}

// Message handlers
onMessage('get-tabs', async () => {
  return getAllTabs();
});

onMessage('get-sync-state', async () => {
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

let previousTabId = 0;

browser.tabs.onActivated.addListener(async ({ tabId }) => {
  startSpan(
    {
      name: 'Tab Activated',
      op: 'ui.action',
      attributes: { tabId },
    },
    async (span: Span | undefined) => {
      if (!span) {
        logger.error('Failed to create Sentry span for Tab Activated');
        return;
      }

      const getTabSpan = startInactiveSpan({
        name: 'browser.tabs.get',
        op: 'browser.api.call',
      });

      if (!previousTabId) {
        previousTabId = tabId;
        getTabSpan.setAttribute('action', 'set_initial_previousTabId');
        getTabSpan.end();
        return;
      }

      let tab: Tabs.Tab | undefined;

      try {
        tab = await browser.tabs.get(previousTabId);
        previousTabId = tabId;
        if (tab) {
          getTabSpan.setAttribute('tab.id', tab.id);
          getTabSpan.setAttribute('tab.title', tab.title);
          span.setAttribute('previousTab.id', tab.id);
          span.setAttribute('previousTab.title', tab.title);
        }
        getTabSpan.setStatus({ code: 1 });
      } catch (error) {
        logger.error('Failed to get previous tab', error);
        captureException(error, { tags: { scope: 'background-tabs-onActivated-getTab' } });
        getTabSpan.setStatus({ code: 2, message: 'internal_error' });
        if (error instanceof Error) {
          getTabSpan.setAttribute('error.message', error.message);
        }
        span.setStatus({ code: 2, message: 'internal_error' });
      } finally {
        getTabSpan.end();
      }

      if (tab && tab.title) {
        logger.info('previous tab', { title: tab.title });
        const sendMessageSpan = startInactiveSpan({
          name: 'sendMessage: tab-prev',
          op: 'message.send',
        });
        try {
          await sendMessage('tab-prev', { title: tab.title }, { context: 'content-script', tabId });
          sendMessageSpan.setStatus({ code: 1 });
        } catch (e) {
          sendMessageSpan.setStatus({ code: 2, message: 'internal_error' });
          logger.error('Failed to send message', e);
          captureException(e, { tags: { scope: 'background-tabs-onActivated-sendMessage' } });
          span.setStatus({ code: 2, message: 'internal_error' });
        } finally {
          sendMessageSpan.end();
        }
      }
    },
  );
});

onMessage('get-current-tab', async () => {
  return startSpan(
    { name: 'Get Current Tab', op: 'message.handler' },
    async (span: Span | undefined) => {
      try {
        const tab = await browser.tabs.get(previousTabId);
        if (tab) {
          span?.setAttribute('tab.id', tab.id);
          span?.setAttribute('tab.title', tab.title);
        }
        span?.setStatus({ code: 1 });
        return {
          title: tab?.title,
        };
      } catch (error) {
        logger.error('Failed to get current tab', error);
        captureException(error, { tags: { scope: 'background-onMessage-get-current-tab' } });
        span?.setStatus({ code: 2, message: 'internal_error' });
        if (error instanceof Error && span) {
          span.setAttribute('error.message', error.message);
        }
        return {
          title: undefined,
        };
      }
    },
  );
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
