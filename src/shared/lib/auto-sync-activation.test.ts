import { describe, expect, it } from 'vitest';

import { isAutoSyncActivationId } from './auto-sync-activation';

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
