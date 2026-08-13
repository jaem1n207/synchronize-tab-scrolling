import { describe, expect, it } from 'vitest';

import { doesAutoSyncStopMatchActivation, isAutoSyncActivationId } from './auto-sync-activation';

describe('isAutoSyncActivationId', () => {
  it('accepts a canonical UUID v4 activation identity', () => {
    expect(isAutoSyncActivationId('11111111-1111-4111-8111-111111111111')).toBe(true);
  });

  it.each([
    undefined,
    null,
    1,
    '',
    '11111111-1111-1111-8111-111111111111',
    '11111111-1111-4111-7111-111111111111',
    'not-an-activation-id',
  ])('rejects malformed activation identity %s', (value) => {
    expect(isAutoSyncActivationId(value)).toBe(false);
  });
});

describe('doesAutoSyncStopMatchActivation', () => {
  const activeActivationId = '11111111-1111-4111-8111-111111111111';

  it('accepts the exact active UUID and the legacy unspecified identity', () => {
    expect(doesAutoSyncStopMatchActivation(activeActivationId, activeActivationId)).toBe(true);
    expect(doesAutoSyncStopMatchActivation(undefined, activeActivationId)).toBe(true);
  });

  it.each(['22222222-2222-4222-8222-222222222222', 'not-a-uuid', null])(
    'rejects stale or malformed cleanup identity %s',
    (requestedActivationId) => {
      expect(doesAutoSyncStopMatchActivation(requestedActivationId, activeActivationId)).toBe(
        false,
      );
    },
  );
});
