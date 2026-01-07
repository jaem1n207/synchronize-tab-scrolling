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
import { isForbiddenUrl } from '~/shared/lib/url-utils';
import type { AutoSyncGroupInfo } from '~/shared/types/messages';

import type { JsonValue } from '@sentry/browser/build/npm/types/integrations/featureFlags/openfeature/types';
import type { Destination } from 'webext-bridge';

// Sentry 초기화
initializeSentry();

const logger = new ExtensionLogger({ scope: 'background' });

// Sync state management
interface SyncState {
  isActive: boolean;
  linkedTabs: Array<number>;
  connectionStatuses: Record<number, 'connected' | 'disconnected' | 'error'>;
  mode?: string; // Store sync mode for restoration
  lastActiveSyncedTabId: number | null; // Track the last active synced tab for toast targeting
}

let syncState: SyncState = {
  isActive: false,
  linkedTabs: [],
  connectionStatuses: {},
  lastActiveSyncedTabId: null,
};

// Keep-alive mechanism to prevent service worker termination during active sync
// Chrome MV3 service workers terminate after ~30 seconds of inactivity
let keepAliveInterval: ReturnType<typeof setInterval> | null = null;
const KEEP_ALIVE_INTERVAL_MS = 25000; // 25 seconds (before 30s termination)

/**
 * Start keep-alive mechanism to prevent service worker termination
 * Also periodically checks health of all synced tabs
 */
function startKeepAlive() {
  if (keepAliveInterval) {
    logger.debug('Keep-alive already running');
    return;
  }

  keepAliveInterval = setInterval(async () => {
    logger.debug('Keep-alive ping', {
      syncActive: syncState.isActive,
      linkedTabs: syncState.linkedTabs.length,
    });

    // If sync is active, check health of all tabs
    if (syncState.isActive && syncState.linkedTabs.length > 0) {
      await checkAllTabsHealth();
    }
  }, KEEP_ALIVE_INTERVAL_MS);

  logger.info('Keep-alive started');
}

/**
 * Stop keep-alive mechanism
 */
function stopKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
    logger.info('Keep-alive stopped');
  }
}

/**
 * Check health of all synced tabs and attempt recovery if needed
 */
async function checkAllTabsHealth() {
  if (!syncState.isActive) return;

  logger.debug('Checking health of all synced tabs', {
    tabCount: syncState.linkedTabs.length,
  });

  for (const tabId of syncState.linkedTabs) {
    const isAlive = await isContentScriptAlive(tabId);

    if (!isAlive && syncState.connectionStatuses[tabId] === 'connected') {
      logger.warn(`Tab ${tabId} lost connection during keep-alive check, attempting recovery`);

      // Try to re-inject content script
      const success = await reinjectContentScript(tabId);
      if (!success) {
        logger.error(`Failed to recover tab ${tabId} during keep-alive check`);
        syncState.connectionStatuses[tabId] = 'error';
        await persistSyncState();
      }
    }
  }
}

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

// Track pending retry timers for auto-sync groups
const autoSyncRetryTimers = new Map<string, ReturnType<typeof setTimeout>>();

// Dismissed URL groups - user rejected sync suggestion (memory only, cleared on browser restart)
const dismissedUrlGroups = new Set<string>();

// Pending suggestions - prevent duplicate toasts for same URL group
const pendingSuggestions = new Set<string>();

// Flag to prevent re-entrant toggleAutoSync calls
let isTogglingAutoSync = false;

// Flag to track if initialization is running (to handle toggle during init)
let isInitializingAutoSync = false;

// Simple queue-based toggle to prevent race conditions
// When toggle is in progress, queue the latest request and process after completion
let pendingToggleRequest: boolean | null = null;

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
      logger.debug('[AUTO-SYNC] URL excluded - non-http protocol', {
        url,
        protocol: parsed.protocol,
      });
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

    const normalized = `${parsed.protocol}//${normalizedHost}${parsed.pathname}`;
    logger.debug('[AUTO-SYNC] URL normalized', { original: url, normalized });
    return normalized;
  } catch (error) {
    logger.debug('[AUTO-SYNC] URL normalization failed', { url, error });
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
 * Check if URL is a local development server
 * Development servers are excluded from auto-sync suggestions but not from manual sync
 */
function isLocalDevelopmentServer(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();

    // Check for localhost and common local development patterns
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname.endsWith('.localhost') ||
      // IPv6 loopback
      hostname === '[::1]'
    );
  } catch {
    return false;
  }
}

/**
 * Remove tab from all auto-sync groups
 */
async function removeTabFromAllAutoSyncGroups(tabId: number): Promise<void> {
  for (const [normalizedUrl, group] of autoSyncState.groups.entries()) {
    if (group.tabIds.has(tabId)) {
      group.tabIds.delete(tabId);
      logger.debug(`Removed tab ${tabId} from auto-sync group`, { normalizedUrl });

      // If group has less than 2 tabs, stop auto-sync and cancel retry for that group
      if (group.tabIds.size < 2) {
        cancelAutoSyncRetry(normalizedUrl);
        if (group.isActive) {
          await stopAutoSyncForGroup(normalizedUrl);
        }
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
 * @param skipBroadcast - If true, don't broadcast group update (used during batch initialization)
 * @returns The normalized URL if the tab was added to a group, null otherwise
 */
async function updateAutoSyncGroup(
  tabId: number,
  url: string,
  skipStartSync: boolean = false,
  skipBroadcast: boolean = false,
): Promise<string | null> {
  return withAutoSyncLock(() =>
    updateAutoSyncGroupInternal(tabId, url, skipStartSync, skipBroadcast),
  );
}

/**
 * Internal implementation of updateAutoSyncGroup (called within mutex lock)
 */
async function updateAutoSyncGroupInternal(
  tabId: number,
  url: string,
  skipStartSync: boolean = false,
  skipBroadcast: boolean = false,
): Promise<string | null> {
  logger.info('[AUTO-SYNC] updateAutoSyncGroupInternal called', {
    tabId,
    url,
    skipStartSync,
    skipBroadcast,
  });

  if (!autoSyncState.enabled) {
    logger.info('[AUTO-SYNC] Auto-sync disabled, skipping update');
    return null;
  }

  const normalizedUrl = normalizeUrlForAutoSync(url);
  if (!normalizedUrl) {
    logger.info('[AUTO-SYNC] URL normalization returned null, skipping');
    return null;
  }

  // Check if URL is forbidden (search engines, PDF viewers, auth pages, etc.)
  if (isForbiddenUrl(url)) {
    logger.debug(`[AUTO-SYNC] URL is forbidden, skipping auto-sync`, { url, tabId });
    await removeTabFromAllAutoSyncGroups(tabId);
    return null;
  }

  // Check if URL is a local development server (excluded from auto-sync suggestions only)
  if (isLocalDevelopmentServer(url)) {
    logger.debug(`[AUTO-SYNC] URL is local dev server, skipping auto-sync`, { url, tabId });
    await removeTabFromAllAutoSyncGroups(tabId);
    return null;
  }

  // Check if URL is excluded by user patterns
  if (isUrlExcluded(url, autoSyncState.excludedUrls)) {
    logger.debug(`[AUTO-SYNC] URL excluded from auto-sync`, { url, tabId });
    await removeTabFromAllAutoSyncGroups(tabId);
    return null;
  }

  // Skip tabs that are in manual sync (they take priority)
  if (isTabManuallyOverridden(tabId)) {
    logger.debug(`[AUTO-SYNC] Tab ${tabId} is in manual sync, skipping auto-sync`);
    return null;
  }

  // Remove from all existing groups first
  logger.info('[AUTO-SYNC] Removing tab from existing groups', { tabId });
  await removeTabFromAllAutoSyncGroups(tabId);

  // Add to new group
  let group = autoSyncState.groups.get(normalizedUrl);
  const isNewGroup = !group;
  if (!group) {
    group = { tabIds: new Set(), isActive: false };
    autoSyncState.groups.set(normalizedUrl, group);
    logger.info('[AUTO-SYNC] Created new group', { normalizedUrl });
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
  logger.info('[AUTO-SYNC] Tab added to group', {
    tabId,
    normalizedUrl,
    groupSize: group.tabIds.size,
    groupTabIds: Array.from(group.tabIds),
    isNewGroup,
    isActive: group.isActive,
  });

  // Show sync suggestion if group has 2+ tabs and not already active (unless skipStartSync is true)
  const shouldShowSuggestion = !skipStartSync && group.tabIds.size >= 2 && !group.isActive;
  logger.info('[AUTO-SYNC] Checking if should show suggestion', {
    skipStartSync,
    groupSize: group.tabIds.size,
    isActive: group.isActive,
    shouldShowSuggestion,
  });

  if (shouldShowSuggestion && !dismissedUrlGroups.has(normalizedUrl)) {
    // If suggestion already pending (toast showing on other tabs), send to this new tab only
    if (pendingSuggestions.has(normalizedUrl)) {
      logger.info('[AUTO-SYNC] Sending suggestion to newly joined tab (from updateAutoSyncGroup)', {
        tabId,
        normalizedUrl,
      });
      await sendSuggestionToSingleTab(tabId, normalizedUrl, group);
    } else {
      // New group - broadcast to all tabs
      logger.info('[AUTO-SYNC] Showing suggestion for group', {
        normalizedUrl,
        tabIds: Array.from(group.tabIds),
      });
      await showSyncSuggestion(normalizedUrl);
    }
  }

  // Broadcast group update to content scripts (unless skipBroadcast is true)
  if (!skipBroadcast) {
    await broadcastAutoSyncGroupUpdate();
  }

  return normalizedUrl;
}

/**
 * Cancel any pending retry timer for a group
 */
function cancelAutoSyncRetry(normalizedUrl: string): void {
  const existingTimer = autoSyncRetryTimers.get(normalizedUrl);
  if (existingTimer) {
    clearTimeout(existingTimer);
    autoSyncRetryTimers.delete(normalizedUrl);
  }
}

/**
 * Stop auto-sync for a specific URL group
 */
async function stopAutoSyncForGroup(normalizedUrl: string): Promise<void> {
  // Cancel any pending retry timer
  cancelAutoSyncRetry(normalizedUrl);

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

  // Clear pending suggestion for this group to allow new suggestions after sync stops
  pendingSuggestions.delete(normalizedUrl);
}

/**
 * Show sync suggestion toast to a tab in the group
 * Instead of auto-starting sync, we ask the user for confirmation
 *
 * IMPORTANT: We send to a tab that's IN the group, not necessarily the active tab.
 * If the active tab is in the group, we prefer it (better UX).
 * Otherwise, we send to the first tab in the group (guaranteed to have content script ready).
 * This prevents hanging when active tab's content script isn't responding.
 */
async function showSyncSuggestion(normalizedUrl: string): Promise<void> {
  const group = autoSyncState.groups.get(normalizedUrl);

  // Comprehensive debug logging for troubleshooting toast display issues
  logger.info('[AUTO-SYNC] showSyncSuggestion called', {
    normalizedUrl,
    groupExists: !!group,
    groupSize: group?.tabIds.size,
    groupTabIds: group ? Array.from(group.tabIds) : [],
    isActive: group?.isActive,
    isPending: pendingSuggestions.has(normalizedUrl),
    isDismissed: dismissedUrlGroups.has(normalizedUrl),
  });

  if (!group || group.tabIds.size < 2) {
    logger.debug('[AUTO-SYNC] Cannot show suggestion - group not found or too small', {
      normalizedUrl,
      groupExists: !!group,
      groupSize: group?.tabIds.size,
    });
    return;
  }

  // Don't show if already dismissed by user
  if (dismissedUrlGroups.has(normalizedUrl)) {
    logger.debug('[AUTO-SYNC] Skipping suggestion - URL group dismissed by user', {
      normalizedUrl,
    });
    return;
  }

  // Don't show duplicate suggestions
  if (pendingSuggestions.has(normalizedUrl)) {
    logger.debug('[AUTO-SYNC] Skipping suggestion - already pending', { normalizedUrl });
    return;
  }

  // Get tab titles for the suggestion message
  const tabIds = Array.from(group.tabIds);
  const tabTitles: string[] = [];

  for (const tabId of tabIds) {
    try {
      const tab = await browser.tabs.get(tabId);
      tabTitles.push(tab.title || 'Untitled');
    } catch {
      tabTitles.push('Untitled');
    }
  }

  // Issue 12 Fix: Send toast to ALL tabs in the group
  // This ensures the user sees the toast regardless of which tab they're viewing
  const uniqueTargetTabs = [...new Set(tabIds)];

  if (uniqueTargetTabs.length === 0) {
    logger.debug('[AUTO-SYNC] No tabs found for sync suggestion');
    return;
  }

  // Mark as pending to prevent duplicates
  pendingSuggestions.add(normalizedUrl);

  // Check which tabs need content script injection
  // Only inject into tabs that don't respond to ping (no content script yet)
  // Also check if any tab is already syncing - if so, skip showing suggestion
  logger.info('[AUTO-SYNC] Checking content script status before showing suggestion', {
    normalizedUrl,
    targetTabs: uniqueTargetTabs,
  });

  const tabsNeedingInjection: number[] = [];
  let hasActiveSyncTab = false;

  await Promise.allSettled(
    uniqueTargetTabs.map(async (tabId) => {
      try {
        const response = await sendMessageWithTimeout<{
          success: boolean;
          tabId: number;
          isSyncActive: boolean;
        }>(
          'scroll:ping',
          { tabId, timestamp: Date.now() },
          { context: 'content-script', tabId },
          500,
        );

        if (response?.success) {
          logger.debug('[AUTO-SYNC] Content script already exists', {
            tabId,
            isSyncActive: response.isSyncActive,
          });
          // Check if this tab is already syncing
          if (response.isSyncActive) {
            hasActiveSyncTab = true;
          }
        }
      } catch {
        // No response means no content script - needs injection
        tabsNeedingInjection.push(tabId);
      }
    }),
  );

  // Log ping results summary
  logger.info('[AUTO-SYNC] Ping results summary', {
    normalizedUrl,
    totalTabs: uniqueTargetTabs.length,
    tabsNeedingInjection: tabsNeedingInjection.length,
    hasActiveSyncTab,
  });

  // If any tab is already syncing, skip showing suggestion
  if (hasActiveSyncTab) {
    logger.info('[AUTO-SYNC] Skipping suggestion - tabs are already syncing', {
      normalizedUrl,
    });
    pendingSuggestions.delete(normalizedUrl);
    return;
  }

  // Only inject into tabs without content scripts
  if (tabsNeedingInjection.length > 0) {
    logger.info('[AUTO-SYNC] Injecting content scripts into tabs without scripts', {
      normalizedUrl,
      tabsNeedingInjection,
    });

    await Promise.allSettled(
      tabsNeedingInjection.map(async (tabId) => {
        try {
          await browser.scripting.executeScript({
            target: { tabId },
            files: ['dist/contentScripts/index.global.js'],
          });
          logger.debug('[AUTO-SYNC] Content script injected for suggestion', { tabId });
        } catch (error) {
          logger.debug('[AUTO-SYNC] Content script injection failed', {
            tabId,
            error,
          });
        }
      }),
    );

    // Wait for content scripts to initialize
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  logger.info('[AUTO-SYNC] Showing sync suggestion toast on ALL tabs', {
    normalizedUrl,
    targetTabs: uniqueTargetTabs,
    tabCount: tabIds.length,
    tabTitles,
  });

  // Send toast to all tabs in parallel
  const results = await Promise.allSettled(
    uniqueTargetTabs.map(async (targetTabId) => {
      try {
        await sendMessageWithTimeout(
          'sync-suggestion:show',
          {
            normalizedUrl,
            tabCount: tabIds.length,
            tabIds,
            tabTitles,
          },
          { context: 'content-script', tabId: targetTabId },
          2_000, // 2 second timeout
        );
        return { tabId: targetTabId, success: true };
      } catch (error) {
        return {
          tabId: targetTabId,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );

  const successCount = results.filter((r) => r.status === 'fulfilled' && r.value.success).length;

  logger.info('[AUTO-SYNC] Sync suggestion sent', {
    totalTabs: uniqueTargetTabs.length,
    successCount,
    results: results.map((r) => (r.status === 'fulfilled' ? r.value : { error: r.reason })),
  });

  // If all sends failed, remove from pending suggestions
  if (successCount === 0) {
    pendingSuggestions.delete(normalizedUrl);
  }
}

/**
 * Send sync suggestion toast to a single newly joined tab
 * Used when a new tab joins an existing pending group (toast already showing on other tabs)
 */
async function sendSuggestionToSingleTab(
  tabId: number,
  normalizedUrl: string,
  group: AutoSyncGroup,
): Promise<void> {
  const tabIds = Array.from(group.tabIds);
  const tabTitles: string[] = [];

  for (const id of tabIds) {
    try {
      const tab = await browser.tabs.get(id);
      tabTitles.push(tab.title || 'Untitled');
    } catch {
      tabTitles.push('Untitled');
    }
  }

  // Check if content script is ready, inject if needed
  try {
    await sendMessage('ping', {}, { context: 'content-script', tabId });
  } catch {
    // Content script not ready, inject it
    try {
      await browser.scripting.executeScript({
        target: { tabId },
        files: ['dist/contentScripts/index.global.js'],
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      logger.warn('[AUTO-SYNC] Failed to inject content script for new tab', { tabId, error });
      return;
    }
  }

  // Send toast to the single new tab
  try {
    await sendMessage(
      'sync-suggestion:show',
      {
        normalizedUrl,
        tabIds,
        tabTitles,
        tabCount: tabIds.length,
      },
      { context: 'content-script', tabId },
    );
    logger.info('[AUTO-SYNC] Sent suggestion to newly joined tab', { tabId, normalizedUrl });
  } catch (error) {
    logger.warn('[AUTO-SYNC] Failed to send suggestion to new tab', { tabId, error });
  }
}

/**
 * Show add-tab suggestion toast when a new tab with same URL is detected
 * while manual sync is already active
 *
 * IMPORTANT: We send the toast to an already-synced tab, NOT the newly created tab.
 * This is because when a new tab is created, the browser makes it active immediately,
 * but its content script may not have initialized yet. Synced tabs are guaranteed
 * to have their content scripts ready.
 */
async function showAddTabSuggestion(
  tabId: number,
  tabTitle: string,
  normalizedUrl: string,
): Promise<void> {
  // Check if there are manual offsets that would be reset
  // For now, we'll assume no manual offsets (could be enhanced later)
  const hasManualOffsets = false;

  // Issue 10 Fix: Send toast to ALL tabs (synced tabs + new tab)
  // This ensures the user sees the toast regardless of which tab they're viewing
  const allTargetTabs = [...syncState.linkedTabs, tabId];
  // Remove duplicates (in case new tab is somehow already in linkedTabs)
  const uniqueTargetTabs = [...new Set(allTargetTabs)];

  if (uniqueTargetTabs.length === 0) {
    logger.debug('[AUTO-SYNC] No tabs found for add-tab suggestion');
    return;
  }

  logger.info('[AUTO-SYNC] Showing add-tab suggestion toast on ALL tabs', {
    newTabId: tabId,
    tabTitle,
    syncedTabs: syncState.linkedTabs,
    allTargetTabs: uniqueTargetTabs,
    hasManualOffsets,
  });

  // Send toast to all tabs in parallel
  const results = await Promise.allSettled(
    uniqueTargetTabs.map(async (targetTabId) => {
      try {
        await sendMessageWithTimeout(
          'sync-suggestion:add-tab',
          {
            tabId,
            tabTitle,
            hasManualOffsets,
            normalizedUrl,
          },
          { context: 'content-script', tabId: targetTabId },
          2_000, // 2 second timeout
        );
        return { tabId: targetTabId, success: true };
      } catch (error) {
        return {
          tabId: targetTabId,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );

  const successCount = results.filter((r) => r.status === 'fulfilled' && r.value.success).length;

  logger.info('[AUTO-SYNC] Add-tab suggestion sent', {
    totalTabs: uniqueTargetTabs.length,
    successCount,
    results: results.map((r) => (r.status === 'fulfilled' ? r.value : { error: r.reason })),
  });
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

  logger.info('[AUTO-SYNC] Broadcasting group update', {
    groupCount: groups.length,
    tabCount: allTabIds.size,
  });

  // Timeout for each message (1 second - reduced from 3s for faster response)
  const MESSAGE_TIMEOUT = 1000;

  // Helper to send message with timeout
  const sendWithTimeout = async (tabId: number): Promise<void> => {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Message timeout')), MESSAGE_TIMEOUT);
    });

    try {
      await Promise.race([
        sendMessage(
          'auto-sync:group-updated',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { groups } as any,
          { context: 'content-script', tabId },
        ),
        timeoutPromise,
      ]);
    } catch (error) {
      // Log as debug since this is expected for tabs with no content script
      logger.debug(`[AUTO-SYNC] Failed to broadcast to tab ${tabId}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  // Broadcast to all tabs in groups with timeout protection
  await Promise.all(Array.from(allTabIds).map(sendWithTimeout));

  logger.info('[AUTO-SYNC] Broadcast complete');
}

/**
 * Initialize auto-sync state from storage and scan existing tabs
 */
async function initializeAutoSync(overrideEnabled?: boolean): Promise<void> {
  // Prevent concurrent initialization
  if (isInitializingAutoSync) {
    logger.info('[AUTO-SYNC] initializeAutoSync skipped - already initializing');
    return;
  }

  isInitializingAutoSync = true;

  try {
    logger.info('[AUTO-SYNC] Initializing auto-sync...');

    // If enabled state is provided (from toggleAutoSync), use it directly
    // Otherwise load from storage (for initial startup)
    // This prevents race condition where storage read returns stale value
    if (overrideEnabled !== undefined) {
      autoSyncState.enabled = overrideEnabled;
    } else {
      autoSyncState.enabled = await loadAutoSyncEnabled();
    }
    autoSyncState.excludedUrls = await loadAutoSyncExcludedUrls();

    logger.info('[AUTO-SYNC] State loaded', {
      enabled: autoSyncState.enabled,
      excludedUrls: autoSyncState.excludedUrls,
    });

    if (!autoSyncState.enabled) {
      logger.info('[AUTO-SYNC] Auto-sync is disabled, skipping initialization');
      return;
    }

    // Scan all tabs and build groups
    // Skip broadcast and start sync during scanning - do it once at the end
    const tabs = await browser.tabs.query({});
    logger.info('[AUTO-SYNC] Scanning tabs', { tabCount: tabs.length });

    for (const tab of tabs) {
      if (tab.id && tab.url) {
        logger.info('[AUTO-SYNC] Processing tab', { tabId: tab.id, url: tab.url });
        // skipStartSync=true, skipBroadcast=true during batch initialization
        await updateAutoSyncGroup(tab.id, tab.url, true, true);
      }
    }

    logger.info('[AUTO-SYNC] Tab scanning complete, checking for eligible groups', {
      groupCount: autoSyncState.groups.size,
      groups: Array.from(autoSyncState.groups.entries()).map(([url, g]) => ({
        url,
        tabCount: g.tabIds.size,
        tabIds: Array.from(g.tabIds),
        isActive: g.isActive,
      })),
    });

    // Bug 14-1 fix: Inject content scripts into pre-existing tabs
    // Manifest-declared content scripts only inject into NEW tabs after extension installation
    // For tabs that existed before installation, we need to programmatically inject
    for (const [normalizedUrl, group] of autoSyncState.groups.entries()) {
      if (group.tabIds.size >= 2) {
        const tabIds = Array.from(group.tabIds);
        logger.info('[AUTO-SYNC] Injecting content scripts for group', {
          normalizedUrl,
          tabIds,
        });

        // Inject content scripts in parallel
        const injectionResults = await Promise.allSettled(
          tabIds.map(async (tabId) => {
            try {
              await browser.scripting.executeScript({
                target: { tabId },
                files: ['dist/contentScripts/index.global.js'],
              });
              logger.info('[AUTO-SYNC] Content script injected', { tabId });
              return { tabId, success: true };
            } catch (error) {
              logger.warn('[AUTO-SYNC] Content script injection failed', { tabId, error });
              return { tabId, success: false };
            }
          }),
        );

        // Remove tabs where injection failed from the group
        for (const result of injectionResults) {
          if (result.status === 'fulfilled' && !result.value.success) {
            group.tabIds.delete(result.value.tabId);
            logger.info('[AUTO-SYNC] Removed tab from group due to injection failure', {
              tabId: result.value.tabId,
              normalizedUrl,
            });
          }
        }

        // If group now has fewer than 2 tabs, delete it
        if (group.tabIds.size < 2) {
          autoSyncState.groups.delete(normalizedUrl);
          logger.info('[AUTO-SYNC] Deleted group due to insufficient tabs after injection', {
            normalizedUrl,
          });
        }
      }
    }

    // Wait for content scripts to fully initialize after injection
    // Reduced from 500ms to 100ms for faster toast display
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Show suggestions for groups with 2+ tabs (instead of auto-starting)
    for (const [normalizedUrl, group] of autoSyncState.groups.entries()) {
      if (group.tabIds.size >= 2 && !group.isActive) {
        logger.info('[AUTO-SYNC] Scheduling suggestion for group during init', {
          normalizedUrl,
          tabIds: Array.from(group.tabIds),
        });
        // Show suggestion (no additional delay needed since we already waited)
        if (!pendingSuggestions.has(normalizedUrl) && !dismissedUrlGroups.has(normalizedUrl)) {
          await showSyncSuggestion(normalizedUrl);
        }
      }
    }

    // Broadcast group update once at the end (fire-and-forget for faster response)
    logger.info('[AUTO-SYNC] Broadcasting group update (async)');
    void broadcastAutoSyncGroupUpdate();

    logger.info('[AUTO-SYNC] Initialization complete', {
      groupCount: autoSyncState.groups.size,
      groups: Array.from(autoSyncState.groups.entries()).map(([url, g]) => ({
        url,
        tabCount: g.tabIds.size,
        tabIds: Array.from(g.tabIds),
        isActive: g.isActive,
      })),
    });
  } catch (error) {
    logger.error('[AUTO-SYNC] Failed to initialize auto-sync', { error });
  } finally {
    isInitializingAutoSync = false;
  }
}

/**
 * Toggle auto-sync enabled state
 * Uses simple queue-based approach: if toggle is in progress, queue request and process after completion
 */
async function toggleAutoSync(enabled: boolean): Promise<void> {
  // If toggle is already in progress, queue this request
  if (isTogglingAutoSync) {
    logger.info('[AUTO-SYNC] toggleAutoSync queuing request (toggle in progress)', { enabled });
    pendingToggleRequest = enabled;
    return;
  }

  // Wait for any ongoing initialization to complete before toggling
  // This prevents race conditions where toggle modifies state while init is reading it
  if (isInitializingAutoSync) {
    logger.info('[AUTO-SYNC] toggleAutoSync waiting for initialization to complete', { enabled });
    // Poll until initialization completes (max 10 seconds)
    const maxWait = 10000;
    const pollInterval = 100;
    let waited = 0;
    while (isInitializingAutoSync && waited < maxWait) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
      waited += pollInterval;
    }
    if (isInitializingAutoSync) {
      logger.warn('[AUTO-SYNC] toggleAutoSync timed out waiting for initialization');
    }
  }

  // Skip if state hasn't changed
  if (autoSyncState.enabled === enabled) {
    logger.info('[AUTO-SYNC] toggleAutoSync skipped - state unchanged', { enabled });
    return;
  }

  isTogglingAutoSync = true;
  logger.info('[AUTO-SYNC] toggleAutoSync called', {
    enabled,
    previousState: autoSyncState.enabled,
  });

  try {
    autoSyncState.enabled = enabled;
    await saveAutoSyncEnabled(enabled);

    if (enabled) {
      // Clean up any stale state before re-initialization
      logger.info('[AUTO-SYNC] Enabling - clearing stale state before initialization');
      autoSyncState.groups.clear();

      // Clear dismissed and pending suggestions for fresh start
      dismissedUrlGroups.clear();
      pendingSuggestions.clear();

      // Cancel any pending retry timers from previous session
      for (const timer of autoSyncRetryTimers.values()) {
        clearTimeout(timer);
      }
      autoSyncRetryTimers.clear();

      // Small delay to ensure content scripts are ready after rapid toggle
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Re-initialize to scan tabs and create groups
      // Pass true directly to prevent storage race condition (stale value read)
      logger.info('[AUTO-SYNC] Enabling - calling initializeAutoSync');
      await initializeAutoSync(true);
    } else {
      // Cancel all pending retry timers
      logger.info('[AUTO-SYNC] Disabling - clearing retry timers', {
        timerCount: autoSyncRetryTimers.size,
      });
      for (const timer of autoSyncRetryTimers.values()) {
        clearTimeout(timer);
      }
      autoSyncRetryTimers.clear();

      // Clear dismissed and pending suggestions
      dismissedUrlGroups.clear();
      pendingSuggestions.clear();

      // Stop all active auto-sync groups
      logger.info('[AUTO-SYNC] Stopping all active groups', {
        groupCount: autoSyncState.groups.size,
      });
      for (const [normalizedUrl, group] of autoSyncState.groups.entries()) {
        if (group.isActive) {
          await stopAutoSyncForGroup(normalizedUrl);
        }
      }
      // Clear all groups
      autoSyncState.groups.clear();
      logger.info('[AUTO-SYNC] All groups cleared');
    }

    // Broadcast status change to all tabs (fire-and-forget for immediate response)
    const tabs = await browser.tabs.query({});
    void (async () => {
      const BROADCAST_TIMEOUT = 500;
      await Promise.allSettled(
        tabs.map(async (tab) => {
          if (tab.id) {
            try {
              await Promise.race([
                sendMessage(
                  'auto-sync:status-changed',
                  { enabled },
                  { context: 'content-script', tabId: tab.id },
                ),
                new Promise((_, reject) =>
                  setTimeout(() => reject(new Error('timeout')), BROADCAST_TIMEOUT),
                ),
              ]);
            } catch {
              // Tab may not have content script or timed out
            }
          }
        }),
      );
      logger.info('[AUTO-SYNC] Status broadcast complete (async)');
    })();
  } finally {
    isTogglingAutoSync = false;

    // Process any queued request after current toggle completes
    if (pendingToggleRequest !== null) {
      const queuedState = pendingToggleRequest;
      pendingToggleRequest = null;
      logger.info('[AUTO-SYNC] Processing queued toggle request', { enabled: queuedState });
      // Call directly instead of setTimeout for better service worker compatibility
      // Using void to handle the promise without blocking
      void toggleAutoSync(queuedState);
    }
  }
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

          // Start keep-alive after restoring sync
          startKeepAlive();
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
      await removeTabFromAllAutoSyncGroups(tabId);
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
  const payload = data as { tabIds: Array<number>; isAutoSync?: boolean };

  // Broadcast stop message to all selected tabs
  const promises = payload.tabIds.map((tabId) =>
    sendMessage('scroll:stop', data, { context: 'content-script', tabId }).catch((error) => {
      logger.error(`Failed to send stop message to tab ${tabId}`, { error });
    }),
  );

  await Promise.all(promises);

  // Also stop any auto-sync groups that contain these tabs
  // This ensures auto-sync state is cleared when user stops from popup
  for (const [normalizedUrl, group] of autoSyncState.groups.entries()) {
    if (group.isActive) {
      const hasStoppedTab = payload.tabIds.some((tabId) => group.tabIds.has(tabId));
      if (hasStoppedTab) {
        logger.info('[AUTO-SYNC] Clearing auto-sync group due to manual stop', {
          normalizedUrl,
          stoppedTabIds: payload.tabIds,
        });
        group.isActive = false;
      }
    }
  }

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

  // Stop keep-alive mechanism
  stopKeepAlive();

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
      { ...statusPayload, currentTabId: tabId } as JsonValue,
      { context: 'content-script', tabId } as Destination,
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
      await removeTabFromAllAutoSyncGroups(payload.tabId);
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

// Handler for content script re-injection request (when all reconnection attempts fail)
onMessage('scroll:request-reinject', async ({ data }) => {
  const payload = data as { tabId: number };
  logger.info('Received content script re-inject request', { tabId: payload.tabId });

  // Check if tab is in any active sync
  const isInManualSync = syncState.isActive && syncState.linkedTabs.includes(payload.tabId);
  const isInAutoSync = isTabInActiveAutoSyncGroup(payload.tabId);

  if (!isInManualSync && !isInAutoSync) {
    logger.debug('Tab not in any active sync, ignoring re-inject request', {
      tabId: payload.tabId,
    });
    return { success: false, reason: 'Tab not in sync' };
  }

  // Re-inject content script
  const success = await reinjectContentScript(payload.tabId);
  return { success };
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

// Handler for getting detailed auto-sync status (for UI display)
onMessage('auto-sync:get-detailed-status', async ({ sender }) => {
  logger.debug('[AUTO-SYNC] get-detailed-status request', { senderTabId: sender.tabId });

  const allGroups = Array.from(autoSyncState.groups.entries()).map(([url, g]) => ({
    url,
    tabCount: g.tabIds.size,
    tabIds: Array.from(g.tabIds),
    isActive: g.isActive,
  }));
  const activeGroups = Array.from(autoSyncState.groups.values()).filter((g) => g.isActive);
  const totalSyncedTabs = activeGroups.reduce((sum, g) => sum + g.tabIds.size, 0);

  // Count all tabs in groups with 2+ tabs (potential sync candidates)
  // This is different from totalSyncedTabs which only counts actively syncing tabs
  const potentialSyncTabs = Array.from(autoSyncState.groups.values())
    .filter((g) => g.tabIds.size >= 2)
    .reduce((sum, g) => sum + g.tabIds.size, 0);

  // Find current tab's group if sender has tabId
  let currentTabGroup:
    | {
        normalizedUrl: string;
        tabCount: number;
        isActive: boolean;
      }
    | undefined;

  if (sender.tabId) {
    for (const [normalizedUrl, group] of autoSyncState.groups.entries()) {
      if (group.tabIds.has(sender.tabId)) {
        currentTabGroup = {
          normalizedUrl,
          tabCount: group.tabIds.size,
          isActive: group.isActive,
        };
        break;
      }
    }
  }

  const response = {
    success: true,
    enabled: autoSyncState.enabled,
    activeGroupCount: activeGroups.length,
    totalSyncedTabs,
    potentialSyncTabs,
    currentTabGroup,
  };

  logger.debug('[AUTO-SYNC] get-detailed-status response', {
    ...response,
    allGroups,
    groupCount: autoSyncState.groups.size,
  });

  return response;
});

// Handler for sync suggestion response (user accepted or rejected)
onMessage('sync-suggestion:response', async ({ data }) => {
  const payload = data as { normalizedUrl: string; accepted: boolean };
  logger.info('[AUTO-SYNC] Received sync suggestion response', payload);

  // Remove from pending suggestions
  pendingSuggestions.delete(payload.normalizedUrl);

  // Issue 12 Fix: Broadcast dismiss message to ALL tabs in the group
  // This closes the toast on all tabs when one tab responds
  const group = autoSyncState.groups.get(payload.normalizedUrl);
  if (group) {
    const uniqueTargetTabs = Array.from(group.tabIds);

    // Send dismiss message to all tabs in parallel (fire-and-forget, don't wait)
    Promise.allSettled(
      uniqueTargetTabs.map((targetTabId) =>
        sendMessageWithTimeout(
          'sync-suggestion:dismiss',
          { normalizedUrl: payload.normalizedUrl },
          { context: 'content-script', tabId: targetTabId },
          1_000, // 1 second timeout
        ).catch(() => {
          // Ignore errors - tab may have been closed or content script not ready
        }),
      ),
    ).then((results) => {
      const successCount = results.filter((r) => r.status === 'fulfilled').length;
      logger.debug('[AUTO-SYNC] Dismiss sync suggestion toast broadcast', {
        totalTabs: uniqueTargetTabs.length,
        successCount,
      });
    });
  }

  if (payload.accepted) {
    // User accepted - start manual sync for this group
    const group = autoSyncState.groups.get(payload.normalizedUrl);
    if (group && group.tabIds.size >= 2) {
      const tabIds = Array.from(group.tabIds);
      logger.info('[AUTO-SYNC] Starting manual sync from suggestion acceptance', {
        normalizedUrl: payload.normalizedUrl,
        tabIds,
      });

      // Mark tabs as manually overridden so they won't be auto-synced again
      for (const tabId of tabIds) {
        manualSyncOverriddenTabs.add(tabId);
      }

      // Remove from auto-sync groups
      autoSyncState.groups.delete(payload.normalizedUrl);

      // ✅ FIX: Set syncState BEFORE starting connections to prevent race condition
      // This allows new tabs created during connection phase to be detected
      syncState.isActive = true;
      syncState.linkedTabs = tabIds;
      syncState.mode = 'ratio';

      // Start manual sync by sending scroll:start to background (which triggers the full flow)
      // This will handle the connection tracking and status broadcasting
      const connectionResults: Record<number, { success: boolean; error?: string }> = {};

      const promises = tabIds.map(async (tabId) => {
        try {
          const response = await sendMessageWithTimeout<{ success: boolean; tabId: number }>(
            'scroll:start',
            {
              tabIds,
              mode: 'ratio',
              currentTabId: tabId,
              isAutoSync: false, // This is now manual sync
            },
            { context: 'content-script', tabId },
            2_000,
          );

          if (response && response.success && response.tabId === tabId) {
            connectionResults[tabId] = { success: true };
            syncState.connectionStatuses[tabId] = 'connected';
          } else {
            connectionResults[tabId] = { success: false, error: 'Invalid acknowledgment' };
            syncState.connectionStatuses[tabId] = 'error';
          }
        } catch (error) {
          connectionResults[tabId] = { success: false, error: String(error) };
          syncState.connectionStatuses[tabId] = 'error';
        }
      });

      await Promise.all(promises);

      // Check if at least 2 tabs connected
      const successfulConnections = Object.entries(connectionResults).filter(
        ([, result]) => result.success,
      );
      const connectedTabIds = successfulConnections.map(([tabId]) => Number(tabId));

      if (connectedTabIds.length >= 2) {
        // Update linkedTabs to only include successfully connected tabs
        syncState.linkedTabs = connectedTabIds;
        await persistSyncState();
        await broadcastSyncStatus();
        logger.info('[AUTO-SYNC] Manual sync started from suggestion', { connectedTabIds });
      } else {
        // Not enough connections - reset syncState
        syncState.isActive = false;
        syncState.linkedTabs = [];
        syncState.connectionStatuses = {};
        logger.warn('[AUTO-SYNC] Failed to start sync - not enough tabs connected', {
          connectionResults,
        });
      }
    }
  } else {
    // User rejected - add to dismissed groups
    dismissedUrlGroups.add(payload.normalizedUrl);
    logger.info('[AUTO-SYNC] User dismissed sync suggestion', {
      normalizedUrl: payload.normalizedUrl,
    });
  }

  return { success: true };
});

// Handler for add-tab suggestion response (user accepted or rejected adding new tab to existing sync)
onMessage('sync-suggestion:add-tab-response', async ({ data }) => {
  const payload = data as { tabId: number; accepted: boolean };
  logger.info('[AUTO-SYNC] Received add-tab suggestion response', payload);

  // Issue 10 Fix: Broadcast dismiss message to ALL tabs (synced + new tab)
  // This closes the toast on all tabs when one tab responds
  const allTargetTabs = [...syncState.linkedTabs, payload.tabId];
  const uniqueTargetTabs = [...new Set(allTargetTabs)];

  // Send dismiss message to all tabs in parallel (fire-and-forget, don't wait)
  Promise.allSettled(
    uniqueTargetTabs.map((targetTabId) =>
      sendMessageWithTimeout(
        'sync-suggestion:dismiss-add-tab',
        { tabId: payload.tabId },
        { context: 'content-script', tabId: targetTabId },
        1_000, // 1 second timeout
      ).catch(() => {
        // Ignore errors - tab may have been closed or content script not ready
      }),
    ),
  ).then((results) => {
    const successCount = results.filter((r) => r.status === 'fulfilled').length;
    logger.debug('[AUTO-SYNC] Dismiss add-tab toast broadcast', {
      totalTabs: uniqueTargetTabs.length,
      successCount,
    });
  });

  if (payload.accepted && syncState.isActive) {
    // User accepted - add tab to existing manual sync
    const tabId = payload.tabId;

    // Verify tab still exists
    try {
      const tab = await browser.tabs.get(tabId);
      if (!tab) {
        return { success: false, error: 'Tab no longer exists' };
      }

      // Mark as manually overridden
      manualSyncOverriddenTabs.add(tabId);

      // Remove from any auto-sync groups
      await removeTabFromAllAutoSyncGroups(tabId);

      // Add to manual sync
      const newTabIds = [...syncState.linkedTabs, tabId];

      // Send scroll:start to all tabs with updated tab list
      const promises = newTabIds.map(async (tId) => {
        try {
          const response = await sendMessageWithTimeout<{ success: boolean; tabId: number }>(
            'scroll:start',
            {
              tabIds: newTabIds,
              mode: syncState.mode || 'ratio',
              currentTabId: tId,
              isAutoSync: false,
            },
            { context: 'content-script', tabId: tId },
            2_000,
          );

          if (response && response.success && response.tabId === tId) {
            syncState.connectionStatuses[tId] = 'connected';
          } else {
            syncState.connectionStatuses[tId] = 'error';
          }
        } catch {
          syncState.connectionStatuses[tId] = 'error';
        }
      });

      await Promise.all(promises);

      // Update sync state
      syncState.linkedTabs = newTabIds;
      await persistSyncState();
      await broadcastSyncStatus();

      logger.info('[AUTO-SYNC] Added tab to manual sync', { tabId, newTabIds });
    } catch (error) {
      logger.error('[AUTO-SYNC] Failed to add tab to sync', { tabId, error });
      return { success: false, error: String(error) };
    }
  }

  return { success: true };
});

logger.info('All message handlers registered successfully');

// Tab event listeners for sync persistence

// Handle tab removal - remove from sync and stop if <2 tabs remain
browser.tabs.onRemoved.addListener(async (tabId) => {
  // Clean up manually overridden tabs set
  manualSyncOverriddenTabs.delete(tabId);

  // Handle auto-sync group removal
  if (autoSyncState.enabled) {
    await removeTabFromAllAutoSyncGroups(tabId);
    await broadcastAutoSyncGroupUpdate();
  }

  // Dismiss Add-Tab toast for the closed tab
  // This handles the case where a new tab (not yet synced) is closed
  // while the Add-Tab toast is being shown to synced tabs
  if (syncState.isActive && syncState.linkedTabs.length > 0) {
    const dismissPromises = syncState.linkedTabs.map((linkedTabId) =>
      sendMessageWithTimeout(
        'sync-suggestion:dismiss-add-tab',
        { tabId }, // The tab that was just closed
        { context: 'content-script', tabId: linkedTabId },
        1_000,
      ).catch(() => {
        // Ignore errors - tab may have been closed
      }),
    );
    await Promise.allSettled(dismissPromises);
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

    // ✅ FIX: Store remaining tabs before clearing sync state
    const remainingTabs = [...syncState.linkedTabs];

    // ✅ FIX: Remove remaining tabs from manualSyncOverriddenTabs
    // This allows them to rejoin auto-sync groups when new same-URL tabs are created
    for (const remainingTabId of remainingTabs) {
      manualSyncOverriddenTabs.delete(remainingTabId);
    }

    // Stop sync for remaining tabs
    const promises = remainingTabs.map((remainingTabId) =>
      sendMessage('scroll:stop', {}, { context: 'content-script', tabId: remainingTabId }).catch(
        (error) => {
          logger.error(`Failed to send stop message to tab ${remainingTabId}`, { error });
        },
      ),
    );
    await Promise.all(promises);

    // Stop keep-alive mechanism
    stopKeepAlive();

    // Clear sync state
    syncState.isActive = false;
    syncState.linkedTabs = [];
    syncState.connectionStatuses = {};
    syncState.mode = undefined;
    await persistSyncState();

    // ✅ FIX: Re-add remaining tabs to auto-sync groups if auto-sync is enabled
    if (autoSyncState.enabled) {
      for (const remainingTabId of remainingTabs) {
        try {
          const tab = await browser.tabs.get(remainingTabId);
          if (tab.url) {
            await updateAutoSyncGroup(remainingTabId, tab.url);
          }
        } catch {
          // Tab may have been closed
        }
      }
    }
  } else {
    // Continue sync with remaining tabs, broadcast updated status
    logger.info(`Continuing sync with ${syncState.linkedTabs.length} tabs`);
    await persistSyncState(); // Persist updated tab list
    await broadcastSyncStatus();
  }
});

// Handle new tab creation for auto-sync
browser.tabs.onCreated.addListener(async (tab) => {
  // ✅ Bug 9-1 Fix: Record the current active synced tab BEFORE browser switches to new tab
  // This ensures lastActiveSyncedTabId is set correctly for Add-Tab toast targeting
  if (syncState.isActive) {
    try {
      const activeTabs = await browser.tabs.query({ active: true, currentWindow: true });
      const activeTab = activeTabs[0];
      if (activeTab?.id && syncState.linkedTabs.includes(activeTab.id)) {
        syncState.lastActiveSyncedTabId = activeTab.id;
        logger.debug('[AUTO-SYNC] Recorded lastActiveSyncedTabId in onCreated', {
          lastActiveSyncedTabId: activeTab.id,
          newTabId: tab.id,
        });
      }
    } catch {
      // Ignore errors when querying tabs
    }
  }

  if (!autoSyncState.enabled || !tab.id) {
    return;
  }

  // For new tabs, the URL might be available immediately or after navigation
  // If URL is available, add to auto-sync group (but don't start sync yet - wait for page to load)
  if (tab.url && tab.url !== 'about:blank' && tab.url !== 'chrome://newtab/') {
    logger.debug(`New tab ${tab.id} created with URL, adding to auto-sync group (pending)`, {
      url: tab.url,
    });
    // skipStartSync=true, skipBroadcast=true because content script isn't ready yet
    await updateAutoSyncGroup(tab.id, tab.url, true, true);

    // ✅ FIX: Show suggestion after content script is ready (delayed)
    // This ensures instant toast display when a new same-URL tab is created
    const normalizedUrl = normalizeUrlForAutoSync(tab.url);
    if (normalizedUrl) {
      const group = autoSyncState.groups.get(normalizedUrl);
      if (group && group.tabIds.size >= 2 && !group.isActive) {
        // Schedule toast display after content script initializes
        setTimeout(async () => {
          // Re-check conditions (state might have changed)
          const currentGroup = autoSyncState.groups.get(normalizedUrl);
          if (
            currentGroup &&
            currentGroup.tabIds.size >= 2 &&
            !currentGroup.isActive &&
            !dismissedUrlGroups.has(normalizedUrl)
          ) {
            // If suggestion already pending (toast showing on other tabs), send to this new tab only
            if (pendingSuggestions.has(normalizedUrl) && tab.id !== undefined) {
              logger.info('[AUTO-SYNC] Sending suggestion to newly joined tab', {
                tabId: tab.id,
                normalizedUrl,
              });
              await sendSuggestionToSingleTab(tab.id, normalizedUrl, currentGroup);
            } else {
              // New group - broadcast to all tabs
              logger.info('[AUTO-SYNC] Showing delayed suggestion after tab creation', {
                tabId: tab.id,
                normalizedUrl,
              });
              await showSyncSuggestion(normalizedUrl);
            }
          }
        }, 500); // 500ms delay for content script initialization
      }
    }
  }
});

// Handle tab updates (refresh, URL change) - auto-reconnect synced tabs
browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Process URL changes IMMEDIATELY (don't wait for status=complete)
  // This enables instant toast display when URL is known
  if (changeInfo.url || (changeInfo.status === 'loading' && tab.url)) {
    const url = changeInfo.url || tab.url || '';
    const normalizedUrl = normalizeUrlForAutoSync(url);

    if (normalizedUrl) {
      // 1. Check if this tab should be offered to add to existing manual sync
      // We send toast to an already-synced tab (content script is ready), not to the new tab
      if (syncState.isActive && !syncState.linkedTabs.includes(tabId)) {
        // Check if any synced tab has the same normalized URL
        const syncedTabsWithSameUrl = await Promise.all(
          syncState.linkedTabs.map(async (syncedTabId) => {
            try {
              const syncedTab = await browser.tabs.get(syncedTabId);
              const syncedNormalizedUrl = syncedTab.url
                ? normalizeUrlForAutoSync(syncedTab.url)
                : null;
              return syncedNormalizedUrl === normalizedUrl;
            } catch {
              return false;
            }
          }),
        );

        if (syncedTabsWithSameUrl.some((match) => match)) {
          // This tab has same URL as a synced tab - offer to add it
          logger.info('[AUTO-SYNC] Detected new tab with same URL as synced tab (immediate)', {
            tabId,
            normalizedUrl,
            trigger: changeInfo.url ? 'url_change' : 'loading_with_url',
          });
          await showAddTabSuggestion(tabId, tab.title || 'Untitled', normalizedUrl);
        }
      }

      // 2. Handle auto-sync group updates and show suggestion immediately
      if (autoSyncState.enabled) {
        const existingGroup = autoSyncState.groups.get(normalizedUrl);

        // If tab is not in any group yet, add it and possibly show suggestion
        if (!existingGroup || !existingGroup.tabIds.has(tabId)) {
          // Don't skip suggestion - we want immediate toast display
          await updateAutoSyncGroup(tabId, url);
        }
        // If tab is in group but sync not active, show suggestion now
        // ✅ FIX: Add pendingSuggestions and dismissedUrlGroups checks to prevent repeated toasts
        else if (existingGroup && existingGroup.tabIds.has(tabId) && !existingGroup.isActive) {
          if (
            existingGroup.tabIds.size >= 2 &&
            !pendingSuggestions.has(normalizedUrl) &&
            !dismissedUrlGroups.has(normalizedUrl)
          ) {
            await showSyncSuggestion(normalizedUrl);
          }
        }
      }
    }
  }

  // Note: We removed the duplicate logic from changeInfo.status === 'complete' block
  // since it's now handled above when URL is first detected

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
            { url: changeInfo.url, sourceTabId: tabId } as JsonValue,
            { context: 'content-script', tabId: targetTabId } as Destination,
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
  // Track the last active synced tab for toast targeting (Bug 8-2 fix)
  if (syncState.isActive && syncState.linkedTabs.includes(tabId)) {
    syncState.lastActiveSyncedTabId = tabId;
  }

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
    if (newValue !== oldValue && newValue !== undefined) {
      logger.info('Auto-sync enabled changed via storage', { newValue, oldValue });
      // toggleAutoSync handles queuing internally if toggle is in progress
      await toggleAutoSync(newValue);
    }
  }
});

logger.info('Storage change listener registered');
