import { useState, useCallback, useEffect } from 'react';

import { createRoot } from 'react-dom/client';

import { loadUrlSyncEnabled, saveUrlSyncEnabled } from '~/shared/lib/storage';

import { SyncControlPanel } from './components';

import '@unocss/reset/tailwind.css';
// eslint-disable-next-line import/no-unresolved
import 'virtual:uno.css';

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

  // Function to inject styles into shadow DOM
  const injectStyles = () => {
    // Clear existing styles
    styleContainer.innerHTML = '';

    // Clone all style tags and link elements
    Array.from(document.querySelectorAll('style, link[rel="stylesheet"]')).forEach((el) => {
      const cloned = el.cloneNode(true) as HTMLElement;
      styleContainer.appendChild(cloned);
    });

    // Add critical base styles for Shadow DOM
    const baseStyle = document.createElement('style');
    baseStyle.textContent = `
      :host {
        all: initial;
        display: block;
      }

      * {
        box-sizing: border-box;
      }

      /* Ensure high z-index for overlays */
      .geist-overlay {
        z-index: 100000000001;
      }

      .geist-overlay-backdrop {
        z-index: 10000000000;
        pointer-events: auto;
      }
    `;
    styleContainer.appendChild(baseStyle);
  };

  // Inject styles immediately
  injectStyles();

  // Re-inject styles after a short delay to catch any late-loaded styles
  setTimeout(injectStyles, 100);
  setTimeout(injectStyles, 500);

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
