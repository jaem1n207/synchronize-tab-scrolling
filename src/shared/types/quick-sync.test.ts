import { describe, expect, it } from 'vitest';

import type {
  QuickSyncFeedbackMessage,
  SyncStatusRequestMessage,
  SyncStatusResponseMessage,
} from '~/shared/types';
import type {
  ProtocolMap,
  StartSyncContentMessage,
  StartSyncMessage,
} from '~/shared/types/messages';

type IsExact<TLeft, TRight> =
  (<T>() => T extends TLeft ? 1 : 2) extends <T>() => T extends TRight ? 1 : 2
    ? (<T>() => T extends TRight ? 1 : 2) extends <T>() => T extends TLeft ? 1 : 2
      ? true
      : false
    : false;

describe('Quick Sync message contracts', () => {
  it('keeps the exported scroll:start protocol aligned with both destinations', () => {
    const protocolIsExact: IsExact<
      ProtocolMap['scroll:start'],
      StartSyncMessage | StartSyncContentMessage
    > = true;

    expect(protocolIsExact).toBe(true);
  });

  it('keeps the split sync status requests aligned with the exported protocol', () => {
    const protocolIsExact: IsExact<ProtocolMap['sync:get-status'], SyncStatusRequestMessage> = true;

    expect(protocolIsExact).toBe(true);
  });

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
      source: 'popup',
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
    if (response.status === 'active' && response.source === 'popup') {
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
