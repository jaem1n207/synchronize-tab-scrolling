import { useState, useCallback, useEffect } from 'react';

import { createRoot } from 'react-dom/client';
import browser from 'webextension-polyfill';

import { loadUrlSyncEnabled, saveUrlSyncEnabled } from '~/shared/lib/storage';

import { SyncControlPanel } from './components';

function PanelApp() {
  const [urlSyncEnabled, setUrlSyncEnabled] = useState(true);

  useEffect(() => {
    // Load URL sync state
    loadUrlSyncEnabled().then(setUrlSyncEnabled).catch(console.error);
  }, []);

  const handleToggleUrlSync = useCallback(() => {
    setUrlSyncEnabled((prev) => {
      const newValue = !prev;
      saveUrlSyncEnabled(newValue);
      return newValue;
    });
  }, []);

  return <SyncControlPanel urlSyncEnabled={urlSyncEnabled} onToggle={handleToggleUrlSync} />;
}

let panelRoot: ReturnType<typeof createRoot> | null = null;
let panelContainer: HTMLDivElement | null = null;

export function showPanel() {
  if (panelContainer) {
    panelContainer.style.display = 'block';
    return;
  }

  // Create root container following Vercel toolbar pattern
  panelContainer = document.createElement('div');
  panelContainer.id = 'scroll-sync-panel-root';
  panelContainer.className = 'tailwind tailwind-no-preflight';
  panelContainer.setAttribute('style', 'all: revert;');

  // Append to body
  document.body.appendChild(panelContainer);

  // Create shadow DOM for style isolation
  const shadowRoot = panelContainer.attachShadow({ mode: 'open' });

  // Create theme wrapper with minimal fixed positioning context
  const themeWrapper = document.createElement('div');
  themeWrapper.className = 'dark-theme';
  themeWrapper.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    pointer-events: none;
    z-index: 2147483647;
  `;
  shadowRoot.appendChild(themeWrapper);

  // Create content wrapper
  const contentWrapper = document.createElement('div');
  contentWrapper.setAttribute('style', 'position: relative; pointer-events: auto;');
  themeWrapper.appendChild(contentWrapper);

  // Create style container
  const styleContainer = document.createElement('div');
  contentWrapper.appendChild(styleContainer);

  // Create app container
  const appContainer = document.createElement('div');
  appContainer.id = 'scroll-sync-app';
  contentWrapper.appendChild(appContainer);

  // Inject extension CSS into shadow DOM
  const extensionStyleLink = document.createElement('link');
  extensionStyleLink.rel = 'stylesheet';
  extensionStyleLink.href = browser.runtime.getURL(
    'dist/contentScripts/synchronize-tab-scrolling.css',
  );
  styleContainer.appendChild(extensionStyleLink);

  // Add critical base styles for Shadow DOM
  // UnoCSS uses @property with inherits:false for opacity variables,
  // which don't inherit into Shadow DOM. We need to explicitly set them.
  const baseStyle = document.createElement('style');
  baseStyle.textContent = `
    :host {
      all: initial;
      display: block;
    }

    *, *::before, *::after, ::backdrop {
      box-sizing: border-box;
      --un-text-opacity: 100%;
      --un-bg-opacity: 100%;
      --un-border-opacity: 100%;
      --un-ring-opacity: 100%;
      --un-ring-offset-opacity: 100%;
    }
  `;
  styleContainer.appendChild(baseStyle);

  // Create React root and render
  panelRoot = createRoot(appContainer);
  panelRoot.render(<PanelApp />);
}

export function hidePanel() {
  if (panelContainer) {
    panelContainer.style.display = 'none';
  }
}

export function destroyPanel() {
  if (panelRoot) {
    panelRoot.unmount();
    panelRoot = null;
  }

  if (panelContainer) {
    panelContainer.remove();
    panelContainer = null;
  }
}
