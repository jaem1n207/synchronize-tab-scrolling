import { onMessage, sendMessage } from 'webext-bridge/content-script';

import { ExtensionLogger } from '~/shared/lib/logger';

import {
  exportCurrentElementContext,
  applyElementBasedSync,
  type ElementSignature,
} from './elementSync';

import type { ScrollPosition, SyncGroup, SyncMode } from '~/shared/types';

const logger = new ExtensionLogger({ scope: 'content-scroll-sync' });

// Immediate log to verify module loading
console.log('🚀 [ScrollSync] Module file parsing started');
logger.info('🚀 [ScrollSync] Logger initialized');

// Utility functions
function throttle<T extends (...args: Parameters<T>) => void>(func: T, wait: number) {
  let lastCalled = 0;
  let timeout: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    const now = Date.now();
    const remaining = wait - (now - lastCalled);

    if (remaining <= 0) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      lastCalled = now;
      func(...args);
    } else if (!timeout) {
      timeout = setTimeout(() => {
        lastCalled = Date.now();
        timeout = null;
        func(...args);
      }, remaining);
    }
  };
}

function debounce<T extends (...args: Parameters<T>) => void>(func: T, wait: number) {
  let timeoutId: NodeJS.Timeout | undefined;

  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      func(...args);
    }, wait);
  };
}

// State management
let isReceivingScroll = false; // Flag to prevent echo when receiving scroll from other tabs
let currentGroup: SyncGroup | null = null;
let manualAdjustMode = false;
let scrollListenerAdded = false; // Track if scroll listener is already added
let lastSyncTimestamp = 0; // Track last successful sync
let connectionLost = false; // Track connection status
let reconnectAttempts = 0; // Track reconnection attempts

// Store the latest scroll handler reference to avoid stale closures
let currentScrollHandler: ((event: Event) => void) | null = null;

// Reset the receiving flag after a delay
const resetReceivingScroll = debounce(() => {
  isReceivingScroll = false;
  logger.info('Reset isReceivingScroll flag');
}, 250);

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
  // Set flag to prevent sending this received scroll back
  isReceivingScroll = true;

  const beforeScrollTop = window.pageYOffset;
  const beforeScrollHeight = document.documentElement.scrollHeight;
  const beforeClientHeight = window.innerHeight;

  logger.info('🎯 APPLYING scroll position NOW', {
    receivedPosition: {
      scrollTop: position.scrollTop,
      scrollHeight: position.scrollHeight,
      clientHeight: position.clientHeight,
    },
    currentPosition: {
      scrollTop: beforeScrollTop,
      scrollHeight: beforeScrollHeight,
      clientHeight: beforeClientHeight,
    },
    syncMode,
    isReceivingScroll,
  });

  if (syncMode === 'ratio') {
    // Calculate ratio-based position
    // Use the scroll ratio from the source tab
    const sourceScrollableHeight = position.scrollHeight - position.clientHeight;
    const sourceScrollableWidth = position.scrollWidth - position.clientWidth;

    // Avoid division by zero
    const scrollRatioY =
      sourceScrollableHeight > 0 ? position.scrollTop / sourceScrollableHeight : 0;
    const scrollRatioX =
      sourceScrollableWidth > 0 ? position.scrollLeft / sourceScrollableWidth : 0;

    // Apply the ratio to this tab's dimensions
    const targetScrollHeight = document.documentElement.scrollHeight;
    const targetClientHeight = window.innerHeight;
    const targetScrollWidth = document.documentElement.scrollWidth;
    const targetClientWidth = window.innerWidth;

    const targetScrollableHeight = targetScrollHeight - targetClientHeight;
    const targetScrollableWidth = targetScrollWidth - targetClientWidth;

    const targetTop = Math.max(0, scrollRatioY * targetScrollableHeight);
    const targetLeft = Math.max(0, scrollRatioX * targetScrollableWidth);

    logger.info('📐 Calculated scroll target', {
      source: {
        scrollTop: position.scrollTop,
        scrollHeight: position.scrollHeight,
        clientHeight: position.clientHeight,
        scrollableHeight: sourceScrollableHeight,
      },
      target: {
        scrollHeight: targetScrollHeight,
        clientHeight: targetClientHeight,
        scrollableHeight: targetScrollableHeight,
      },
      calculation: {
        scrollRatioY: `${(scrollRatioY * 100).toFixed(2)}%`,
        targetTop,
        targetLeft,
      },
      willScroll: targetTop !== beforeScrollTop,
      scrollDelta: targetTop - beforeScrollTop,
    });

    // Perform the actual scroll
    window.scrollTo({
      top: targetTop,
      left: targetLeft,
      behavior: 'instant', // Use instant to avoid interference
    });

    // Verify the scroll actually happened
    const afterScrollTop = window.pageYOffset;
    const scrollSuccess = Math.abs(afterScrollTop - targetTop) < 1; // Allow 1px tolerance

    logger.info('✅ ScrollTo executed', {
      targetTop,
      beforeScrollTop,
      afterScrollTop,
      actualDelta: afterScrollTop - beforeScrollTop,
      success: scrollSuccess,
      error: scrollSuccess ? null : `Expected ${targetTop}, got ${afterScrollTop}`,
    });

    if (!scrollSuccess && targetScrollableHeight > 0) {
      logger.error('⚠️ Scroll position mismatch', {
        expected: targetTop,
        actual: afterScrollTop,
        difference: Math.abs(afterScrollTop - targetTop),
        pageInfo: {
          scrollHeight: targetScrollHeight,
          clientHeight: targetClientHeight,
          scrollableHeight: targetScrollableHeight,
        },
      });
    }
  } else if (syncMode === 'element') {
    // Element-based synchronization (to be implemented)
    applyElementBasedScroll(position);
  }

  // Reset the flag after a delay
  resetReceivingScroll();
}

// Element-based scroll synchronization
function applyElementBasedScroll(position: ScrollPosition & { elementContext?: unknown }) {
  // Set flag to prevent echo
  isReceivingScroll = true;

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
      resetReceivingScroll();
      return;
    }
  }

  // Fallback to ratio-based
  const sourceScrollableHeight = position.scrollHeight - position.clientHeight;
  const sourceScrollableWidth = position.scrollWidth - position.clientWidth;

  const scrollRatioY = sourceScrollableHeight > 0 ? position.scrollTop / sourceScrollableHeight : 0;
  const scrollRatioX = sourceScrollableWidth > 0 ? position.scrollLeft / sourceScrollableWidth : 0;

  const targetScrollHeight = document.documentElement.scrollHeight;
  const targetClientHeight = window.innerHeight;
  const targetScrollWidth = document.documentElement.scrollWidth;
  const targetClientWidth = window.innerWidth;

  const targetScrollableHeight = targetScrollHeight - targetClientHeight;
  const targetScrollableWidth = targetScrollWidth - targetClientWidth;

  const targetTop = Math.max(0, scrollRatioY * targetScrollableHeight);
  const targetLeft = Math.max(0, scrollRatioX * targetScrollableWidth);

  window.scrollTo({
    top: targetTop,
    left: targetLeft,
    behavior: 'instant',
  });

  resetReceivingScroll();
}

// Create a function that returns a throttled scroll handler with current group
function createScrollHandler(group: SyncGroup) {
  logger.info('📝 Creating new scroll handler for group', {
    groupId: group.id,
    isActive: group.isActive,
    tabs: group.tabs,
  });

  return throttle(async () => {
    try {
      // Skip if we're receiving a scroll from another tab
      if (isReceivingScroll) {
        logger.info('Skipping sync - receiving scroll from another tab');
        return;
      }

      // Check for manual adjustment mode
      if (manualAdjustMode) {
        logger.info('Skipping sync - manual adjust mode');
        return;
      }

      // Check if the group is still active
      if (!group.isActive) {
        logger.info('Skipping sync - group no longer active', {
          groupId: group.id,
          isActive: group.isActive,
        });
        return;
      }

      const position = getScrollPosition();
      let elementContext;

      // If using element-based sync, export element context
      if (group.syncMode === 'element') {
        elementContext = exportCurrentElementContext();
      }

      logger.info('📤 SENDING scroll position to background', {
        groupId: group.id,
        scrollTop: position.scrollTop,
        scrollHeight: position.scrollHeight,
        isReceivingScroll,
      });

      // Update debug indicator
      updateDebugIndicator('SENDING...', 'rgba(255, 165, 0, 0.9)');

      // Send scroll position to background
      await sendMessage(
        'sync-scroll',
        {
          groupId: group.id,
          position: { ...position, elementContext },
        },
        'background',
      );

      logger.info('✅ Scroll position sent successfully');
      updateDebugIndicator('SENT ✓', 'rgba(0, 200, 0, 0.9)');

      // Update sync status
      lastSyncTimestamp = Date.now();
      connectionLost = false;
      reconnectAttempts = 0;

      setTimeout(() => {
        updateDebugIndicator('SYNC ACTIVE', 'rgba(0, 128, 0, 0.9)');
      }, 500);
    } catch (error) {
      logger.error('Failed to send scroll position', error);
      updateDebugIndicator('SEND ERROR', 'rgba(255, 0, 0, 0.9)');

      // Mark connection as lost and attempt reconnection
      connectionLost = true;
      attemptReconnection();
    }
  }, 50); // Throttle to 50ms
}

// Handle scroll events - This wrapper just checks for alt key and calls the current handler
function handleScroll(event: Event) {
  // Log every scroll event for debugging
  logger.info('📜 Scroll event detected', {
    hasHandler: !!currentScrollHandler,
    hasGroup: !!currentGroup,
    groupId: currentGroup?.id,
    isActive: currentGroup?.isActive,
    scrollTop: window.pageYOffset,
    isReceivingScroll,
  });

  // Check for manual adjustment mode (Alt/Option key)
  if (event instanceof KeyboardEvent && event.altKey) {
    logger.info('Skipping sync - Alt key pressed');
    return;
  }

  // Call the current scroll handler if it exists
  if (currentScrollHandler) {
    logger.info('🔥 Calling scroll handler');
    currentScrollHandler(event);
  } else {
    logger.warn('⚠️ No scroll handler available!');
  }
}

// Handle ping messages for checking if content script is loaded
onMessage('ping', () => {
  logger.info('Received ping, responding with pong');
  return { response: 'pong' };
});

// Log when the module loads
console.log('🚀 [ScrollSync] Module fully loaded');
logger.info('🚀 ScrollSync module loaded and ready', {
  url: window.location.href,
  timestamp: Date.now(),
  hasWindow: typeof window !== 'undefined',
  hasDocument: typeof document !== 'undefined',
});

// Listen for sync start
onMessage('sync-started', ({ data }) => {
  currentGroup = data.group;
  logger.info('🟢 SYNC STARTED - received sync-started message', {
    group: currentGroup,
    tabCount: currentGroup?.tabs?.length,
    syncMode: currentGroup?.syncMode,
    showControlPanel: data.showControlPanel,
    url: window.location.href,
    tabId: 'will be in this tab',
  });

  // Add visual indicator for debugging
  addDebugIndicator();

  // Create a new scroll handler with the current group
  currentScrollHandler = createScrollHandler(currentGroup);

  // Initialize connection tracking
  lastSyncTimestamp = Date.now();
  connectionLost = false;
  reconnectAttempts = 0;

  // Start health check monitoring
  startHealthCheck();

  // TEST: Immediately test sending a sync message
  setTimeout(() => {
    if (currentGroup && currentGroup.isActive) {
      logger.info('🔵 TEST: Sending test scroll sync message');
      const testPosition = getScrollPosition();
      sendMessage(
        'sync-scroll',
        {
          groupId: currentGroup.id,
          position: testPosition,
        },
        'background',
      )
        .then(() => {
          logger.info('✅ TEST: Test sync message sent successfully');
        })
        .catch((err) => {
          logger.error('❌ TEST: Failed to send test sync message', err);
        });
    }
  }, 1000);

  // Add scroll listener only if not already added
  if (!scrollListenerAdded) {
    logger.info('Adding scroll event listener for the first time');
    window.addEventListener('scroll', handleScroll, { passive: true });
    scrollListenerAdded = true;
    logger.info('Scroll listener added successfully');
  } else {
    logger.info('Scroll listener already exists, skipping addition');
  }
});

// Add debug indicator to show sync status
function addDebugIndicator() {
  if (document.getElementById('sync-debug-indicator')) {
    return;
  }

  const indicator = document.createElement('div');
  indicator.id = 'sync-debug-indicator';
  indicator.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 20px;
    background: rgba(0, 128, 0, 0.9);
    color: white;
    padding: 8px 16px;
    border-radius: 20px;
    font-family: monospace;
    font-size: 12px;
    z-index: 2147483646;
    pointer-events: none;
  `;
  indicator.textContent = 'SYNC ACTIVE';
  document.body.appendChild(indicator);
}

// Update debug indicator when receiving scroll
function updateDebugIndicator(message: string, color = 'rgba(0, 128, 0, 0.9)') {
  const indicator = document.getElementById('sync-debug-indicator');
  if (indicator) {
    indicator.textContent = message;
    indicator.style.background = color;
    // Flash effect
    indicator.style.transform = 'scale(1.1)';
    setTimeout(() => {
      indicator.style.transform = 'scale(1)';
    }, 100);
  }
}

// Listen for sync stop
onMessage('sync-stopped', ({ data }) => {
  if (currentGroup?.id === data.groupId) {
    logger.info('🛑 Sync stopped - cleaning up state');

    // Stop health checking
    stopHealthCheck();

    // Clear state
    clearSyncState();
  }
});

// Listen for scroll updates from other tabs
onMessage('apply-scroll', ({ data }) => {
  const { position, syncMode } = data;
  logger.info('🟡 APPLY SCROLL - Received apply-scroll message', {
    scrollTop: position.scrollTop,
    scrollHeight: position.scrollHeight,
    clientHeight: position.clientHeight,
    syncMode,
    currentGroup: !!currentGroup,
    currentGroupId: currentGroup?.id,
    willApply: true,
    currentScrollTop: window.pageYOffset,
    timestamp: Date.now(),
  });

  // Update debug indicator
  updateDebugIndicator('RECEIVING...', 'rgba(0, 100, 255, 0.9)');

  // Always apply scroll, don't check currentGroup here
  applyScrollPosition(position, syncMode);

  // Show success after applying
  setTimeout(() => {
    updateDebugIndicator('RECEIVED ✓', 'rgba(0, 150, 255, 0.9)');
    setTimeout(() => {
      updateDebugIndicator('SYNC ACTIVE', 'rgba(0, 128, 0, 0.9)');
    }, 500);
  }, 100);
});

// Listen for sync mode changes
onMessage('sync-mode-changed', ({ data }) => {
  if (currentGroup) {
    currentGroup.syncMode = data.mode;
    // Recreate the scroll handler with the updated group
    currentScrollHandler = createScrollHandler(currentGroup);
    logger.info('Sync mode changed', { mode: data.mode });
  }
});

// Listen for tab removal notifications
onMessage('tab-removed', ({ data }) => {
  const { groupId, removedTabId, remainingTabs } = data as {
    groupId: string;
    removedTabId: number;
    remainingTabs: number[];
  };
  logger.info(`🗑️ Tab ${removedTabId} was removed from group ${groupId}`);

  if (currentGroup && currentGroup.id === groupId) {
    // Update our local group state
    currentGroup.tabs = remainingTabs;
    logger.info(`Updated group tabs count: ${remainingTabs.length}`);

    // Update debug indicator to show reduced tab count
    updateDebugIndicator(`SYNC ACTIVE (${remainingTabs.length} tabs)`, 'rgba(0, 128, 0, 0.9)');
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

// Auto-reconnection logic
function attemptReconnection() {
  if (!currentGroup || reconnectAttempts >= 5) {
    logger.warn('Max reconnection attempts reached or no group to reconnect');
    return;
  }

  reconnectAttempts++;
  logger.info(`🔄 Attempting reconnection #${reconnectAttempts}`);
  updateDebugIndicator(`RECONNECTING... (${reconnectAttempts}/5)`, 'rgba(255, 165, 0, 0.9)');

  // Try to check if background is responsive
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sendMessage('ping', undefined as any, 'background')
    .then(() => {
      logger.info('✅ Background script is responsive, attempting sync restoration');
      // Try to get current sync state from background
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return sendMessage('get-sync-state', undefined as any, 'background') as Promise<{
        activeGroupId: string | null;
        groups: SyncGroup[];
      }>;
    })
    .then((syncState: { activeGroupId: string | null; groups: SyncGroup[] }) => {
      if (syncState && syncState.activeGroupId && currentGroup) {
        // Check if our current group is still active
        const activeGroup = syncState.groups?.find((g: SyncGroup) => g.id === currentGroup?.id);
        if (activeGroup && activeGroup.isActive) {
          logger.info('🟢 Sync group is still active, restoring connection');
          connectionLost = false;
          reconnectAttempts = 0;
          updateDebugIndicator('RECONNECTED ✓', 'rgba(0, 200, 0, 0.9)');

          // Update our local group state
          if (activeGroup) {
            currentGroup = activeGroup;
            currentScrollHandler = createScrollHandler(currentGroup);
          }

          setTimeout(() => {
            updateDebugIndicator('SYNC ACTIVE', 'rgba(0, 128, 0, 0.9)');
          }, 1000);
        } else {
          logger.warn('⚠️ Sync group is no longer active, clearing local state');
          clearSyncState();
        }
      } else {
        logger.warn('⚠️ No active sync state found, clearing local state');
        clearSyncState();
      }
    })
    .catch((error) => {
      logger.error('❌ Reconnection failed', error);

      // Exponential backoff for retry
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 10000);
      setTimeout(() => {
        attemptReconnection();
      }, delay);
    });
}

// Clear sync state when connection is permanently lost
function clearSyncState() {
  logger.info('🧹 Clearing sync state due to lost connection');
  currentGroup = null;
  currentScrollHandler = null;
  connectionLost = false;
  reconnectAttempts = 0;

  // Remove debug indicator
  const indicator = document.getElementById('sync-debug-indicator');
  if (indicator) {
    indicator.remove();
  }
}

// Periodic connection health check
let healthCheckInterval: NodeJS.Timeout | null = null;

function startHealthCheck() {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
  }

  healthCheckInterval = setInterval(() => {
    if (currentGroup && currentGroup.isActive && !connectionLost) {
      // Check if we haven't sent anything for a while (indicating potential issues)
      const timeSinceLastSync = Date.now() - lastSyncTimestamp;

      // If no sync activity for 30 seconds, do a health check
      if (timeSinceLastSync > 30000) {
        logger.info('🏥 Performing connection health check');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sendMessage('ping', undefined as any, 'background')
          .then(() => {
            logger.info('✅ Health check passed');
          })
          .catch((error) => {
            logger.warn('⚠️ Health check failed, marking connection as lost', error);
            connectionLost = true;
            attemptReconnection();
          });
      }
    }
  }, 15000); // Check every 15 seconds
}

function stopHealthCheck() {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }
}

// Auto-cleanup when tab is being closed or navigated away
function handleTabCleanup() {
  if (currentGroup) {
    logger.info('🧹 Tab cleanup - notifying background about tab closure');

    // Send cleanup message to background (fire and forget)
    sendMessage(
      'tab-cleanup',
      {
        groupId: currentGroup.id,
        reason: 'tab_closing',
      },
      'background',
    ).catch(() => {
      // Ignore errors during cleanup
    });

    clearSyncState();
    stopHealthCheck();
  }
}

// Listen for page unload events
window.addEventListener('beforeunload', handleTabCleanup);
window.addEventListener('unload', handleTabCleanup);

// Listen for page visibility changes to handle browser idle/active states
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && currentGroup && connectionLost) {
    logger.info('🔄 Page became visible and connection was lost, attempting reconnection');
    attemptReconnection();
  }
});

// Listen for focus events to handle browser coming back from idle
window.addEventListener('focus', () => {
  if (currentGroup && connectionLost) {
    logger.info('🔄 Window gained focus and connection was lost, attempting reconnection');
    attemptReconnection();
  }
});
