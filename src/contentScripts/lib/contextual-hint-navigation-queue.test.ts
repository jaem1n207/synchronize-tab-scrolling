import {
  getPendingUrlSyncHintIdForMode,
  isPendingUrlSyncContextualHintId,
} from './contextual-hint-navigation-queue';

describe('contextual hint navigation queue', () => {
  it('maps URL Sync modes to the post-navigation hint id', () => {
    expect(getPendingUrlSyncHintIdForMode('follow-changed-tab')).toBe('page-change-synced');
    expect(getPendingUrlSyncHintIdForMode('keep-each-tabs-website')).toBe(
      'keep-website-path-synced',
    );
  });

  it('validates pending URL Sync hint ids', () => {
    expect(isPendingUrlSyncContextualHintId('page-change-synced')).toBe(true);
    expect(isPendingUrlSyncContextualHintId('keep-website-path-synced')).toBe(true);
    expect(isPendingUrlSyncContextualHintId('manual-scroll-adjustment')).toBe(false);
  });
});
