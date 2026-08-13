import browser from 'webextension-polyfill';

import { ExtensionLogger } from '~/shared/lib/logger';

import {
  registerAutoSyncHandlers,
  registerConnectionHandlers,
  registerQuickSyncCommandHandler,
  registerScrollSyncHandlers,
  registerTabEventHandlers,
} from './handlers';
import { initializeBackground } from './lib/background-initialization';
import { recentQuickSyncOutcomeStore } from './lib/quick-sync-feedback';

const logger = new ExtensionLogger({ scope: 'background' });

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

registerQuickSyncCommandHandler();
registerScrollSyncHandlers();
registerConnectionHandlers({
  getRecentQuickSyncOutcome: recentQuickSyncOutcomeStore.read,
  now: Date.now,
});
registerAutoSyncHandlers();
registerTabEventHandlers();

logger.info('All handlers registered successfully');

void initializeBackground();
