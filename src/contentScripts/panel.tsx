import { useState, useCallback, useEffect } from 'react';

import { createRoot } from 'react-dom/client';
import { onMessage, sendMessage } from 'webext-bridge/content-script';
import browser from 'webextension-polyfill';

import { loadUrlSyncEnabled, saveUrlSyncEnabled } from '~/shared/lib/storage';
import type {
  SyncSuggestionMessage,
  AddTabToSyncMessage,
  DismissAddTabToastMessage,
  DismissSyncSuggestionToastMessage,
} from '~/shared/types/messages';

import { SyncControlPanel } from './components';
import { SyncSuggestionToast, AddTabToSyncToast } from './components/SyncSuggestionToast';

function PanelApp() {
  const [urlSyncEnabled, setUrlSyncEnabled] = useState(true);
  const [syncSuggestion, setSyncSuggestion] = useState<SyncSuggestionMessage | null>(null);
  const [addTabSuggestion, setAddTabSuggestion] = useState<AddTabToSyncMessage | null>(null);

  useEffect(() => {
    // Load URL sync state
    loadUrlSyncEnabled().then(setUrlSyncEnabled).catch(console.error);

    // Listen for state changes from other synced tabs
    const unsubscribe = onMessage('sync:url-enabled-changed', ({ data }) => {
      const { enabled } = data as { enabled: boolean };
      setUrlSyncEnabled(enabled);
      saveUrlSyncEnabled(enabled);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Listen for sync suggestion messages
  useEffect(() => {
    const unsubscribeSuggestion = onMessage('sync-suggestion:show', ({ data }) => {
      setSyncSuggestion(data as unknown as SyncSuggestionMessage);
    });

    const unsubscribeAddTab = onMessage('sync-suggestion:add-tab', ({ data }) => {
      setAddTabSuggestion(data as unknown as AddTabToSyncMessage);
    });

    // Issue 11 Fix: Listen for dismiss messages to close add-tab toast when another tab responds
    const unsubscribeDismissAddTab = onMessage('sync-suggestion:dismiss-add-tab', ({ data }) => {
      const payload = data as unknown as DismissAddTabToastMessage;
      setAddTabSuggestion((current) => {
        if (current?.tabId === payload.tabId) {
          return null;
        }
        return current;
      });
    });

    // Issue 12 Fix: Listen for dismiss messages to close sync suggestion toast when another tab responds
    const unsubscribeDismissSyncSuggestion = onMessage('sync-suggestion:dismiss', ({ data }) => {
      const payload = data as unknown as DismissSyncSuggestionToastMessage;
      setSyncSuggestion((current) => {
        if (current?.normalizedUrl === payload.normalizedUrl) {
          return null;
        }
        return current;
      });
    });

    return () => {
      unsubscribeSuggestion();
      unsubscribeAddTab();
      unsubscribeDismissAddTab();
      unsubscribeDismissSyncSuggestion();
    };
  }, []);

  const handleToggleUrlSync = useCallback(async () => {
    const newValue = !urlSyncEnabled;
    setUrlSyncEnabled(newValue);
    saveUrlSyncEnabled(newValue);

    // Broadcast to other synced tabs via background
    try {
      await sendMessage('sync:url-enabled-changed', { enabled: newValue }, 'background');
    } catch (error) {
      console.error('Failed to broadcast URL sync enabled change', error);
    }
  }, [urlSyncEnabled]);

  // Handle sync suggestion accept
  const handleSyncSuggestionAccept = useCallback(async () => {
    if (!syncSuggestion) return;

    try {
      await sendMessage(
        'sync-suggestion:response',
        { normalizedUrl: syncSuggestion.normalizedUrl, accepted: true },
        'background',
      );
    } catch (error) {
      console.error('Failed to send sync suggestion response', error);
    }
    setSyncSuggestion(null);
  }, [syncSuggestion]);

  // Handle sync suggestion reject
  const handleSyncSuggestionReject = useCallback(async () => {
    if (!syncSuggestion) return;

    try {
      await sendMessage(
        'sync-suggestion:response',
        { normalizedUrl: syncSuggestion.normalizedUrl, accepted: false },
        'background',
      );
    } catch (error) {
      console.error('Failed to send sync suggestion response', error);
    }
    setSyncSuggestion(null);
  }, [syncSuggestion]);

  // Handle add tab suggestion accept
  const handleAddTabAccept = useCallback(async () => {
    if (!addTabSuggestion) return;

    try {
      await sendMessage(
        'sync-suggestion:add-tab-response',
        { tabId: addTabSuggestion.tabId, accepted: true },
        'background',
      );
    } catch (error) {
      console.error('Failed to send add tab response', error);
    }
    setAddTabSuggestion(null);
  }, [addTabSuggestion]);

  // Handle add tab suggestion reject
  const handleAddTabReject = useCallback(async () => {
    if (!addTabSuggestion) return;

    try {
      await sendMessage(
        'sync-suggestion:add-tab-response',
        { tabId: addTabSuggestion.tabId, accepted: false },
        'background',
      );
    } catch (error) {
      console.error('Failed to send add tab response', error);
    }
    setAddTabSuggestion(null);
  }, [addTabSuggestion]);

  return (
    <>
      <SyncControlPanel urlSyncEnabled={urlSyncEnabled} onToggle={handleToggleUrlSync} />

      {/* Sync suggestion toast */}
      {syncSuggestion && (
        <SyncSuggestionToast
          suggestion={syncSuggestion}
          onAccept={handleSyncSuggestionAccept}
          onReject={handleSyncSuggestionReject}
        />
      )}

      {/* Add tab to sync toast */}
      {addTabSuggestion && (
        <AddTabToSyncToast
          suggestion={addTabSuggestion}
          onAccept={handleAddTabAccept}
          onReject={handleAddTabReject}
        />
      )}
    </>
  );
}

let panelRoot: ReturnType<typeof createRoot> | null = null;
let panelContainer: HTMLDivElement | null = null;
let themeChangeListener: ((e: MediaQueryListEvent) => void) | null = null;

/**
 * Detect system theme preference
 */
function getSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

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
  // Uses system theme to match .light or .dark selector
  const themeWrapper = document.createElement('div');
  themeWrapper.className = getSystemTheme();

  // Listen for system theme changes
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  themeChangeListener = (e: MediaQueryListEvent) => {
    themeWrapper.className = e.matches ? 'dark' : 'light';
  };
  mediaQuery.addEventListener('change', themeChangeListener);
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
  // UnoCSS uses @property with inherits:false for CSS variables,
  // which don't inherit into Shadow DOM. We need to explicitly set them.
  // Also add theme HSL variables since :root doesn't apply in Shadow DOM.
  const baseStyle = document.createElement('style');
  baseStyle.textContent = `
    :host {
      all: initial;
      display: block;
    }

    /* Light theme HSL variables */
    .light {
      --background: 0 0% 100%;
      --foreground: 0 0% 3.9%;
      --card: 0 0% 100%;
      --card-foreground: 0 0% 3.9%;
      --popover: 0 0% 100%;
      --popover-foreground: 0 0% 3.9%;
      --primary: 0 0% 9%;
      --primary-foreground: 0 0% 98%;
      --secondary: 0 0% 96.1%;
      --secondary-foreground: 0 0% 9%;
      --muted: 0 0% 96.1%;
      --muted-foreground: 0 0% 45.1%;
      --accent: 0 0% 96.1%;
      --accent-foreground: 0 0% 9%;
      --destructive: 0 84.2% 60.2%;
      --destructive-foreground: 0 0% 98%;
      --border: 0 0% 89.8%;
      --input: 0 0% 89.8%;
      --ring: 0 0% 3.9%;
      --radius: 0.5rem;
      color-scheme: light only;

      /* Computed color variables for light theme */
      --colors-background: hsl(var(--background));
      --colors-foreground: hsl(var(--foreground));
      --colors-card: hsl(var(--card));
      --colors-card-foreground: hsl(var(--card-foreground));
      --colors-popover-DEFAULT: hsl(var(--popover));
      --colors-popover-foreground: hsl(var(--popover-foreground));
      --colors-primary-DEFAULT: hsl(var(--primary));
      --colors-primary-foreground: hsl(var(--primary-foreground));
      --colors-secondary-DEFAULT: hsl(var(--secondary));
      --colors-secondary-foreground: hsl(var(--secondary-foreground));
      --colors-muted-DEFAULT: hsl(var(--muted));
      --colors-muted-foreground: hsl(var(--muted-foreground));
      --colors-accent-DEFAULT: hsl(var(--accent));
      --colors-accent-foreground: hsl(var(--accent-foreground));
      --colors-destructive-DEFAULT: hsl(var(--destructive));
      --colors-destructive-foreground: hsl(var(--destructive-foreground));
      --colors-border: hsl(var(--border));
      --colors-input: hsl(var(--input));
      --colors-ring: hsl(var(--ring));

      /* Base text color - replaces body { color: ... } from UnoCSS */
      color: hsl(var(--foreground));
    }

    /* Dark theme HSL variables */
    .dark {
      --background: 0 0% 3.9%;
      --foreground: 0 0% 98%;
      --card: 0 0% 3.9%;
      --card-foreground: 0 0% 98%;
      --popover: 0 0% 3.9%;
      --popover-foreground: 0 0% 98%;
      --primary: 0 0% 98%;
      --primary-foreground: 0 0% 9%;
      --secondary: 0 0% 14.9%;
      --secondary-foreground: 0 0% 98%;
      --muted: 0 0% 14.9%;
      --muted-foreground: 0 0% 63.9%;
      --accent: 0 0% 14.9%;
      --accent-foreground: 0 0% 98%;
      --destructive: 0 62.8% 30.6%;
      --destructive-foreground: 0 0% 98%;
      --border: 0 0% 14.9%;
      --input: 0 0% 14.9%;
      --ring: 0 0% 83.1%;
      --radius: 0.5rem;
      color-scheme: dark only;

      /* Computed color variables for dark theme */
      --colors-background: hsl(var(--background));
      --colors-foreground: hsl(var(--foreground));
      --colors-card: hsl(var(--card));
      --colors-card-foreground: hsl(var(--card-foreground));
      --colors-popover-DEFAULT: hsl(var(--popover));
      --colors-popover-foreground: hsl(var(--popover-foreground));
      --colors-primary-DEFAULT: hsl(var(--primary));
      --colors-primary-foreground: hsl(var(--primary-foreground));
      --colors-secondary-DEFAULT: hsl(var(--secondary));
      --colors-secondary-foreground: hsl(var(--secondary-foreground));
      --colors-muted-DEFAULT: hsl(var(--muted));
      --colors-muted-foreground: hsl(var(--muted-foreground));
      --colors-accent-DEFAULT: hsl(var(--accent));
      --colors-accent-foreground: hsl(var(--accent-foreground));
      --colors-destructive-DEFAULT: hsl(var(--destructive));
      --colors-destructive-foreground: hsl(var(--destructive-foreground));
      --colors-border: hsl(var(--border));
      --colors-input: hsl(var(--input));
      --colors-ring: hsl(var(--ring));

      /* Base text color - replaces body { color: ... } from UnoCSS */
      color: hsl(var(--foreground));
    }

    *, *::before, *::after, ::backdrop {
      box-sizing: border-box;

      /* Opacity variables (from @property declarations) */
      --un-text-opacity: 100%;
      --un-bg-opacity: 100%;
      --un-border-opacity: 100%;
      --un-ring-opacity: 100%;
      --un-ring-offset-opacity: 100%;

      /* Outline variables */
      --un-outline-style: solid;

      /* Shadow variables */
      --un-shadow: 0 0 #0000;
      --un-shadow-color: ;
      --un-ring-shadow: 0 0 #0000;
      --un-ring-offset-shadow: 0 0 #0000;
      --un-ring-color: ;
      --un-ring-inset: ;
      --un-ring-offset-color: ;
      --un-ring-offset-width: 0px;
      --un-inset-shadow: 0 0 #0000;
      --un-inset-shadow-color: ;
      --un-inset-ring-shadow: 0 0 #0000;
      --un-inset-ring-color: ;

      /* Transform variables */
      --un-translate-x: 0;
      --un-translate-y: 0;
      --un-translate-z: 0;
      --un-scale-x: 1;
      --un-scale-y: 1;
      --un-scale-z: 1;

      /* Space reverse variables */
      --un-space-y-reverse: 0;

      /* Backdrop filter variables */
      --un-backdrop-blur: ;
      --un-backdrop-brightness: ;
      --un-backdrop-contrast: ;
      --un-backdrop-grayscale: ;
      --un-backdrop-hue-rotate: ;
      --un-backdrop-invert: ;
      --un-backdrop-opacity: ;
      --un-backdrop-saturate: ;
      --un-backdrop-sepia: ;
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
  // Remove theme change listener
  if (themeChangeListener) {
    window
      .matchMedia('(prefers-color-scheme: dark)')
      .removeEventListener('change', themeChangeListener);
    themeChangeListener = null;
  }

  if (panelRoot) {
    panelRoot.unmount();
    panelRoot = null;
  }

  if (panelContainer) {
    panelContainer.remove();
    panelContainer = null;
  }
}
