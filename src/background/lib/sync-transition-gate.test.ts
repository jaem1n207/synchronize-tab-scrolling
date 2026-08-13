import { describe, expect, it, vi } from 'vitest';

vi.mock('./sync-state', () => ({
  getSyncStateSnapshot: vi.fn(() => ({
    revision: 0,
  })),
}));

import { createSyncTransitionGate } from './sync-transition-gate';

describe('createSyncTransitionGate', () => {
  it('serializes transitions and reads committed revision when each transition starts', async () => {
    const events: Array<string> = [];
    let revision = 4;
    const firstRelease = Promise.withResolvers<void>();
    const gate = createSyncTransitionGate(() => revision);

    const first = gate.run(async (context) => {
      events.push(`first:${context.operationGeneration}:${context.expectedRevision}`);
      await firstRelease.promise;
      revision = 5;
    });
    const second = gate.run(async (context) => {
      events.push(`second:${context.operationGeneration}:${context.expectedRevision}`);
    });

    await Promise.resolve();
    expect(events).toEqual(['first:1:4']);

    firstRelease.resolve();
    await Promise.all([first, second]);

    expect(events).toEqual(['first:1:4', 'second:2:5']);
  });

  it('continues the FIFO queue after a prior transition rejects', async () => {
    const events: Array<string> = [];
    let revision = 8;
    const firstRelease = Promise.withResolvers<void>();
    const gate = createSyncTransitionGate(() => revision);

    const first = gate.run(async () => {
      events.push('first');
      await firstRelease.promise;
      revision = 9;
      throw new Error('transition failed');
    });
    const second = gate.run(async (context) => {
      events.push(`second:${context.operationGeneration}:${context.expectedRevision}`);
      return 'continued';
    });

    firstRelease.resolve();

    await expect(first).rejects.toThrow('transition failed');
    await expect(second).resolves.toBe('continued');
    expect(events).toEqual(['first', 'second:2:9']);
  });
});
