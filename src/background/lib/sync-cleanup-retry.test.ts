import { describe, expect, it, vi } from 'vitest';

import type { AutoSyncGroup } from '~/shared/types/auto-sync-state';
import type { StopSyncContentResponse } from '~/shared/types/messages';
import type { SyncState } from '~/shared/types/sync-state';

import { createLegacyAutoSyncAdapter } from './legacy-auto-sync-adapter';
import {
  MANUAL_CLEANUP_RETRY_DELAYS_MS,
  createManualCleanupRetryScheduler,
} from './sync-cleanup-retry';

interface ScheduledTimer {
  callback: () => void;
  delay: number;
  cleared: boolean;
  timer: ReturnType<typeof setTimeout>;
}

const inactiveState: SyncState = {
  isActive: false,
  linkedTabs: [],
  connectionStatuses: {},
  lastActiveSyncedTabId: null,
  revision: 8,
  sessionEpoch: 4,
};

function createSchedulerHarness(initialState: SyncState = inactiveState) {
  let state = initialState;
  const timers: Array<ScheduledTimer> = [];
  const gateEntries: Array<number> = [];
  const sendStop = vi.fn<(tabId: number) => Promise<StopSyncContentResponse>>(
    async (tabId: number) => ({ success: true, tabId }),
  );

  const scheduler = createManualCleanupRetryScheduler({
    transitionGate: {
      run: async (transition) => {
        gateEntries.push(gateEntries.length + 1);
        return transition({
          operationGeneration: gateEntries.length,
          expectedRevision: state.revision,
        });
      },
    },
    getState: () => ({
      ...state,
      linkedTabs: [...state.linkedTabs],
      connectionStatuses: { ...state.connectionStatuses },
    }),
    sendStop,
    setTimer: (callback, delay) => {
      const timer = setTimeout(() => undefined, 0);
      clearTimeout(timer);
      timers.push({ callback, delay, cleared: false, timer });
      return timer;
    },
    clearTimer: (timer) => {
      const scheduled = timers.find((candidate) => candidate.timer === timer);
      if (scheduled) {
        scheduled.cleared = true;
      }
      clearTimeout(timer);
    },
  });

  return {
    scheduler,
    timers,
    gateEntries,
    sendStop,
    createSiblingScheduler() {
      return createManualCleanupRetryScheduler({
        transitionGate: {
          run: async (transition) =>
            transition({
              operationGeneration: gateEntries.length + 1,
              expectedRevision: state.revision,
            }),
        },
        getState: () => ({
          ...state,
          linkedTabs: [...state.linkedTabs],
          connectionStatuses: { ...state.connectionStatuses },
        }),
        sendStop: async (tabId) => ({ success: true, tabId }),
        setTimer: (callback, delay) => {
          const timer = setTimeout(() => undefined, 0);
          clearTimeout(timer);
          timers.push({ callback, delay, cleared: false, timer });
          return timer;
        },
        clearTimer: (timer) => {
          const scheduled = timers.find((candidate) => candidate.timer === timer);
          if (scheduled) {
            scheduled.cleared = true;
          }
          clearTimeout(timer);
        },
      });
    },
    setState(nextState: SyncState) {
      state = nextState;
    },
    async fire(timerIndex: number): Promise<void> {
      timers[timerIndex]?.callback();
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

describe('createManualCleanupRetryScheduler', () => {
  it('uses the exact 1s, 3s, and 10s retry sequence and stops after exhaustion', async () => {
    const harness = createSchedulerHarness();
    harness.sendStop.mockResolvedValue({ success: false });

    harness.scheduler.schedule({
      tabId: 11,
      stoppedRevision: 8,
      stoppedSessionEpoch: 4,
      attemptIndex: 0,
    });

    expect(MANUAL_CLEANUP_RETRY_DELAYS_MS).toEqual([1_000, 3_000, 10_000]);
    expect(harness.timers.map((timer) => timer.delay)).toEqual([1_000]);

    await harness.fire(0);
    expect(harness.timers.map((timer) => timer.delay)).toEqual([1_000, 3_000]);

    await harness.fire(1);
    expect(harness.timers.map((timer) => timer.delay)).toEqual([1_000, 3_000, 10_000]);

    await harness.fire(2);
    expect(harness.timers).toHaveLength(3);
    expect(harness.sendStop).toHaveBeenCalledTimes(3);
    expect(harness.gateEntries).toHaveLength(3);
  });

  it('removes pending cleanup only after an exact successful acknowledgement', async () => {
    const harness = createSchedulerHarness();
    harness.sendStop
      .mockResolvedValueOnce({ success: true, tabId: 99 })
      .mockResolvedValueOnce({ success: true, tabId: 11 });

    harness.scheduler.schedule({
      tabId: 11,
      stoppedRevision: 8,
      stoppedSessionEpoch: 4,
      attemptIndex: 0,
    });

    await harness.fire(0);
    expect(harness.timers.map((timer) => timer.delay)).toEqual([1_000, 3_000]);

    await harness.fire(1);
    expect(harness.timers).toHaveLength(2);
    expect(harness.sendStop).toHaveBeenCalledTimes(2);
  });

  it('cancels before cleanup when the tab belongs to an active session', async () => {
    const harness = createSchedulerHarness();
    harness.scheduler.schedule({
      tabId: 11,
      stoppedRevision: 8,
      stoppedSessionEpoch: 4,
      attemptIndex: 0,
    });
    harness.setState({
      isActive: true,
      linkedTabs: [11, 22],
      connectionStatuses: { 11: 'connected', 22: 'connected' },
      mode: 'ratio',
      lastActiveSyncedTabId: 11,
      revision: 9,
      sessionEpoch: 5,
    });

    await harness.fire(0);

    expect(harness.gateEntries).toHaveLength(1);
    expect(harness.sendStop).not.toHaveBeenCalled();
    expect(harness.timers).toHaveLength(1);
  });

  it('cancels when the committed epoch differs even if the tab is not a member', async () => {
    const harness = createSchedulerHarness();
    harness.scheduler.schedule({
      tabId: 11,
      stoppedRevision: 8,
      stoppedSessionEpoch: 4,
      attemptIndex: 0,
    });
    harness.setState({
      ...inactiveState,
      revision: 9,
      sessionEpoch: 5,
    });

    await harness.fire(0);

    expect(harness.sendStop).not.toHaveBeenCalled();
    expect(harness.timers).toHaveLength(1);
  });

  it('cancels when a restored or reconnected worker has advanced the committed revision', async () => {
    const harness = createSchedulerHarness();
    harness.scheduler.schedule({
      tabId: 11,
      stoppedRevision: 8,
      stoppedSessionEpoch: 4,
      attemptIndex: 0,
    });
    harness.setState({
      ...inactiveState,
      revision: 9,
    });

    await harness.fire(0);

    expect(harness.gateEntries).toHaveLength(1);
    expect(harness.sendStop).not.toHaveBeenCalled();
    expect(harness.timers).toHaveLength(1);
  });

  it('cancels a manual retry when accepted auto replacement commits the same tabs', async () => {
    const harness = createSchedulerHarness();
    const acceptedAutoScheduler = harness.createSiblingScheduler();
    const normalizedUrl = 'https://fixture.invalid/accepted';
    const groups = new Map<string, AutoSyncGroup>([
      [
        normalizedUrl,
        {
          tabIds: new Set([11, 22]),
          isActive: false,
        },
      ],
    ]);
    harness.scheduler.schedule({
      tabId: 11,
      stoppedRevision: 8,
      stoppedSessionEpoch: 4,
      attemptIndex: 0,
    });
    const adapter = createLegacyAutoSyncAdapter({
      groups,
      withLock: async (operation) => operation(),
      getState: () => inactiveState,
      cleanupScheduler: acceptedAutoScheduler,
      sendStart: async () => true,
      sendStop: async (tabId) => ({ success: true, tabId }),
      createActivationId: () => '11111111-1111-4111-8111-111111111111',
    });

    await expect(
      adapter.startAcceptedGroup({
        normalizedUrl,
        tabIds: [11, 22],
        expectedRevision: 8,
      }),
    ).resolves.toEqual({ status: 'started' });
    harness.setState({
      ...inactiveState,
      revision: 9,
    });
    await harness.fire(0);

    expect(groups.get(normalizedUrl)?.isActive).toBe(true);
    expect(harness.sendStop).not.toHaveBeenCalled();
    expect(harness.timers[0]?.cleared).toBe(true);
  });

  it('replaces an older timer for the same tab and supports explicit cancellation', () => {
    const harness = createSchedulerHarness();
    const input = {
      tabId: 11,
      stoppedRevision: 8,
      stoppedSessionEpoch: 4,
      attemptIndex: 0,
    };

    harness.scheduler.schedule(input);
    harness.scheduler.schedule(input);

    expect(harness.timers[0]?.cleared).toBe(true);
    expect(harness.timers[1]?.cleared).toBe(false);

    harness.scheduler.cancelForTab(11);
    expect(harness.timers[1]?.cleared).toBe(true);
  });
});
