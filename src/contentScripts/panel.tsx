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
let manualModeIndicator: HTMLDivElement | null = null;

export function showPanel() {
  if (panelContainer) {
    panelContainer.style.display = 'block';
    return;
  }

  // Create container with highest z-index and pointer events enabled for panel interaction
  panelContainer = document.createElement('div');
  panelContainer.id = 'scroll-sync-panel-root';
  panelContainer.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 2147483647;
  `;

  // Append to body
  document.body.appendChild(panelContainer);

  // Create shadow DOM for style isolation
  const shadowRoot = panelContainer.attachShadow({ mode: 'open' });

  // Create manual mode visual indicator
  manualModeIndicator = document.createElement('div');
  manualModeIndicator.id = 'manual-mode-indicator';
  manualModeIndicator.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    pointer-events: none;
    border: 4px solid #3b82f6;
    box-shadow: inset 0 0 30px rgba(59, 130, 246, 0.3), 0 0 20px rgba(59, 130, 246, 0.2);
    opacity: 0;
    transition: opacity 0.2s ease-in-out;
    z-index: 2147483646;
  `;
  shadowRoot.appendChild(manualModeIndicator);

  // Create style container
  const styleContainer = document.createElement('div');
  shadowRoot.appendChild(styleContainer);

  // Create app container - enable pointer events for the panel itself
  const appContainer = document.createElement('div');
  appContainer.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  `;
  appContainer.id = 'scroll-sync-app';
  shadowRoot.appendChild(appContainer);

  // Inject styles into shadow DOM
  Array.from(document.querySelectorAll('style, link[rel="stylesheet"]')).forEach((el) => {
    const cloned = el.cloneNode(true);
    styleContainer.appendChild(cloned);
  });

  // Create React root and render
  panelRoot = createRoot(appContainer);
  panelRoot.render(<PanelApp />);

  // Monitor for manual mode class changes
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        const hasManualMode = document.documentElement.classList.contains('scroll-sync-manual-mode');
        if (manualModeIndicator) {
          manualModeIndicator.style.opacity = hasManualMode ? '1' : '0';
        }
      }
    });
  });

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });
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
