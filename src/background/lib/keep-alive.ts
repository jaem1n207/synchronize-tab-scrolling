import { ExtensionLogger } from '~/shared/lib/logger';

import { isContentScriptAlive, reinjectContentScript } from './content-script-manager';
import { persistSyncState, syncState } from './sync-state';

const logger = new ExtensionLogger({ scope: 'keep-alive' });

const KEEP_ALIVE_INTERVAL_MS = 25000;

const keepAliveState = {
  interval: null as ReturnType<typeof setInterval> | null,
};

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
    const isAlive = await isContentScriptAlive(tabId);

    if (!isAlive && syncState.connectionStatuses[tabId] === 'connected') {
      logger.warn(`Tab ${tabId} lost connection during keep-alive check, attempting recovery`);

      const success = await reinjectContentScript(tabId);
      if (!success) {
        logger.error(`Failed to recover tab ${tabId} during keep-alive check`);
        syncState.connectionStatuses[tabId] = 'error';
        await persistSyncState();
      }
    }
  }
}
