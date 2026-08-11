import { describe, expect, it } from 'vitest';

import type { QuickSyncFeedbackMessage, SyncStatusResponseMessage } from '~/shared/types';

describe('Quick Sync message contracts', () => {
  it('keeps an absolute candidate deadline', () => {
    const message: QuickSyncFeedbackMessage = {
      outcome: 'candidate-selected',
      generation: 3,
      expiresAt: 50_000,
    };

    expect(message).toEqual({
      outcome: 'candidate-selected',
      generation: 3,
      expiresAt: 50_000,
    });
  });

  it('preserves unavailable linked tabs in an active snapshot', () => {
    const response: SyncStatusResponseMessage = {
      status: 'active',
      snapshot: {
        revision: 8,
        sessionEpoch: 2,
        mode: 'ratio',
        linkedTabIds: [11, 22],
        tabs: [
          {
            availability: 'available',
            tabId: 11,
            title: 'Visible title',
            windowId: 1,
            location: 'current-tab',
            connectionStatus: 'connected',
          },
          {
            availability: 'unavailable',
            tabId: 22,
            connectionStatus: 'error',
          },
        ],
      },
    };

    expect(response.status).toBe('active');
    if (response.status === 'active') {
      expect(response.snapshot.linkedTabIds).toEqual([11, 22]);
      expect(response.snapshot.tabs[1]).toEqual({
        availability: 'unavailable',
        tabId: 22,
        connectionStatus: 'error',
      });
    }
  });

  it('distinguishes an explicit state error from inactive state', () => {
    const response: SyncStatusResponseMessage = {
      status: 'error',
      reason: 'storage-error',
    };

    expect(response).toEqual({ status: 'error', reason: 'storage-error' });
  });
});
