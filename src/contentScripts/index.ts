import { createRoot } from 'react-dom/client';
import { onMessage } from 'webext-bridge/content-script';
import browser from 'webextension-polyfill';

import '~/shared/styles';
import { renderApp } from './render';

// Firefox `browser.tabs.executeScript()` requires scripts return a primitive value
(() => {
  console.info('[dynamic-scrollbar-webext] Hello world from content script');

  // communication example: send previous tab title from background page
  onMessage('tab-prev', ({ data }) => {
    console.log(`[dynamic-scrollbar-webext] Navigate from page "${data.title}"`);
  });

  // mount component to context window
  const container = document.createElement('div');
  container.id = __NAME__;
  container.style.setProperty('z-index', '2147483647', 'important');
  container.style.setProperty('position', 'relative', 'important');
  container.style.setProperty('color-scheme', 'normal', 'important');
  const root = document.createElement('div');
  const styleEl = document.createElement('link');
  const shadowDOM = container.attachShadow?.({ mode: __DEV__ ? 'open' : 'closed' }) || container;
  styleEl.setAttribute('rel', 'stylesheet');
  styleEl.setAttribute('href', browser.runtime.getURL('dist/contentScripts/style.css'));
  shadowDOM.appendChild(styleEl);
  shadowDOM.appendChild(root);
  document.body.appendChild(container);
  const appRoot = createRoot(root);
  renderApp({ root: appRoot });
})();
