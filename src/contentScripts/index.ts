import * as Sentry from '@sentry/react';
import { createRoot } from 'react-dom/client';
import { onMessage } from 'webext-bridge/content-script';
import browser from 'webextension-polyfill';

import { ExtensionLogger } from '~/shared/lib/logger';
import { initializeSentry } from '~/shared/lib/sentry_init';

import '~/shared/styles';
import { renderApp } from './render';
import { initScrollSync } from './scrollSync';

// Firefox `browser.tabs.executeScript()` requires scripts return a primitive value
(() => {
  // Sentry 초기화
  initializeSentry();

  const logger = new ExtensionLogger({ scope: 'content-script' });
  logger.info('[scroll-sync] Content script loaded');
  console.log('[content-script] Content script loaded', { url: window.location.href });

  // Initialize scroll synchronization system
  console.log('[content-script] Initializing scroll sync');
  initScrollSync();
  console.log('[content-script] Scroll sync initialized');

  // Note: Keyboard handler requires tab ID which will be provided when sync starts
  // Cannot use browser.tabs.getCurrent() in content scripts due to Chrome restrictions

  // communication example: send previous tab title from background page
  onMessage('tab-prev', ({ data }) => {
    logger.info(`[scroll-sync] Navigate from page "${data.title}"`, { data });
  });

  // mount component to context window
  try {
    const container = document.createElement('div');
    container.id = __NAME__;
    container.style.setProperty('z-index', '2147483647', 'important');
    container.style.setProperty('position', 'relative', 'important');
    container.style.setProperty('color-scheme', 'normal', 'important');
    const rootElement = document.createElement('div');
    const styleEl = document.createElement('link');
    const shadowDOM = container.attachShadow?.({ mode: __DEV__ ? 'open' : 'closed' }) || container;
    styleEl.setAttribute('rel', 'stylesheet');
    styleEl.setAttribute(
      'href',
      browser.runtime.getURL('dist/contentScripts/synchronize-tab-scrolling.css'),
    );
    shadowDOM.appendChild(styleEl);
    shadowDOM.appendChild(rootElement);
    document.body.appendChild(container);

    const appRoot = createRoot(rootElement, {
      onUncaughtError: Sentry.reactErrorHandler((error, errorInfo) => {
        logger.error('React uncaught error', { error, componentStack: errorInfo?.componentStack });
      }),
      onCaughtError: Sentry.reactErrorHandler((error, errorInfo) => {
        logger.warn('React caught error (in ErrorBoundary)', {
          error,
          componentStack: errorInfo?.componentStack,
        });
      }),
      onRecoverableError: Sentry.reactErrorHandler((error, errorInfo) => {
        logger.warn('React recoverable error', {
          error,
          componentStack: errorInfo?.componentStack,
        });
      }),
    });

    renderApp({ root: appRoot });
  } catch (error) {
    logger.error('Failed to mount content script UI', error);
  }
})();
