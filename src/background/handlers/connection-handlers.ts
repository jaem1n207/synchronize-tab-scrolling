import { onMessage } from 'webext-bridge/background';
import browser from 'webextension-polyfill';

import { ExtensionLogger } from '~/shared/lib/logger';
import type { StartSyncContentMessage } from '~/shared/types/messages';

import {
  removeTabFromAllAutoSyncGroups,
  getAutoSyncGroupMembers,
  isTabInActiveAutoSyncGroup,
} from '../lib/auto-sync-groups';
import { waitForBackgroundInitialization } from '../lib/background-initialization';
import { reinjectContentScript } from '../lib/content-script-manager';
import { sendMessageWithTimeout } from '../lib/messaging';
import { syncState, persistCommittedSyncStateLegacy, broadcastSyncStatus } from '../lib/sync-state';

import type { ReinjectionContext } from '../lib/content-script-manager';

const logger = new ExtensionLogger({ scope: 'background/connection-handlers' });

interface ManualRecoverySnapshot {
  tabId: number;
  sessionEpoch: number;
  linkedTabIds: Array<number>;
  mode: 'ratio' | 'element';
}

interface AutoRecoverySnapshot {
  tabId: number;
  groupTabIds: Array<number>;
  mode: 'ratio';
}

function captureManualRecovery(tabId: number): ManualRecoverySnapshot | null {
  if (!syncState.isActive || !syncState.linkedTabs.includes(tabId)) {
    return null;
  }

  return {
    tabId,
    sessionEpoch: syncState.sessionEpoch,
    linkedTabIds: [...syncState.linkedTabs],
    mode: syncState.mode || 'ratio',
  };
}

function isCurrentManualRecovery(snapshot: ManualRecoverySnapshot): boolean {
  return (
    syncState.isActive &&
    syncState.sessionEpoch === snapshot.sessionEpoch &&
    syncState.linkedTabs.includes(snapshot.tabId) &&
    haveSameTabIds(snapshot.linkedTabIds, syncState.linkedTabs) &&
    (syncState.mode || 'ratio') === snapshot.mode
  );
}

function getCurrentAutoGroupTabIds(tabId: number): Array<number> {
  return [...new Set([...getAutoSyncGroupMembers(tabId), tabId])];
}

function captureAutoRecovery(tabId: number): AutoRecoverySnapshot | null {
  if (!isTabInActiveAutoSyncGroup(tabId)) {
    return null;
  }

  return {
    tabId,
    groupTabIds: getCurrentAutoGroupTabIds(tabId),
    mode: 'ratio',
  };
}

function haveSameTabIds(left: ReadonlyArray<number>, right: ReadonlyArray<number>): boolean {
  return left.length === right.length && left.every((tabId) => right.includes(tabId));
}

function isCurrentAutoRecovery(snapshot: AutoRecoverySnapshot): boolean {
  return (
    isTabInActiveAutoSyncGroup(snapshot.tabId) &&
    haveSameTabIds(snapshot.groupTabIds, getCurrentAutoGroupTabIds(snapshot.tabId))
  );
}

export function registerConnectionHandlers(): void {
  onMessage('sync:get-status', async ({ sender }) => {
    const senderTabId = sender.tabId;
    const readiness = await waitForBackgroundInitialization();
    if (readiness.manual.status !== 'ready') {
      return {
        success: false,
        reason: 'session-state-unavailable',
        isActive: false,
        linkedTabs: [],
        connectionStatuses: {},
      };
    }

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
      currentTabId: senderTabId,
    };
  });

  onMessage('scroll:ping', async ({ data }) => {
    const payload = data;
    logger.debug('Received connection health ping', { tabId: payload.tabId });

    return { success: true, timestamp: Date.now(), tabId: payload.tabId };
  });

  onMessage('scroll:reconnect', async ({ data }) => {
    const payload = { tabId: data.tabId };
    const readiness = await waitForBackgroundInitialization();
    if (readiness.manual.status !== 'ready') {
      return { success: false, reason: 'session-state-unavailable' };
    }

    logger.info('Received reconnection request from content script', { tabId: payload.tabId });

    const manualRecovery = captureManualRecovery(payload.tabId);
    const autoRecovery = captureAutoRecovery(payload.tabId);

    if (!manualRecovery && !autoRecovery) {
      logger.debug('Tab not in any active sync, ignoring reconnection request', {
        tabId: payload.tabId,
        manualSyncActive: syncState.isActive,
        linkedTabs: syncState.linkedTabs,
        isInAutoSync: false,
      });
      return { success: false, reason: 'Sync not active' };
    }

    const isCapturedRecoveryCurrent = (): boolean =>
      manualRecovery
        ? isCurrentManualRecovery(manualRecovery)
        : autoRecovery !== null && isCurrentAutoRecovery(autoRecovery);

    try {
      await browser.tabs.get(payload.tabId);
      if (!isCapturedRecoveryCurrent()) {
        return { success: false, reason: 'stale-session' };
      }
      logger.debug('Tab verified for reconnection', { tabId: payload.tabId });
    } catch (error) {
      logger.error('Tab no longer exists, removing from sync', { tabId: payload.tabId, error });
      if (!isCapturedRecoveryCurrent()) {
        return { success: false, reason: 'stale-session' };
      }
      if (manualRecovery) {
        syncState.linkedTabs = syncState.linkedTabs.filter((id) => id !== payload.tabId);
        delete syncState.connectionStatuses[payload.tabId];
        await persistCommittedSyncStateLegacy();
      }
      if (autoRecovery) {
        await removeTabFromAllAutoSyncGroups(payload.tabId);
      }
      return { success: false, reason: 'Tab no longer exists' };
    }

    try {
      let response: { success: boolean; tabId: number } | undefined;
      if (manualRecovery) {
        const startMessage = {
          tabIds: manualRecovery.linkedTabIds,
          mode: manualRecovery.mode,
          currentTabId: payload.tabId,
          isAutoSync: false,
          sessionEpoch: manualRecovery.sessionEpoch,
        } satisfies StartSyncContentMessage;
        response = await sendMessageWithTimeout<{ success: boolean; tabId: number }>(
          'scroll:start',
          startMessage,
          { context: 'content-script', tabId: payload.tabId },
          3_000,
        );
      } else {
        if (!autoRecovery) {
          return { success: false, reason: 'stale-session' };
        }
        const startMessage = {
          tabIds: autoRecovery.groupTabIds,
          mode: autoRecovery.mode,
          currentTabId: payload.tabId,
          isAutoSync: true,
        } satisfies StartSyncContentMessage;
        response = await sendMessageWithTimeout<{ success: boolean; tabId: number }>(
          'scroll:start',
          startMessage,
          { context: 'content-script', tabId: payload.tabId },
          3_000,
        );
      }

      if (!isCapturedRecoveryCurrent()) {
        return { success: false, reason: 'stale-session' };
      }
      if (response && response.success && response.tabId === payload.tabId) {
        if (manualRecovery) {
          syncState.connectionStatuses[payload.tabId] = 'connected';
          await persistCommittedSyncStateLegacy();
          if (!isCapturedRecoveryCurrent()) {
            return { success: false, reason: 'stale-session' };
          }
          await broadcastSyncStatus();
        }
        logger.info(`Tab ${payload.tabId} reconnected successfully after idle recovery`, {
          isManualSync: manualRecovery !== null,
          isAutoSync: autoRecovery !== null,
        });
        return { success: true };
      } else {
        logger.error('Invalid reconnection acknowledgment', { tabId: payload.tabId });
        if (manualRecovery) {
          syncState.connectionStatuses[payload.tabId] = 'error';
          await persistCommittedSyncStateLegacy();
        }
        return { success: false, reason: 'Invalid acknowledgment' };
      }
    } catch (error) {
      logger.error(`Failed to reconnect tab ${payload.tabId}`, { error });
      if (!isCapturedRecoveryCurrent()) {
        return { success: false, reason: 'stale-session' };
      }
      if (manualRecovery) {
        syncState.connectionStatuses[payload.tabId] = 'error';
        await persistCommittedSyncStateLegacy();
      }
      return { success: false, reason: 'Connection failed' };
    }
  });

  onMessage('scroll:request-reinject', async ({ data }) => {
    const payload = { tabId: data.tabId };
    const readiness = await waitForBackgroundInitialization();
    if (readiness.manual.status !== 'ready') {
      return { success: false, reason: 'session-state-unavailable' };
    }

    logger.info('Received content script re-inject request', { tabId: payload.tabId });

    const manualRecovery = captureManualRecovery(payload.tabId);
    const autoRecovery = manualRecovery ? null : captureAutoRecovery(payload.tabId);

    if (!manualRecovery && !autoRecovery) {
      logger.debug('Tab not in any active sync, ignoring re-inject request', {
        tabId: payload.tabId,
      });
      return { success: false, reason: 'Tab not in sync' };
    }

    let context: ReinjectionContext;
    if (manualRecovery) {
      context = {
        startMessage: {
          tabIds: manualRecovery.linkedTabIds,
          mode: manualRecovery.mode,
          currentTabId: payload.tabId,
          isAutoSync: false,
          sessionEpoch: manualRecovery.sessionEpoch,
        },
        isSessionCurrent: (): boolean => isCurrentManualRecovery(manualRecovery),
      };
    } else if (autoRecovery) {
      context = {
        startMessage: {
          tabIds: autoRecovery.groupTabIds,
          mode: autoRecovery.mode,
          currentTabId: payload.tabId,
          isAutoSync: true,
        },
        isSessionCurrent: (): boolean => isCurrentAutoRecovery(autoRecovery),
      };
    } else {
      return { success: false, reason: 'Tab not in sync' };
    }
    const success = await reinjectContentScript(payload.tabId, context);
    if (!context.isSessionCurrent()) {
      return { success: false };
    }
    if (success && manualRecovery) {
      syncState.connectionStatuses[payload.tabId] = 'connected';
      await persistCommittedSyncStateLegacy();
      if (!context.isSessionCurrent()) {
        return { success: false };
      }
      await broadcastSyncStatus();
    }
    return { success };
  });
}
