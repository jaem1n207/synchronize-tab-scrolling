import { describe, expect, it } from 'vitest';

import type { SyncState } from '~/shared/types/sync-state';

import { isAuthorizedManualSessionMessage } from './manual-session-authorization';

describe('isAuthorizedManualSessionMessage', () => {
  const state: SyncState = {
    isActive: true,
    linkedTabs: [11, 22],
    connectionStatuses: { 11: 'connected', 22: 'connected' },
    mode: 'ratio',
    lastActiveSyncedTabId: 11,
    revision: 4,
    sessionEpoch: 3,
  };

  it('accepts a committed member with the current epoch', () => {
    expect(
      isAuthorizedManualSessionMessage(state, 11, {
        isAutoSync: false,
        sourceTabId: 11,
        sessionEpoch: 3,
      }),
    ).toBe(true);
  });

  it.each([
    { senderTabId: undefined, sourceTabId: 11, sessionEpoch: 3 },
    { senderTabId: 22, sourceTabId: 11, sessionEpoch: 3 },
    { senderTabId: 33, sourceTabId: 33, sessionEpoch: 3 },
    { senderTabId: 11, sourceTabId: 11, sessionEpoch: 2 },
  ])('rejects unauthorized identity %#', ({ senderTabId, sourceTabId, sessionEpoch }) => {
    expect(
      isAuthorizedManualSessionMessage(state, senderTabId, {
        isAutoSync: false,
        sourceTabId,
        sessionEpoch,
      }),
    ).toBe(false);
  });

  it('rejects a member when the committed manual session is inactive', () => {
    expect(
      isAuthorizedManualSessionMessage(
        {
          ...state,
          isActive: false,
        },
        11,
        {
          isAutoSync: false,
          sourceTabId: 11,
          sessionEpoch: 3,
        },
      ),
    ).toBe(false);
  });
});
