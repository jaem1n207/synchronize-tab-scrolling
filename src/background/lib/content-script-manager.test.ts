import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { StartSyncContentMessage } from '~/shared/types/messages';

import {
  isContentScriptAlive,
  reinjectContentScript,
  reinjectManualReconnect,
} from './content-script-manager';
import { sendMessageWithTimeout } from './messaging';

import type { ReconnectAttemptToken } from './sync-session-orchestrator';

const { executeScriptMock, sendMessageWithTimeoutMock } = vi.hoisted(() => ({
  executeScriptMock: vi.fn(),
  sendMessageWithTimeoutMock: vi.fn(),
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

describe('content-script-manager', () => {
  function createManualReinjectionContext(
    tabId = 2,
    mode: 'ratio' | 'element' = 'ratio',
    isSessionCurrent: () => boolean = () => true,
  ): {
    startMessage: StartSyncContentMessage;
    isSessionCurrent: () => boolean;
  } {
    return {
      startMessage: {
        tabIds: [1, 2, 3],
        mode,
        currentTabId: tabId,
        sessionEpoch: 8,
      },
      isSessionCurrent,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
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
    it('sends the caller-frozen start message instead of sampling replacement state', async () => {
      vi.useFakeTimers();
      executeScriptMock.mockResolvedValue(undefined);
      sendMessageWithTimeoutMock.mockResolvedValue({ success: true, tabId: 2 });
      const context = createManualReinjectionContext();

      const promise = reinjectContentScript(2, context);
      await Promise.resolve();
      vi.advanceTimersByTime(500);
      await promise;

      expect(sendMessageWithTimeout).toHaveBeenCalledWith(
        'scroll:start',
        {
          tabIds: [1, 2, 3],
          mode: 'ratio',
          currentTabId: 2,
          sessionEpoch: 8,
        },
        { context: 'content-script', tabId: 2 },
        3_000,
      );
    });

    it('stops after injection when the captured session becomes stale during the delay', async () => {
      vi.useFakeTimers();
      executeScriptMock.mockResolvedValue(undefined);
      let isCurrent = true;
      const context = createManualReinjectionContext(2, 'ratio', () => isCurrent);

      const promise = reinjectContentScript(2, context);
      await Promise.resolve();
      isCurrent = false;
      vi.advanceTimersByTime(500);

      await expect(promise).resolves.toBe(false);
      expect(sendMessageWithTimeout).not.toHaveBeenCalled();
    });

    it('reinjects script, waits 500ms, restarts the frozen session, and returns true', async () => {
      vi.useFakeTimers();
      executeScriptMock.mockResolvedValue(undefined);
      sendMessageWithTimeoutMock.mockResolvedValue({ success: true, tabId: 2 });

      const promise = reinjectContentScript(2, createManualReinjectionContext());
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
          sessionEpoch: 8,
        },
        { context: 'content-script', tabId: 2 },
        3000,
      );
    });

    it('forwards the caller-captured sync mode', async () => {
      vi.useFakeTimers();
      executeScriptMock.mockResolvedValue(undefined);
      sendMessageWithTimeoutMock.mockResolvedValue({ success: true, tabId: 3 });

      const promise = reinjectContentScript(3, createManualReinjectionContext(3, 'element'));
      await Promise.resolve();
      vi.advanceTimersByTime(500);
      await promise;

      expect(sendMessageWithTimeout).toHaveBeenCalledWith(
        'scroll:start',
        {
          tabIds: [1, 2, 3],
          mode: 'element',
          currentTabId: 3,
          sessionEpoch: 8,
        },
        { context: 'content-script', tabId: 3 },
        3000,
      );
    });

    it('forwards the caller-frozen auto-sync activation identity', async () => {
      vi.useFakeTimers();
      executeScriptMock.mockResolvedValue(undefined);
      sendMessageWithTimeoutMock.mockResolvedValue({ success: true, tabId: 4 });
      const startMessage: StartSyncContentMessage = {
        tabIds: [4, 5],
        mode: 'ratio',
        currentTabId: 4,
        isAutoSync: true,
        autoSyncGeneration: '11111111-1111-4111-8111-111111111111',
      };

      const promise = reinjectContentScript(4, {
        startMessage,
        isSessionCurrent: () => true,
      });
      await Promise.resolve();
      vi.advanceTimersByTime(500);

      await expect(promise).resolves.toBe(true);
      expect(sendMessageWithTimeout).toHaveBeenCalledWith(
        'scroll:start',
        startMessage,
        { context: 'content-script', tabId: 4 },
        3_000,
      );
    });

    it('returns false when executeScript throws', async () => {
      executeScriptMock.mockRejectedValue(new Error('Cannot inject'));

      await expect(reinjectContentScript(4, createManualReinjectionContext(4))).resolves.toBe(
        false,
      );

      expect(sendMessageWithTimeoutMock).not.toHaveBeenCalled();
    });

    it('returns false when scroll:start response has wrong tabId', async () => {
      vi.useFakeTimers();
      executeScriptMock.mockResolvedValue(undefined);
      sendMessageWithTimeoutMock.mockResolvedValue({ success: true, tabId: 999 });

      const promise = reinjectContentScript(5, createManualReinjectionContext(5));
      await Promise.resolve();
      vi.advanceTimersByTime(500);

      await expect(promise).resolves.toBe(false);
    });

    it('returns false when scroll:start response success is false', async () => {
      vi.useFakeTimers();
      executeScriptMock.mockResolvedValue(undefined);
      sendMessageWithTimeoutMock.mockResolvedValue({ success: false, tabId: 6 });

      const promise = reinjectContentScript(6, createManualReinjectionContext(6));
      await Promise.resolve();
      vi.advanceTimersByTime(500);

      await expect(promise).resolves.toBe(false);
    });

    it('returns false when scroll:start times out', async () => {
      vi.useFakeTimers();
      executeScriptMock.mockResolvedValue(undefined);
      sendMessageWithTimeoutMock.mockRejectedValue(new Error('Timeout after 3000ms'));

      const promise = reinjectContentScript(7, createManualReinjectionContext(7));
      await Promise.resolve();
      vi.advanceTimersByTime(500);

      await expect(promise).resolves.toBe(false);
    });

    it('returns false when scroll:start response is undefined', async () => {
      vi.useFakeTimers();
      executeScriptMock.mockResolvedValue(undefined);
      sendMessageWithTimeoutMock.mockResolvedValue(undefined);

      const promise = reinjectContentScript(8, createManualReinjectionContext(8));
      await Promise.resolve();
      vi.advanceTimersByTime(500);

      await expect(promise).resolves.toBe(false);
    });

    it('returns false without owning connection-state mutation when reinjection fails', async () => {
      vi.useFakeTimers();
      executeScriptMock.mockResolvedValue(undefined);
      sendMessageWithTimeoutMock.mockResolvedValue({ success: false, tabId: 9 });

      const promise = reinjectContentScript(9, createManualReinjectionContext(9));
      await Promise.resolve();
      vi.advanceTimersByTime(500);

      await expect(promise).resolves.toBe(false);
    });

    it('revalidates the captured session after the scroll:start acknowledgement', async () => {
      vi.useFakeTimers();
      executeScriptMock.mockResolvedValue(undefined);
      const acknowledgement = Promise.withResolvers<{ success: boolean; tabId: number }>();
      sendMessageWithTimeoutMock.mockReturnValue(acknowledgement.promise);
      let isCurrent = true;

      const promise = reinjectContentScript(
        10,
        createManualReinjectionContext(10, 'ratio', () => isCurrent),
      );
      await Promise.resolve();
      vi.advanceTimersByTime(500);
      await Promise.resolve();
      isCurrent = false;
      acknowledgement.resolve({ success: true, tabId: 10 });

      await expect(promise).resolves.toBe(false);
    });
  });

  describe('reinjectManualReconnect', () => {
    it('returns an exact acknowledgement for the frozen reconnect token', async () => {
      vi.useFakeTimers();
      executeScriptMock.mockResolvedValue(undefined);
      sendMessageWithTimeoutMock.mockResolvedValue({ success: true, tabId: 12 });
      const token: ReconnectAttemptToken = {
        tabId: 12,
        revision: 9,
        sessionEpoch: 4,
        attemptGeneration: 3,
        startMessage: {
          tabIds: [12, 13],
          mode: 'element',
          currentTabId: 12,
          isAutoSync: false,
          sessionEpoch: 4,
        },
      };

      const promise = reinjectManualReconnect(token, () => true);
      await Promise.resolve();
      vi.advanceTimersByTime(500);

      await expect(promise).resolves.toEqual({ success: true, tabId: 12 });
      expect(sendMessageWithTimeout).toHaveBeenCalledWith(
        'scroll:start',
        token.startMessage,
        { context: 'content-script', tabId: 12 },
        3_000,
      );
    });
  });
});
