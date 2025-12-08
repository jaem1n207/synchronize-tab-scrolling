import { onMessage, sendMessage } from 'webext-bridge/background';
import browser from 'webextension-polyfill';

import { ExtensionLogger } from '~/shared/lib/logger';
import { initializeSentry } from '~/shared/lib/sentry_init';
import {
  loadAutoSyncEnabled,
  loadAutoSyncExcludedUrls,
  loadUrlSyncEnabled,
  saveAutoSyncEnabled,
} from '~/shared/lib/storage';
import type { AutoSyncGroupInfo } from '~/shared/types/messages';

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

// Auto-sync state for same-URL tabs
interface AutoSyncGroup {
  tabIds: Set<number>;
  isActive: boolean;
}

interface AutoSyncState {
  enabled: boolean;
  groups: Map<string, AutoSyncGroup>; // normalizedUrl → group
  excludedUrls: Array<string>;
}

const autoSyncState: AutoSyncState = {
  enabled: false,
  groups: new Map(),
  excludedUrls: [],
};

// Track tabs that are in manual sync (excluded from auto-sync temporarily)
const manualSyncOverriddenTabs = new Set<number>();

/**
 * Check if a tab is overridden by manual sync
 */
function isTabManuallyOverridden(tabId: number): boolean {
  return manualSyncOverriddenTabs.has(tabId);
}

// Maximum tabs per auto-sync group to prevent performance issues
const MAX_AUTO_SYNC_GROUP_SIZE = 10;

// Mutex for auto-sync group updates to prevent race conditions
let autoSyncMutex: Promise<void> = Promise.resolve();

/**
 * Execute a function with auto-sync mutex lock
 * Prevents race conditions when multiple tabs update simultaneously
 */
async function withAutoSyncLock<T>(fn: () => Promise<T>): Promise<T> {
  const previousMutex = autoSyncMutex;
  let releaseLock: () => void;
  autoSyncMutex = new Promise((resolve) => {
    releaseLock = resolve;
  });

  try {
    await previousMutex;
    return await fn();
  } finally {
    releaseLock!();
  }
}

/**
 * Normalize URL for auto-sync comparison
 * Strips query params, hash, and default ports to match same base URLs
 */
function normalizeUrlForAutoSync(url: string): string | null {
  try {
    const parsed = new URL(url);
    // Exclude non-http protocols
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return null;
    }

    // Normalize hostname - strip default ports (80 for http, 443 for https)
    let normalizedHost = parsed.hostname;
    if (parsed.port) {
      const isDefaultPort =
        (parsed.protocol === 'http:' && parsed.port === '80') ||
        (parsed.protocol === 'https:' && parsed.port === '443');
      if (!isDefaultPort) {
        normalizedHost = `${parsed.hostname}:${parsed.port}`;
      }
    }

    return `${parsed.protocol}//${normalizedHost}${parsed.pathname}`;
  } catch {
    return null;
  }
}

/**
 * Check if URL matches any excluded pattern
 */
function isUrlExcluded(url: string, patterns: Array<string>): boolean {
  return patterns.some((pattern) => {
    try {
      const regex = new RegExp(pattern.replace(/\*/g, '.*').replace(/\//g, '\\/'));
      return regex.test(url);
    } catch {
      return false;
    }
  });
}

/**
 * Remove tab from all auto-sync groups
 */
function removeTabFromAllAutoSyncGroups(tabId: number): void {
  for (const [normalizedUrl, group] of autoSyncState.groups.entries()) {
    if (group.tabIds.has(tabId)) {
      group.tabIds.delete(tabId);
      logger.debug(`Removed tab ${tabId} from auto-sync group`, { normalizedUrl });

      // If group has less than 2 tabs, stop auto-sync for that group
      if (group.tabIds.size < 2 && group.isActive) {
        stopAutoSyncForGroup(normalizedUrl);
      }

      // Remove empty groups
      if (group.tabIds.size === 0) {
        autoSyncState.groups.delete(normalizedUrl);
        logger.debug(`Removed empty auto-sync group`, { normalizedUrl });
      }
    }
  }
}

/**
 * Get other tab IDs in the same active auto-sync group as the given tab
 * @returns Array of tab IDs in the same group (excluding the given tab)
 */
function getAutoSyncGroupMembers(tabId: number): number[] {
  for (const [, group] of autoSyncState.groups) {
    if (group.isActive && group.tabIds.has(tabId)) {
      return Array.from(group.tabIds).filter((id) => id !== tabId);
    }
  }
  return [];
}

/**
 * Check if a tab is in any active auto-sync group
 */
function isTabInActiveAutoSyncGroup(tabId: number): boolean {
  for (const [, group] of autoSyncState.groups) {
    if (group.isActive && group.tabIds.has(tabId)) {
      return true;
    }
  }
  return false;
}

/**
 * Update auto-sync group for a tab based on its URL (with mutex lock)
 * @param tabId - The tab ID
 * @param url - The tab's URL
 * @param skipStartSync - If true, don't start sync even if group has 2+ tabs (used when page isn't fully loaded)
 * @returns The normalized URL if the tab was added to a group, null otherwise
 */
async function updateAutoSyncGroup(
  tabId: number,
  url: string,
  skipStartSync: boolean = false,
): Promise<string | null> {
  return withAutoSyncLock(() => updateAutoSyncGroupInternal(tabId, url, skipStartSync));
}

/**
 * Internal implementation of updateAutoSyncGroup (called within mutex lock)
 */
async function updateAutoSyncGroupInternal(
  tabId: number,
  url: string,
  skipStartSync: boolean = false,
): Promise<string | null> {
  if (!autoSyncState.enabled) return null;

  const normalizedUrl = normalizeUrlForAutoSync(url);
  if (!normalizedUrl) return null;

  // Check if URL is excluded
  if (isUrlExcluded(url, autoSyncState.excludedUrls)) {
    logger.debug(`URL excluded from auto-sync`, { url, tabId });
    removeTabFromAllAutoSyncGroups(tabId);
    return null;
  }

  // Skip tabs that are in manual sync (they take priority)
  if (isTabManuallyOverridden(tabId)) {
    logger.debug(`Tab ${tabId} is in manual sync, skipping auto-sync`);
    return null;
  }

  // Remove from all existing groups first
  removeTabFromAllAutoSyncGroups(tabId);

  // Add to new group
  let group = autoSyncState.groups.get(normalizedUrl);
  if (!group) {
    group = { tabIds: new Set(), isActive: false };
    autoSyncState.groups.set(normalizedUrl, group);
  }

  // Check group size limit to prevent performance issues
  if (group.tabIds.size >= MAX_AUTO_SYNC_GROUP_SIZE && !group.tabIds.has(tabId)) {
    logger.warn('[AUTO-SYNC] Group size limit reached, tab not added', {
      normalizedUrl,
      currentSize: group.tabIds.size,
      maxSize: MAX_AUTO_SYNC_GROUP_SIZE,
      tabId,
    });
    return null;
  }

  group.tabIds.add(tabId);

  // Start auto-sync if group has 2+ tabs and not already active (unless skipStartSync is true)
  if (!skipStartSync && group.tabIds.size >= 2 && !group.isActive) {
    await startAutoSyncForGroup(normalizedUrl);
  }

  // Broadcast group update to content scripts
  await broadcastAutoSyncGroupUpdate();

  return normalizedUrl;
}

/**
 * Start auto-sync for a specific URL group
 * Only sets isActive=true if at least 2 tabs successfully received the message
 * This allows retry when not all tabs are ready yet
 */
async function startAutoSyncForGroup(normalizedUrl: string): Promise<void> {
  const group = autoSyncState.groups.get(normalizedUrl);

  if (!group || group.tabIds.size < 2) {
    return;
  }

  // Don't restart if already active
  if (group.isActive) {
    return;
  }

  const tabIds = Array.from(group.tabIds);

  // Send scroll:start with isAutoSync flag to all tabs in group
  // Track which tabs successfully received the message
  // Use retry with exponential backoff for tabs that aren't ready yet
  const results = await Promise.all(
    tabIds.map(async (tabId) => {
      try {
        const response = await sendMessageWithRetry<{ success: boolean; tabId: number }>(
          'scroll:start',
          {
            tabIds,
            mode: 'ratio',
            currentTabId: tabId,
            isAutoSync: true,
          },
          { context: 'content-script', tabId },
          { maxRetries: 2, initialDelayMs: 500, timeoutMs: 2_000 },
        );
        return { tabId, success: response?.success === true, response };
      } catch (error) {
        logger.error('[AUTO-SYNC] Tab message failed after retries', {
          tabId,
          error: String(error),
        });
        return { tabId, success: false, error: String(error) };
      }
    }),
  );

  const successCount = results.filter((r) => r.success).length;

  // Only mark as active if at least 2 tabs successfully received the message
  // If fewer, keep isActive=false so we can retry when more tabs are ready
  if (successCount >= 2) {
    group.isActive = true;
  }
}

/**
 * Stop auto-sync for a specific URL group
 */
async function stopAutoSyncForGroup(normalizedUrl: string): Promise<void> {
  const group = autoSyncState.groups.get(normalizedUrl);
  if (!group) return;

  const tabIds = Array.from(group.tabIds);
  logger.info(`Stopping auto-sync for group`, { normalizedUrl, tabIds });

  // Send scroll:stop with isAutoSync flag to all tabs in group
  const promises = tabIds.map(async (tabId) => {
    try {
      await sendMessage('scroll:stop', { isAutoSync: true }, { context: 'content-script', tabId });
    } catch (error) {
      logger.debug(`Failed to stop auto-sync for tab ${tabId}`, { error });
    }
  });

  await Promise.all(promises);
  group.isActive = false;
}

/**
 * Broadcast auto-sync group update to all content scripts
 */
async function broadcastAutoSyncGroupUpdate(): Promise<void> {
  const groups: Array<AutoSyncGroupInfo> = [];

  for (const [normalizedUrl, group] of autoSyncState.groups.entries()) {
    groups.push({
      normalizedUrl,
      tabIds: Array.from(group.tabIds),
      isActive: group.isActive,
    });
  }

  // Get all tabs in auto-sync groups
  const allTabIds = new Set<number>();
  for (const group of autoSyncState.groups.values()) {
    for (const tabId of group.tabIds) {
      allTabIds.add(tabId);
    }
  }

  // Broadcast to all tabs in groups
  const promises = Array.from(allTabIds).map(async (tabId) => {
    try {
      await sendMessage(
        'auto-sync:group-updated',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { groups } as any,
        { context: 'content-script', tabId },
      );
    } catch (error) {
      logger.debug(`Failed to broadcast auto-sync group update to tab ${tabId}`, { error });
    }
  });

  await Promise.all(promises);
}

/**
 * Initialize auto-sync state from storage and scan existing tabs
 */
async function initializeAutoSync(): Promise<void> {
  try {
    autoSyncState.enabled = await loadAutoSyncEnabled();
    autoSyncState.excludedUrls = await loadAutoSyncExcludedUrls();

    if (!autoSyncState.enabled) {
      return;
    }

    // Scan all tabs and build groups
    const tabs = await browser.tabs.query({});

    for (const tab of tabs) {
      if (tab.id && tab.url) {
        await updateAutoSyncGroup(tab.id, tab.url);
      }
    }
  } catch (error) {
    logger.error('[AUTO-SYNC] Failed to initialize auto-sync', { error });
  }
}

/**
 * Toggle auto-sync enabled state
 */
async function toggleAutoSync(enabled: boolean): Promise<void> {
  autoSyncState.enabled = enabled;
  await saveAutoSyncEnabled(enabled);

  if (enabled) {
    // Re-initialize to scan tabs and create groups
    await initializeAutoSync();
  } else {
    // Stop all active auto-sync groups
    for (const [normalizedUrl, group] of autoSyncState.groups.entries()) {
      if (group.isActive) {
        await stopAutoSyncForGroup(normalizedUrl);
      }
    }
    // Clear all groups
    autoSyncState.groups.clear();
  }

  // Broadcast status change to all tabs
  const tabs = await browser.tabs.query({});
  const promises = tabs.map(async (tab) => {
    if (tab.id) {
      try {
        await sendMessage(
          'auto-sync:status-changed',
          { enabled },
          { context: 'content-script', tabId: tab.id },
        );
      } catch {
        // Tab may not have content script
      }
    }
  });
  await Promise.all(promises);
}

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

// Initialize auto-sync on service worker startup
initializeAutoSync();

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

// Helper function to send message with retry and exponential backoff
async function sendMessageWithRetry<T>(
  messageId: string,
  data: unknown,
  destination: { context: 'content-script'; tabId: number },
  options: {
    maxRetries?: number;
    initialDelayMs?: number;
    timeoutMs?: number;
  } = {},
): Promise<T> {
  const { maxRetries = 3, initialDelayMs = 500, timeoutMs = 2_000 } = options;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await sendMessageWithTimeout<T>(messageId, data, destination, timeoutMs);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        // Exponential backoff: 500ms, 1000ms, 2000ms
        const delayMs = initialDelayMs * Math.pow(2, attempt);
        logger.debug(`Message to tab ${destination.tabId} failed, retrying in ${delayMs}ms`, {
          attempt: attempt + 1,
          maxRetries,
          error: lastError.message,
        });
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError;
}

// Scroll synchronization message handlers
logger.info('Registering scroll:start handler');
onMessage('scroll:start', async ({ data }) => {
  logger.info('Received scroll:start message', { data });
  const payload = data as { tabIds: Array<number>; mode: string; isAutoSync?: boolean };

  // If this is a manual sync (not auto-sync), handle conflict with auto-sync
  if (!payload.isAutoSync) {
    for (const tabId of payload.tabIds) {
      // Mark tab as manually overridden (takes priority over auto-sync)
      manualSyncOverriddenTabs.add(tabId);
      // Remove from any auto-sync groups
      removeTabFromAllAutoSyncGroups(tabId);
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
  const payload = data as { tabIds: Array<number>; isAutoSync?: boolean };

  // Broadcast stop message to all selected tabs
  const promises = payload.tabIds.map((tabId) =>
    sendMessage('scroll:stop', data, { context: 'content-script', tabId }).catch((error) => {
      logger.error(`Failed to send stop message to tab ${tabId}`, { error });
    }),
  );

  await Promise.all(promises);

  // If this was a manual sync stop, re-add tabs to auto-sync groups
  if (!payload.isAutoSync && autoSyncState.enabled) {
    for (const tabId of payload.tabIds) {
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
      tabIds: payload.tabIds,
    });
  }

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

// Handler for URL sync enabled state change broadcast
onMessage('sync:url-enabled-changed', async ({ data, sender }) => {
  const payload = data as { enabled: boolean };
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

// Handler for connection health check ping
onMessage('scroll:ping', async ({ data }) => {
  const payload = data as { tabId: number; timestamp: number };
  logger.debug('Received connection health ping', { payload });

  // Respond to indicate connection is alive
  return { success: true, timestamp: Date.now(), tabId: payload.tabId };
});

// Handler for reconnection request from content script (idle tab recovery)
onMessage('scroll:reconnect', async ({ data }) => {
  const payload = data as { tabId: number; timestamp: number };
  logger.info('Received reconnection request from content script', { payload });

  // Check if tab is in manual sync or auto-sync
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

  // Verify tab still exists
  try {
    const tab = await browser.tabs.get(payload.tabId);
    logger.debug('Tab verified for reconnection', { tabId: tab.id, url: tab.url });
  } catch (error) {
    logger.error('Tab no longer exists, removing from sync', { tabId: payload.tabId, error });
    // Remove tab from manual sync list
    if (isInManualSync) {
      syncState.linkedTabs = syncState.linkedTabs.filter((id) => id !== payload.tabId);
      delete syncState.connectionStatuses[payload.tabId];
      await persistSyncState();
    }
    // Remove tab from auto-sync groups
    if (isInAutoSync) {
      removeTabFromAllAutoSyncGroups(payload.tabId);
    }
    return { success: false, reason: 'Tab no longer exists' };
  }

  // Re-send scroll:start to reconnect the content script
  try {
    // Determine the correct tab list based on sync type
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
      3_000, // 3 second timeout for reconnection
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

// Handler for auto-sync status toggle from content script
onMessage('auto-sync:status-changed', async ({ data }) => {
  const payload = data as { enabled: boolean };
  await toggleAutoSync(payload.enabled);
  return { success: true, enabled: autoSyncState.enabled };
});

// Handler for getting auto-sync status
onMessage('auto-sync:get-status', async () => {
  const groups: Array<AutoSyncGroupInfo> = [];
  for (const [normalizedUrl, group] of autoSyncState.groups.entries()) {
    groups.push({
      normalizedUrl,
      tabIds: Array.from(group.tabIds),
      isActive: group.isActive,
    });
  }

  return {
    success: true,
    enabled: autoSyncState.enabled,
    groups,
  };
});

logger.info('All message handlers registered successfully');

// Tab event listeners for sync persistence

// Handle tab removal - remove from sync and stop if <2 tabs remain
browser.tabs.onRemoved.addListener(async (tabId) => {
  // Clean up manually overridden tabs set
  manualSyncOverriddenTabs.delete(tabId);

  // Handle auto-sync group removal
  if (autoSyncState.enabled) {
    removeTabFromAllAutoSyncGroups(tabId);
    await broadcastAutoSyncGroupUpdate();
  }

  // Handle manual sync removal
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

// Handle new tab creation for auto-sync
browser.tabs.onCreated.addListener(async (tab) => {
  if (!autoSyncState.enabled || !tab.id) {
    return;
  }

  // For new tabs, the URL might be available immediately or after navigation
  // If URL is available, add to auto-sync group (but don't start sync yet - wait for page to load)
  if (tab.url && tab.url !== 'about:blank' && tab.url !== 'chrome://newtab/') {
    logger.debug(`New tab ${tab.id} created with URL, adding to auto-sync group (pending)`, {
      url: tab.url,
    });
    // skipStartSync=true because content script isn't ready yet
    await updateAutoSyncGroup(tab.id, tab.url, true);
  }
});

// Handle tab updates (refresh, URL change) - auto-reconnect synced tabs
browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Handle auto-sync group updates on URL change
  // Don't start sync yet - content script might not be ready
  if (autoSyncState.enabled && changeInfo.url) {
    // skipStartSync=true because page is still loading, content script might not be ready
    await updateAutoSyncGroup(tabId, changeInfo.url, true);
  }

  // When page load completes, content script should be ready - now we can start sync
  if (autoSyncState.enabled && changeInfo.status === 'complete' && tab.url) {
    const normalizedUrl = normalizeUrlForAutoSync(tab.url);
    const existingGroup = normalizedUrl ? autoSyncState.groups.get(normalizedUrl) : null;

    if (normalizedUrl) {
      // If tab is not in any group yet, add it
      if (!existingGroup || !existingGroup.tabIds.has(tabId)) {
        await updateAutoSyncGroup(tabId, tab.url);
      }
      // If tab is in group but sync not active, try to start sync now
      else if (existingGroup && existingGroup.tabIds.has(tabId) && !existingGroup.isActive) {
        if (existingGroup.tabIds.size >= 2) {
          await startAutoSyncForGroup(normalizedUrl);
        }
      }
      // If tab is in group and sync IS active, send scroll:start to this tab so it joins the sync
      else if (existingGroup && existingGroup.tabIds.has(tabId) && existingGroup.isActive) {
        const tabIds = Array.from(existingGroup.tabIds);
        try {
          await sendMessage(
            'scroll:start',
            {
              tabIds,
              mode: 'ratio',
              currentTabId: tabId,
              isAutoSync: true,
            },
            { context: 'content-script', tabId },
          );
        } catch (error) {
          logger.error('[AUTO-SYNC] Failed to join sync', {
            tabId,
            normalizedUrl,
            error: String(error),
          });
        }
      }
    }
  }

  // Check if this tab is in our synced list (manual sync)
  if (!syncState.isActive || !syncState.linkedTabs.includes(tabId)) {
    return;
  }

  // URL changed - broadcast to other synced tabs for cross-domain navigation support
  // Content script's MutationObserver only handles SPA navigation; this handles hard navigation
  if (changeInfo.url) {
    logger.info(`Synced tab ${tabId} URL changed, broadcasting`, { url: changeInfo.url });

    const urlSyncEnabled = await loadUrlSyncEnabled();
    if (urlSyncEnabled) {
      const targetTabIds = syncState.linkedTabs.filter((id) => id !== tabId);
      await Promise.all(
        targetTabIds.map((targetTabId) =>
          sendMessage(
            'url:sync',
            { url: changeInfo.url, sourceTabId: tabId },
            { context: 'content-script', tabId: targetTabId },
          ).catch((error) => {
            logger.debug(`Failed to relay URL sync to tab ${targetTabId}`, { error });
          }),
        ),
      );
    }
  }

  // Only reconnect when page has finished loading
  if (changeInfo.status !== 'complete') {
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

// Helper function to check if content script is alive via ping
async function isContentScriptAlive(tabId: number): Promise<boolean> {
  try {
    const response = await sendMessageWithTimeout<{ success: boolean }>(
      'scroll:ping',
      { tabId, timestamp: Date.now() },
      { context: 'content-script', tabId },
      1_000, // 1 second timeout for ping
    );
    return response && response.success;
  } catch {
    return false;
  }
}

// Helper function to re-inject content script into a tab
async function reinjectContentScript(tabId: number): Promise<boolean> {
  try {
    logger.info(`Re-injecting content script into tab ${tabId}`);

    // Re-inject the content script
    await browser.scripting.executeScript({
      target: { tabId },
      files: ['dist/contentScripts/index.global.js'],
    });

    logger.info(`Content script re-injected into tab ${tabId}`);

    // Wait a moment for the script to initialize
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Now send scroll:start to initialize sync
    const response = await sendMessageWithTimeout<{ success: boolean; tabId: number }>(
      'scroll:start',
      {
        tabIds: syncState.linkedTabs,
        mode: syncState.mode || 'ratio',
        currentTabId: tabId,
      },
      { context: 'content-script', tabId },
      3_000,
    );

    if (response && response.success && response.tabId === tabId) {
      syncState.connectionStatuses[tabId] = 'connected';
      logger.info(`Tab ${tabId} reconnected after content script re-injection`);
      await persistSyncState();
      await broadcastSyncStatus();
      return true;
    }

    return false;
  } catch (error) {
    logger.error(`Failed to re-inject content script into tab ${tabId}`, { error });
    return false;
  }
}

// Handle tab activation - check content script health and reconnect if needed
browser.tabs.onActivated.addListener(async ({ tabId }) => {
  if (!syncState.isActive || !syncState.linkedTabs.includes(tabId)) {
    return;
  }

  logger.debug(`Synced tab ${tabId} activated, checking content script health`);

  // First, check if content script is alive with a ping
  const isAlive = await isContentScriptAlive(tabId);

  if (isAlive) {
    // Content script is alive
    if (syncState.connectionStatuses[tabId] !== 'connected') {
      // Mark as connected if it wasn't already
      syncState.connectionStatuses[tabId] = 'connected';
      await persistSyncState();
      await broadcastSyncStatus();
    }
    logger.debug(`Tab ${tabId} content script is alive`);
    return;
  }

  // Content script is not responding - it may have been killed when tab was suspended
  logger.info(`Content script in tab ${tabId} not responding, attempting recovery`);

  // Try to reconnect first (in case content script just needs re-initialization)
  try {
    const response = await sendMessageWithTimeout<{ success: boolean; tabId: number }>(
      'scroll:start',
      {
        tabIds: syncState.linkedTabs,
        mode: syncState.mode || 'ratio',
        currentTabId: tabId,
      },
      { context: 'content-script', tabId },
      2_000,
    );

    if (response && response.success && response.tabId === tabId) {
      syncState.connectionStatuses[tabId] = 'connected';
      logger.info(`Successfully reconnected activated tab ${tabId}`);
      await persistSyncState();
      await broadcastSyncStatus();
      return;
    }
  } catch (error) {
    logger.debug(`Reconnection attempt failed for tab ${tabId}, trying re-injection`, { error });
  }

  // If reconnection failed, try re-injecting the content script
  const reinjectSuccess = await reinjectContentScript(tabId);

  if (!reinjectSuccess) {
    logger.error(`Failed to recover tab ${tabId} after all attempts`);
    syncState.connectionStatuses[tabId] = 'error';
    await persistSyncState();
    await broadcastSyncStatus();
  }
});

logger.info('Tab event listeners registered');

// Listen for storage changes to handle auto-sync toggle from popup
// This provides a backup mechanism in case the message isn't received
browser.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName !== 'local') return;

  // Handle auto-sync enabled change
  if ('autoSyncEnabled' in changes) {
    const { newValue, oldValue } = changes.autoSyncEnabled as {
      newValue?: boolean;
      oldValue?: boolean;
    };
    if (newValue !== oldValue) {
      logger.info('Auto-sync enabled changed via storage', { newValue, oldValue });
      // Only trigger if the state actually changed and doesn't match current state
      if (newValue !== autoSyncState.enabled) {
        await toggleAutoSync(newValue ?? false);
      }
    }
  }
});

logger.info('Storage change listener registered');
