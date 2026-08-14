import { describe, expect, it } from 'vitest';

import {
  clearPendingUrlSyncContextualHint,
  consumePendingUrlSyncContextualHint,
  hasPendingUrlSyncContextualHint,
  savePendingUrlSyncContextualHint,
} from './contextual-hint-state';

describe('contextual hint state', () => {
  it('stores and consumes pending URL Sync hints by tab ID', () => {
    savePendingUrlSyncContextualHint(10, 'page-change-synced');
    savePendingUrlSyncContextualHint(20, 'keep-website-path-synced');

    expect(consumePendingUrlSyncContextualHint(10)).toBe('page-change-synced');
    expect(consumePendingUrlSyncContextualHint(10)).toBeNull();
    expect(consumePendingUrlSyncContextualHint(20)).toBe('keep-website-path-synced');
  });

  it('reports a pending URL Sync navigation without consuming its hint', () => {
    savePendingUrlSyncContextualHint(25, 'keep-website-path-synced');

    expect(hasPendingUrlSyncContextualHint(25)).toBe(true);
    expect(consumePendingUrlSyncContextualHint(25)).toBe('keep-website-path-synced');
    expect(hasPendingUrlSyncContextualHint(25)).toBe(false);
  });

  it('clears a pending hint without consuming other tabs', () => {
    savePendingUrlSyncContextualHint(30, 'page-change-synced');
    savePendingUrlSyncContextualHint(40, 'keep-website-path-synced');

    clearPendingUrlSyncContextualHint(30);

    expect(consumePendingUrlSyncContextualHint(30)).toBeNull();
    expect(consumePendingUrlSyncContextualHint(40)).toBe('keep-website-path-synced');
  });
});
