import { ExtensionLogger } from '~/shared/lib/logger';

import { isContentScriptAlive, reinjectContentScript } from './content-script-manager';
import { persistCommittedSyncStateLegacy, syncState } from './sync-state';

const logger = new ExtensionLogger({ scope: 'keep-alive' });

const KEEP_ALIVE_INTERVAL_MS = 25000;

const keepAliveState = {
  interval: null as ReturnType<typeof setInterval> | null,
};

interface ManualHealthSnapshot {
  tabId: number;
  linkedTabIds: Array<number>;
  mode: 'ratio' | 'element';
  sessionEpoch: number;
}

function captureManualHealth(tabId: number): ManualHealthSnapshot | null {
  if (!syncState.isActive || !syncState.linkedTabs.includes(tabId)) {
    return null;
  }

  return {
    tabId,
    linkedTabIds: [...syncState.linkedTabs],
    mode: syncState.mode || 'ratio',
    sessionEpoch: syncState.sessionEpoch,
  };
}

function isCurrentManualHealth(snapshot: ManualHealthSnapshot): boolean {
  return (
    syncState.isActive &&
    syncState.sessionEpoch === snapshot.sessionEpoch &&
    syncState.linkedTabs.includes(snapshot.tabId) &&
    syncState.linkedTabs.length === snapshot.linkedTabIds.length &&
    snapshot.linkedTabIds.every((tabId) => syncState.linkedTabs.includes(tabId)) &&
    (syncState.mode || 'ratio') === snapshot.mode
  );
}

export function startKeepAlive(): void {
  if (keepAliveState.interval) {
    logger.debug('Keep-alive already running');
    return;
  }

  keepAliveState.interval = setInterval(async () => {
    logger.debug('Keep-alive ping', {
      syncActive: syncState.isActive,
      linkedTabs: syncState.linkedTabs.length,
    });

    if (syncState.isActive && syncState.linkedTabs.length > 0) {
      await checkAllTabsHealth();
    }
  }, KEEP_ALIVE_INTERVAL_MS);

  logger.info('Keep-alive started');
}

export function stopKeepAlive(): void {
  if (keepAliveState.interval) {
    clearInterval(keepAliveState.interval);
    keepAliveState.interval = null;
    logger.info('Keep-alive stopped');
  }
}

async function checkAllTabsHealth(): Promise<void> {
  if (!syncState.isActive) return;

  logger.debug('Checking health of all synced tabs', {
    tabCount: syncState.linkedTabs.length,
  });

  for (const tabId of syncState.linkedTabs) {
    const manualHealth = captureManualHealth(tabId);
    if (!manualHealth) {
      continue;
    }
    const isAlive = await isContentScriptAlive(tabId);
    if (!isCurrentManualHealth(manualHealth)) {
      continue;
    }

    if (!isAlive && syncState.connectionStatuses[tabId] === 'connected') {
      logger.warn(`Tab ${tabId} lost connection during keep-alive check, attempting recovery`);

      const success = await reinjectContentScript(tabId, {
        startMessage: {
          tabIds: manualHealth.linkedTabIds,
          mode: manualHealth.mode,
          currentTabId: tabId,
          sessionEpoch: manualHealth.sessionEpoch,
        },
        isSessionCurrent: (): boolean => isCurrentManualHealth(manualHealth),
      });
      if (!isCurrentManualHealth(manualHealth)) {
        continue;
      }
      if (!success) {
        logger.error(`Failed to recover tab ${tabId} during keep-alive check`);
        syncState.connectionStatuses[tabId] = 'error';
        await persistCommittedSyncStateLegacy();
      }
    }
  }
}
