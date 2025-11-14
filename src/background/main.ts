import { captureException, startInactiveSpan, startSpan } from '@sentry/react';
import { onMessage, sendMessage } from 'webext-bridge/background';
import browser, { type Tabs } from 'webextension-polyfill';

import { ExtensionLogger } from '~/shared/lib/logger';
import { initializeSentry } from '~/shared/lib/sentry_init';

import type { Span } from '@sentry/react';

// Sentry 초기화
initializeSentry();

const logger = new ExtensionLogger({ scope: 'background' });

// Sync state management
interface SyncState {
  isActive: boolean;
  linkedTabs: Array<number>;
  connectionStatuses: Record<number, 'connected' | 'disconnected' | 'error'>;
  mode?: string; // Store sync mode for restoration
}

let syncState: SyncState = {
  isActive: false,
  linkedTabs: [],
  connectionStatuses: {},
};

// Helper to persist sync state to storage
async function persistSyncState() {
  try {
    await browser.storage.local.set({ syncState });
    logger.debug('Sync state persisted to storage', { syncState });
  } catch (error) {
    logger.error('Failed to persist sync state', { error });
  }
}

// Helper to restore sync state from storage
async function restoreSyncState() {
  try {
    const result = await browser.storage.local.get('syncState');
    if (result.syncState) {
      syncState = result.syncState as SyncState;
      logger.info('Sync state restored from storage', { syncState });

      // If sync was active, verify tabs still exist and reconnect
      if (syncState.isActive && syncState.linkedTabs.length >= 2) {
        logger.info('Reconnecting previously synced tabs after service worker restart');
        const tabs = await browser.tabs.query({ currentWindow: true });
        const existingTabIds = tabs.map((t) => t.id).filter((id): id is number => id !== undefined);

        // Filter out tabs that no longer exist
        syncState.linkedTabs = syncState.linkedTabs.filter((id) => existingTabIds.includes(id));

        if (syncState.linkedTabs.length >= 2) {
          // Reconnect all tabs
          const reconnectPromises = syncState.linkedTabs.map(async (tabId) => {
            try {
              await sendMessage(
                'scroll:start',
                {
                  tabIds: syncState.linkedTabs,
                  mode: syncState.mode || 'ratio',
                  currentTabId: tabId,
                },
                { context: 'content-script', tabId },
              );
              syncState.connectionStatuses[tabId] = 'connected';
              logger.info(`Reconnected tab ${tabId} after service worker restart`);
            } catch (error) {
              logger.error(`Failed to reconnect tab ${tabId}`, { error });
              syncState.connectionStatuses[tabId] = 'error';
            }
          });

          await Promise.all(reconnectPromises);
          await broadcastSyncStatus();
        } else {
          // Not enough tabs, clear sync state
          logger.info(
            'Not enough tabs remaining after service worker restart, clearing sync state',
          );
          syncState.isActive = false;
          syncState.linkedTabs = [];
          syncState.connectionStatuses = {};
          await persistSyncState();
        }
      }
    }
  } catch (error) {
    logger.error('Failed to restore sync state', { error });
  }
}

// Restore state on service worker startup
restoreSyncState();

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

// Log when background script loads
logger.info('Background script loaded, registering message handlers');

browser.action.onClicked.addListener(() => {
  browser.runtime.openOptionsPage();
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

// Helper function to send message with timeout
async function sendMessageWithTimeout<T>(
  messageId: string,
  data: unknown,
  destination: { context: 'content-script'; tabId: number },
  timeoutMs: number = 2_000,
): Promise<T> {
  return Promise.race([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sendMessage(messageId, data as any, destination) as Promise<T>,
    new Promise<never>((__, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs),
    ),
  ]);
}

// Scroll synchronization message handlers
logger.info('Registering scroll:start handler');
onMessage('scroll:start', async ({ data }) => {
  logger.info('Received scroll:start message', { data });
  const payload = data as { tabIds: Array<number>; mode: string };

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
        2_000, // 2 second timeout
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
  const payload = data as { tabIds: Array<number> };

  // Broadcast stop message to all selected tabs
  const promises = payload.tabIds.map((tabId) =>
    sendMessage('scroll:stop', data, { context: 'content-script', tabId }).catch((error) => {
      logger.error(`Failed to send stop message to tab ${tabId}`, { error });
    }),
  );

  await Promise.all(promises);

  // Clear sync state
  syncState.isActive = false;
  syncState.linkedTabs = [];
  syncState.connectionStatuses = {};
  syncState.mode = undefined;

  // Persist cleared state
  await persistSyncState();

  return { success: true };
});

onMessage('scroll:sync', async ({ data, sender }) => {
  const payload = data as {
    scrollTop: number;
    scrollHeight: number;
    clientHeight: number;
    sourceTabId: number;
    mode: string;
    timestamp: number;
  };

  logger.debug('Relaying scroll sync message', { payload, sender });

  // Only relay to synced tabs (excluding the source)
  const targetTabIds = syncState.linkedTabs.filter((tabId) => tabId !== payload.sourceTabId);

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
  const payload = data as { tabId: number; enabled: boolean };

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

// Handler for baseline update relay
onMessage('scroll:baseline-update', async ({ data }) => {
  logger.debug('Relaying baseline update', { data });
  const payload = data as {
    sourceTabId: number;
    baselineRatio: number;
    timestamp: number;
  };

  // Relay to all synced tabs except the source
  const targetTabIds = syncState.linkedTabs.filter((tabId) => tabId !== payload.sourceTabId);

  if (targetTabIds.length === 0) {
    logger.debug('No target tabs for baseline update');
    return { success: true };
  }

  const promises = targetTabIds.map((tabId) =>
    sendMessage('scroll:baseline-update', data, {
      context: 'content-script',
      tabId,
    }).catch((error) => {
      logger.debug(`Failed to relay baseline update to tab ${tabId}`, { error });
    }),
  );

  await Promise.all(promises);
  return { success: true };
});

// Helper function to broadcast sync status to all synced tabs
async function broadcastSyncStatus() {
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

  const statusPayload = {
    linkedTabs: linkedTabsInfo,
    connectionStatuses: syncState.connectionStatuses,
  };

  // Broadcast to all synced tabs
  const promises = syncState.linkedTabs.map(async (tabId) => {
    await sendMessage(
      'sync:status',
      { ...statusPayload, currentTabId: tabId },
      { context: 'content-script', tabId },
    ).catch((error) => {
      logger.debug(`Failed to send sync status to tab ${tabId}`, { error });
    });
  });

  await Promise.all(promises);
}

// Handler for getting sync status (from popup or content script)
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

onMessage('url:sync', async ({ data }) => {
  const payload = data as { url: string; sourceTabId: number };
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

// Handler for connection health check ping
onMessage('scroll:ping', async ({ data }) => {
  const payload = data as { tabId: number; timestamp: number };
  logger.debug('Received connection health ping', { payload });

  // Respond to indicate connection is alive
  return { success: true, timestamp: Date.now(), tabId: payload.tabId };
});

logger.info('All message handlers registered successfully');

// Tab event listeners for sync persistence

// Handle tab removal - remove from sync and stop if <2 tabs remain
browser.tabs.onRemoved.addListener(async (tabId) => {
  if (!syncState.isActive || !syncState.linkedTabs.includes(tabId)) {
    return;
  }

  logger.info(`Synced tab ${tabId} was closed, updating sync state`);

  // Remove from linked tabs and connection statuses
  syncState.linkedTabs = syncState.linkedTabs.filter((id) => id !== tabId);
  delete syncState.connectionStatuses[tabId];

  // Check if we still have enough tabs to continue syncing
  if (syncState.linkedTabs.length < 2) {
    logger.info('Less than 2 tabs remaining, stopping sync');

    // Stop sync for remaining tabs
    const promises = syncState.linkedTabs.map((remainingTabId) =>
      sendMessage('scroll:stop', {}, { context: 'content-script', tabId: remainingTabId }).catch(
        (error) => {
          logger.error(`Failed to send stop message to tab ${remainingTabId}`, { error });
        },
      ),
    );
    await Promise.all(promises);

    // Clear sync state
    syncState.isActive = false;
    syncState.linkedTabs = [];
    syncState.connectionStatuses = {};
    syncState.mode = undefined;
    await persistSyncState();
  } else {
    // Continue sync with remaining tabs, broadcast updated status
    logger.info(`Continuing sync with ${syncState.linkedTabs.length} tabs`);
    await persistSyncState(); // Persist updated tab list
    await broadcastSyncStatus();
  }
});

// Handle tab updates (refresh, URL change) - auto-reconnect synced tabs
browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Only act when page has finished loading
  if (changeInfo.status !== 'complete') {
    return;
  }

  // Check if this tab is in our synced list
  if (!syncState.isActive || !syncState.linkedTabs.includes(tabId)) {
    return;
  }

  logger.info(`Synced tab ${tabId} was refreshed/updated, reconnecting`, { url: tab.url });

  // Resend scroll:start message to reconnect the tab
  try {
    await sendMessage(
      'scroll:start',
      {
        tabIds: syncState.linkedTabs,
        mode: syncState.mode || 'ratio',
        currentTabId: tabId,
      },
      { context: 'content-script', tabId },
    );

    syncState.connectionStatuses[tabId] = 'connected';
    logger.info(`Successfully reconnected tab ${tabId}`);

    // Persist updated connection status
    await persistSyncState();

    // Broadcast updated status to all tabs
    await broadcastSyncStatus();
  } catch (error) {
    logger.error(`Failed to reconnect tab ${tabId}`, { error });
    syncState.connectionStatuses[tabId] = 'error';
    await persistSyncState();
  }
});

// Handle tab activation - reconnect if previously disconnected
browser.tabs.onActivated.addListener(async ({ tabId }) => {
  if (!syncState.isActive || !syncState.linkedTabs.includes(tabId)) {
    return;
  }

  // Check if tab was disconnected
  if (
    syncState.connectionStatuses[tabId] === 'disconnected' ||
    syncState.connectionStatuses[tabId] === 'error'
  ) {
    logger.info(`Attempting to reconnect activated tab ${tabId}`);

    try {
      await sendMessage(
        'scroll:start',
        {
          tabIds: syncState.linkedTabs,
          mode: syncState.mode || 'ratio',
          currentTabId: tabId,
        },
        { context: 'content-script', tabId },
      );

      syncState.connectionStatuses[tabId] = 'connected';
      logger.info(`Successfully reconnected activated tab ${tabId}`);
      await persistSyncState();
      await broadcastSyncStatus();
    } catch (error) {
      logger.error(`Failed to reconnect activated tab ${tabId}`, { error });
      syncState.connectionStatuses[tabId] = 'error';
      await persistSyncState();
    }
  }
});

logger.info('Tab event listeners registered');
