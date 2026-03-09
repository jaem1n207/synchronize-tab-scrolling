import browser from 'webextension-polyfill';

import { ExtensionLogger } from '~/shared/lib/logger';

import {
  registerAutoSyncHandlers,
  registerConnectionHandlers,
  registerScrollSyncHandlers,
  registerTabEventHandlers,
} from './handlers';
import { initializeAutoSync } from './lib/auto-sync-lifecycle';
import { startKeepAlive } from './lib/keep-alive';
import { syncState, restoreSyncState } from './lib/sync-state';

const logger = new ExtensionLogger({ scope: 'background' });

// Restore state on service worker startup (also starts keep-alive if sync was active)
restoreSyncState().then(() => {
  if (syncState.isActive) {
    startKeepAlive();
  }
});

// Initialize auto-sync on service worker startup
initializeAutoSync();

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
