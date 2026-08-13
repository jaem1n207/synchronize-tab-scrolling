import { describe, expect, it } from 'vitest';

import { isRuntimeRelayMessageIdentity } from './runtime-relay-identity';

describe('isRuntimeRelayMessageIdentity', () => {
  it('accepts exact manual and auto runtime identities', () => {
    expect(
      isRuntimeRelayMessageIdentity({
        isAutoSync: false,
        sourceTabId: 7,
        sessionEpoch: 3,
      }),
    ).toBe(true);
    expect(
      isRuntimeRelayMessageIdentity({
        isAutoSync: true,
        sourceTabId: 7,
        autoSyncGeneration: '11111111-1111-4111-8111-111111111111',
      }),
    ).toBe(true);
  });

  it.each([
    {
      name: 'manual identity without an epoch',
      value: { isAutoSync: false, sourceTabId: 7 },
    },
    {
      name: 'manual identity with an activation UUID',
      value: {
        isAutoSync: false,
        sourceTabId: 7,
        sessionEpoch: 3,
        autoSyncGeneration: '11111111-1111-4111-8111-111111111111',
      },
    },
    {
      name: 'auto identity without an activation UUID',
      value: { isAutoSync: true, sourceTabId: 7 },
    },
    {
      name: 'auto identity with a malformed activation UUID',
      value: { isAutoSync: true, sourceTabId: 7, autoSyncGeneration: 'not-a-uuid' },
    },
    {
      name: 'auto identity with a manual epoch',
      value: {
        isAutoSync: true,
        sourceTabId: 7,
        autoSyncGeneration: '11111111-1111-4111-8111-111111111111',
        sessionEpoch: 3,
      },
    },
  ])('rejects $name', ({ value }) => {
    expect(isRuntimeRelayMessageIdentity(value)).toBe(false);
  });
});
