/// <reference types="vitest/globals" />

import {
  PENDING_URL_SYNC_CONTEXTUAL_HINT_SESSION_KEY,
  consumePendingUrlSyncContextualHintId,
  getPendingUrlSyncHintIdForMode,
  savePendingUrlSyncContextualHintId,
} from './contextual-hint-navigation-queue';

describe('contextual hint navigation queue', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('maps URL Sync modes to the post-navigation hint id', () => {
    expect(getPendingUrlSyncHintIdForMode('follow-changed-tab')).toBe('page-change-synced');
    expect(getPendingUrlSyncHintIdForMode('keep-each-tabs-website')).toBe(
      'keep-website-path-synced',
    );
  });

  it('stores and consumes a pending URL Sync hint id once', () => {
    expect(savePendingUrlSyncContextualHintId(sessionStorage, 'page-change-synced')).toEqual({
      status: 'success',
    });

    expect(consumePendingUrlSyncContextualHintId(sessionStorage)).toEqual({
      status: 'success',
      hintId: 'page-change-synced',
    });
    expect(consumePendingUrlSyncContextualHintId(sessionStorage)).toEqual({
      status: 'success',
      hintId: null,
    });
  });

  it('drops invalid stored values without exposing them as hints', () => {
    sessionStorage.setItem(PENDING_URL_SYNC_CONTEXTUAL_HINT_SESSION_KEY, 'not-a-hint');

    expect(consumePendingUrlSyncContextualHintId(sessionStorage)).toEqual({
      status: 'success',
      hintId: null,
    });
    expect(sessionStorage.getItem(PENDING_URL_SYNC_CONTEXTUAL_HINT_SESSION_KEY)).toBeNull();
  });

  it('reports storage write failures without throwing', () => {
    const storage = {
      setItem: vi.fn(() => {
        throw new Error('SecurityError');
      }),
    };

    expect(savePendingUrlSyncContextualHintId(storage, 'keep-website-path-synced')).toEqual({
      status: 'failed',
    });
  });
});
