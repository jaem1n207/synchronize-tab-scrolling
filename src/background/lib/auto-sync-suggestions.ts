import { sendMessage } from 'webext-bridge/background';
import browser from 'webextension-polyfill';

import { extractDomainFromUrl, normalizeUrlForAutoSync } from '~/shared/lib/auto-sync-url-utils';
import { ExtensionLogger } from '~/shared/lib/logger';
import type { AutoSyncGroup } from '~/shared/types/auto-sync-state';

import {
  autoSyncState,
  dismissedUrlGroups,
  excludedDomains,
  pendingSuggestions,
  suggestionSnoozeUntil,
} from './auto-sync-state';
import { sendMessageWithTimeout } from './messaging';
import { syncState } from './sync-state';

const logger = new ExtensionLogger({ scope: 'background/auto-sync-suggestions' });

export function isDomainPermanentlyExcluded(normalizedUrl: string): boolean {
  const domain = extractDomainFromUrl(normalizedUrl);
  if (!domain) return false;
  return excludedDomains.has(domain);
}

export function isDomainSnoozed(normalizedUrl: string): boolean {
  const domain = extractDomainFromUrl(normalizedUrl);
  if (!domain) return false;

  const expiresAt = suggestionSnoozeUntil.get(domain);
  if (!expiresAt) return false;

  if (Date.now() >= expiresAt) {
    suggestionSnoozeUntil.delete(domain);
    return false;
  }

  return true;
}

/**
 * Show sync suggestion toast on all tabs in a group
 *
 * IMPORTANT: We send to a tab that's IN the group, not necessarily the active tab.
 * If the active tab is in the group, we prefer it (better UX).
 * Otherwise, we send to the first tab in the group (guaranteed to have content script ready).
 * This prevents hanging when active tab's content script isn't responding.
 */
export async function showSyncSuggestion(normalizedUrl: string): Promise<void> {
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

  if (dismissedUrlGroups.has(normalizedUrl)) {
    logger.debug('[AUTO-SYNC] Skipping suggestion - URL group dismissed by user', {
      normalizedUrl,
    });
    return;
  }

  if (isDomainPermanentlyExcluded(normalizedUrl)) {
    logger.debug('[AUTO-SYNC] Skipping suggestion - domain is permanently excluded', {
      normalizedUrl,
      domain: extractDomainFromUrl(normalizedUrl),
    });
    return;
  }

  if (isDomainSnoozed(normalizedUrl)) {
    logger.debug('[AUTO-SYNC] Skipping suggestion - domain is snoozed', {
      normalizedUrl,
      domain: extractDomainFromUrl(normalizedUrl),
    });
    return;
  }

  if (pendingSuggestions.has(normalizedUrl)) {
    logger.debug('[AUTO-SYNC] Skipping suggestion - already pending', { normalizedUrl });
    return;
  }

  // Background-side active sync check — more reliable than the ping check below,
  // which depends on 500ms timeouts that fail when Chrome throttles background tabs.
  if (syncState.isActive) {
    const hasSyncedTabWithSameUrl = await hasSyncedTabMatchingUrl(normalizedUrl);
    if (hasSyncedTabWithSameUrl) {
      logger.info('[AUTO-SYNC] Skipping suggestion - synced tabs share this normalized URL', {
        normalizedUrl,
        syncedTabs: syncState.linkedTabs,
      });
      return;
    }
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
            ...(syncState.isActive &&
              syncState.linkedTabs.length > 0 && {
                hasExistingSync: true,
                existingSyncTabCount: syncState.linkedTabs.length,
              }),
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
export async function sendSuggestionToSingleTab(
  tabId: number,
  normalizedUrl: string,
  group: AutoSyncGroup,
): Promise<void> {
  if (isDomainPermanentlyExcluded(normalizedUrl)) {
    logger.debug('[AUTO-SYNC] Skipping single-tab suggestion - domain is permanently excluded', {
      tabId,
      normalizedUrl,
    });
    return;
  }

  if (isDomainSnoozed(normalizedUrl)) {
    logger.debug('[AUTO-SYNC] Skipping single-tab suggestion - domain is snoozed', {
      tabId,
      normalizedUrl,
    });
    return;
  }

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
        ...(syncState.isActive &&
          syncState.linkedTabs.length > 0 && {
            hasExistingSync: true,
            existingSyncTabCount: syncState.linkedTabs.length,
          }),
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
export async function showAddTabSuggestion(
  tabId: number,
  tabTitle: string,
  normalizedUrl: string,
): Promise<void> {
  if (isDomainPermanentlyExcluded(normalizedUrl)) {
    logger.debug('[AUTO-SYNC] Skipping add-tab suggestion - domain is permanently excluded', {
      tabId,
      normalizedUrl,
    });
    return;
  }

  if (isDomainSnoozed(normalizedUrl)) {
    logger.debug('[AUTO-SYNC] Skipping add-tab suggestion - domain is snoozed', {
      tabId,
      normalizedUrl,
    });
    return;
  }

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

async function hasSyncedTabMatchingUrl(normalizedUrl: string): Promise<boolean> {
  const results = await Promise.allSettled(
    syncState.linkedTabs.map(async (tabId) => {
      const tab = await browser.tabs.get(tabId);
      return tab.url ? normalizeUrlForAutoSync(tab.url) === normalizedUrl : false;
    }),
  );
  return results.some((r) => r.status === 'fulfilled' && r.value);
}
