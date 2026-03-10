import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  autoSyncState,
  manualSyncOverriddenTabs,
  autoSyncRetryTimers,
  dismissedUrlGroups,
  pendingSuggestions,
  MAX_AUTO_SYNC_GROUP_SIZE,
  autoSyncFlags,
  isTabManuallyOverridden,
  withAutoSyncLock,
} from './auto-sync-state';

describe('auto-sync-state', () => {
  beforeEach(() => {
    autoSyncState.enabled = false;
    autoSyncState.groups.clear();
    autoSyncState.excludedUrls = [];

    manualSyncOverriddenTabs.clear();
    autoSyncRetryTimers.clear();
    dismissedUrlGroups.clear();
    pendingSuggestions.clear();

    autoSyncFlags.isToggling = false;
    autoSyncFlags.isInitializing = false;
    autoSyncFlags.pendingToggleRequest = null;
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('autoSyncState', () => {
    it('should have enabled set to false initially', () => {
      expect(autoSyncState.enabled).toBe(false);
    });

    it('should have empty groups Map initially', () => {
      expect(autoSyncState.groups).toBeInstanceOf(Map);
      expect(autoSyncState.groups.size).toBe(0);
    });

    it('should have empty excludedUrls array initially', () => {
      expect(autoSyncState.excludedUrls).toEqual([]);
      expect(Array.isArray(autoSyncState.excludedUrls)).toBe(true);
    });

    it('should allow mutating enabled property', () => {
      autoSyncState.enabled = true;
      expect(autoSyncState.enabled).toBe(true);
    });

    it('should allow adding to groups Map', () => {
      const groupId = 'group-1';
      const groupData = { tabIds: new Set([1, 2, 3]), isActive: false };
      autoSyncState.groups.set(groupId, groupData);
      expect(autoSyncState.groups.get(groupId)).toEqual(groupData);
    });

    it('should allow adding to excludedUrls array', () => {
      const url = 'https://example.com';
      autoSyncState.excludedUrls.push(url);
      expect(autoSyncState.excludedUrls).toContain(url);
    });
  });

  describe('manualSyncOverriddenTabs', () => {
    it('should be an empty Set initially', () => {
      expect(manualSyncOverriddenTabs).toBeInstanceOf(Set);
      expect(manualSyncOverriddenTabs.size).toBe(0);
    });

    it('should allow adding tab IDs', () => {
      manualSyncOverriddenTabs.add(1);
      expect(manualSyncOverriddenTabs.has(1)).toBe(true);
    });

    it('should allow removing tab IDs', () => {
      manualSyncOverriddenTabs.add(1);
      manualSyncOverriddenTabs.delete(1);
      expect(manualSyncOverriddenTabs.has(1)).toBe(false);
    });
  });

  describe('autoSyncRetryTimers', () => {
    it('should be an empty Map initially', () => {
      expect(autoSyncRetryTimers).toBeInstanceOf(Map);
      expect(autoSyncRetryTimers.size).toBe(0);
    });

    it('should allow storing timeout IDs', () => {
      const timeoutId = setTimeout(() => {}, 1000);
      autoSyncRetryTimers.set('timer-1', timeoutId);
      expect(autoSyncRetryTimers.has('timer-1')).toBe(true);
      clearTimeout(timeoutId);
    });

    it('should allow clearing timers', () => {
      const timeoutId = setTimeout(() => {}, 1000);
      autoSyncRetryTimers.set('timer-1', timeoutId);
      autoSyncRetryTimers.delete('timer-1');
      expect(autoSyncRetryTimers.has('timer-1')).toBe(false);
      clearTimeout(timeoutId);
    });
  });

  describe('dismissedUrlGroups', () => {
    it('should be an empty Set initially', () => {
      expect(dismissedUrlGroups).toBeInstanceOf(Set);
      expect(dismissedUrlGroups.size).toBe(0);
    });

    it('should allow adding URL group IDs', () => {
      dismissedUrlGroups.add('url-group-1');
      expect(dismissedUrlGroups.has('url-group-1')).toBe(true);
    });

    it('should allow removing URL group IDs', () => {
      dismissedUrlGroups.add('url-group-1');
      dismissedUrlGroups.delete('url-group-1');
      expect(dismissedUrlGroups.has('url-group-1')).toBe(false);
    });
  });

  describe('pendingSuggestions', () => {
    it('should be an empty Set initially', () => {
      expect(pendingSuggestions).toBeInstanceOf(Set);
      expect(pendingSuggestions.size).toBe(0);
    });

    it('should allow adding suggestion IDs', () => {
      pendingSuggestions.add('suggestion-1');
      expect(pendingSuggestions.has('suggestion-1')).toBe(true);
    });

    it('should allow removing suggestion IDs', () => {
      pendingSuggestions.add('suggestion-1');
      pendingSuggestions.delete('suggestion-1');
      expect(pendingSuggestions.has('suggestion-1')).toBe(false);
    });
  });

  describe('MAX_AUTO_SYNC_GROUP_SIZE', () => {
    it('should be 10', () => {
      expect(MAX_AUTO_SYNC_GROUP_SIZE).toBe(10);
    });

    it('should be a number', () => {
      expect(typeof MAX_AUTO_SYNC_GROUP_SIZE).toBe('number');
    });
  });

  describe('autoSyncFlags', () => {
    it('should have isToggling set to false initially', () => {
      expect(autoSyncFlags.isToggling).toBe(false);
    });

    it('should have isInitializing set to false initially', () => {
      expect(autoSyncFlags.isInitializing).toBe(false);
    });

    it('should have pendingToggleRequest set to null initially', () => {
      expect(autoSyncFlags.pendingToggleRequest).toBeNull();
    });

    it('should allow mutating isToggling', () => {
      autoSyncFlags.isToggling = true;
      expect(autoSyncFlags.isToggling).toBe(true);
    });

    it('should allow mutating isInitializing', () => {
      autoSyncFlags.isInitializing = true;
      expect(autoSyncFlags.isInitializing).toBe(true);
    });

    it('should allow mutating pendingToggleRequest to boolean', () => {
      autoSyncFlags.pendingToggleRequest = true;
      expect(autoSyncFlags.pendingToggleRequest).toBe(true);
    });
  });

  describe('isTabManuallyOverridden', () => {
    it('should return false for non-overridden tab', () => {
      expect(isTabManuallyOverridden(1)).toBe(false);
    });

    it('should return true after adding tab to manualSyncOverriddenTabs', () => {
      manualSyncOverriddenTabs.add(1);
      expect(isTabManuallyOverridden(1)).toBe(true);
    });

    it('should return false after removing tab from manualSyncOverriddenTabs', () => {
      manualSyncOverriddenTabs.add(1);
      manualSyncOverriddenTabs.delete(1);
      expect(isTabManuallyOverridden(1)).toBe(false);
    });

    it('should handle multiple tabs independently', () => {
      manualSyncOverriddenTabs.add(1);
      manualSyncOverriddenTabs.add(3);
      expect(isTabManuallyOverridden(1)).toBe(true);
      expect(isTabManuallyOverridden(2)).toBe(false);
      expect(isTabManuallyOverridden(3)).toBe(true);
    });
  });

  describe('withAutoSyncLock', () => {
    it('should execute function and return result', async () => {
      const result = await withAutoSyncLock(async () => {
        return 'test-result';
      });
      expect(result).toBe('test-result');
    });

    it('should serialize concurrent calls', async () => {
      const executionOrder: number[] = [];

      const promise1 = withAutoSyncLock(async () => {
        executionOrder.push(1);
        await new Promise((resolve) => setTimeout(resolve, 5));
        executionOrder.push(1);
      });

      const promise2 = withAutoSyncLock(async () => {
        executionOrder.push(2);
        executionOrder.push(2);
      });

      await Promise.all([promise1, promise2]);

      expect(executionOrder).toEqual([1, 1, 2, 2]);
    });

    it('should release lock even if function throws', async () => {
      const executionOrder: number[] = [];

      const promise1 = withAutoSyncLock(async () => {
        executionOrder.push(1);
        throw new Error('test error');
      }).catch(() => {
        void 0;
      });

      const promise2 = withAutoSyncLock(async () => {
        executionOrder.push(2);
      });

      await Promise.all([promise1, promise2]);

      expect(executionOrder).toEqual([1, 2]);
    });

    it('should return number type correctly', async () => {
      const result = await withAutoSyncLock(async () => {
        return 42;
      });
      expect(result).toBe(42);
      expect(typeof result).toBe('number');
    });

    it('should return string type correctly', async () => {
      const result = await withAutoSyncLock(async () => {
        return 'test-string';
      });
      expect(result).toBe('test-string');
      expect(typeof result).toBe('string');
    });

    it('should return object type correctly', async () => {
      const result = await withAutoSyncLock(async () => {
        return { key: 'value', count: 1 };
      });
      expect(result).toEqual({ key: 'value', count: 1 });
    });

    it('should return array type correctly', async () => {
      const result = await withAutoSyncLock(async () => {
        return [1, 2, 3];
      });
      expect(Array.isArray(result)).toBe(true);
      expect(result).toEqual([1, 2, 3]);
    });
  });
});
