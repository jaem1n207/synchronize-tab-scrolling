import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isContentScriptAlive, reinjectContentScript } from './content-script-manager';
import { sendMessageWithTimeout } from './messaging';
import { broadcastSyncStatus, persistSyncState, syncState } from './sync-state';

const {
  executeScriptMock,
  sendMessageWithTimeoutMock,
  persistSyncStateMock,
  broadcastSyncStatusMock,
} = vi.hoisted(() => ({
  executeScriptMock: vi.fn(),
  sendMessageWithTimeoutMock: vi.fn(),
  persistSyncStateMock: vi.fn(),
  broadcastSyncStatusMock: vi.fn(),
}));

vi.mock('webextension-polyfill', () => ({
  default: {
    scripting: {
      executeScript: executeScriptMock,
    },
  },
}));

vi.mock('~/shared/lib/logger', () => ({
  ExtensionLogger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock('./messaging', () => ({
  sendMessageWithTimeout: sendMessageWithTimeoutMock,
}));

vi.mock('./sync-state', () => ({
  syncState: {
    isActive: false,
    linkedTabs: [] as Array<number>,
    connectionStatuses: {} as Record<number, 'connected' | 'disconnected' | 'error'>,
    lastActiveSyncedTabId: null as number | null,
    mode: undefined as 'ratio' | 'element' | undefined,
  },
  persistSyncState: persistSyncStateMock,
  broadcastSyncStatus: broadcastSyncStatusMock,
}));

describe('content-script-manager', () => {
  beforeEach(() => {
    syncState.linkedTabs = [1, 2, 3];
    syncState.mode = undefined;
    syncState.connectionStatuses = {};

    persistSyncStateMock.mockResolvedValue(undefined);
    broadcastSyncStatusMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('isContentScriptAlive', () => {
    it('returns true when ping succeeds with success=true', async () => {
      sendMessageWithTimeoutMock.mockResolvedValue({ success: true });

      await expect(isContentScriptAlive(10)).resolves.toBe(true);
    });

    it('returns false when ping succeeds with success=false', async () => {
      sendMessageWithTimeoutMock.mockResolvedValue({ success: false });

      await expect(isContentScriptAlive(11)).resolves.toBe(false);
    });

    it('returns false when ping throws or times out', async () => {
      sendMessageWithTimeoutMock.mockRejectedValue(new Error('Timeout after 1000ms'));

      await expect(isContentScriptAlive(12)).resolves.toBe(false);
    });

    it('uses scroll:ping with content-script destination and 1000ms timeout', async () => {
      sendMessageWithTimeoutMock.mockResolvedValue({ success: true });

      await isContentScriptAlive(13);

      expect(sendMessageWithTimeoutMock).toHaveBeenCalledTimes(1);
      expect(sendMessageWithTimeout).toHaveBeenCalledWith(
        'scroll:ping',
        expect.objectContaining({ tabId: 13, timestamp: expect.any(Number) }),
        { context: 'content-script', tabId: 13 },
        1000,
      );
    });
  });

  describe('reinjectContentScript', () => {
    it('reinjects script, waits 500ms, restarts sync, persists state, and returns true', async () => {
      vi.useFakeTimers();
      executeScriptMock.mockResolvedValue(undefined);
      sendMessageWithTimeoutMock.mockResolvedValue({ success: true, tabId: 2 });

      const promise = reinjectContentScript(2);
      await Promise.resolve();

      expect(executeScriptMock).toHaveBeenCalledWith({
        target: { tabId: 2 },
        files: ['dist/contentScripts/index.global.js'],
      });
      expect(sendMessageWithTimeoutMock).not.toHaveBeenCalled();

      vi.advanceTimersByTime(500);

      await expect(promise).resolves.toBe(true);

      expect(sendMessageWithTimeout).toHaveBeenCalledWith(
        'scroll:start',
        {
          tabIds: [1, 2, 3],
          mode: 'ratio',
          currentTabId: 2,
        },
        { context: 'content-script', tabId: 2 },
        3000,
      );
      expect(syncState.connectionStatuses[2]).toBe('connected');
      expect(persistSyncState).toHaveBeenCalledTimes(1);
      expect(broadcastSyncStatus).toHaveBeenCalledTimes(1);
    });

    it('uses existing sync mode when mode is set', async () => {
      vi.useFakeTimers();
      syncState.mode = 'element';
      executeScriptMock.mockResolvedValue(undefined);
      sendMessageWithTimeoutMock.mockResolvedValue({ success: true, tabId: 3 });

      const promise = reinjectContentScript(3);
      await Promise.resolve();
      vi.advanceTimersByTime(500);
      await promise;

      expect(sendMessageWithTimeout).toHaveBeenCalledWith(
        'scroll:start',
        {
          tabIds: [1, 2, 3],
          mode: 'element',
          currentTabId: 3,
        },
        { context: 'content-script', tabId: 3 },
        3000,
      );
    });

    it('returns false when executeScript throws', async () => {
      executeScriptMock.mockRejectedValue(new Error('Cannot inject'));

      await expect(reinjectContentScript(4)).resolves.toBe(false);

      expect(sendMessageWithTimeoutMock).not.toHaveBeenCalled();
      expect(persistSyncState).not.toHaveBeenCalled();
      expect(broadcastSyncStatus).not.toHaveBeenCalled();
    });

    it('returns false when scroll:start response has wrong tabId', async () => {
      vi.useFakeTimers();
      executeScriptMock.mockResolvedValue(undefined);
      sendMessageWithTimeoutMock.mockResolvedValue({ success: true, tabId: 999 });

      const promise = reinjectContentScript(5);
      await Promise.resolve();
      vi.advanceTimersByTime(500);

      await expect(promise).resolves.toBe(false);

      expect(syncState.connectionStatuses[5]).toBeUndefined();
      expect(persistSyncState).not.toHaveBeenCalled();
      expect(broadcastSyncStatus).not.toHaveBeenCalled();
    });

    it('returns false when scroll:start response success is false', async () => {
      vi.useFakeTimers();
      executeScriptMock.mockResolvedValue(undefined);
      sendMessageWithTimeoutMock.mockResolvedValue({ success: false, tabId: 6 });

      const promise = reinjectContentScript(6);
      await Promise.resolve();
      vi.advanceTimersByTime(500);

      await expect(promise).resolves.toBe(false);

      expect(syncState.connectionStatuses[6]).toBeUndefined();
      expect(persistSyncState).not.toHaveBeenCalled();
      expect(broadcastSyncStatus).not.toHaveBeenCalled();
    });

    it('returns false when scroll:start times out', async () => {
      vi.useFakeTimers();
      executeScriptMock.mockResolvedValue(undefined);
      sendMessageWithTimeoutMock.mockRejectedValue(new Error('Timeout after 3000ms'));

      const promise = reinjectContentScript(7);
      await Promise.resolve();
      vi.advanceTimersByTime(500);

      await expect(promise).resolves.toBe(false);

      expect(syncState.connectionStatuses[7]).toBeUndefined();
      expect(persistSyncState).not.toHaveBeenCalled();
      expect(broadcastSyncStatus).not.toHaveBeenCalled();
    });

    it('returns false when scroll:start response is undefined', async () => {
      vi.useFakeTimers();
      executeScriptMock.mockResolvedValue(undefined);
      sendMessageWithTimeoutMock.mockResolvedValue(undefined);

      const promise = reinjectContentScript(8);
      await Promise.resolve();
      vi.advanceTimersByTime(500);

      await expect(promise).resolves.toBe(false);

      expect(syncState.connectionStatuses[8]).toBeUndefined();
      expect(persistSyncState).not.toHaveBeenCalled();
      expect(broadcastSyncStatus).not.toHaveBeenCalled();
    });

    it('keeps existing status for a tab when reinjection fails', async () => {
      vi.useFakeTimers();
      syncState.connectionStatuses[9] = 'disconnected';
      executeScriptMock.mockResolvedValue(undefined);
      sendMessageWithTimeoutMock.mockResolvedValue({ success: false, tabId: 9 });

      const promise = reinjectContentScript(9);
      await Promise.resolve();
      vi.advanceTimersByTime(500);

      await expect(promise).resolves.toBe(false);

      expect(syncState.connectionStatuses[9]).toBe('disconnected');
    });

    it('marks tab as connected only after successful scroll:start response', async () => {
      vi.useFakeTimers();
      syncState.connectionStatuses[10] = 'disconnected';
      executeScriptMock.mockResolvedValue(undefined);
      sendMessageWithTimeoutMock.mockResolvedValue({ success: true, tabId: 10 });

      const promise = reinjectContentScript(10);
      await Promise.resolve();

      expect(syncState.connectionStatuses[10]).toBe('disconnected');

      vi.advanceTimersByTime(500);
      await promise;

      expect(syncState.connectionStatuses[10]).toBe('connected');
    });
  });
});
