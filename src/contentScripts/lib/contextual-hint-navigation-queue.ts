import { isPendingUrlSyncContextualHintId } from '~/shared/lib/contextual-hints';
import type { PendingUrlSyncContextualHintId } from '~/shared/types/contextual-hints';
import type { UrlSyncMode } from '~/shared/types/url-sync';

export function getPendingUrlSyncHintIdForMode(mode: UrlSyncMode): PendingUrlSyncContextualHintId {
  return mode === 'keep-each-tabs-website' ? 'keep-website-path-synced' : 'page-change-synced';
}

export { isPendingUrlSyncContextualHintId };
