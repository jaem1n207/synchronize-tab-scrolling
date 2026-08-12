import { isAutoSyncActivationId } from './auto-sync-activation';

import type { RuntimeRelayMessageIdentity } from '~/shared/types/sync-session';

function isTabId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isSessionEpoch(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function isRuntimeRelayMessageIdentity(
  value: unknown,
): value is RuntimeRelayMessageIdentity {
  if (typeof value !== 'object' || value === null || !isTabId(Reflect.get(value, 'sourceTabId'))) {
    return false;
  }

  const isAutoSync = Reflect.get(value, 'isAutoSync');
  if (isAutoSync === true) {
    return (
      isAutoSyncActivationId(Reflect.get(value, 'autoSyncGeneration')) &&
      Reflect.get(value, 'sessionEpoch') === undefined
    );
  }

  return (
    isAutoSync === false &&
    isSessionEpoch(Reflect.get(value, 'sessionEpoch')) &&
    Reflect.get(value, 'autoSyncGeneration') === undefined
  );
}
