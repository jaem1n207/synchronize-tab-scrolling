import { useState, useCallback, useEffect } from 'react';

import { createRoot } from 'react-dom/client';
import { onMessage, sendMessage } from 'webext-bridge/content-script';
import browser from 'webextension-polyfill';

import { DraggableControlPanel } from '~/popup/components/DraggableControlPanel';
import { LinkedSitesPanel } from '~/popup/components/LinkedSitesPanel';
import { loadPanelMinimized, savePanelMinimized } from '~/shared/lib/storage';

import type { TabInfo, ConnectionStatus } from '~/popup/types';

import '@unocss/reset/tailwind.css';
// eslint-disable-next-line import/no-unresolved
import 'virtual:uno.css';

function PanelApp() {
  const [isMinimized, setIsMinimized] = useState(false);
  const [linkedTabs, setLinkedTabs] = useState<Array<TabInfo>>([]);
  const [connectionStatuses, setConnectionStatuses] = useState<Record<number, ConnectionStatus>>(
    {},
  );
  const [currentTabId, setCurrentTabId] = useState<number>();

  useEffect(() => {
    // Load minimized state
    loadPanelMinimized().then(setIsMinimized).catch(console.error);
  }, []);

  const handleToggleMinimize = useCallback(() => {
    setIsMinimized((prev) => {
      const newValue = !prev;
      savePanelMinimized(newValue);
      return newValue;
    });
  }, []);

  const handleSwitchToTab = useCallback(async (tabId: number) => {
    try {
      await browser.tabs.update(tabId, { active: true });
    } catch (error) {
      console.error('Failed to switch to tab:', error);
    }
  }, []);

  useEffect(() => {
    // Listen for sync status updates from background
    const unsubscribe = onMessage('sync:status', ({ data }) => {
      // Type guard to validate payload structure
      if (
        typeof data === 'object' &&
        data !== null &&
        'linkedTabs' in data &&
        'connectionStatuses' in data &&
        'currentTabId' in data
      ) {
        const payload = data as unknown as {
          linkedTabs: Array<TabInfo>;
          connectionStatuses: Record<number, ConnectionStatus>;
          currentTabId: number;
        };

        setLinkedTabs(payload.linkedTabs);
        setConnectionStatuses(payload.connectionStatuses);
        setCurrentTabId(payload.currentTabId);
      }
    });

    // Request initial sync status
    sendMessage('sync:get-status', {}, 'background').catch(console.error);

    return unsubscribe;
  }, []);

  return (
    <DraggableControlPanel isMinimized={isMinimized} onToggleMinimize={handleToggleMinimize}>
      <LinkedSitesPanel
        connectionStatuses={connectionStatuses}
        currentTabId={currentTabId}
        linkedTabs={linkedTabs}
        onSwitchToTab={handleSwitchToTab}
      />
    </DraggableControlPanel>
  );
}

let panelRoot: ReturnType<typeof createRoot> | null = null;
let panelContainer: HTMLDivElement | null = null;

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
