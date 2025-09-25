import { onMessage, sendMessage } from 'webext-bridge/content-script';

import { ExtensionLogger } from '~/shared/lib/logger';

import {
  exportCurrentElementContext,
  applyElementBasedSync,
  type ElementSignature,
} from './elementSync';

import type { ScrollPosition, SyncGroup, SyncMode } from '~/shared/types';

const logger = new ExtensionLogger({ scope: 'content-scroll-sync' });

let isScrolling = false;
let scrollTimeout: NodeJS.Timeout | null = null;
let currentGroup: SyncGroup | null = null;
let manualAdjustMode = false;

// Get current scroll position
function getScrollPosition(): ScrollPosition {
  return {
    scrollTop: window.pageYOffset || document.documentElement.scrollTop,
    scrollLeft: window.pageXOffset || document.documentElement.scrollLeft,
    scrollHeight: document.documentElement.scrollHeight,
    scrollWidth: document.documentElement.scrollWidth,
    clientHeight: window.innerHeight,
    clientWidth: window.innerWidth,
    timestamp: Date.now(),
  };
}

// Apply scroll position based on sync mode
function applyScrollPosition(position: ScrollPosition, syncMode: SyncMode) {
  if (isScrolling) return;

  isScrolling = true;

  if (syncMode === 'ratio') {
    // Calculate ratio-based position
    const targetTop =
      (position.scrollTop / position.scrollHeight) * document.documentElement.scrollHeight;
    const targetLeft =
      (position.scrollLeft / position.scrollWidth) * document.documentElement.scrollWidth;

    window.scrollTo({
      top: targetTop,
      left: targetLeft,
      behavior: 'instant', // Use instant to avoid interference
    });
  } else if (syncMode === 'element') {
    // Element-based synchronization (to be implemented)
    applyElementBasedScroll(position);
  }

  // Reset scrolling flag after a short delay
  setTimeout(() => {
    isScrolling = false;
  }, 100);
}

// Element-based scroll synchronization
function applyElementBasedScroll(position: ScrollPosition & { elementContext?: unknown }) {
  // Try element-based sync first
  if (position.elementContext) {
    const success = applyElementBasedSync(
      position.elementContext as {
        signature: ElementSignature | null;
        scrollTop: number;
        pageHeight: number;
      },
    );
    if (success) {
      return;
    }
  }

  // Fallback to ratio-based
  const targetTop =
    (position.scrollTop / position.scrollHeight) * document.documentElement.scrollHeight;
  const targetLeft =
    (position.scrollLeft / position.scrollWidth) * document.documentElement.scrollWidth;

  window.scrollTo({
    top: targetTop,
    left: targetLeft,
    behavior: 'instant',
  });
}

// Handle scroll events
function handleScroll(event: Event) {
  // Check for manual adjustment mode (Alt/Option key)
  if (manualAdjustMode || (event instanceof KeyboardEvent && event.altKey)) {
    return; // Don't sync when in manual adjustment mode
  }

  if (!currentGroup || !currentGroup.isActive || isScrolling) {
    return;
  }

  // Debounce scroll events
  if (scrollTimeout) {
    clearTimeout(scrollTimeout);
  }

  scrollTimeout = setTimeout(async () => {
    if (!currentGroup || !currentGroup.isActive) return;

    const position = getScrollPosition();
    let elementContext;

    // If using element-based sync, export element context
    if (currentGroup.syncMode === 'element') {
      elementContext = exportCurrentElementContext();
    }

    try {
      // Send scroll position to background
      // The background script will get the tab ID from the sender
      await sendMessage(
        'sync-scroll',
        {
          groupId: currentGroup.id,
          position: { ...position, elementContext },
        },
        'background',
      );
    } catch (error) {
      logger.error('Failed to send scroll position', error);
    }
  }, 50); // Debounce delay
}

// Listen for sync start
onMessage('sync-started', ({ data }) => {
  currentGroup = data.group;
  logger.info('Sync started', { group: currentGroup });

  // Add scroll listener
  window.addEventListener('scroll', handleScroll, { passive: true });
});

// Listen for sync stop
onMessage('sync-stopped', ({ data }) => {
  if (currentGroup?.id === data.groupId) {
    currentGroup = null;
    logger.info('Sync stopped');

    // Remove scroll listener
    window.removeEventListener('scroll', handleScroll);
  }
});

// Listen for scroll updates from other tabs
onMessage('apply-scroll', ({ data }) => {
  const { position, syncMode } = data;
  applyScrollPosition(position, syncMode);
});

// Listen for sync mode changes
onMessage('sync-mode-changed', ({ data }) => {
  if (currentGroup) {
    currentGroup.syncMode = data.mode;
    logger.info('Sync mode changed', { mode: data.mode });
  }
});

// Handle manual adjustment mode
export function setManualAdjustMode(enabled: boolean) {
  manualAdjustMode = enabled;
}

// Listen for keyboard events for manual adjustment
document.addEventListener('keydown', (event) => {
  if (event.altKey || event.metaKey) {
    setManualAdjustMode(true);
  }
});

document.addEventListener('keyup', (event) => {
  if (!event.altKey && !event.metaKey) {
    setManualAdjustMode(false);
  }
});

// Export functions for use in UI
export function getCurrentSyncGroup() {
  return currentGroup;
}

export function isCurrentlySyncing() {
  return currentGroup !== null && currentGroup.isActive;
}
