import { sendMessage } from 'webext-bridge/background';

import {
  isLocalDevelopmentServer,
  isUrlExcluded,
  normalizeUrlForAutoSync,
} from '~/shared/lib/auto-sync-url-utils';
import { ExtensionLogger } from '~/shared/lib/logger';
import { isForbiddenUrl } from '~/shared/lib/url-utils';
import type { AutoSyncGroupInfo } from '~/shared/types/messages';

import {
  autoSyncState,
  autoSyncRetryTimers,
  dismissedUrlGroups,
  pendingSuggestions,
  MAX_AUTO_SYNC_GROUP_SIZE,
  isTabManuallyOverridden,
  withAutoSyncLock,
} from './auto-sync-state';
import {
  showSyncSuggestion,
  sendSuggestionToSingleTab,
  isDomainSnoozed,
} from './auto-sync-suggestions';

const logger = new ExtensionLogger({ scope: 'background/auto-sync-groups' });

/**
 * Cancel any pending retry timer for a group
 */
export function cancelAutoSyncRetry(normalizedUrl: string): void {
  const existingTimer = autoSyncRetryTimers.get(normalizedUrl);
  if (existingTimer) {
    clearTimeout(existingTimer);
    autoSyncRetryTimers.delete(normalizedUrl);
  }
}

/**
 * Stop auto-sync for a specific URL group
 */
export async function stopAutoSyncForGroup(normalizedUrl: string): Promise<void> {
  cancelAutoSyncRetry(normalizedUrl);

  const group = autoSyncState.groups.get(normalizedUrl);
  if (!group) return;

  const tabIds = Array.from(group.tabIds);
  logger.info(`Stopping auto-sync for group`, { normalizedUrl, tabIds });

  const promises = tabIds.map(async (tabId) => {
    try {
      await sendMessage('scroll:stop', { isAutoSync: true }, { context: 'content-script', tabId });
    } catch (error) {
      logger.debug(`Failed to stop auto-sync for tab ${tabId}`, { error });
    }
  });

  await Promise.all(promises);
  group.isActive = false;

  pendingSuggestions.delete(normalizedUrl);
}

/**
 * Remove tab from all auto-sync groups
 */
export async function removeTabFromAllAutoSyncGroups(tabId: number): Promise<void> {
  for (const [normalizedUrl, group] of autoSyncState.groups.entries()) {
    if (group.tabIds.has(tabId)) {
      group.tabIds.delete(tabId);
      logger.debug(`Removed tab ${tabId} from auto-sync group`, { normalizedUrl });

      if (group.tabIds.size < 2) {
        cancelAutoSyncRetry(normalizedUrl);
        if (group.isActive) {
          await stopAutoSyncForGroup(normalizedUrl);
        }
      }

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
export function getAutoSyncGroupMembers(tabId: number): number[] {
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
export function isTabInActiveAutoSyncGroup(tabId: number): boolean {
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
export async function updateAutoSyncGroup(
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

  if (isForbiddenUrl(url)) {
    logger.debug(`[AUTO-SYNC] URL is forbidden, skipping auto-sync`, { url, tabId });
    await removeTabFromAllAutoSyncGroups(tabId);
    return null;
  }

  if (isLocalDevelopmentServer(url)) {
    logger.debug(`[AUTO-SYNC] URL is local dev server, skipping auto-sync`, { url, tabId });
    await removeTabFromAllAutoSyncGroups(tabId);
    return null;
  }

  if (isUrlExcluded(url, autoSyncState.excludedUrls)) {
    logger.debug(`[AUTO-SYNC] URL excluded from auto-sync`, { url, tabId });
    await removeTabFromAllAutoSyncGroups(tabId);
    return null;
  }

  if (isTabManuallyOverridden(tabId)) {
    logger.debug(`[AUTO-SYNC] Tab ${tabId} is in manual sync, skipping auto-sync`);
    return null;
  }

  logger.info('[AUTO-SYNC] Removing tab from existing groups', { tabId });
  await removeTabFromAllAutoSyncGroups(tabId);

  let group = autoSyncState.groups.get(normalizedUrl);
  const isNewGroup = !group;
  if (!group) {
    group = { tabIds: new Set(), isActive: false };
    autoSyncState.groups.set(normalizedUrl, group);
    logger.info('[AUTO-SYNC] Created new group', { normalizedUrl });
  }

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

  const shouldShowSuggestion = !skipStartSync && group.tabIds.size >= 2 && !group.isActive;
  logger.info('[AUTO-SYNC] Checking if should show suggestion', {
    skipStartSync,
    groupSize: group.tabIds.size,
    isActive: group.isActive,
    shouldShowSuggestion,
  });

  if (
    shouldShowSuggestion &&
    !dismissedUrlGroups.has(normalizedUrl) &&
    !isDomainSnoozed(normalizedUrl)
  ) {
    if (pendingSuggestions.has(normalizedUrl)) {
      logger.info('[AUTO-SYNC] Sending suggestion to newly joined tab (from updateAutoSyncGroup)', {
        tabId,
        normalizedUrl,
      });
      await sendSuggestionToSingleTab(tabId, normalizedUrl, group);
    } else {
      logger.info('[AUTO-SYNC] Showing suggestion for group', {
        normalizedUrl,
        tabIds: Array.from(group.tabIds),
      });
      await showSyncSuggestion(normalizedUrl);
    }
  }

  if (!skipBroadcast) {
    await broadcastAutoSyncGroupUpdate();
  }

  return normalizedUrl;
}

/**
 * Broadcast auto-sync group update to all content scripts
 */
export async function broadcastAutoSyncGroupUpdate(): Promise<void> {
  const groups: Array<AutoSyncGroupInfo> = [];

  for (const [normalizedUrl, group] of autoSyncState.groups.entries()) {
    groups.push({
      normalizedUrl,
      tabIds: Array.from(group.tabIds),
      isActive: group.isActive,
    });
  }

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

  const MESSAGE_TIMEOUT = 1000;

  const sendWithTimeout = async (tabId: number): Promise<void> => {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Message timeout')), MESSAGE_TIMEOUT);
    });

    try {
      await Promise.race([
        sendMessage('auto-sync:group-updated', { groups }, { context: 'content-script', tabId }),
        timeoutPromise,
      ]);
    } catch (error) {
      logger.debug(`[AUTO-SYNC] Failed to broadcast to tab ${tabId}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  await Promise.all(Array.from(allTabIds).map(sendWithTimeout));

  logger.info('[AUTO-SYNC] Broadcast complete');
}
