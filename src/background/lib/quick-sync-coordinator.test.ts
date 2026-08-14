import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { QuickSyncFeedbackMessage, RecentQuickSyncOutcome } from '~/shared/types/quick-sync';
import type { ManualStartResult } from '~/shared/types/sync-session';
import type { SyncState } from '~/shared/types/sync-state';

import { createQuickSyncCandidateStore } from './quick-sync-candidate';
import { createQuickSyncCoordinator } from './quick-sync-coordinator';
import { createQuickSyncHandshakeRegistry } from './quick-sync-feedback';

import type { ProvisionalQuickSyncHandshake, QuickSyncPort } from './quick-sync-feedback';
import type { SyncTransitionGate } from './sync-transition-gate';
import type { Mock, MockInstance } from 'vitest';

interface CoordinatorHarness {
  coordinator: ReturnType<typeof createQuickSyncCoordinator>;
  candidateStore: ReturnType<typeof createQuickSyncCandidateStore>;
  transitionGate: SyncTransitionGate;
  feedback: Array<{ tabId: number; message: QuickSyncFeedbackMessage }>;
  recentOutcomes: Array<RecentQuickSyncOutcome>;
  startManualSession: ReturnType<typeof vi.fn>;
  addTabToManualSession: ReturnType<typeof vi.fn>;
  ensureContentScript: Mock<(tabId: number) => Promise<boolean>>;
  revalidateInvocationTab: ReturnType<typeof vi.fn>;
  beginHandshake: MockInstance<(input: ProvisionalQuickSyncHandshake) => Promise<QuickSyncPort>>;
  showUnsupportedBadge: ReturnType<typeof vi.fn>;
  port: QuickSyncPort;
  disconnectPort(): void;
  allowFeedbackFor(outcome: QuickSyncFeedbackMessage['outcome']): void;
  failFeedbackFor(outcome: QuickSyncFeedbackMessage['outcome']): void;
  rejectFeedbackFor(outcome: QuickSyncFeedbackMessage['outcome']): void;
  setState(nextState: SyncState): void;
  setNow(nextNow: number): void;
}

function createInactiveState(): SyncState {
  return {
    isActive: false,
    linkedTabs: [],
    connectionStatuses: {},
    lastActiveSyncedTabId: null,
    revision: 0,
    sessionEpoch: 0,
  };
}

function createSerialGate(getRevision: () => number): SyncTransitionGate {
  let tail: Promise<void> = Promise.resolve();
  let operationGeneration = 0;
  return {
    run(transition) {
      const result = tail.then(() =>
        transition({
          operationGeneration: ++operationGeneration,
          expectedRevision: getRevision(),
        }),
      );
      tail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  };
}

function createHarness(
  initialState: SyncState = createInactiveState(),
  setTimer: typeof setTimeout = setTimeout,
): CoordinatorHarness {
  let state = initialState;
  let now = 10_000;
  let disconnectListener = (): void => undefined;
  const candidateStore = createQuickSyncCandidateStore();
  const handshakeRegistry = createQuickSyncHandshakeRegistry({ now: () => now });
  const transitionGate = createSerialGate(() => state.revision);
  const feedback: Array<{ tabId: number; message: QuickSyncFeedbackMessage }> = [];
  const recentOutcomes: Array<RecentQuickSyncOutcome> = [];
  const failedFeedbackOutcomes = new Set<QuickSyncFeedbackMessage['outcome']>();
  const rejectedFeedbackOutcomes = new Set<QuickSyncFeedbackMessage['outcome']>();
  const port: QuickSyncPort = {
    disconnect: vi.fn(),
    onDisconnect: {
      addListener(listener) {
        disconnectListener = listener;
      },
    },
  };
  const startManualSession = vi.fn().mockResolvedValue({
    status: 'committed',
    connectedTabIds: [11, 22],
    revision: 1,
    sessionEpoch: 1,
  });
  const addTabToManualSession = vi.fn().mockResolvedValue({
    status: 'committed',
    linkedTabIds: [11, 22, 33],
    revision: 6,
    sessionEpoch: 2,
  });
  const ensureContentScript = vi.fn<(tabId: number) => Promise<boolean>>().mockResolvedValue(true);
  const revalidateInvocationTab = vi.fn().mockResolvedValue(undefined);
  const beginHandshake = vi.spyOn(handshakeRegistry, 'begin');
  const showUnsupportedBadge = vi.fn().mockResolvedValue(undefined);

  const coordinator = createQuickSyncCoordinator({
    candidateStore,
    handshakeRegistry,
    transitionGate,
    now: () => now,
    getState: () => state,
    ensureContentScript,
    revalidateInvocationTab,
    sendFeedback: async (tabId, message) => {
      feedback.push({ tabId, message });
      if (failedFeedbackOutcomes.has(message.outcome)) {
        throw new Error('feedback unavailable');
      }
      if (rejectedFeedbackOutcomes.has(message.outcome)) {
        return {
          status: 'failed',
          generation: message.generation,
          reason: 'hud-unavailable',
        };
      }
      if (message.outcome === 'candidate-selected') {
        handshakeRegistry.bindPort({
          generation: message.generation,
          senderTabId: tabId,
          port,
        });
      }
      return { status: 'ready', generation: message.generation };
    },
    startManualSession,
    addTabToManualSession,
    setRecentOutcome: (outcome) => {
      recentOutcomes.push(outcome);
    },
    showUnsupportedBadge,
    setTimer,
  });

  return {
    coordinator,
    candidateStore,
    transitionGate,
    feedback,
    recentOutcomes,
    startManualSession,
    addTabToManualSession,
    ensureContentScript,
    revalidateInvocationTab,
    beginHandshake,
    showUnsupportedBadge,
    port,
    disconnectPort() {
      disconnectListener();
    },
    allowFeedbackFor(outcome) {
      failedFeedbackOutcomes.delete(outcome);
    },
    failFeedbackFor(outcome) {
      failedFeedbackOutcomes.add(outcome);
    },
    rejectFeedbackFor(outcome) {
      rejectedFeedbackOutcomes.add(outcome);
    },
    setState(nextState) {
      state = nextState;
    },
    setNow(nextNow) {
      now = nextNow;
    },
  };
}

describe('createQuickSyncCoordinator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ensures the content runtime before candidate feedback and Port reservation', async () => {
    const harness = createHarness();
    const contentReady = Promise.withResolvers<boolean>();
    harness.ensureContentScript.mockReturnValueOnce(contentReady.promise);

    const resultPromise = harness.transitionGate.run((context) =>
      harness.coordinator.handle(context, {
        commandReceivedAt: 10_000,
        tabId: 11,
        windowId: 1,
      }),
    );
    await Promise.resolve();

    expect(harness.ensureContentScript).toHaveBeenCalledWith(11);
    expect(harness.feedback).toEqual([]);
    expect(harness.beginHandshake).not.toHaveBeenCalled();

    contentReady.resolve(true);
    const result = await resultPromise;

    expect(result).toEqual({ status: 'candidate-armed', generation: 1, expiresAt: 20_000 });
    expect(harness.candidateStore.read()).toEqual({
      tabId: 11,
      generation: 1,
      expiresAt: 20_000,
    });
    expect(harness.revalidateInvocationTab).toHaveBeenCalledWith(11);
  });

  it('arms a first candidate without binding the injected timer receiver', async () => {
    const strictTimer = new Proxy(setTimeout, {
      apply(target, receiver, arguments_) {
        if (receiver !== undefined) {
          throw new TypeError('unexpected-timer-receiver');
        }
        return Reflect.apply(target, undefined, arguments_);
      },
    });
    const harness = createHarness(createInactiveState(), strictTimer);

    const result = await harness.transitionGate.run((context) =>
      harness.coordinator.handle(context, {
        commandReceivedAt: 10_000,
        tabId: 11,
        windowId: 1,
      }),
    );

    expect(result).toEqual({ status: 'candidate-armed', generation: 1, expiresAt: 20_000 });
    expect(harness.candidateStore.read()).toEqual({
      tabId: 11,
      generation: 1,
      expiresAt: 20_000,
    });
    expect(harness.feedback).not.toContainEqual({
      tabId: 11,
      message: {
        outcome: 'clear',
        generation: 1,
        reason: 'invalidated',
      },
    });
    expect(harness.port.disconnect).not.toHaveBeenCalled();
  });

  it('rejects an unreachable first-tab runtime without reserving a candidate or Port', async () => {
    const harness = createHarness();
    harness.ensureContentScript.mockResolvedValueOnce(false);

    const result = await harness.transitionGate.run((context) =>
      harness.coordinator.handle(context, {
        commandReceivedAt: 10_000,
        tabId: 11,
        windowId: 1,
      }),
    );

    expect(result).toEqual({ status: 'rejected', reason: 'content-unreachable' });
    expect(harness.beginHandshake).not.toHaveBeenCalled();
    expect(harness.feedback).toEqual([]);
    expect(harness.candidateStore.read()).toBeNull();
    expect(harness.recentOutcomes.at(-1)).toEqual({
      tabId: 11,
      resultKind: 'candidate-failed',
      reason: 'content-unreachable',
      expiresAt: 40_000,
    });
    expect(harness.showUnsupportedBadge).toHaveBeenCalledWith(11, 0);

    await expect(
      harness.transitionGate.run((context) =>
        harness.coordinator.handle(context, {
          commandReceivedAt: 10_001,
          tabId: 11,
          windowId: 1,
        }),
      ),
    ).resolves.toEqual({ status: 'candidate-armed', generation: 1, expiresAt: 20_000 });
  });

  it('keeps the same candidate deadline on a same-tab command', async () => {
    const harness = createHarness();
    harness.candidateStore.arm({ tabId: 11, generation: 4, expiresAt: 20_000 });

    const result = await harness.transitionGate.run((context) =>
      harness.coordinator.handle(context, {
        commandReceivedAt: 15_000,
        tabId: 11,
        windowId: 1,
      }),
    );

    expect(result).toEqual({ status: 'candidate-armed', generation: 4, expiresAt: 20_000 });
    expect(harness.feedback.at(-1)?.message).toEqual({
      outcome: 'same-candidate',
      generation: 4,
      expiresAt: 20_000,
    });
  });

  it('starts exactly two tabs with require-all after a different-tab command', async () => {
    const harness = createHarness();
    harness.candidateStore.arm({ tabId: 11, generation: 4, expiresAt: 20_000 });

    const result = await harness.transitionGate.run((context) =>
      harness.coordinator.handle(context, {
        commandReceivedAt: 19_999,
        tabId: 22,
        windowId: 2,
      }),
    );

    expect(result).toEqual({ status: 'started', tabCount: 2 });
    expect(harness.ensureContentScript).toHaveBeenCalledWith(22);
    expect(harness.startManualSession).toHaveBeenCalledWith(
      expect.objectContaining({ expectedRevision: 0 }),
      {
        tabIds: [11, 22],
        mode: 'ratio',
        source: 'quick-sync',
        requireAll: true,
      },
    );
    expect(harness.revalidateInvocationTab).toHaveBeenCalledWith(11);
    expect(harness.candidateStore.read()).toBeNull();
  });

  it('reports an already-included active tab without mutating the session', async () => {
    const harness = createHarness({
      isActive: true,
      linkedTabs: [11, 22],
      connectionStatuses: { 11: 'connected', 22: 'connected' },
      mode: 'ratio',
      lastActiveSyncedTabId: 11,
      revision: 5,
      sessionEpoch: 2,
    });

    const result = await harness.transitionGate.run((context) =>
      harness.coordinator.handle(context, {
        commandReceivedAt: 10_000,
        tabId: 22,
        windowId: 2,
      }),
    );

    expect(result).toEqual({ status: 'already-included', tabCount: 2 });
    expect(harness.ensureContentScript).toHaveBeenCalledWith(22);
    expect(harness.startManualSession).not.toHaveBeenCalled();
    expect(harness.addTabToManualSession).not.toHaveBeenCalled();
  });

  it('adds only an unlinked active tab using the committed revision', async () => {
    const activeState: SyncState = {
      isActive: true,
      linkedTabs: [11, 22],
      connectionStatuses: { 11: 'connected', 22: 'connected' },
      mode: 'ratio',
      lastActiveSyncedTabId: 11,
      revision: 5,
      sessionEpoch: 2,
    };
    const harness = createHarness(activeState);

    const result = await harness.transitionGate.run((context) =>
      harness.coordinator.handle(context, {
        commandReceivedAt: 10_000,
        tabId: 33,
        windowId: 3,
      }),
    );

    expect(result).toEqual({ status: 'added', tabCount: 3 });
    expect(harness.addTabToManualSession).toHaveBeenCalledWith(
      expect.objectContaining({ expectedRevision: 5 }),
      { tabId: 33, expectedRevision: 5, source: 'quick-sync' },
    );
    expect(harness.startManualSession).not.toHaveBeenCalled();
    expect(harness.ensureContentScript).toHaveBeenCalledWith(33);
  });

  it('preserves the candidate when the second-tab runtime cannot be prepared', async () => {
    const harness = createHarness();
    harness.candidateStore.arm({ tabId: 11, generation: 4, expiresAt: 20_000 });
    harness.ensureContentScript.mockResolvedValueOnce(false);

    const result = await harness.transitionGate.run((context) =>
      harness.coordinator.handle(context, {
        commandReceivedAt: 15_000,
        tabId: 22,
        windowId: 2,
      }),
    );

    expect(result).toEqual({ status: 'rejected', reason: 'content-unreachable' });
    expect(harness.feedback).toEqual([
      {
        tabId: 22,
        message: {
          outcome: 'clear',
          generation: 4,
          reason: 'invalidated',
        },
      },
      {
        tabId: 11,
        message: {
          outcome: 'second-tab-failed',
          generation: 4,
          expiresAt: 20_000,
          reason: 'content-unreachable',
        },
      },
    ]);
    expect(harness.startManualSession).not.toHaveBeenCalled();
    expect(harness.candidateStore.read()).toEqual({
      tabId: 11,
      generation: 4,
      expiresAt: 20_000,
    });
    expect(harness.recentOutcomes.at(-1)).toEqual({
      tabId: 22,
      resultKind: 'start-failed',
      reason: 'content-unreachable',
      expiresAt: 40_000,
    });
  });

  it('preserves an active session when a new tab runtime cannot be prepared', async () => {
    const activeState: SyncState = {
      isActive: true,
      linkedTabs: [11, 22],
      connectionStatuses: { 11: 'connected', 22: 'connected' },
      mode: 'ratio',
      lastActiveSyncedTabId: 11,
      revision: 5,
      sessionEpoch: 2,
    };
    const harness = createHarness(activeState);
    harness.ensureContentScript.mockResolvedValueOnce(false);

    const result = await harness.transitionGate.run((context) =>
      harness.coordinator.handle(context, {
        commandReceivedAt: 10_000,
        tabId: 33,
        windowId: 3,
      }),
    );

    expect(result).toEqual({ status: 'rejected', reason: 'content-unreachable' });
    expect(harness.feedback).toEqual([]);
    expect(harness.addTabToManualSession).not.toHaveBeenCalled();
    expect(harness.recentOutcomes.at(-1)).toEqual({
      tabId: 33,
      resultKind: 'add-failed',
      reason: 'content-unreachable',
      tabCount: 2,
      expiresAt: 40_000,
    });
  });

  it('records a degraded recent outcome without denying a committed Add', async () => {
    const activeState: SyncState = {
      isActive: true,
      linkedTabs: [11, 22],
      connectionStatuses: { 11: 'connected', 22: 'connected' },
      mode: 'ratio',
      lastActiveSyncedTabId: 11,
      revision: 5,
      sessionEpoch: 2,
    };
    const harness = createHarness(activeState);
    harness.addTabToManualSession.mockResolvedValueOnce({
      status: 'committed',
      linkedTabIds: [11, 22, 33],
      revision: 6,
      sessionEpoch: 2,
      warning: 'auto-sync-degraded',
    });

    const result = await harness.transitionGate.run((context) =>
      harness.coordinator.handle(context, {
        commandReceivedAt: 10_000,
        tabId: 33,
        windowId: 3,
      }),
    );

    expect(result).toEqual({ status: 'added', tabCount: 3 });
    expect(harness.recentOutcomes).toContainEqual({
      tabId: 33,
      resultKind: 'add-failed',
      reason: 'auto-sync-degraded',
      tabCount: 3,
      expiresAt: 40_000,
    });
  });

  it('protects a reserved candidate from deadline and Port callbacks until Start finishes', async () => {
    const harness = createHarness();
    await harness.transitionGate.run((context) =>
      harness.coordinator.handle(context, {
        commandReceivedAt: 10_000,
        tabId: 11,
        windowId: 1,
      }),
    );
    const deferredStart = Promise.withResolvers<ManualStartResult>();
    harness.startManualSession.mockReturnValue(deferredStart.promise);

    const start = harness.transitionGate.run((context) =>
      harness.coordinator.handle(context, {
        commandReceivedAt: 19_999,
        tabId: 22,
        windowId: 2,
      }),
    );
    await vi.advanceTimersByTimeAsync(10_000);
    harness.disconnectPort();
    deferredStart.resolve({
      status: 'committed',
      connectedTabIds: [11, 22],
      revision: 1,
      sessionEpoch: 1,
    });

    await expect(start).resolves.toEqual({ status: 'started', tabCount: 2 });
    await vi.runAllTimersAsync();
    expect(harness.candidateStore.read()).toBeNull();
  });

  it('restores the original candidate and Port when connecting feedback fails before expiry', async () => {
    const harness = createHarness();
    await harness.transitionGate.run((context) =>
      harness.coordinator.handle(context, {
        commandReceivedAt: 10_000,
        tabId: 11,
        windowId: 1,
      }),
    );
    harness.failFeedbackFor('connecting');
    harness.setNow(19_500);

    await expect(
      harness.transitionGate.run((context) =>
        harness.coordinator.handle(context, {
          commandReceivedAt: 19_000,
          tabId: 22,
          windowId: 2,
        }),
      ),
    ).resolves.toEqual({ status: 'rejected', reason: 'hud-unavailable' });

    expect(harness.candidateStore.read()).toEqual({
      tabId: 11,
      generation: 1,
      expiresAt: 20_000,
    });
    expect(harness.port.disconnect).not.toHaveBeenCalled();

    harness.allowFeedbackFor('connecting');
    await expect(
      harness.transitionGate.run((context) =>
        harness.coordinator.handle(context, {
          commandReceivedAt: 19_750,
          tabId: 22,
          windowId: 2,
        }),
      ),
    ).resolves.toEqual({ status: 'started', tabCount: 2 });

    expect(harness.candidateStore.read()).toBeNull();
    expect(harness.port.disconnect).toHaveBeenCalledOnce();
  });

  it('clears the candidate and Port when connecting feedback fails after expiry', async () => {
    const harness = createHarness();
    await harness.transitionGate.run((context) =>
      harness.coordinator.handle(context, {
        commandReceivedAt: 10_000,
        tabId: 11,
        windowId: 1,
      }),
    );
    harness.failFeedbackFor('connecting');
    harness.setNow(20_000);

    await expect(
      harness.transitionGate.run((context) =>
        harness.coordinator.handle(context, {
          commandReceivedAt: 19_000,
          tabId: 22,
          windowId: 2,
        }),
      ),
    ).resolves.toEqual({ status: 'rejected', reason: 'hud-unavailable' });

    expect(harness.candidateStore.read()).toBeNull();
    expect(harness.port.disconnect).toHaveBeenCalledOnce();
    expect(harness.feedback.at(-1)).toEqual({
      tabId: 11,
      message: {
        outcome: 'clear',
        generation: 1,
        reason: 'expired',
      },
    });
  });

  it('restores the original candidate when connecting feedback reports failure', async () => {
    const harness = createHarness();
    await harness.transitionGate.run((context) =>
      harness.coordinator.handle(context, {
        commandReceivedAt: 10_000,
        tabId: 11,
        windowId: 1,
      }),
    );
    harness.rejectFeedbackFor('connecting');
    harness.setNow(19_500);

    await expect(
      harness.transitionGate.run((context) =>
        harness.coordinator.handle(context, {
          commandReceivedAt: 19_000,
          tabId: 22,
          windowId: 2,
        }),
      ),
    ).resolves.toEqual({ status: 'rejected', reason: 'hud-unavailable' });

    expect(harness.candidateStore.read()).toEqual({
      tabId: 11,
      generation: 1,
      expiresAt: 20_000,
    });
    expect(harness.port.disconnect).not.toHaveBeenCalled();
  });

  it('terminates the invocation HUD and retries the original candidate after a failed Start', async () => {
    const harness = createHarness();
    harness.candidateStore.arm({ tabId: 11, generation: 4, expiresAt: 20_000 });
    harness.startManualSession.mockResolvedValue({
      status: 'rejected',
      reason: 'connection-timeout',
    });
    harness.setNow(19_500);

    const result = await harness.transitionGate.run((context) =>
      harness.coordinator.handle(context, {
        commandReceivedAt: 19_000,
        tabId: 22,
        windowId: 2,
      }),
    );

    expect(result).toEqual({ status: 'rejected', reason: 'connection-timeout' });
    expect(harness.candidateStore.read()).toEqual({
      tabId: 11,
      generation: 4,
      expiresAt: 20_000,
    });
    expect(harness.feedback.slice(-2)).toEqual([
      {
        tabId: 22,
        message: {
          outcome: 'clear',
          generation: 4,
          reason: 'invalidated',
        },
      },
      {
        tabId: 11,
        message: {
          outcome: 'second-tab-failed',
          generation: 4,
          expiresAt: 20_000,
          reason: 'connection-timeout',
        },
      },
    ]);
  });

  it('terminally clears both HUDs when a failed Start completes at the deadline', async () => {
    const harness = createHarness();
    harness.candidateStore.arm({ tabId: 11, generation: 4, expiresAt: 20_000 });
    harness.startManualSession.mockImplementation(async () => {
      harness.setNow(20_000);
      return { status: 'rejected', reason: 'connection-timeout' };
    });

    await harness.transitionGate.run((context) =>
      harness.coordinator.handle(context, {
        commandReceivedAt: 19_000,
        tabId: 22,
        windowId: 2,
      }),
    );

    expect(harness.candidateStore.read()).toBeNull();
    expect(harness.feedback.slice(-2)).toEqual([
      {
        tabId: 22,
        message: {
          outcome: 'clear',
          generation: 4,
          reason: 'invalidated',
        },
      },
      {
        tabId: 11,
        message: {
          outcome: 'clear',
          generation: 4,
          reason: 'expired',
        },
      },
    ]);
  });

  it('terminally clears a missing reserved candidate before its deadline', async () => {
    const harness = createHarness();
    await harness.transitionGate.run((context) =>
      harness.coordinator.handle(context, {
        commandReceivedAt: 10_000,
        tabId: 11,
        windowId: 1,
      }),
    );
    harness.revalidateInvocationTab
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('missing'));
    harness.setNow(19_500);

    const result = await harness.transitionGate.run((context) =>
      harness.coordinator.handle(context, {
        commandReceivedAt: 19_000,
        tabId: 22,
        windowId: 2,
      }),
    );

    expect(result).toEqual({ status: 'rejected', reason: 'candidate-tab-missing' });
    expect(harness.candidateStore.read()).toBeNull();
    expect(harness.port.disconnect).toHaveBeenCalledOnce();
    expect(harness.startManualSession).not.toHaveBeenCalled();
    expect(harness.feedback.slice(-2)).toEqual([
      {
        tabId: 22,
        message: {
          outcome: 'clear',
          generation: 1,
          reason: 'invalidated',
        },
      },
      {
        tabId: 11,
        message: {
          outcome: 'clear',
          generation: 1,
          reason: 'invalidated',
        },
      },
    ]);
    expect(harness.recentOutcomes.at(-1)).toEqual({
      tabId: 22,
      resultKind: 'start-failed',
      reason: 'candidate-tab-missing',
      expiresAt: 49_500,
    });
    expect(harness.showUnsupportedBadge).toHaveBeenCalledWith(22, 1);
  });

  it('revalidates the first tab after runtime readiness and before reserving feedback', async () => {
    const harness = createHarness();
    const events: Array<string> = [];
    harness.ensureContentScript.mockImplementationOnce(async () => {
      events.push('ensure');
      return true;
    });
    harness.revalidateInvocationTab.mockRejectedValue(new Error('missing'));
    harness.revalidateInvocationTab.mockImplementationOnce(async () => {
      events.push('revalidate');
      throw new Error('missing');
    });

    const result = await harness.transitionGate.run((context) =>
      harness.coordinator.handle(context, {
        commandReceivedAt: 10_000,
        tabId: 11,
        windowId: 1,
      }),
    );

    expect(result).toEqual({ status: 'rejected', reason: 'candidate-tab-missing' });
    expect(events).toEqual(['ensure', 'revalidate']);
    expect(harness.beginHandshake).not.toHaveBeenCalled();
    expect(harness.feedback).toEqual([]);
    expect(harness.port.disconnect).not.toHaveBeenCalled();
    expect(harness.candidateStore.read()).toBeNull();
    expect(harness.recentOutcomes.at(-1)).toEqual({
      tabId: 11,
      resultKind: 'candidate-failed',
      reason: 'candidate-tab-missing',
      expiresAt: 40_000,
    });
    expect(harness.showUnsupportedBadge).toHaveBeenCalledWith(11, 0);
  });

  it('invalidates only the candidate owned by the affected tab', async () => {
    const harness = createHarness();
    harness.candidateStore.arm({ tabId: 11, generation: 4, expiresAt: 20_000 });

    await expect(
      harness.transitionGate.run((context) =>
        harness.coordinator.invalidateCandidateForTab(context, 22),
      ),
    ).resolves.toBe(false);
    expect(harness.candidateStore.read()).toEqual({
      tabId: 11,
      generation: 4,
      expiresAt: 20_000,
    });

    await expect(
      harness.transitionGate.run((context) =>
        harness.coordinator.invalidateCandidateForTab(context, 11),
      ),
    ).resolves.toBe(true);
    expect(harness.candidateStore.read()).toBeNull();
  });

  it('keeps a committed Start truthful when its success HUD cannot render', async () => {
    const harness = createHarness();
    harness.candidateStore.arm({ tabId: 11, generation: 4, expiresAt: 20_000 });
    harness.failFeedbackFor('start-succeeded');

    await expect(
      harness.transitionGate.run((context) =>
        harness.coordinator.handle(context, {
          commandReceivedAt: 19_000,
          tabId: 22,
          windowId: 2,
        }),
      ),
    ).resolves.toEqual({ status: 'started', tabCount: 2 });
    expect(harness.candidateStore.read()).toBeNull();
  });

  it('keeps a committed Add truthful when its success HUD cannot render', async () => {
    const harness = createHarness({
      isActive: true,
      linkedTabs: [11, 22],
      connectionStatuses: { 11: 'connected', 22: 'connected' },
      mode: 'ratio',
      lastActiveSyncedTabId: 11,
      revision: 5,
      sessionEpoch: 2,
    });
    harness.failFeedbackFor('add-succeeded');

    await expect(
      harness.transitionGate.run((context) =>
        harness.coordinator.handle(context, {
          commandReceivedAt: 10_000,
          tabId: 33,
          windowId: 3,
        }),
      ),
    ).resolves.toEqual({ status: 'added', tabCount: 3 });
  });
});
