import { describe, expect, it } from 'vitest';

import { createQuickSyncCandidateStore } from './quick-sync-candidate';

describe('createQuickSyncCandidateStore', () => {
  it('accepts a different-tab command received before the absolute deadline', () => {
    const store = createQuickSyncCandidateStore();
    store.arm({ tabId: 11, expiresAt: 30_000, generation: 1 });

    expect(
      store.reserveForSecondTab({
        tabId: 22,
        commandReceivedAt: 29_999,
        operationGeneration: 4,
      }),
    ).toEqual({
      status: 'reserved',
      candidate: { tabId: 11, expiresAt: 30_000, generation: 1 },
      operationGeneration: 4,
    });
  });

  it('expires a command received at the deadline', () => {
    const store = createQuickSyncCandidateStore();
    store.arm({ tabId: 11, expiresAt: 30_000, generation: 1 });

    expect(
      store.reserveForSecondTab({
        tabId: 22,
        commandReceivedAt: 30_000,
        operationGeneration: 4,
      }),
    ).toEqual({ status: 'expired', generation: 1 });
    expect(store.read()).toBeNull();
  });

  it('does not extend a same-tab candidate', () => {
    const store = createQuickSyncCandidateStore();
    store.arm({ tabId: 11, expiresAt: 30_000, generation: 1 });

    expect(
      store.reserveForSecondTab({
        tabId: 11,
        commandReceivedAt: 25_000,
        operationGeneration: 4,
      }),
    ).toEqual({
      status: 'same-tab',
      candidate: { tabId: 11, expiresAt: 30_000, generation: 1 },
    });
    expect(store.read()).toEqual({ tabId: 11, expiresAt: 30_000, generation: 1 });
  });

  it('reserves monotonically increasing candidate generations', () => {
    const store = createQuickSyncCandidateStore();

    expect(store.reserveGeneration()).toBe(1);
    expect(store.reserveGeneration()).toBe(2);
  });

  it('hides a reserved candidate and protects it from matching clears', () => {
    const store = createQuickSyncCandidateStore();
    store.arm({ tabId: 11, expiresAt: 30_000, generation: 1 });
    store.reserveForSecondTab({
      tabId: 22,
      commandReceivedAt: 29_000,
      operationGeneration: 4,
    });

    expect(store.read()).toBeNull();
    expect(store.clear(1)).toBe(false);
    expect(store.clearForTab(11)).toBeNull();
  });

  it('restores a failed reserved attempt before its original deadline', () => {
    const store = createQuickSyncCandidateStore();
    store.arm({ tabId: 11, expiresAt: 30_000, generation: 1 });
    store.reserveForSecondTab({
      tabId: 22,
      commandReceivedAt: 29_000,
      operationGeneration: 4,
    });

    expect(
      store.finishSecondTabAttempt({
        generation: 1,
        operationGeneration: 4,
        succeeded: false,
        completedAt: 29_999,
      }),
    ).toBe('restored');
    expect(store.read()).toEqual({ tabId: 11, expiresAt: 30_000, generation: 1 });
  });

  it('clears a failed reserved attempt at its original deadline', () => {
    const store = createQuickSyncCandidateStore();
    store.arm({ tabId: 11, expiresAt: 30_000, generation: 1 });
    store.reserveForSecondTab({
      tabId: 22,
      commandReceivedAt: 29_000,
      operationGeneration: 4,
    });

    expect(
      store.finishSecondTabAttempt({
        generation: 1,
        operationGeneration: 4,
        succeeded: false,
        completedAt: 30_000,
      }),
    ).toBe('cleared');
    expect(store.read()).toBeNull();
  });

  it('clears a successful reserved attempt', () => {
    const store = createQuickSyncCandidateStore();
    store.arm({ tabId: 11, expiresAt: 30_000, generation: 1 });
    store.reserveForSecondTab({
      tabId: 22,
      commandReceivedAt: 29_000,
      operationGeneration: 4,
    });

    expect(
      store.finishSecondTabAttempt({
        generation: 1,
        operationGeneration: 4,
        succeeded: true,
        completedAt: 31_000,
      }),
    ).toBe('cleared');
  });

  it('terminally clears a reserved attempt before its original deadline', () => {
    const store = createQuickSyncCandidateStore();
    store.arm({ tabId: 11, expiresAt: 30_000, generation: 1 });
    store.reserveForSecondTab({
      tabId: 22,
      commandReceivedAt: 29_000,
      operationGeneration: 4,
    });

    expect(
      store.abortSecondTabAttempt({
        generation: 1,
        operationGeneration: 4,
      }),
    ).toBe('cleared');
    expect(store.read()).toBeNull();
  });

  it('protects a reservation from a stale terminal abort', () => {
    const store = createQuickSyncCandidateStore();
    store.arm({ tabId: 11, expiresAt: 30_000, generation: 1 });
    store.reserveForSecondTab({
      tabId: 22,
      commandReceivedAt: 29_000,
      operationGeneration: 4,
    });

    expect(
      store.abortSecondTabAttempt({
        generation: 1,
        operationGeneration: 3,
      }),
    ).toBe('stale');
    expect(store.clear(1)).toBe(false);
  });

  it('ignores a stale completion from a different operation generation', () => {
    const store = createQuickSyncCandidateStore();
    store.arm({ tabId: 11, expiresAt: 30_000, generation: 1 });
    store.reserveForSecondTab({
      tabId: 22,
      commandReceivedAt: 29_000,
      operationGeneration: 4,
    });

    expect(
      store.finishSecondTabAttempt({
        generation: 1,
        operationGeneration: 3,
        succeeded: false,
        completedAt: 29_500,
      }),
    ).toBe('stale');
    expect(store.clear(1)).toBe(false);
  });
});
