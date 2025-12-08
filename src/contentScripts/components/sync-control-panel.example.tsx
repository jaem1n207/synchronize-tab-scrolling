import { useState } from 'react';

import { SyncControlPanel } from './sync-control-panel';

/**
 * Example usage of SyncControlPanel component with Shadow DOM compatibility
 *
 * This demonstrates the proper integration pattern for content scripts:
 * 1. Root container with `style="all: revert;"` for Shadow DOM isolation
 * 2. Inner wrapper with `display: contents; pointer-events: auto;` for proper event handling
 * 3. Theme wrapper for consistent styling across light/dark modes
 * 4. Z-index management for overlay stacking
 *
 * @example
 * ```tsx
 * // In your content script render function:
 * import { createRoot } from 'react-dom/client';
 * import { SyncControlPanelExample } from './sync-control-panel.example';
 *
 * const container = document.createElement('div');
 * container.id = 'sync-control-root';
 * document.body.appendChild(container);
 *
 * const shadowRoot = container.attachShadow({ mode: 'open' });
 * const shadowContainer = document.createElement('div');
 * shadowContainer.setAttribute('style', 'all: revert;');
 * shadowRoot.appendChild(shadowContainer);
 *
 * const root = createRoot(shadowContainer);
 * root.render(<SyncControlPanelExample />);
 * ```
 */
export const SyncControlPanelExample = () => {
  const [urlSyncEnabled, setUrlSyncEnabled] = useState(false);

  const handleToggle = () => {
    setUrlSyncEnabled((prev) => {
      const newValue = !prev;
      console.log('URL sync toggled:', newValue);

      // Example: Store preference in chrome.storage
      // chrome.storage.local.set({ urlSyncEnabled: newValue });

      // Example: Send message to background script
      // chrome.runtime.sendMessage({ type: 'URL_SYNC_TOGGLE', enabled: newValue });

      return newValue;
    });
  };

  return (
    <div
      style={{
        all: 'revert',
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 2147483647,
      }}
    >
      <div style={{ display: 'contents', pointerEvents: 'auto' }}>
        <div className="antialiased">
          <SyncControlPanel urlSyncEnabled={urlSyncEnabled} onToggle={handleToggle} />
        </div>
      </div>
    </div>
  );
};
