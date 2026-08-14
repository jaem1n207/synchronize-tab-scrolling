import { isPendingUrlSyncContextualHintId } from '~/shared/lib/contextual-hints';
import type { PendingUrlSyncContextualHintId } from '~/shared/types/contextual-hints';
import type { UrlSyncMode } from '~/shared/types/url-sync';

export function getPendingUrlSyncHintIdForMode(mode: UrlSyncMode): PendingUrlSyncContextualHintId {
  return mode === 'follow-changed-tab' ? 'page-change-synced' : 'keep-website-path-synced';
}

export { isPendingUrlSyncContextualHintId };
