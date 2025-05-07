import { onMessage, sendMessage } from 'webext-bridge/background';
import browser from 'webextension-polyfill';


import type { Tabs } from 'webextension-polyfill';
import { ExtensionLogger } from '~/shared/lib/logger';
import { initializeSentry } from '~/shared/lib/sentry_init';

// Sentry 초기화
initializeSentry();

// only on dev mode
if (import.meta.hot) {
  // @ts-expect-error for background HMR
  import('/@vite/client');
  // load latest content script
  import('./contentScriptHMR');
}

browser.runtime.onInstalled.addListener((): void => {
  const logger = new ExtensionLogger({ scope: 'background-onInstalled' });
  logger.info('Extension installed');
});

browser.action.onClicked.addListener(() => {
  browser.runtime.openOptionsPage();
});

let previousTabId = 0;

// communication example: send previous tab title from background page
// see shim.d.ts for type declaration
browser.tabs.onActivated.addListener(async ({ tabId }) => {
  if (!previousTabId) {
    previousTabId = tabId;
    return;
  }

  let tab: Tabs.Tab;

  try {
    tab = await browser.tabs.get(previousTabId);
    previousTabId = tabId;
  } catch (error) {
    const logger = new ExtensionLogger({ scope: 'background-tabs-onActivated' });
    logger.error('Failed to get previous tab', error);
    return;
  }

  const logger = new ExtensionLogger({ scope: 'background-tabs-onActivated' });
  logger.info('previous tab', { title: tab.title });
  sendMessage('tab-prev', { title: tab.title }, { context: 'content-script', tabId });
});

onMessage('get-current-tab', async () => {
  const logger = new ExtensionLogger({ scope: 'background-onMessage-get-current-tab' });
  try {
    const tab = await browser.tabs.get(previousTabId);
    return {
      title: tab?.title,
    };
  } catch (error) {
    logger.error('Failed to get current tab', error);
    return {
      title: undefined,
    };
  }
});
