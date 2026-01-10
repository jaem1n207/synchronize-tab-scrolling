/**
 * Suggestion toast rendering for content scripts
 * This renders toasts independently of the main panel for sync suggestions
 * that need to appear before sync is started
 */

import { createRoot } from 'react-dom/client';
import { onMessage, sendMessage } from 'webext-bridge/content-script';
import browser from 'webextension-polyfill';

import { ExtensionLogger } from '~/shared/lib/logger';
import type {
  SyncSuggestionMessage,
  AddTabToSyncMessage,
  DismissAddTabToastMessage,
  DismissSyncSuggestionToastMessage,
} from '~/shared/types/messages';

import { SyncSuggestionToast, AddTabToSyncToast } from './components/SyncSuggestionToast';

const logger = new ExtensionLogger({ scope: 'suggestion-toast' });

let toastRoot: ReturnType<typeof createRoot> | null = null;
let toastContainer: HTMLDivElement | null = null;
let currentSuggestion: SyncSuggestionMessage | null = null;
let currentAddTabSuggestion: AddTabToSyncMessage | null = null;
let cssLoaded = false;
let cssLoadPromise: Promise<void> | null = null;

// Memory leak fix: Store theme listener reference for cleanup
let toastThemeChangeListener: ((e: MediaQueryListEvent) => void) | null = null;

// Memory leak fix: Prevent duplicate onMessage handler registration on re-injection
let messageHandlersRegistered = false;

/**
 * Detect system theme preference
 */
function getSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Register message handlers for toast dismiss events
 * Only registers once to prevent accumulation on content script re-injection
 */
function registerMessageHandlers() {
  if (messageHandlersRegistered) return;

  // Issue 10 Fix: Listen for dismiss messages from background script
  // When one tab responds to add-tab suggestion, all tabs receive this message to close their toasts
  onMessage('sync-suggestion:dismiss-add-tab', ({ data }) => {
    const payload = data as unknown as DismissAddTabToastMessage;
    dismissAddTabToast(payload.tabId);
  });

  // Issue 12 Fix: Listen for dismiss messages from background script
  // When one tab responds to sync suggestion, all tabs receive this message to close their toasts
  onMessage('sync-suggestion:dismiss', ({ data }) => {
    const payload = data as unknown as DismissSyncSuggestionToastMessage;
    dismissSyncSuggestionToast(payload.normalizedUrl);
  });

  messageHandlersRegistered = true;
}

/**
 * Create the toast container if it doesn't exist
 * Also recreates if the container was removed from DOM
 * Returns a Promise that resolves when CSS is loaded
 */
async function ensureToastContainer(): Promise<void> {
  // Register message handlers on first call (prevents accumulation on re-injection)
  registerMessageHandlers();

  // Check for orphaned containers in DOM (re-injection scenario)
  // When content script is re-injected, module state resets but DOM elements remain
  const existingContainers = document.querySelectorAll('#scroll-sync-suggestion-toast-root');
  if (existingContainers.length > 0 && !toastContainer) {
    logger.info('[SuggestionToast] Found orphaned toast containers, cleaning up', {
      count: existingContainers.length,
    });
    existingContainers.forEach((container) => container.remove());
  }

  // Check if container exists AND is actually attached to the DOM AND CSS is loaded
  // This handles cases where the website might have removed our container
  if (toastContainer && document.body.contains(toastContainer) && cssLoaded) {
    return;
  }

  // If CSS is loading, wait for it
  if (cssLoadPromise && toastContainer && document.body.contains(toastContainer)) {
    await cssLoadPromise;
    return;
  }

  // Clean up stale references if container exists but was detached from DOM
  if (toastContainer) {
    if (toastRoot) {
      try {
        toastRoot.unmount();
      } catch {
        // Already unmounted or invalid - ignore
      }
      toastRoot = null;
    }
    toastContainer = null;
    cssLoaded = false;
    cssLoadPromise = null;
  }

  // Clean up existing theme listener before creating new one
  if (toastThemeChangeListener) {
    window
      .matchMedia('(prefers-color-scheme: dark)')
      .removeEventListener('change', toastThemeChangeListener);
    toastThemeChangeListener = null;
  }

  // Create root container
  toastContainer = document.createElement('div');
  toastContainer.id = 'scroll-sync-suggestion-toast-root';
  toastContainer.className = 'tailwind tailwind-no-preflight';
  toastContainer.setAttribute('style', 'all: revert;');

  document.body.appendChild(toastContainer);

  // Create shadow DOM for style isolation
  const shadowRoot = toastContainer.attachShadow({ mode: 'open' });

  // Create theme wrapper
  const themeWrapper = document.createElement('div');
  themeWrapper.className = getSystemTheme();

  // Listen for system theme changes (store reference for cleanup)
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  toastThemeChangeListener = (e: MediaQueryListEvent) => {
    themeWrapper.className = e.matches ? 'dark' : 'light';
  };
  mediaQuery.addEventListener('change', toastThemeChangeListener);

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

  // Create app container with explicit font size reset
  const appContainer = document.createElement('div');
  appContainer.id = 'scroll-sync-suggestion-app';
  appContainer.style.cssText = `
    font-size: 16px;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    line-height: 1.5;
  `;
  contentWrapper.appendChild(appContainer);

  // Inject extension CSS into shadow DOM with load tracking
  cssLoadPromise = new Promise<void>((resolve) => {
    const extensionStyleLink = document.createElement('link');
    extensionStyleLink.rel = 'stylesheet';
    extensionStyleLink.href = browser.runtime.getURL(
      'dist/contentScripts/synchronize-tab-scrolling.css',
    );

    extensionStyleLink.onload = () => {
      cssLoaded = true;
      resolve();
    };

    // Error fallback - proceed anyway to avoid blocking indefinitely
    extensionStyleLink.onerror = () => {
      logger.error('[SuggestionToast] Failed to load CSS, proceeding anyway');
      cssLoaded = true;
      resolve();
    };

    styleContainer.appendChild(extensionStyleLink);
  });

  // Add theme CSS variables
  const baseStyle = document.createElement('style');
  baseStyle.textContent = `
    :host {
      all: initial;
      display: block;
    }

    /* Reset font-size to prevent inheritance from host page */
    /* This ensures consistent font sizes across all websites */
    .light, .dark {
      font-size: 16px;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.5;
    }

    /* CRITICAL FIX: Override rem-based text size classes with absolute pixel values
     * rem units in Shadow DOM still reference the host document's root font-size,
     * causing inconsistent sizes across different websites.
     * These pixel overrides ensure consistent appearance regardless of host styles.
     */
    .text-xs { font-size: 12px !important; }
    .text-sm { font-size: 14px !important; }
    .text-base { font-size: 16px !important; }

    /* Scrollbar styling for better UX when content overflows */
    *::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }

    .light *::-webkit-scrollbar-track {
      background: hsl(0 0% 96.1%);
      border-radius: 4px;
    }

    .light *::-webkit-scrollbar-thumb {
      background: hsl(0 0% 89.8%);
      border-radius: 4px;
    }

    .light *::-webkit-scrollbar-thumb:hover {
      background: hsl(0 0% 80%);
    }

    .dark *::-webkit-scrollbar-track {
      background: hsl(0 0% 14.9%);
      border-radius: 4px;
    }

    .dark *::-webkit-scrollbar-thumb {
      background: hsl(0 0% 25%);
      border-radius: 4px;
    }

    .dark *::-webkit-scrollbar-thumb:hover {
      background: hsl(0 0% 35%);
    }

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
      color: hsl(var(--foreground));
    }

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
      color: hsl(var(--foreground));
    }

    *, *::before, *::after, ::backdrop {
      box-sizing: border-box;
      --un-text-opacity: 100%;
      --un-bg-opacity: 100%;
      --un-border-opacity: 100%;
      --un-ring-opacity: 100%;
      --un-ring-offset-opacity: 100%;
      --un-outline-style: solid;
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
      --un-translate-x: 0;
      --un-translate-y: 0;
      --un-translate-z: 0;
      --un-scale-x: 1;
      --un-scale-y: 1;
      --un-scale-z: 1;
      --un-space-y-reverse: 0;
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

  // Create React root
  toastRoot = createRoot(appContainer);

  // Wait for CSS to load before returning
  await cssLoadPromise;
}

/**
 * Render the current toast state
 */
function renderToast() {
  if (!toastRoot) return;

  const handleSyncAccept = async () => {
    if (!currentSuggestion) return;

    try {
      await sendMessage(
        'sync-suggestion:response',
        { normalizedUrl: currentSuggestion.normalizedUrl, accepted: true },
        'background',
      );
    } catch (error) {
      // Gracefully handle extension context invalidation (happens during rapid toggle)
      if (error instanceof Error && error.message.includes('Extension context invalidated')) {
        await logger.warn('[SuggestionToast] Extension context invalidated, closing toast');
      } else {
        await logger.error('Failed to send sync suggestion response', error);
      }
    }
    currentSuggestion = null;
    renderToast();
  };

  const handleSyncReject = async () => {
    if (!currentSuggestion) return;

    try {
      await sendMessage(
        'sync-suggestion:response',
        { normalizedUrl: currentSuggestion.normalizedUrl, accepted: false },
        'background',
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes('Extension context invalidated')) {
        await logger.warn('[SuggestionToast] Extension context invalidated, closing toast');
      } else {
        await logger.error('Failed to send sync suggestion response', error);
      }
    }
    currentSuggestion = null;
    renderToast();
  };

  const handleAddTabAccept = async () => {
    if (!currentAddTabSuggestion) return;

    try {
      await sendMessage(
        'sync-suggestion:add-tab-response',
        { tabId: currentAddTabSuggestion.tabId, accepted: true },
        'background',
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes('Extension context invalidated')) {
        await logger.warn('[SuggestionToast] Extension context invalidated, closing toast');
      } else {
        await logger.error('Failed to send add tab response', error);
      }
    }
    currentAddTabSuggestion = null;
    renderToast();
  };

  const handleAddTabReject = async () => {
    if (!currentAddTabSuggestion) return;

    try {
      await sendMessage(
        'sync-suggestion:add-tab-response',
        { tabId: currentAddTabSuggestion.tabId, accepted: false },
        'background',
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes('Extension context invalidated')) {
        await logger.warn('[SuggestionToast] Extension context invalidated, closing toast');
      } else {
        await logger.error('Failed to send add tab response', error);
      }
    }
    currentAddTabSuggestion = null;
    renderToast();
  };

  toastRoot.render(
    <>
      {currentSuggestion && (
        <SyncSuggestionToast
          suggestion={currentSuggestion}
          onAccept={handleSyncAccept}
          onReject={handleSyncReject}
        />
      )}
      {currentAddTabSuggestion && (
        <AddTabToSyncToast
          suggestion={currentAddTabSuggestion}
          onAccept={handleAddTabAccept}
          onReject={handleAddTabReject}
        />
      )}
    </>,
  );
}

/**
 * Show sync suggestion toast
 */
export async function showSyncSuggestionToast(suggestion: SyncSuggestionMessage) {
  // Debug logging to diagnose toast display issues
  logger.debug('[SuggestionToast] showSyncSuggestionToast called', {
    normalizedUrl: suggestion.normalizedUrl,
    tabCount: suggestion.tabCount,
    hasContainer: !!toastContainer,
    containerInDOM: toastContainer ? document.body.contains(toastContainer) : false,
    hasRoot: !!toastRoot,
    cssLoaded,
  });

  await ensureToastContainer();

  logger.debug('[SuggestionToast] After ensureToastContainer (CSS loaded)', {
    hasContainer: !!toastContainer,
    containerInDOM: toastContainer ? document.body.contains(toastContainer) : false,
    hasRoot: !!toastRoot,
    cssLoaded,
  });

  currentSuggestion = suggestion;
  renderToast();
}

/**
 * Show add tab suggestion toast
 */
export async function showAddTabSuggestionToast(suggestion: AddTabToSyncMessage) {
  await ensureToastContainer();
  currentAddTabSuggestion = suggestion;
  renderToast();
}

/**
 * Hide all suggestion toasts
 */
export function hideSuggestionToasts() {
  currentSuggestion = null;
  currentAddTabSuggestion = null;
  renderToast();
}

/**
 * Cleanup suggestion toast container
 */
export function destroySuggestionToast() {
  // Clean up theme listener to prevent memory leak
  if (toastThemeChangeListener) {
    window
      .matchMedia('(prefers-color-scheme: dark)')
      .removeEventListener('change', toastThemeChangeListener);
    toastThemeChangeListener = null;
  }

  if (toastRoot) {
    toastRoot.unmount();
    toastRoot = null;
  }

  if (toastContainer) {
    toastContainer.remove();
    toastContainer = null;
  }

  currentSuggestion = null;
  currentAddTabSuggestion = null;
  cssLoaded = false;
  cssLoadPromise = null;
}

/**
 * Dismiss add-tab toast if it matches the given tabId
 * Issue 10 Fix: Called when another tab responds to the add-tab suggestion
 */
export function dismissAddTabToast(tabId: number) {
  if (currentAddTabSuggestion?.tabId === tabId) {
    currentAddTabSuggestion = null;
    renderToast();
  }
}

/**
 * Dismiss sync suggestion toast if it matches the given normalizedUrl
 * Issue 12 Fix: Called when another tab responds to the sync suggestion
 */
export function dismissSyncSuggestionToast(normalizedUrl: string) {
  if (currentSuggestion?.normalizedUrl === normalizedUrl) {
    currentSuggestion = null;
    renderToast();
  }
}
