import {
  QUICK_SYNC_CANDIDATE_DURATION_MS,
  QUICK_SYNC_RECENT_OUTCOME_DURATION_MS,
} from '~/shared/lib/quick-sync';
import type {
  QuickSyncCommandResult,
  QuickSyncFailureReason,
  QuickSyncFeedbackMessage,
  QuickSyncFeedbackResponse,
  RecentQuickSyncOutcome,
} from '~/shared/types/quick-sync';
import type { ManualAddResult, ManualStartResult } from '~/shared/types/sync-session';
import type { SyncState } from '~/shared/types/sync-state';

import type { QuickSyncCandidate, QuickSyncCandidateStore } from './quick-sync-candidate';
import type { QuickSyncHandshakeRegistry, QuickSyncPort } from './quick-sync-feedback';
import type { SyncTransitionContext, SyncTransitionGate } from './sync-transition-gate';

interface QuickSyncInvocation {
  commandReceivedAt: number;
  tabId: number;
  windowId: number;
}

export interface QuickSyncCoordinatorDependencies {
  candidateStore: QuickSyncCandidateStore;
  handshakeRegistry: QuickSyncHandshakeRegistry;
  transitionGate: SyncTransitionGate;
  now: () => number;
  getState: () => SyncState;
  ensureContentScript: (tabId: number) => Promise<boolean>;
  revalidateInvocationTab: (tabId: number) => Promise<void>;
  sendFeedback: (
    tabId: number,
    message: QuickSyncFeedbackMessage,
  ) => Promise<QuickSyncFeedbackResponse>;
  startManualSession: (
    context: SyncTransitionContext,
    input: {
      tabIds: Array<number>;
      mode: 'ratio';
      source: 'quick-sync';
      requireAll: true;
    },
  ) => Promise<ManualStartResult>;
  addTabToManualSession: (
    context: SyncTransitionContext,
    input: {
      tabId: number;
      expectedRevision: number;
      source: 'quick-sync';
    },
  ) => Promise<ManualAddResult>;
  setRecentOutcome: (outcome: RecentQuickSyncOutcome) => void;
  showUnsupportedBadge: (tabId: number, generation: number) => Promise<void>;
  setTimer: typeof setTimeout;
}

export interface QuickSyncCoordinator {
  handle(
    context: SyncTransitionContext,
    invocation: QuickSyncInvocation,
  ): Promise<QuickSyncCommandResult>;
  expireCandidate(context: SyncTransitionContext, generation: number, now: number): Promise<void>;
  handleCandidatePortDisconnect(context: SyncTransitionContext, generation: number): Promise<void>;
  invalidateCandidate(
    context: SyncTransitionContext,
    reason?: 'consumed' | 'invalidated',
  ): Promise<boolean>;
  invalidateCandidateForTab(context: SyncTransitionContext, tabId: number): Promise<boolean>;
}

interface ActiveCandidatePort {
  candidate: QuickSyncCandidate;
  port: QuickSyncPort;
}

function toFailureReason(result: ManualStartResult | ManualAddResult): QuickSyncFailureReason {
  if (result.status === 'committed') {
    return 'invalid-acknowledgement';
  }
  switch (result.reason) {
    case 'unsupported-page':
    case 'content-unreachable':
    case 'candidate-tab-missing':
    case 'connection-timeout':
    case 'invalid-acknowledgement':
    case 'offset-reconciliation-failed':
    case 'persistence-failed':
    case 'auto-sync-degraded':
    case 'session-state-unavailable':
    case 'hud-unavailable':
      return result.reason;
    case 'stale-revision':
    case 'not-active':
      return 'session-state-unavailable';
  }
}

export function createQuickSyncCoordinator(
  dependencies: QuickSyncCoordinatorDependencies,
): QuickSyncCoordinator {
  const activePorts = new Map<number, ActiveCandidatePort>();

  function recordFailure(
    tabId: number,
    generation: number,
    resultKind: RecentQuickSyncOutcome['resultKind'],
    reason: QuickSyncFailureReason,
    tabCount?: number,
  ): void {
    dependencies.setRecentOutcome({
      tabId,
      resultKind,
      reason,
      ...(tabCount === undefined ? {} : { tabCount }),
      expiresAt: dependencies.now() + QUICK_SYNC_RECENT_OUTCOME_DURATION_MS,
    });
    void dependencies.showUnsupportedBadge(tabId, generation).catch(() => undefined);
  }

  async function sendReadyFeedback(
    tabId: number,
    message: QuickSyncFeedbackMessage,
  ): Promise<boolean> {
    try {
      const response = await dependencies.sendFeedback(tabId, message);
      return response.status === 'ready' && response.generation === message.generation;
    } catch {
      return false;
    }
  }

  async function prepareInvocationTab(tabId: number): Promise<QuickSyncFailureReason | null> {
    try {
      if (!(await dependencies.ensureContentScript(tabId))) {
        return 'content-unreachable';
      }
    } catch {
      return 'content-unreachable';
    }

    try {
      await dependencies.revalidateInvocationTab(tabId);
      return null;
    } catch {
      return 'candidate-tab-missing';
    }
  }

  async function releaseCandidateFeedback(
    candidate: QuickSyncCandidate,
    reason: 'expired' | 'consumed' | 'invalidated' | 'worker-disconnected',
  ): Promise<void> {
    const active = activePorts.get(candidate.generation);
    activePorts.delete(candidate.generation);
    active?.port.disconnect();
    await dependencies
      .sendFeedback(candidate.tabId, {
        outcome: 'clear',
        generation: candidate.generation,
        reason,
      })
      .catch(() => undefined);
  }

  function bindActiveCandidatePort(candidate: QuickSyncCandidate, port: QuickSyncPort): void {
    activePorts.set(candidate.generation, { candidate, port });
    dependencies.setTimer(
      () => {
        void dependencies.transitionGate.run((context) =>
          expireCandidate(context, candidate.generation, dependencies.now()),
        );
      },
      Math.max(0, candidate.expiresAt - dependencies.now()),
    );
    port.onDisconnect.addListener(() => {
      void dependencies.transitionGate.run((context) =>
        handleCandidatePortDisconnect(context, candidate.generation),
      );
    });
  }

  async function expireCandidate(
    _context: SyncTransitionContext,
    generation: number,
    now: number,
  ): Promise<void> {
    const candidate = dependencies.candidateStore.read();
    if (
      candidate?.generation !== generation ||
      now < candidate.expiresAt ||
      !dependencies.candidateStore.clear(generation)
    ) {
      return;
    }
    await releaseCandidateFeedback(candidate, 'expired');
  }

  async function handleCandidatePortDisconnect(
    _context: SyncTransitionContext,
    generation: number,
  ): Promise<void> {
    const active = activePorts.get(generation);
    if (active === undefined || !dependencies.candidateStore.clear(generation)) {
      return;
    }
    activePorts.delete(generation);
    await dependencies
      .sendFeedback(active.candidate.tabId, {
        outcome: 'clear',
        generation,
        reason: 'worker-disconnected',
      })
      .catch(() => undefined);
  }

  async function armFirstCandidate(tabId: number): Promise<QuickSyncCommandResult> {
    const preparationFailure = await prepareInvocationTab(tabId);
    if (preparationFailure !== null) {
      const failureReason = preparationFailure;
      recordFailure(tabId, 0, 'candidate-failed', failureReason);
      return { status: 'rejected', reason: failureReason };
    }

    const generation = dependencies.candidateStore.reserveGeneration();
    const expiresAt = dependencies.now() + QUICK_SYNC_CANDIDATE_DURATION_MS;
    const portPromise = dependencies.handshakeRegistry.begin({ tabId, generation, expiresAt });
    const feedbackPromise = dependencies.sendFeedback(tabId, {
      outcome: 'candidate-selected',
      generation,
      expiresAt,
    });
    let port: QuickSyncPort | undefined;
    let promoted = false;
    const failureReason: QuickSyncFailureReason = 'hud-unavailable';

    try {
      const result = await Promise.all([feedbackPromise, portPromise]);
      const feedback = result[0];
      port = result[1];
      if (feedback.status !== 'ready' || feedback.generation !== generation) {
        throw new Error('hud-unavailable');
      }

      const candidate = { tabId, generation, expiresAt };
      dependencies.handshakeRegistry.discard(generation);
      dependencies.candidateStore.arm(candidate);
      bindActiveCandidatePort(candidate, port);
      promoted = true;
      return { status: 'candidate-armed', generation, expiresAt };
    } catch {
      recordFailure(tabId, generation, 'candidate-failed', failureReason);
      return { status: 'rejected', reason: failureReason };
    } finally {
      if (!promoted) {
        const provisionalPort = dependencies.handshakeRegistry.discard(generation);
        const portToDisconnect = port ?? provisionalPort;
        portToDisconnect?.disconnect();
        await dependencies
          .sendFeedback(tabId, {
            outcome: 'clear',
            generation,
            reason: 'invalidated',
          })
          .catch(() => undefined);
      }
    }
  }

  async function handleActive(
    context: SyncTransitionContext,
    invocation: QuickSyncInvocation,
    state: SyncState,
  ): Promise<QuickSyncCommandResult> {
    const generation = dependencies.candidateStore.reserveGeneration();
    const preparationFailure = await prepareInvocationTab(invocation.tabId);
    if (preparationFailure !== null) {
      recordFailure(
        invocation.tabId,
        generation,
        state.linkedTabs.includes(invocation.tabId) ? 'candidate-failed' : 'add-failed',
        preparationFailure,
        state.linkedTabs.length,
      );
      return { status: 'rejected', reason: preparationFailure };
    }

    if (state.linkedTabs.includes(invocation.tabId)) {
      const feedbackReady = await sendReadyFeedback(invocation.tabId, {
        outcome: 'already-included',
        generation,
        tabCount: state.linkedTabs.length,
      });
      if (!feedbackReady) {
        recordFailure(invocation.tabId, generation, 'candidate-failed', 'hud-unavailable');
        return { status: 'rejected', reason: 'hud-unavailable' };
      }
      return { status: 'already-included', tabCount: state.linkedTabs.length };
    }

    const feedbackReady = await sendReadyFeedback(invocation.tabId, {
      outcome: 'connecting',
      generation,
    });
    if (!feedbackReady) {
      recordFailure(invocation.tabId, generation, 'add-failed', 'hud-unavailable');
      return { status: 'rejected', reason: 'hud-unavailable' };
    }

    const result = await dependencies.addTabToManualSession(context, {
      tabId: invocation.tabId,
      expectedRevision: context.expectedRevision,
      source: 'quick-sync',
    });
    if (result.status === 'committed') {
      if (result.warning === 'auto-sync-degraded') {
        dependencies.setRecentOutcome({
          tabId: invocation.tabId,
          resultKind: 'add-failed',
          reason: result.warning,
          tabCount: result.linkedTabIds.length,
          expiresAt: dependencies.now() + QUICK_SYNC_RECENT_OUTCOME_DURATION_MS,
        });
      }
      await dependencies
        .sendFeedback(invocation.tabId, {
          outcome: 'add-succeeded',
          generation,
          tabCount: result.linkedTabIds.length,
        })
        .catch(() => undefined);
      return { status: 'added', tabCount: result.linkedTabIds.length };
    }

    const reason = toFailureReason(result);
    recordFailure(invocation.tabId, generation, 'add-failed', reason, state.linkedTabs.length);
    await dependencies
      .sendFeedback(invocation.tabId, {
        outcome: 'add-failed',
        generation,
        tabCount: state.linkedTabs.length,
        reason,
      })
      .catch(() => undefined);
    return { status: 'rejected', reason };
  }

  async function handleReservedSecondTab(
    context: SyncTransitionContext,
    invocation: QuickSyncInvocation,
    candidate: QuickSyncCandidate,
  ): Promise<QuickSyncCommandResult> {
    let reason: QuickSyncFailureReason = 'hud-unavailable';
    let candidateInvalid = false;
    let succeeded = false;
    try {
      const preparationFailure = await prepareInvocationTab(invocation.tabId);
      if (preparationFailure !== null) {
        reason = preparationFailure;
        return { status: 'rejected', reason };
      }

      const feedbackReady = await sendReadyFeedback(invocation.tabId, {
        outcome: 'connecting',
        generation: candidate.generation,
      });
      if (!feedbackReady) {
        return { status: 'rejected', reason };
      }

      reason = 'candidate-tab-missing';
      try {
        await dependencies.revalidateInvocationTab(candidate.tabId);
      } catch {
        candidateInvalid = true;
        throw new Error('candidate-tab-missing');
      }
      const result = await dependencies.startManualSession(context, {
        tabIds: [candidate.tabId, invocation.tabId],
        mode: 'ratio',
        source: 'quick-sync',
        requireAll: true,
      });
      if (result.status !== 'committed') {
        reason = toFailureReason(result);
        return { status: 'rejected', reason };
      }

      succeeded = true;
      await releaseCandidateFeedback(candidate, 'consumed');
      await dependencies
        .sendFeedback(invocation.tabId, {
          outcome: 'start-succeeded',
          generation: candidate.generation,
          tabCount: result.connectedTabIds.length,
        })
        .catch(() => undefined);
      return { status: 'started', tabCount: result.connectedTabIds.length };
    } catch {
      return { status: 'rejected', reason };
    } finally {
      const finish = candidateInvalid
        ? dependencies.candidateStore.abortSecondTabAttempt({
            generation: candidate.generation,
            operationGeneration: context.operationGeneration,
          })
        : dependencies.candidateStore.finishSecondTabAttempt({
            generation: candidate.generation,
            operationGeneration: context.operationGeneration,
            succeeded,
            completedAt: dependencies.now(),
          });
      if (!succeeded) {
        recordFailure(invocation.tabId, candidate.generation, 'start-failed', reason);
        await dependencies
          .sendFeedback(invocation.tabId, {
            outcome: 'clear',
            generation: candidate.generation,
            reason: 'invalidated',
          })
          .catch(() => undefined);
        if (finish === 'restored') {
          await dependencies
            .sendFeedback(candidate.tabId, {
              outcome: 'second-tab-failed',
              generation: candidate.generation,
              expiresAt: candidate.expiresAt,
              reason,
            })
            .catch(() => undefined);
        } else if (finish === 'cleared') {
          await releaseCandidateFeedback(candidate, candidateInvalid ? 'invalidated' : 'expired');
        }
      }
    }
  }

  async function handleInactive(
    context: SyncTransitionContext,
    invocation: QuickSyncInvocation,
  ): Promise<QuickSyncCommandResult> {
    const decision = dependencies.candidateStore.reserveForSecondTab({
      tabId: invocation.tabId,
      commandReceivedAt: invocation.commandReceivedAt,
      operationGeneration: context.operationGeneration,
    });
    if (decision.status === 'none') {
      return armFirstCandidate(invocation.tabId);
    }
    if (decision.status === 'expired') {
      const active = activePorts.get(decision.generation);
      if (active !== undefined) {
        await releaseCandidateFeedback(active.candidate, 'expired');
      }
      return armFirstCandidate(invocation.tabId);
    }
    if (decision.status === 'same-tab') {
      const ready = await sendReadyFeedback(invocation.tabId, {
        outcome: 'same-candidate',
        generation: decision.candidate.generation,
        expiresAt: decision.candidate.expiresAt,
      });
      if (!ready) {
        recordFailure(
          invocation.tabId,
          decision.candidate.generation,
          'candidate-failed',
          'hud-unavailable',
        );
        return { status: 'rejected', reason: 'hud-unavailable' };
      }
      return {
        status: 'candidate-armed',
        generation: decision.candidate.generation,
        expiresAt: decision.candidate.expiresAt,
      };
    }
    return handleReservedSecondTab(context, invocation, decision.candidate);
  }

  const coordinator: QuickSyncCoordinator = {
    async handle(context, invocation) {
      const state = dependencies.getState();
      return state.isActive
        ? handleActive(context, invocation, state)
        : handleInactive(context, invocation);
    },
    expireCandidate,
    handleCandidatePortDisconnect,
    async invalidateCandidate(_context, reason = 'invalidated') {
      const candidate = dependencies.candidateStore.read();
      if (candidate === null || !dependencies.candidateStore.clear(candidate.generation)) {
        return false;
      }
      await releaseCandidateFeedback(candidate, reason);
      return true;
    },
    async invalidateCandidateForTab(_context, tabId) {
      const candidate = dependencies.candidateStore.clearForTab(tabId);
      if (candidate === null) {
        return false;
      }
      await releaseCandidateFeedback(candidate, 'invalidated');
      return true;
    },
  };
  return coordinator;
}
