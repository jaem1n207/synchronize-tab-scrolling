import type { ContextualHintId } from '~/shared/types/contextual-hints';
import type { UrlSyncMode } from '~/shared/types/url-sync';

export const PENDING_URL_SYNC_CONTEXTUAL_HINT_SESSION_KEY =
  'scrollSyncPendingUrlSyncContextualHintId';

export type PendingUrlSyncContextualHintId = Extract<
  ContextualHintId,
  'page-change-synced' | 'keep-website-path-synced'
>;

export interface PendingUrlSyncHintStorageSuccess {
  status: 'success';
}

export interface PendingUrlSyncHintStorageFailure {
  status: 'failed';
}

export type PendingUrlSyncHintStorageResult =
  | PendingUrlSyncHintStorageSuccess
  | PendingUrlSyncHintStorageFailure;

export interface ConsumePendingUrlSyncHintSuccess {
  status: 'success';
  hintId: PendingUrlSyncContextualHintId | null;
}

export interface ConsumePendingUrlSyncHintFailure {
  status: 'failed';
}

export type ConsumePendingUrlSyncHintResult =
  | ConsumePendingUrlSyncHintSuccess
  | ConsumePendingUrlSyncHintFailure;

export function getPendingUrlSyncHintIdForMode(mode: UrlSyncMode): PendingUrlSyncContextualHintId {
  return mode === 'keep-each-tabs-website' ? 'keep-website-path-synced' : 'page-change-synced';
}

export function isPendingUrlSyncContextualHintId(
  value: unknown,
): value is PendingUrlSyncContextualHintId {
  return value === 'page-change-synced' || value === 'keep-website-path-synced';
}

export function savePendingUrlSyncContextualHintId(
  storage: Pick<Storage, 'setItem'>,
  hintId: PendingUrlSyncContextualHintId,
): PendingUrlSyncHintStorageResult {
  try {
    storage.setItem(PENDING_URL_SYNC_CONTEXTUAL_HINT_SESSION_KEY, hintId);
    return { status: 'success' };
  } catch {
    return { status: 'failed' };
  }
}

export function consumePendingUrlSyncContextualHintId(
  storage: Pick<Storage, 'getItem' | 'removeItem'>,
): ConsumePendingUrlSyncHintResult {
  try {
    const storedHintId = storage.getItem(PENDING_URL_SYNC_CONTEXTUAL_HINT_SESSION_KEY);

    if (!storedHintId) {
      return { status: 'success', hintId: null };
    }

    storage.removeItem(PENDING_URL_SYNC_CONTEXTUAL_HINT_SESSION_KEY);

    if (!isPendingUrlSyncContextualHintId(storedHintId)) {
      return { status: 'success', hintId: null };
    }

    return { status: 'success', hintId: storedHintId };
  } catch {
    return { status: 'failed' };
  }
}
