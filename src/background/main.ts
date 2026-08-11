import browser from 'webextension-polyfill';

import { ExtensionLogger } from '~/shared/lib/logger';

import {
  registerAutoSyncHandlers,
  registerConnectionHandlers,
  registerScrollSyncHandlers,
  registerTabEventHandlers,
} from './handlers';
import { initializeBackground } from './lib/background-initialization';

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

registerScrollSyncHandlers();
registerConnectionHandlers();
registerAutoSyncHandlers();
registerTabEventHandlers();

logger.info('All handlers registered successfully');

void initializeBackground();
