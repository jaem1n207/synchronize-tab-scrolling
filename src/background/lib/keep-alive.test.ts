import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SyncState } from '~/shared/types/sync-state';

const {
  loggerDebugMock,
  loggerInfoMock,
  loggerWarnMock,
  loggerErrorMock,
  isContentScriptAliveMock,
  reinjectContentScriptMock,
  persistSyncStateMock,
  commitSyncStateMock,
  broadcastSyncStatusMock,
  tabsGetMock,
  sendMessageWithTimeoutMock,
  syncStateMock,
} = vi.hoisted(() => ({
  loggerDebugMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  isContentScriptAliveMock: vi.fn(),
  reinjectContentScriptMock: vi.fn(),
  persistSyncStateMock: vi.fn(),
  commitSyncStateMock: vi.fn(),
  broadcastSyncStatusMock: vi.fn(),
  tabsGetMock: vi.fn(),
  sendMessageWithTimeoutMock: vi.fn(),
  syncStateMock: {
    isActive: false as boolean,
    linkedTabs: [] as Array<number>,
    connectionStatuses: {} as Record<number, SyncState['connectionStatuses'][number]>,
    lastActiveSyncedTabId: null as number | null,
    mode: undefined as 'ratio' | 'element' | undefined,
    revision: 0,
    sessionEpoch: 0,
  },
}));

vi.mock('webextension-polyfill', () => ({
  default: {
    tabs: {
      get: tabsGetMock,
    },
  },
}));

vi.mock('~/shared/lib/logger', () => ({
  ExtensionLogger: vi.fn().mockImplementation(() => ({
    debug: loggerDebugMock,
    info: loggerInfoMock,
    warn: loggerWarnMock,
    error: loggerErrorMock,
  })),
}));

vi.mock('./content-script-manager', () => ({
  isContentScriptAlive: isContentScriptAliveMock,
  reinjectContentScript: reinjectContentScriptMock,
  reinjectManualReconnect: vi.fn(async (token, isSessionCurrent) => {
    const success = await reinjectContentScriptMock(token.tabId, {
      startMessage: token.startMessage,
      isSessionCurrent,
    });
    return { success, tabId: token.tabId };
  }),
}));

vi.mock('./auto-sync-state', () => ({
  manualSyncOverriddenTabs: new Set<number>(),
  withAutoSyncLock: vi.fn(async (operation: () => Promise<unknown>) => operation()),
}));

vi.mock('./messaging', () => ({
  sendMessageWithTimeout: sendMessageWithTimeoutMock,
}));

vi.mock('./sync-state', () => ({
  syncState: syncStateMock,
  getSyncStateSnapshot: vi.fn(() => ({
    ...syncStateMock,
    linkedTabs: [...syncStateMock.linkedTabs],
    connectionStatuses: { ...syncStateMock.connectionStatuses },
  })),
  persistSyncState: persistSyncStateMock,
  commitSyncState: commitSyncStateMock,
  broadcastSyncStatus: broadcastSyncStatusMock,
}));

vi.mock('./sync-transition-gate', () => ({
  syncTransitionGate: {
    run: vi.fn(
      async (
        transition: (context: {
          operationGeneration: number;
          expectedRevision: number;
        }) => Promise<unknown>,
      ) =>
        transition({
          operationGeneration: 1,
          expectedRevision: syncStateMock.revision,
        }),
    ),
  },
}));

import { startKeepAlive, stopKeepAlive } from './keep-alive';

async function triggerKeepAliveTick(): Promise<void> {
  await vi.advanceTimersByTimeAsync(25_000);
  for (let index = 0; index < 12; index += 1) {
    await Promise.resolve();
  }
}

describe('keep-alive', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stopKeepAlive();
    vi.clearAllMocks();

    syncStateMock.isActive = false;
    syncStateMock.linkedTabs = [];
    syncStateMock.connectionStatuses = {};
    syncStateMock.lastActiveSyncedTabId = null;
    syncStateMock.mode = undefined;
    syncStateMock.revision = 0;
    syncStateMock.sessionEpoch = 0;
    tabsGetMock.mockImplementation(async (tabId: number) => ({ id: tabId }));
    sendMessageWithTimeoutMock.mockImplementation(
      async (_message: string, _data: unknown, destination: { tabId: number }) => ({
        success: true,
        tabId: destination.tabId,
      }),
    );
    persistSyncStateMock.mockResolvedValue({ status: 'persisted' });
    commitSyncStateMock.mockImplementation((nextState: SyncState) => {
      syncStateMock.isActive = nextState.isActive;
      syncStateMock.linkedTabs = [...nextState.linkedTabs];
      syncStateMock.connectionStatuses = { ...nextState.connectionStatuses };
      syncStateMock.lastActiveSyncedTabId = nextState.lastActiveSyncedTabId;
      syncStateMock.mode = nextState.mode;
      syncStateMock.revision = nextState.revision;
      syncStateMock.sessionEpoch = nextState.sessionEpoch;
    });
    broadcastSyncStatusMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    stopKeepAlive();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('startKeepAlive', () => {
    it('starts keep-alive interval', () => {
      const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');

      startKeepAlive();

      expect(setIntervalSpy).toHaveBeenCalledTimes(1);
      expect(loggerInfoMock).toHaveBeenCalledWith('Keep-alive started');
    });

    it('does not start duplicate interval when already running', () => {
      const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');

      startKeepAlive();
      startKeepAlive();

      expect(setIntervalSpy).toHaveBeenCalledTimes(1);
      expect(loggerDebugMock).toHaveBeenCalledWith('Keep-alive already running');
    });

    it('runs interval every 25000ms', () => {
      const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');

      startKeepAlive();

      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 25_000);
    });

    it('does not trigger health check before interval elapses', async () => {
      syncStateMock.isActive = true;
      syncStateMock.linkedTabs = [11];
      isContentScriptAliveMock.mockResolvedValue(true);

      startKeepAlive();
      vi.advanceTimersByTime(24_999);
      await Promise.resolve();

      expect(isContentScriptAliveMock).not.toHaveBeenCalled();
    });
  });

  describe('stopKeepAlive', () => {
    it('clears interval when running', () => {
      const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

      startKeepAlive();
      stopKeepAlive();

      expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
      expect(loggerInfoMock).toHaveBeenCalledWith('Keep-alive stopped');
    });

    it('does nothing when interval is not running', () => {
      const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

      stopKeepAlive();

      expect(clearIntervalSpy).not.toHaveBeenCalled();
    });

    it('can restart keep-alive after stopping', () => {
      const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');

      startKeepAlive();
      stopKeepAlive();
      startKeepAlive();

      expect(setIntervalSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('health check logic', () => {
    it('checks all linked tabs when sync is active', async () => {
      syncStateMock.isActive = true;
      syncStateMock.linkedTabs = [1, 2, 3];
      syncStateMock.connectionStatuses = {
        1: 'connected',
        2: 'connected',
        3: 'connected',
      };
      isContentScriptAliveMock.mockResolvedValue(true);

      startKeepAlive();
      await triggerKeepAliveTick();

      expect(isContentScriptAliveMock).toHaveBeenCalledTimes(3);
      expect(isContentScriptAliveMock).toHaveBeenNthCalledWith(1, 1);
      expect(isContentScriptAliveMock).toHaveBeenNthCalledWith(2, 2);
      expect(isContentScriptAliveMock).toHaveBeenNthCalledWith(3, 3);
    });

    it('takes no recovery action when tab is alive', async () => {
      syncStateMock.isActive = true;
      syncStateMock.linkedTabs = [5];
      syncStateMock.connectionStatuses[5] = 'connected';
      isContentScriptAliveMock.mockResolvedValue(true);

      startKeepAlive();
      await triggerKeepAliveTick();

      expect(reinjectContentScriptMock).not.toHaveBeenCalled();
      expect(persistSyncStateMock).not.toHaveBeenCalled();
    });

    it('reinjects when tab is not alive and status is connected', async () => {
      syncStateMock.isActive = true;
      syncStateMock.linkedTabs = [8];
      syncStateMock.connectionStatuses[8] = 'connected';
      isContentScriptAliveMock.mockResolvedValue(false);
      reinjectContentScriptMock.mockResolvedValue(true);

      startKeepAlive();
      await triggerKeepAliveTick();

      expect(reinjectContentScriptMock).toHaveBeenCalledTimes(1);
      expect(reinjectContentScriptMock).toHaveBeenCalledWith(
        8,
        expect.objectContaining({
          startMessage: {
            tabIds: [8],
            mode: 'ratio',
            currentTabId: 8,
            isAutoSync: false,
            sessionEpoch: 0,
          },
          isSessionCurrent: expect.any(Function),
        }),
      );
    });

    it('does not reinject after a health check crosses into a replacement manual session', async () => {
      const healthCheck = Promise.withResolvers<boolean>();
      syncStateMock.isActive = true;
      syncStateMock.linkedTabs = [8, 9];
      syncStateMock.connectionStatuses = { 8: 'connected', 9: 'connected' };
      syncStateMock.mode = 'ratio';
      syncStateMock.sessionEpoch = 3;
      isContentScriptAliveMock.mockReturnValue(healthCheck.promise);

      startKeepAlive();
      vi.advanceTimersByTime(25_000);
      await Promise.resolve();

      syncStateMock.linkedTabs = [18, 19];
      syncStateMock.connectionStatuses = { 18: 'connected', 19: 'connected' };
      syncStateMock.mode = 'element';
      syncStateMock.sessionEpoch = 4;
      healthCheck.resolve(false);
      await Promise.resolve();
      await Promise.resolve();

      expect(reinjectContentScriptMock).not.toHaveBeenCalled();
      expect(persistSyncStateMock).not.toHaveBeenCalled();
    });

    it('sets error status and persists state when reinjection fails', async () => {
      syncStateMock.isActive = true;
      syncStateMock.linkedTabs = [13];
      syncStateMock.connectionStatuses[13] = 'connected';
      isContentScriptAliveMock.mockResolvedValue(false);
      reinjectContentScriptMock.mockResolvedValue(false);

      startKeepAlive();
      await triggerKeepAliveTick();

      expect(syncStateMock.connectionStatuses[13]).toBe('error');
      expect(persistSyncStateMock).toHaveBeenCalledTimes(1);
    });

    it('does not persist state when reinjection succeeds', async () => {
      syncStateMock.isActive = true;
      syncStateMock.linkedTabs = [21];
      syncStateMock.connectionStatuses[21] = 'connected';
      isContentScriptAliveMock.mockResolvedValue(false);
      reinjectContentScriptMock.mockResolvedValue(true);

      startKeepAlive();
      await triggerKeepAliveTick();

      expect(persistSyncStateMock).not.toHaveBeenCalled();
    });

    it('skips reinjection when tab is not connected', async () => {
      syncStateMock.isActive = true;
      syncStateMock.linkedTabs = [34];
      syncStateMock.connectionStatuses[34] = 'disconnected';
      isContentScriptAliveMock.mockResolvedValue(false);

      startKeepAlive();
      await triggerKeepAliveTick();

      expect(reinjectContentScriptMock).not.toHaveBeenCalled();
      expect(persistSyncStateMock).not.toHaveBeenCalled();
    });

    it('skips health checks when sync is inactive', async () => {
      syncStateMock.isActive = false;
      syncStateMock.linkedTabs = [55];

      startKeepAlive();
      await triggerKeepAliveTick();

      expect(isContentScriptAliveMock).not.toHaveBeenCalled();
      expect(reinjectContentScriptMock).not.toHaveBeenCalled();
    });

    it('skips health checks when there are no linked tabs', async () => {
      syncStateMock.isActive = true;
      syncStateMock.linkedTabs = [];

      startKeepAlive();
      await triggerKeepAliveTick();

      expect(isContentScriptAliveMock).not.toHaveBeenCalled();
      expect(reinjectContentScriptMock).not.toHaveBeenCalled();
    });
  });
});
