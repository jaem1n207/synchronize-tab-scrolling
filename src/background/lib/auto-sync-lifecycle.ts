import { sendMessage } from 'webext-bridge/background';
import browser from 'webextension-polyfill';

import { ExtensionLogger } from '~/shared/lib/logger';
import {
  loadAutoSyncEnabled,
  loadAutoSyncExcludedUrls,
  saveAutoSyncEnabled,
} from '~/shared/lib/storage';

import {
  autoSyncState,
  autoSyncRetryTimers,
  dismissedUrlGroups,
  pendingSuggestions,
  autoSyncFlags,
} from './auto-sync-state';
import {
  updateAutoSyncGroup,
  stopAutoSyncForGroup,
  broadcastAutoSyncGroupUpdate,
} from './auto-sync-groups';
import { showSyncSuggestion } from './auto-sync-suggestions';

const logger = new ExtensionLogger({ scope: 'background/auto-sync-lifecycle' });

/**
 * Initialize auto-sync state from storage and scan existing tabs
 */
export async function initializeAutoSync(overrideEnabled?: boolean): Promise<void> {
  if (autoSyncFlags.isInitializing) {
    logger.info('[AUTO-SYNC] initializeAutoSync skipped - already initializing');
    return;
  }

  autoSyncFlags.isInitializing = true;

  try {
    logger.info('[AUTO-SYNC] Initializing auto-sync...');

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

    const tabs = await browser.tabs.query({});
    logger.info('[AUTO-SYNC] Scanning tabs', { tabCount: tabs.length });

    for (const tab of tabs) {
      if (tab.id && tab.url) {
        logger.info('[AUTO-SYNC] Processing tab', { tabId: tab.id, url: tab.url });
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

        for (const result of injectionResults) {
          if (result.status === 'fulfilled' && !result.value.success) {
            group.tabIds.delete(result.value.tabId);
            logger.info('[AUTO-SYNC] Removed tab from group due to injection failure', {
              tabId: result.value.tabId,
              normalizedUrl,
            });
          }
        }

        if (group.tabIds.size < 2) {
          autoSyncState.groups.delete(normalizedUrl);
          logger.info('[AUTO-SYNC] Deleted group due to insufficient tabs after injection', {
            normalizedUrl,
          });
        }
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 100));

    for (const [normalizedUrl, group] of autoSyncState.groups.entries()) {
      if (group.tabIds.size >= 2 && !group.isActive) {
        logger.info('[AUTO-SYNC] Scheduling suggestion for group during init', {
          normalizedUrl,
          tabIds: Array.from(group.tabIds),
        });
        if (!pendingSuggestions.has(normalizedUrl) && !dismissedUrlGroups.has(normalizedUrl)) {
          await showSyncSuggestion(normalizedUrl);
        }
      }
    }

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
    autoSyncFlags.isInitializing = false;
  }
}

/**
 * Toggle auto-sync enabled state
 * Uses simple queue-based approach: if toggle is in progress, queue request and process after completion
 */
export async function toggleAutoSync(enabled: boolean): Promise<void> {
  if (autoSyncFlags.isToggling) {
    logger.info('[AUTO-SYNC] toggleAutoSync queuing request (toggle in progress)', { enabled });
    autoSyncFlags.pendingToggleRequest = enabled;
    return;
  }

  if (autoSyncFlags.isInitializing) {
    logger.info('[AUTO-SYNC] toggleAutoSync waiting for initialization to complete', { enabled });
    const maxWait = 10000;
    const pollInterval = 100;
    let waited = 0;
    while (autoSyncFlags.isInitializing && waited < maxWait) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
      waited += pollInterval;
    }
    if (autoSyncFlags.isInitializing) {
      logger.warn('[AUTO-SYNC] toggleAutoSync timed out waiting for initialization');
    }
  }

  if (autoSyncState.enabled === enabled) {
    logger.info('[AUTO-SYNC] toggleAutoSync skipped - state unchanged', { enabled });
    return;
  }

  autoSyncFlags.isToggling = true;
  logger.info('[AUTO-SYNC] toggleAutoSync called', {
    enabled,
    previousState: autoSyncState.enabled,
  });

  try {
    autoSyncState.enabled = enabled;
    await saveAutoSyncEnabled(enabled);

    if (enabled) {
      logger.info('[AUTO-SYNC] Enabling - clearing stale state before initialization');
      autoSyncState.groups.clear();

      dismissedUrlGroups.clear();
      pendingSuggestions.clear();

      for (const timer of autoSyncRetryTimers.values()) {
        clearTimeout(timer);
      }
      autoSyncRetryTimers.clear();

      await new Promise((resolve) => setTimeout(resolve, 100));

      logger.info('[AUTO-SYNC] Enabling - calling initializeAutoSync');
      await initializeAutoSync(true);
    } else {
      logger.info('[AUTO-SYNC] Disabling - clearing retry timers', {
        timerCount: autoSyncRetryTimers.size,
      });
      for (const timer of autoSyncRetryTimers.values()) {
        clearTimeout(timer);
      }
      autoSyncRetryTimers.clear();

      dismissedUrlGroups.clear();
      pendingSuggestions.clear();

      logger.info('[AUTO-SYNC] Stopping all active groups', {
        groupCount: autoSyncState.groups.size,
      });
      for (const [normalizedUrl, group] of autoSyncState.groups.entries()) {
        if (group.isActive) {
          await stopAutoSyncForGroup(normalizedUrl);
        }
      }
      autoSyncState.groups.clear();
      logger.info('[AUTO-SYNC] All groups cleared');
    }

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
    autoSyncFlags.isToggling = false;

    if (autoSyncFlags.pendingToggleRequest !== null) {
      const queuedState = autoSyncFlags.pendingToggleRequest;
      autoSyncFlags.pendingToggleRequest = null;
      logger.info('[AUTO-SYNC] Processing queued toggle request', { enabled: queuedState });
      void toggleAutoSync(queuedState);
    }
  }
}
