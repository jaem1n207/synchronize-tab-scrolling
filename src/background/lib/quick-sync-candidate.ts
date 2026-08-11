export interface QuickSyncCandidate {
  tabId: number;
  expiresAt: number;
  generation: number;
}

export type QuickSyncCandidateDecision =
  | { status: 'none' }
  | { status: 'expired'; generation: number }
  | { status: 'same-tab'; candidate: QuickSyncCandidate }
  | {
      status: 'reserved';
      candidate: QuickSyncCandidate;
      operationGeneration: number;
    };

interface ReservedQuickSyncCandidate {
  candidate: QuickSyncCandidate;
  operationGeneration: number;
}

export interface QuickSyncCandidateStore {
  read(): QuickSyncCandidate | null;
  reserveGeneration(): number;
  arm(candidate: QuickSyncCandidate): void;
  clear(generation: number): boolean;
  clearForTab(tabId: number): QuickSyncCandidate | null;
  reserveForSecondTab(input: {
    tabId: number;
    commandReceivedAt: number;
    operationGeneration: number;
  }): QuickSyncCandidateDecision;
  finishSecondTabAttempt(input: {
    generation: number;
    operationGeneration: number;
    succeeded: boolean;
    completedAt: number;
  }): 'cleared' | 'restored' | 'stale';
}

export function createQuickSyncCandidateStore(): QuickSyncCandidateStore {
  let candidate: QuickSyncCandidate | null = null;
  let reservation: ReservedQuickSyncCandidate | null = null;
  let generation = 0;

  return {
    read() {
      return candidate === null ? null : { ...candidate };
    },
    reserveGeneration() {
      generation += 1;
      return generation;
    },
    arm(nextCandidate) {
      candidate = { ...nextCandidate };
      reservation = null;
      generation = Math.max(generation, nextCandidate.generation);
    },
    clear(candidateGeneration) {
      if (candidate?.generation !== candidateGeneration) {
        return false;
      }
      candidate = null;
      return true;
    },
    clearForTab(tabId) {
      if (candidate?.tabId !== tabId) {
        return null;
      }
      const cleared = { ...candidate };
      candidate = null;
      return cleared;
    },
    reserveForSecondTab(input) {
      if (candidate === null) {
        return { status: 'none' };
      }
      if (input.commandReceivedAt >= candidate.expiresAt) {
        const expiredGeneration = candidate.generation;
        candidate = null;
        return { status: 'expired', generation: expiredGeneration };
      }
      if (candidate.tabId === input.tabId) {
        return { status: 'same-tab', candidate: { ...candidate } };
      }

      const reservedCandidate = { ...candidate };
      reservation = {
        candidate: reservedCandidate,
        operationGeneration: input.operationGeneration,
      };
      candidate = null;
      return {
        status: 'reserved',
        candidate: reservedCandidate,
        operationGeneration: input.operationGeneration,
      };
    },
    finishSecondTabAttempt(input) {
      if (
        reservation?.candidate.generation !== input.generation ||
        reservation.operationGeneration !== input.operationGeneration
      ) {
        return 'stale';
      }

      const reservedCandidate = reservation.candidate;
      reservation = null;
      if (!input.succeeded && input.completedAt < reservedCandidate.expiresAt) {
        candidate = { ...reservedCandidate };
        return 'restored';
      }
      return 'cleared';
    },
  };
}

export const quickSyncCandidateStore = createQuickSyncCandidateStore();
