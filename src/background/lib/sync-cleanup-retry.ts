import type { StopSyncContentResponse } from '~/shared/types/messages';
import type { SyncState } from '~/shared/types/sync-state';

import type { SyncTransitionGate } from './sync-transition-gate';

export const MANUAL_CLEANUP_RETRY_DELAYS_MS: ReadonlyArray<number> = [1_000, 3_000, 10_000];

export interface PendingManualCleanup {
  tabId: number;
  stoppedRevision: number;
  stoppedSessionEpoch: number;
  attemptIndex: number;
}

export interface ManualCleanupRetryScheduler {
  schedule(input: PendingManualCleanup): void;
  cancelForTab(tabId: number): void;
  cancelAll(): void;
}

interface ScheduledManualCleanup {
  input: PendingManualCleanup;
  timer: ReturnType<typeof setTimeout>;
}

export function createManualCleanupRetryScheduler(dependencies: {
  transitionGate: SyncTransitionGate;
  getState: () => SyncState;
  sendStop: (tabId: number) => Promise<StopSyncContentResponse>;
  setTimer: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimer: (timer: ReturnType<typeof setTimeout>) => void;
}): ManualCleanupRetryScheduler {
  const pendingByTabId = new Map<number, ScheduledManualCleanup>();

  const cancelForTab = (tabId: number): void => {
    const scheduled = pendingByTabId.get(tabId);
    if (!scheduled) {
      return;
    }

    dependencies.clearTimer(scheduled.timer);
    pendingByTabId.delete(tabId);
  };

  const schedule = (input: PendingManualCleanup): void => {
    cancelForTab(input.tabId);

    const delay = MANUAL_CLEANUP_RETRY_DELAYS_MS[input.attemptIndex];
    if (delay === undefined) {
      return;
    }

    const scheduled: ScheduledManualCleanup = {
      input: { ...input },
      timer: dependencies.setTimer(() => {
        if (pendingByTabId.get(input.tabId) !== scheduled) {
          return;
        }

        dependencies.transitionGate
          .run(async () => {
            if (pendingByTabId.get(input.tabId) !== scheduled) {
              return;
            }

            const state = dependencies.getState();
            if (
              state.sessionEpoch !== input.stoppedSessionEpoch ||
              (state.isActive && state.linkedTabs.includes(input.tabId))
            ) {
              pendingByTabId.delete(input.tabId);
              return;
            }

            let acknowledgement: StopSyncContentResponse;
            try {
              acknowledgement = await dependencies.sendStop(input.tabId);
            } catch {
              acknowledgement = { success: false };
            }

            if (acknowledgement.success && acknowledgement.tabId === input.tabId) {
              pendingByTabId.delete(input.tabId);
              return;
            }

            pendingByTabId.delete(input.tabId);
            schedule({
              ...input,
              attemptIndex: input.attemptIndex + 1,
            });
          })
          .catch(() => undefined);
      }, delay),
    };
    pendingByTabId.set(input.tabId, scheduled);
  };

  return {
    schedule,
    cancelForTab,
    cancelAll() {
      for (const tabId of [...pendingByTabId.keys()]) {
        cancelForTab(tabId);
      }
    },
  };
}
