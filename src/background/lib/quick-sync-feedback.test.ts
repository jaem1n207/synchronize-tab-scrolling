import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RecentQuickSyncOutcome } from '~/shared/types/quick-sync';

import {
  createQuickSyncBadgeController,
  createQuickSyncFeedbackSender,
  createQuickSyncHandshakeRegistry,
  createRecentQuickSyncOutcomeStore,
} from './quick-sync-feedback';

import type { QuickSyncPort } from './quick-sync-feedback';

function createPort(): QuickSyncPort {
  return {
    disconnect: vi.fn(),
    onDisconnect: {
      addListener: vi.fn(),
    },
  };
}

describe('createQuickSyncHandshakeRegistry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves only a generation-bound Port from the expected sender tab', async () => {
    const registry = createQuickSyncHandshakeRegistry({ now: () => 10_000 });
    const port = createPort();
    const pending = registry.begin({ tabId: 11, generation: 3, expiresAt: 20_000 });

    expect(registry.bindPort({ generation: 3, senderTabId: 22, port })).toBe(false);
    expect(registry.bindPort({ generation: 2, senderTabId: 11, port })).toBe(false);
    expect(registry.bindPort({ generation: 3, senderTabId: 11, port })).toBe(true);
    await expect(pending).resolves.toBe(port);
  });

  it('rejects a handshake after the shorter remaining candidate lifetime', async () => {
    const registry = createQuickSyncHandshakeRegistry({ now: () => 10_000 });
    const pending = registry.begin({ tabId: 11, generation: 3, expiresAt: 10_500 });
    const rejection = expect(pending).rejects.toThrow('quick-sync-handshake-timeout');

    await vi.advanceTimersByTimeAsync(500);

    await rejection;
    expect(registry.bindPort({ generation: 3, senderTabId: 11, port: createPort() })).toBe(false);
  });

  it('discards and returns an already-bound provisional Port', async () => {
    const registry = createQuickSyncHandshakeRegistry({ now: () => 10_000 });
    const port = createPort();
    const pending = registry.begin({ tabId: 11, generation: 3, expiresAt: 20_000 });
    registry.bindPort({ generation: 3, senderTabId: 11, port });
    await pending;

    expect(registry.discard(3)).toBe(port);
    expect(registry.discard(3)).toBeUndefined();
  });
});

describe('createQuickSyncFeedbackSender', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('bounds feedback readiness to the control-plane timeout', async () => {
    const sender = createQuickSyncFeedbackSender(
      () => new Promise(() => undefined),
      setTimeout,
      clearTimeout,
    );
    const pending = sender(11, {
      outcome: 'candidate-selected',
      generation: 3,
      expiresAt: 20_000,
    });
    const rejection = expect(pending).rejects.toThrow('quick-sync-feedback-timeout');

    await vi.advanceTimersByTimeAsync(1_000);

    await rejection;
  });
});

describe('createRecentQuickSyncOutcomeStore', () => {
  it('keeps one non-expired outcome and clears it after its absolute expiry', () => {
    let now = 10_000;
    const store = createRecentQuickSyncOutcomeStore({ now: () => now });
    const outcome: RecentQuickSyncOutcome = {
      tabId: 11,
      resultKind: 'candidate-failed',
      reason: 'hud-unavailable',
      expiresAt: 40_000,
    };

    store.set(outcome);
    expect(store.read()).toEqual(outcome);

    now = 40_000;
    expect(store.read()).toBeUndefined();
  });

  it('dismisses only the exact tab and expiry identity', () => {
    const store = createRecentQuickSyncOutcomeStore({ now: () => 10_000 });
    store.set({
      tabId: 11,
      resultKind: 'unsupported',
      reason: 'unsupported-page',
      expiresAt: 40_000,
    });

    expect(store.dismiss({ tabId: 22, expiresAt: 40_000 })).toBe('stale');
    expect(store.dismiss({ tabId: 11, expiresAt: 39_999 })).toBe('stale');
    expect(store.dismiss({ tabId: 11, expiresAt: 40_000 })).toBe('dismissed');
    expect(store.read()).toBeUndefined();
  });
});

describe('createQuickSyncBadgeController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('clears badge text after the initial title update fails', async () => {
    const setBadgeText = vi.fn().mockResolvedValue(undefined);
    const setTitle = vi.fn().mockRejectedValueOnce(new Error('title unavailable'));
    const controller = createQuickSyncBadgeController({
      setBadgeText,
      setTitle,
      getUnsupportedTitle: () => 'unsupported',
      setTimer: setTimeout,
    });

    await expect(controller.showUnsupported(11, 7)).rejects.toThrow('title unavailable');
    await vi.advanceTimersByTimeAsync(4_000);

    expect(setBadgeText).toHaveBeenLastCalledWith({ tabId: 11, text: '' });
  });

  it('clears the action title after the initial badge text update fails', async () => {
    const setBadgeText = vi.fn().mockRejectedValueOnce(new Error('badge unavailable'));
    const setTitle = vi.fn().mockResolvedValue(undefined);
    const controller = createQuickSyncBadgeController({
      setBadgeText,
      setTitle,
      getUnsupportedTitle: () => 'unsupported',
      setTimer: setTimeout,
    });

    await expect(controller.showUnsupported(11, 7)).rejects.toThrow('badge unavailable');
    await vi.advanceTimersByTimeAsync(4_000);

    expect(setTitle).toHaveBeenLastCalledWith({ tabId: 11, title: '' });
  });

  it('prevents an older clear timer from clearing a newer badge', async () => {
    const setBadgeText = vi.fn().mockResolvedValue(undefined);
    const controller = createQuickSyncBadgeController({
      setBadgeText,
      setTitle: vi.fn().mockResolvedValue(undefined),
      getUnsupportedTitle: () => 'unsupported',
      setTimer: setTimeout,
    });

    await controller.showUnsupported(11, 7);
    await vi.advanceTimersByTimeAsync(2_000);
    await controller.showUnsupported(11, 8);
    await vi.advanceTimersByTimeAsync(2_000);

    expect(setBadgeText).not.toHaveBeenCalledWith({ tabId: 11, text: '' });

    await vi.advanceTimersByTimeAsync(2_000);
    expect(setBadgeText).toHaveBeenLastCalledWith({ tabId: 11, text: '' });
  });
});
