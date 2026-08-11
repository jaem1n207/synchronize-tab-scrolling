import { getSyncStateSnapshot } from './sync-state';

export interface SyncTransitionContext {
  operationGeneration: number;
  expectedRevision: number;
}

export interface SyncTransitionGate {
  run<T>(transition: (context: SyncTransitionContext) => Promise<T>): Promise<T>;
}

export function createSyncTransitionGate(getCommittedRevision: () => number): SyncTransitionGate {
  let tail: Promise<void> = Promise.resolve();
  let operationGeneration = 0;

  return {
    run<T>(transition: (context: SyncTransitionContext) => Promise<T>): Promise<T> {
      const result = tail.then(() =>
        transition({
          operationGeneration: ++operationGeneration,
          expectedRevision: getCommittedRevision(),
        }),
      );

      tail = result.then(
        () => undefined,
        () => undefined,
      );

      return result;
    },
  };
}

export const syncTransitionGate = createSyncTransitionGate(() => getSyncStateSnapshot().revision);
