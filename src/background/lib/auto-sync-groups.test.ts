import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendMessage } from 'webext-bridge/background';

import {
  broadcastAutoSyncGroupUpdate,
  cancelAutoSyncRetry,
  getAutoSyncGroupMembers,
  isTabInActiveAutoSyncGroup,
  removeTabFromAllAutoSyncGroups,
  stopAutoSyncForGroup,
  updateAutoSyncGroup,
} from './auto-sync-groups';
import {
  autoSyncRetryTimers,
  autoSyncState,
  dismissedUrlGroups,
  MAX_AUTO_SYNC_GROUP_SIZE,
  pendingSuggestions,
  withAutoSyncLock,
} from './auto-sync-state';
import {
  isDomainSnoozed,
  sendSuggestionToSingleTab,
  showSyncSuggestion,
} from './auto-sync-suggestions';

interface AutoSyncGroup {
  tabIds: Set<number>;
  isActive: boolean;
}

const {
  sendMessageMock,
  normalizeUrlForAutoSyncMock,
  isLocalDevelopmentServerMock,
  isUrlExcludedMock,
  isForbiddenUrlMock,
  showSyncSuggestionMock,
  sendSuggestionToSingleTabMock,
  isDomainSnoozedMock,
  withAutoSyncLockMock,
  isTabManuallyOverriddenMock,
  loggerInfoMock,
  loggerDebugMock,
  loggerWarnMock,
  loggerErrorMock,
  mockedAutoSyncState,
  mockedAutoSyncRetryTimers,
  mockedDismissedUrlGroups,
  mockedPendingSuggestions,
  mockedMaxGroupSize,
} = vi.hoisted(() => {
  const sendMessageMock = vi.fn();
  const normalizeUrlForAutoSyncMock = vi.fn();
  const isLocalDevelopmentServerMock = vi.fn();
  const isUrlExcludedMock = vi.fn();
  const isForbiddenUrlMock = vi.fn();
  const showSyncSuggestionMock = vi.fn();
  const sendSuggestionToSingleTabMock = vi.fn();
  const isDomainSnoozedMock = vi.fn().mockReturnValue(false);
  const withAutoSyncLockMock = vi.fn().mockImplementation((fn: () => Promise<unknown>) => fn());
  const isTabManuallyOverriddenMock = vi.fn().mockReturnValue(false);

  const loggerInfoMock = vi.fn();
  const loggerDebugMock = vi.fn();
  const loggerWarnMock = vi.fn();
  const loggerErrorMock = vi.fn();

  const mockedAutoSyncState = {
    enabled: true,
    groups: new Map<string, AutoSyncGroup>(),
    excludedUrls: [] as Array<string>,
  };

  const mockedAutoSyncRetryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const mockedDismissedUrlGroups = new Set<string>();
  const mockedPendingSuggestions = new Set<string>();

  return {
    sendMessageMock,
    normalizeUrlForAutoSyncMock,
    isLocalDevelopmentServerMock,
    isUrlExcludedMock,
    isForbiddenUrlMock,
    showSyncSuggestionMock,
    sendSuggestionToSingleTabMock,
    isDomainSnoozedMock,
    withAutoSyncLockMock,
    isTabManuallyOverriddenMock,
    loggerInfoMock,
    loggerDebugMock,
    loggerWarnMock,
    loggerErrorMock,
    mockedAutoSyncState,
    mockedAutoSyncRetryTimers,
    mockedDismissedUrlGroups,
    mockedPendingSuggestions,
    mockedMaxGroupSize: 10,
  };
});

vi.mock('webext-bridge/background', () => ({
  sendMessage: sendMessageMock,
}));

vi.mock('~/shared/lib/auto-sync-url-utils', () => ({
  normalizeUrlForAutoSync: normalizeUrlForAutoSyncMock,
  isLocalDevelopmentServer: isLocalDevelopmentServerMock,
  isUrlExcluded: isUrlExcludedMock,
}));

vi.mock('~/shared/lib/logger', () => ({
  ExtensionLogger: vi.fn().mockImplementation(() => ({
    info: loggerInfoMock,
    debug: loggerDebugMock,
    warn: loggerWarnMock,
    error: loggerErrorMock,
  })),
}));

vi.mock('~/shared/lib/url-utils', () => ({
  isForbiddenUrl: isForbiddenUrlMock,
}));

vi.mock('./auto-sync-state', () => ({
  autoSyncState: mockedAutoSyncState,
  autoSyncRetryTimers: mockedAutoSyncRetryTimers,
  dismissedUrlGroups: mockedDismissedUrlGroups,
  pendingSuggestions: mockedPendingSuggestions,
  MAX_AUTO_SYNC_GROUP_SIZE: mockedMaxGroupSize,
  isTabManuallyOverridden: isTabManuallyOverriddenMock,
  withAutoSyncLock: withAutoSyncLockMock,
}));

vi.mock('./auto-sync-suggestions', () => ({
  showSyncSuggestion: showSyncSuggestionMock,
  sendSuggestionToSingleTab: sendSuggestionToSingleTabMock,
  isDomainSnoozed: isDomainSnoozedMock,
}));

function createGroup(tabIds: Array<number>, isActive: boolean = false): AutoSyncGroup {
  return { tabIds: new Set(tabIds), isActive };
}

describe('auto-sync-groups', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    autoSyncState.enabled = true;
    autoSyncState.groups.clear();
    autoSyncState.excludedUrls = [];

    autoSyncRetryTimers.clear();
    dismissedUrlGroups.clear();
    pendingSuggestions.clear();

    normalizeUrlForAutoSyncMock.mockImplementation((url: string) => url);
    isForbiddenUrlMock.mockReturnValue(false);
    isLocalDevelopmentServerMock.mockReturnValue(false);
    isUrlExcludedMock.mockReturnValue(false);
    isTabManuallyOverriddenMock.mockReturnValue(false);
    isDomainSnoozedMock.mockReturnValue(false);

    sendMessageMock.mockResolvedValue(undefined);
    showSyncSuggestionMock.mockResolvedValue(undefined);
    sendSuggestionToSingleTabMock.mockResolvedValue(undefined);
    withAutoSyncLockMock.mockImplementation((fn: () => Promise<unknown>) => fn());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('cancelAutoSyncRetry', () => {
    it('clears and deletes timer when one exists', () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
      const timer = setTimeout(() => undefined, 60_000);
      autoSyncRetryTimers.set('https://example.com', timer);

      cancelAutoSyncRetry('https://example.com');

      expect(clearTimeoutSpy).toHaveBeenCalledWith(timer);
      expect(autoSyncRetryTimers.has('https://example.com')).toBe(false);
      clearTimeoutSpy.mockRestore();
    });

    it('does nothing when no timer exists', () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

      cancelAutoSyncRetry('https://missing.com');

      expect(clearTimeoutSpy).not.toHaveBeenCalled();
      expect(autoSyncRetryTimers.size).toBe(0);
      clearTimeoutSpy.mockRestore();
    });
  });

  describe('stopAutoSyncForGroup', () => {
    it('cancels retry timer, stops all tabs, deactivates group, and clears pending suggestion', async () => {
      autoSyncState.groups.set('https://example.com', createGroup([1, 2, 3], true));
      autoSyncRetryTimers.set(
        'https://example.com',
        setTimeout(() => undefined, 60_000),
      );
      pendingSuggestions.add('https://example.com');

      await stopAutoSyncForGroup('https://example.com');

      expect(autoSyncRetryTimers.has('https://example.com')).toBe(false);
      expect(sendMessage).toHaveBeenCalledTimes(3);
      expect(sendMessage).toHaveBeenCalledWith(
        'scroll:stop',
        { isAutoSync: true },
        { context: 'content-script', tabId: 1 },
      );
      expect(sendMessage).toHaveBeenCalledWith(
        'scroll:stop',
        { isAutoSync: true },
        { context: 'content-script', tabId: 2 },
      );
      expect(sendMessage).toHaveBeenCalledWith(
        'scroll:stop',
        { isAutoSync: true },
        { context: 'content-script', tabId: 3 },
      );
      expect(autoSyncState.groups.get('https://example.com')?.isActive).toBe(false);
      expect(pendingSuggestions.has('https://example.com')).toBe(false);
    });

    it('continues when some tabs fail to receive stop message', async () => {
      autoSyncState.groups.set('https://example.com', createGroup([1, 2], true));
      sendMessageMock.mockRejectedValueOnce(new Error('failed')).mockResolvedValueOnce(undefined);

      await stopAutoSyncForGroup('https://example.com');

      expect(sendMessage).toHaveBeenCalledTimes(2);
      expect(autoSyncState.groups.get('https://example.com')?.isActive).toBe(false);
    });

    it('does nothing for non-existent group except canceling retry timer', async () => {
      autoSyncRetryTimers.set(
        'https://unknown.com',
        setTimeout(() => undefined, 60_000),
      );

      await stopAutoSyncForGroup('https://unknown.com');

      expect(autoSyncRetryTimers.has('https://unknown.com')).toBe(false);
      expect(sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('removeTabFromAllAutoSyncGroups', () => {
    it('removes tab from its group', async () => {
      autoSyncState.groups.set('https://example.com', createGroup([1, 2, 3], false));

      await removeTabFromAllAutoSyncGroups(2);

      expect(autoSyncState.groups.get('https://example.com')?.tabIds.has(2)).toBe(false);
      expect(autoSyncState.groups.get('https://example.com')?.tabIds.size).toBe(2);
    });

    it('stops active group when it drops below two tabs', async () => {
      autoSyncState.groups.set('https://example.com', createGroup([10, 11], true));
      autoSyncRetryTimers.set(
        'https://example.com',
        setTimeout(() => undefined, 60_000),
      );

      await removeTabFromAllAutoSyncGroups(10);

      expect(autoSyncRetryTimers.has('https://example.com')).toBe(false);
      expect(sendMessage).toHaveBeenCalledTimes(1);
      expect(sendMessage).toHaveBeenCalledWith(
        'scroll:stop',
        { isAutoSync: true },
        { context: 'content-script', tabId: 11 },
      );
      expect(autoSyncState.groups.get('https://example.com')?.isActive).toBe(false);
    });

    it('deletes empty groups', async () => {
      autoSyncState.groups.set('https://example.com', createGroup([1], false));

      await removeTabFromAllAutoSyncGroups(1);

      expect(autoSyncState.groups.has('https://example.com')).toBe(false);
    });

    it('handles tabs not in any group', async () => {
      autoSyncState.groups.set('https://example.com', createGroup([1, 2], false));

      await removeTabFromAllAutoSyncGroups(99);

      expect(autoSyncState.groups.get('https://example.com')?.tabIds).toEqual(new Set([1, 2]));
      expect(sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('getAutoSyncGroupMembers', () => {
    it('returns other tab ids for active group', () => {
      autoSyncState.groups.set('https://example.com', createGroup([1, 2, 3], true));

      const members = getAutoSyncGroupMembers(2);

      expect(members.sort()).toEqual([1, 3]);
    });

    it('returns empty array for inactive group', () => {
      autoSyncState.groups.set('https://example.com', createGroup([1, 2], false));

      expect(getAutoSyncGroupMembers(1)).toEqual([]);
    });

    it('returns empty array for tab not in any group', () => {
      autoSyncState.groups.set('https://example.com', createGroup([1, 2], true));

      expect(getAutoSyncGroupMembers(9)).toEqual([]);
    });
  });

  describe('isTabInActiveAutoSyncGroup', () => {
    it('returns true for tab in active group', () => {
      autoSyncState.groups.set('https://example.com', createGroup([1, 2], true));

      expect(isTabInActiveAutoSyncGroup(2)).toBe(true);
    });

    it('returns false for tab in inactive group', () => {
      autoSyncState.groups.set('https://example.com', createGroup([1, 2], false));

      expect(isTabInActiveAutoSyncGroup(2)).toBe(false);
    });

    it('returns false for tab not in any group', () => {
      autoSyncState.groups.set('https://example.com', createGroup([1, 2], true));

      expect(isTabInActiveAutoSyncGroup(7)).toBe(false);
    });
  });

  describe('updateAutoSyncGroup', () => {
    it('uses mutex lock wrapper', async () => {
      await updateAutoSyncGroup(1, 'https://example.com');

      expect(withAutoSyncLock).toHaveBeenCalledTimes(1);
    });

    it('returns null when auto-sync is disabled', async () => {
      autoSyncState.enabled = false;

      const result = await updateAutoSyncGroup(1, 'https://example.com');

      expect(result).toBeNull();
      expect(autoSyncState.groups.size).toBe(0);
    });

    it('returns null for forbidden URL', async () => {
      autoSyncState.groups.set('https://old.com', createGroup([1, 2], false));
      isForbiddenUrlMock.mockReturnValue(true);

      const result = await updateAutoSyncGroup(1, 'https://forbidden.com');

      expect(result).toBeNull();
      expect(autoSyncState.groups.get('https://old.com')?.tabIds.has(1)).toBe(false);
    });

    it('returns null for local development server URL', async () => {
      autoSyncState.groups.set('https://old.com', createGroup([1, 2], false));
      isLocalDevelopmentServerMock.mockReturnValue(true);

      const result = await updateAutoSyncGroup(1, 'http://localhost:5173');

      expect(result).toBeNull();
      expect(autoSyncState.groups.get('https://old.com')?.tabIds.has(1)).toBe(false);
    });

    it('returns null for excluded URL', async () => {
      autoSyncState.groups.set('https://old.com', createGroup([1, 2], false));
      autoSyncState.excludedUrls = ['https://excluded.com/*'];
      isUrlExcludedMock.mockReturnValue(true);

      const result = await updateAutoSyncGroup(1, 'https://excluded.com/page');

      expect(result).toBeNull();
      expect(autoSyncState.groups.get('https://old.com')?.tabIds.has(1)).toBe(false);
    });

    it('returns null for manually overridden tab', async () => {
      isTabManuallyOverriddenMock.mockReturnValue(true);

      const result = await updateAutoSyncGroup(1, 'https://example.com');

      expect(result).toBeNull();
      expect(autoSyncState.groups.size).toBe(0);
    });

    it('creates a new group and adds tab', async () => {
      const result = await updateAutoSyncGroup(10, 'https://example.com');

      expect(result).toBe('https://example.com');
      expect(autoSyncState.groups.get('https://example.com')?.tabIds).toEqual(new Set([10]));
      expect(autoSyncState.groups.get('https://example.com')?.isActive).toBe(false);
    });

    it('adds tab to an existing group', async () => {
      autoSyncState.groups.set('https://example.com', createGroup([1], false));

      const result = await updateAutoSyncGroup(2, 'https://example.com');

      expect(result).toBe('https://example.com');
      expect(autoSyncState.groups.get('https://example.com')?.tabIds).toEqual(new Set([1, 2]));
    });

    it('removes tab from old group when URL changes', async () => {
      autoSyncState.groups.set('https://old.com', createGroup([1, 2], false));

      const result = await updateAutoSyncGroup(1, 'https://new.com');

      expect(result).toBe('https://new.com');
      expect(autoSyncState.groups.get('https://old.com')?.tabIds).toEqual(new Set([2]));
      expect(autoSyncState.groups.get('https://new.com')?.tabIds).toEqual(new Set([1]));
    });

    it('shows suggestion when group reaches 2+ tabs and group is inactive and not dismissed', async () => {
      await updateAutoSyncGroup(1, 'https://example.com');
      await updateAutoSyncGroup(2, 'https://example.com');

      expect(showSyncSuggestion).toHaveBeenCalledTimes(1);
      expect(showSyncSuggestion).toHaveBeenCalledWith('https://example.com');
    });

    it('sends suggestion to single tab when pending suggestion already exists', async () => {
      autoSyncState.groups.set('https://example.com', createGroup([1], false));
      pendingSuggestions.add('https://example.com');

      await updateAutoSyncGroup(2, 'https://example.com');

      expect(sendSuggestionToSingleTab).toHaveBeenCalledTimes(1);
      expect(sendSuggestionToSingleTab).toHaveBeenCalledWith(
        2,
        'https://example.com',
        autoSyncState.groups.get('https://example.com'),
      );
      expect(showSyncSuggestion).not.toHaveBeenCalled();
    });

    it('does not show suggestion when group is dismissed', async () => {
      autoSyncState.groups.set('https://example.com', createGroup([1], false));
      dismissedUrlGroups.add('https://example.com');

      await updateAutoSyncGroup(2, 'https://example.com');

      expect(showSyncSuggestion).not.toHaveBeenCalled();
      expect(sendSuggestionToSingleTab).not.toHaveBeenCalled();
    });

    it('does not show suggestion when skipStartSync is true', async () => {
      autoSyncState.groups.set('https://example.com', createGroup([1], false));

      await updateAutoSyncGroup(2, 'https://example.com', true);

      expect(showSyncSuggestion).not.toHaveBeenCalled();
      expect(sendSuggestionToSingleTab).not.toHaveBeenCalled();
    });

    it('does not show suggestion when domain is snoozed', async () => {
      isDomainSnoozedMock.mockReturnValue(true);
      autoSyncState.groups.set('https://github.com/pulls', createGroup([1], false));

      await updateAutoSyncGroup(2, 'https://github.com/pulls');

      expect(isDomainSnoozed).toHaveBeenCalledWith('https://github.com/pulls');
      expect(showSyncSuggestion).not.toHaveBeenCalled();
      expect(sendSuggestionToSingleTab).not.toHaveBeenCalled();
      expect(autoSyncState.groups.get('https://github.com/pulls')?.tabIds).toEqual(new Set([1, 2]));
    });

    it('enforces MAX_AUTO_SYNC_GROUP_SIZE for new tabs', async () => {
      const fullGroupTabIds = Array.from(
        { length: MAX_AUTO_SYNC_GROUP_SIZE },
        (_, index) => index + 1,
      );
      autoSyncState.groups.set('https://example.com', createGroup(fullGroupTabIds, false));

      const result = await updateAutoSyncGroup(MAX_AUTO_SYNC_GROUP_SIZE + 1, 'https://example.com');

      expect(result).toBeNull();
      expect(autoSyncState.groups.get('https://example.com')?.tabIds.size).toBe(
        MAX_AUTO_SYNC_GROUP_SIZE,
      );
    });

    it('broadcasts group update when skipBroadcast is false', async () => {
      await updateAutoSyncGroup(1, 'https://example.com');

      expect(sendMessage).toHaveBeenCalledTimes(1);
      expect(sendMessage).toHaveBeenCalledWith(
        'auto-sync:group-updated',
        {
          groups: [{ normalizedUrl: 'https://example.com', tabIds: [1], isActive: false }],
        },
        { context: 'content-script', tabId: 1 },
      );
    });

    it('skips broadcast when skipBroadcast is true', async () => {
      await updateAutoSyncGroup(1, 'https://example.com', false, true);

      expect(sendMessage).not.toHaveBeenCalled();
    });

    it('returns normalized URL on success', async () => {
      normalizeUrlForAutoSyncMock.mockReturnValue('https://example.com/normalized');

      const result = await updateAutoSyncGroup(1, 'https://example.com/path?a=1');

      expect(result).toBe('https://example.com/normalized');
      expect(autoSyncState.groups.has('https://example.com/normalized')).toBe(true);
    });
  });

  describe('broadcastAutoSyncGroupUpdate', () => {
    it('sends auto-sync:group-updated to all tabs in all groups', async () => {
      autoSyncState.groups.set('https://example.com/a', createGroup([1, 2], false));
      autoSyncState.groups.set('https://example.com/b', createGroup([2, 3], true));

      await broadcastAutoSyncGroupUpdate();

      expect(sendMessage).toHaveBeenCalledTimes(3);
      expect(sendMessage).toHaveBeenCalledWith(
        'auto-sync:group-updated',
        {
          groups: [
            { normalizedUrl: 'https://example.com/a', tabIds: [1, 2], isActive: false },
            { normalizedUrl: 'https://example.com/b', tabIds: [2, 3], isActive: true },
          ],
        },
        { context: 'content-script', tabId: 1 },
      );
      expect(sendMessage).toHaveBeenCalledWith(
        'auto-sync:group-updated',
        {
          groups: [
            { normalizedUrl: 'https://example.com/a', tabIds: [1, 2], isActive: false },
            { normalizedUrl: 'https://example.com/b', tabIds: [2, 3], isActive: true },
          ],
        },
        { context: 'content-script', tabId: 2 },
      );
      expect(sendMessage).toHaveBeenCalledWith(
        'auto-sync:group-updated',
        {
          groups: [
            { normalizedUrl: 'https://example.com/a', tabIds: [1, 2], isActive: false },
            { normalizedUrl: 'https://example.com/b', tabIds: [2, 3], isActive: true },
          ],
        },
        { context: 'content-script', tabId: 3 },
      );
    });

    it('handles send failure gracefully when timeout occurs', async () => {
      vi.useFakeTimers();
      autoSyncState.groups.set('https://example.com', createGroup([1, 2], false));

      sendMessageMock.mockImplementation((_: string, __: unknown, options: { tabId: number }) => {
        if (options.tabId === 1) {
          return new Promise<void>(() => undefined);
        }
        return Promise.resolve(undefined);
      });

      const broadcastPromise = broadcastAutoSyncGroupUpdate();
      await vi.advanceTimersByTimeAsync(1_100);
      await broadcastPromise;

      expect(sendMessage).toHaveBeenCalledTimes(2);
    });

    it('maps groups to AutoSyncGroupInfo payload format', async () => {
      autoSyncState.groups.set('https://example.com', createGroup([5, 6], true));

      await broadcastAutoSyncGroupUpdate();

      const messagePayload = sendMessageMock.mock.calls[0]?.[1] as {
        groups: Array<{ normalizedUrl: string; tabIds: Array<number>; isActive: boolean }>;
      };

      expect(messagePayload.groups).toEqual([
        {
          normalizedUrl: 'https://example.com',
          tabIds: [5, 6],
          isActive: true,
        },
      ]);
    });
  });
});
