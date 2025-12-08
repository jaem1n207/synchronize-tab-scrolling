import { ExtensionLogger } from '~/shared/lib/logger';
import { initializeSentry } from '~/shared/lib/sentry_init';

import '~/shared/styles';
import { initScrollSync } from './scrollSync';

// Firefox `browser.tabs.executeScript()` requires scripts return a primitive value
(() => {
  // Sentry 초기화
  initializeSentry();

  const logger = new ExtensionLogger({ scope: 'content-script' });
  logger.info('🔷 [CONTENT] Content script loaded', {
    url: window.location.href.substring(0, 80),
    readyState: document.readyState,
    timestamp: new Date().toISOString(),
  });

  // Initialize scroll synchronization system
  logger.info('🔷 [CONTENT] Calling initScrollSync()...');
  initScrollSync();
  logger.info('🔷 [CONTENT] initScrollSync() completed - handlers registered');

  // Note: Keyboard handler requires tab ID which will be provided when sync starts
  // Cannot use browser.tabs.getCurrent() in content scripts due to Chrome restrictions
})();
