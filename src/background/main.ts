import browser from 'webextension-polyfill';

import { ExtensionLogger } from '~/shared/lib/logger';

import {
  registerAutoSyncHandlers,
  registerConnectionHandlers,
  registerScrollSyncHandlers,
  registerTabEventHandlers,
} from './handlers';
import { initializeAutoSync } from './lib/auto-sync-lifecycle';
import { manualSyncOverriddenTabs } from './lib/auto-sync-state';
import { startKeepAlive } from './lib/keep-alive';
import { syncState, restoreSyncState } from './lib/sync-state';

const logger = new ExtensionLogger({ scope: 'background' });

// CRITICAL ordering: initializeAutoSync must run AFTER restoreSyncState completes.
// manualSyncOverriddenTabs (in-memory Set) is lost on service worker restart —
// without restoring it first, synced tabs get re-added to auto-sync groups.
restoreSyncState().then(() => {
  if (syncState.isActive) {
    startKeepAlive();

    for (const tabId of syncState.linkedTabs) {
      manualSyncOverriddenTabs.add(tabId);
    }
    logger.info('Restored manualSyncOverriddenTabs from persisted sync state', {
      tabIds: syncState.linkedTabs,
    });
  }

  initializeAutoSync();
});

// only on dev mode
if (import.meta.hot) {
  // @ts-expect-error for background HMR
  // eslint-disable-next-line import/no-unresolved
  import('/@vite/client');
  // load latest content script
  import('./content-script-hmr');
}

browser.runtime.onInstalled.addListener((): void => {
  logger.info('Extension installed');
});

// Register all message handlers and event listeners
logger.info('Background script loaded, registering message handlers');

registerScrollSyncHandlers();
registerConnectionHandlers();
registerAutoSyncHandlers();
registerTabEventHandlers();

logger.info('All handlers registered successfully');
