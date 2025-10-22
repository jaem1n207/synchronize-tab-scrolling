import { useState, useCallback, useEffect } from 'react';

import { createRoot } from 'react-dom/client';
import { onMessage, sendMessage } from 'webext-bridge/content-script';
import browser from 'webextension-polyfill';

import { DraggableControlPanel } from '~/popup/components/DraggableControlPanel';
import { LinkedSitesPanel } from '~/popup/components/LinkedSitesPanel';
import {
  loadPanelMinimized,
  savePanelMinimized,
  loadUrlSyncEnabled,
  saveUrlSyncEnabled,
} from '~/shared/lib/storage';

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
  const [showReconnectPrompt, setShowReconnectPrompt] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [urlSyncEnabled, setUrlSyncEnabled] = useState(true);

  useEffect(() => {
    // Load minimized state and URL sync state
    loadPanelMinimized().then(setIsMinimized).catch(console.error);
    loadUrlSyncEnabled().then(setUrlSyncEnabled).catch(console.error);
  }, []);

  const handleToggleMinimize = useCallback(() => {
    setIsMinimized((prev) => {
      const newValue = !prev;
      savePanelMinimized(newValue);
      return newValue;
    });
  }, []);

  const handleToggleUrlSync = useCallback(() => {
    setUrlSyncEnabled((prev) => {
      const newValue = !prev;
      saveUrlSyncEnabled(newValue);
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

  const handleReconnect = useCallback(async () => {
    if (!currentTabId) return;

    setIsReconnecting(true);
    try {
      // Send ping message to test connection
      const response = await sendMessage(
        'scroll:ping',
        { tabId: currentTabId, timestamp: Date.now() },
        'background',
      );

      if (response) {
        setShowReconnectPrompt(false);
        console.log('Reconnection successful');
      }
    } catch (error) {
      console.error('Reconnection failed:', error);
    } finally {
      setIsReconnecting(false);
    }
  }, [currentTabId]);

  useEffect(() => {
    // Listen for sync status updates from background
    const unsubscribeSyncStatus = onMessage('sync:status', ({ data }) => {
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

    // Listen for connection health messages
    const unsubscribeConnectionLost = onMessage('connection:lost', () => {
      setShowReconnectPrompt(true);
    });

    const unsubscribeConnectionRestored = onMessage('connection:restored', () => {
      setShowReconnectPrompt(false);
    });

    // Request initial sync status
    sendMessage('sync:get-status', {}, 'background').catch(console.error);

    return () => {
      unsubscribeSyncStatus();
      unsubscribeConnectionLost();
      unsubscribeConnectionRestored();
    };
  }, []);

  return (
    <DraggableControlPanel isMinimized={isMinimized} onToggleMinimize={handleToggleMinimize}>
      {showReconnectPrompt && (
        <div
          style={{
            padding: '12px',
            backgroundColor: '#fef3c7',
            borderBottom: '1px solid #f59e0b',
            borderRadius: '8px 8px 0 0',
            pointerEvents: 'auto',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <svg
              fill="none"
              height="20"
              viewBox="0 0 20 20"
              width="20"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M10 18C14.4183 18 18 14.4183 18 10C18 5.58172 14.4183 2 10 2C5.58172 2 2 5.58172 2 10C2 14.4183 5.58172 18 10 18Z"
                stroke="#f59e0b"
                strokeWidth="2"
              />
              <path d="M10 6V10" stroke="#f59e0b" strokeLinecap="round" strokeWidth="2" />
              <circle cx="10" cy="14" fill="#f59e0b" r="1" />
            </svg>
            <span style={{ fontSize: '14px', fontWeight: '500', color: '#92400e' }}>
              {browser.i18n.getMessage('connectionLost')}
            </span>
          </div>
          <button
            disabled={isReconnecting}
            style={{
              padding: '6px 12px',
              backgroundColor: '#f59e0b',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: '500',
              cursor: isReconnecting ? 'not-allowed' : 'pointer',
              opacity: isReconnecting ? 0.6 : 1,
              pointerEvents: 'auto',
            }}
            type="button"
            onClick={handleReconnect}
          >
            {isReconnecting
              ? browser.i18n.getMessage('reconnecting')
              : browser.i18n.getMessage('reconnect')}
          </button>
        </div>
      )}
      <div
        style={{
          padding: '12px',
          borderBottom: '1px solid #e5e7eb',
          pointerEvents: 'auto',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <label
            htmlFor="url-sync-toggle"
            style={{
              fontSize: '13px',
              fontWeight: '500',
              color: '#374151',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            Sync URL Navigation
          </label>
          <button
            aria-checked={urlSyncEnabled}
            aria-label="Toggle URL synchronization"
            id="url-sync-toggle"
            role="switch"
            style={{
              position: 'relative',
              width: '44px',
              height: '24px',
              backgroundColor: urlSyncEnabled ? '#3b82f6' : '#d1d5db',
              borderRadius: '12px',
              border: 'none',
              cursor: 'pointer',
              transition: 'background-color 0.2s',
              pointerEvents: 'auto',
            }}
            type="button"
            onClick={handleToggleUrlSync}
          >
            <span
              style={{
                position: 'absolute',
                top: '2px',
                left: urlSyncEnabled ? '22px' : '2px',
                width: '20px',
                height: '20px',
                backgroundColor: 'white',
                borderRadius: '50%',
                transition: 'left 0.2s',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
              }}
            />
          </button>
        </div>
        <p
          style={{
            marginTop: '6px',
            fontSize: '11px',
            color: '#6b7280',
            lineHeight: '1.4',
          }}
        >
          When enabled, URL changes are synchronized across tabs (preserving hash fragments)
        </p>
      </div>
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

// Export functions for connection health management (used by scrollSync.ts)
export function showReconnectionPrompt() {
  // Message will be handled by PanelApp's onMessage listener
  // This is a no-op but kept for API consistency
}

export function hideReconnectionPrompt() {
  // Message will be handled by PanelApp's onMessage listener
  // This is a no-op but kept for API consistency
}
