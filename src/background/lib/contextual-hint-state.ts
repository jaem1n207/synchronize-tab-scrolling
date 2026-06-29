import type { PendingUrlSyncContextualHintId } from '~/shared/types/contextual-hints';

const pendingUrlSyncContextualHints = new Map<number, PendingUrlSyncContextualHintId>();

export function savePendingUrlSyncContextualHint(
  tabId: number,
  hintId: PendingUrlSyncContextualHintId,
): void {
  pendingUrlSyncContextualHints.set(tabId, hintId);
}

export function consumePendingUrlSyncContextualHint(
  tabId: number,
): PendingUrlSyncContextualHintId | null {
  const hintId = pendingUrlSyncContextualHints.get(tabId) ?? null;
  pendingUrlSyncContextualHints.delete(tabId);
  return hintId;
}

export function clearPendingUrlSyncContextualHint(tabId: number): void {
  pendingUrlSyncContextualHints.delete(tabId);
}
