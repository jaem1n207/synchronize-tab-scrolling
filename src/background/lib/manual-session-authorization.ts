import type { ManualMessageIdentity } from '~/shared/types/sync-session';
import type { SyncState } from '~/shared/types/sync-state';

export function isAuthorizedManualSessionMessage(
  state: SyncState,
  senderTabId: number | undefined,
  identity: ManualMessageIdentity,
): boolean {
  return (
    state.isActive &&
    Number.isSafeInteger(senderTabId) &&
    senderTabId === identity.sourceTabId &&
    state.linkedTabs.includes(identity.sourceTabId) &&
    identity.sessionEpoch === state.sessionEpoch
  );
}
