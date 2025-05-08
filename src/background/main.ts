import { captureException, startInactiveSpan, startSpan } from '@sentry/react';
import { onMessage, sendMessage } from 'webext-bridge/background';
import browser, { type Tabs } from 'webextension-polyfill';

import { ExtensionLogger } from '~/shared/lib/logger';
import { initializeSentry } from '~/shared/lib/sentry_init';

import type { Span } from '@sentry/react';

// Sentry 초기화
initializeSentry();

const logger = new ExtensionLogger({ scope: 'background' });

// only on dev mode
if (import.meta.hot) {
  // @ts-expect-error for background HMR
  // eslint-disable-next-line import/no-unresolved
  import('/@vite/client');
  // load latest content script
  import('./contentScriptHMR');
}

browser.runtime.onInstalled.addListener((): void => {
  logger.info('Extension installed');
});

browser.action.onClicked.addListener(() => {
  browser.runtime.openOptionsPage();
});

let previousTabId = 0;

browser.tabs.onActivated.addListener(async ({ tabId }) => {
  startSpan(
    {
      name: 'Tab Activated',
      op: 'ui.action',
      attributes: { tabId },
    },
    async (span: Span | undefined) => {
      if (!span) {
        logger.error('Failed to create Sentry span for Tab Activated');
        return;
      }

      const getTabSpan = startInactiveSpan({
        name: 'browser.tabs.get',
        op: 'browser.api.call',
      });

      if (!previousTabId) {
        previousTabId = tabId;
        getTabSpan.setAttribute('action', 'set_initial_previousTabId');
        getTabSpan.end();
        return;
      }

      let tab: Tabs.Tab | undefined;

      try {
        tab = await browser.tabs.get(previousTabId);
        previousTabId = tabId;
        if (tab) {
          getTabSpan.setAttribute('tab.id', tab.id);
          getTabSpan.setAttribute('tab.title', tab.title);
          span.setAttribute('previousTab.id', tab.id);
          span.setAttribute('previousTab.title', tab.title);
        }
        getTabSpan.setStatus({ code: 1 });
      } catch (error) {
        logger.error('Failed to get previous tab', error);
        captureException(error, { tags: { scope: 'background-tabs-onActivated-getTab' } });
        getTabSpan.setStatus({ code: 2, message: 'internal_error' });
        if (error instanceof Error) {
          getTabSpan.setAttribute('error.message', error.message);
        }
        span.setStatus({ code: 2, message: 'internal_error' });
      } finally {
        getTabSpan.end();
      }

      if (tab && tab.title) {
        logger.info('previous tab', { title: tab.title });
        const sendMessageSpan = startInactiveSpan({
          name: 'sendMessage: tab-prev',
          op: 'message.send',
        });
        try {
          await sendMessage('tab-prev', { title: tab.title }, { context: 'content-script', tabId });
          sendMessageSpan.setStatus({ code: 1 });
        } catch (e) {
          sendMessageSpan.setStatus({ code: 2, message: 'internal_error' });
          logger.error('Failed to send message', e);
          captureException(e, { tags: { scope: 'background-tabs-onActivated-sendMessage' } });
          span.setStatus({ code: 2, message: 'internal_error' });
        } finally {
          sendMessageSpan.end();
        }
      }
    },
  );
});

onMessage('get-current-tab', async () => {
  return startSpan(
    { name: 'Get Current Tab', op: 'message.handler' },
    async (span: Span | undefined) => {
      try {
        const tab = await browser.tabs.get(previousTabId);
        if (tab) {
          span?.setAttribute('tab.id', tab.id);
          span?.setAttribute('tab.title', tab.title);
        }
        span?.setStatus({ code: 1 });
        return {
          title: tab?.title,
        };
      } catch (error) {
        logger.error('Failed to get current tab', error);
        captureException(error, { tags: { scope: 'background-onMessage-get-current-tab' } });
        span?.setStatus({ code: 2, message: 'internal_error' });
        if (error instanceof Error && span) {
          span.setAttribute('error.message', error.message);
        }
        return {
          title: undefined,
        };
      }
    },
  );
});
