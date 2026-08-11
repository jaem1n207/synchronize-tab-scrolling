import {
  QUICK_SYNC_BADGE_DURATION_MS,
  QUICK_SYNC_CONTROL_TIMEOUT_MS,
} from '~/shared/lib/quick-sync';
import type {
  DismissQuickSyncRecentOutcomeMessage,
  QuickSyncFeedbackMessage,
  QuickSyncFeedbackResponse,
  RecentQuickSyncOutcome,
} from '~/shared/types/quick-sync';

export interface QuickSyncPort {
  disconnect(): void;
  onDisconnect: {
    addListener(listener: () => void): void;
  };
}

export interface ProvisionalQuickSyncHandshake {
  tabId: number;
  generation: number;
  expiresAt: number;
}

export interface QuickSyncHandshakeRegistry {
  begin(input: ProvisionalQuickSyncHandshake): Promise<QuickSyncPort>;
  bindPort(input: { generation: number; senderTabId: number; port: QuickSyncPort }): boolean;
  discard(generation: number): QuickSyncPort | undefined;
}

interface PendingHandshake extends ProvisionalQuickSyncHandshake {
  resolve: (port: QuickSyncPort) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  port?: QuickSyncPort;
  settled: boolean;
}

export function createQuickSyncHandshakeRegistry(dependencies: {
  now: () => number;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
}): QuickSyncHandshakeRegistry {
  const handshakes = new Map<number, PendingHandshake>();
  const setTimer = dependencies.setTimer ?? setTimeout;
  const clearTimer = dependencies.clearTimer ?? clearTimeout;

  return {
    begin(input) {
      const timeoutMs = Math.max(
        0,
        Math.min(QUICK_SYNC_CONTROL_TIMEOUT_MS, input.expiresAt - dependencies.now()),
      );
      return new Promise<QuickSyncPort>((resolve, reject) => {
        const timer = setTimer(() => {
          const pending = handshakes.get(input.generation);
          if (pending === undefined) {
            return;
          }
          handshakes.delete(input.generation);
          pending.settled = true;
          reject(new Error('quick-sync-handshake-timeout'));
        }, timeoutMs);
        handshakes.set(input.generation, {
          ...input,
          resolve,
          reject,
          timer,
          settled: false,
        });
      });
    },
    bindPort(input) {
      const pending = handshakes.get(input.generation);
      if (
        pending === undefined ||
        pending.settled ||
        pending.tabId !== input.senderTabId ||
        pending.port !== undefined
      ) {
        return false;
      }
      clearTimer(pending.timer);
      pending.port = input.port;
      pending.settled = true;
      pending.resolve(input.port);
      return true;
    },
    discard(candidateGeneration) {
      const pending = handshakes.get(candidateGeneration);
      if (pending === undefined) {
        return undefined;
      }
      handshakes.delete(candidateGeneration);
      clearTimer(pending.timer);
      if (!pending.settled) {
        pending.settled = true;
        pending.reject(new Error('quick-sync-handshake-discarded'));
      }
      return pending.port;
    },
  };
}

export type QuickSyncFeedbackTransport = (
  tabId: number,
  message: QuickSyncFeedbackMessage,
) => Promise<QuickSyncFeedbackResponse>;

export function createQuickSyncFeedbackSender(
  send: QuickSyncFeedbackTransport,
  setTimer: typeof setTimeout = setTimeout,
  clearTimer: typeof clearTimeout = clearTimeout,
): QuickSyncFeedbackTransport {
  return async (tabId, message) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<QuickSyncFeedbackResponse>((_, reject) => {
      timer = setTimer(() => {
        reject(new Error('quick-sync-feedback-timeout'));
      }, QUICK_SYNC_CONTROL_TIMEOUT_MS);
    });
    try {
      return await Promise.race([send(tabId, message), timeout]);
    } finally {
      if (timer !== undefined) {
        clearTimer(timer);
      }
    }
  };
}

export interface RecentQuickSyncOutcomeStore {
  set(outcome: RecentQuickSyncOutcome): void;
  read(): RecentQuickSyncOutcome | undefined;
  dismiss(message: DismissQuickSyncRecentOutcomeMessage): 'dismissed' | 'stale';
}

export function createRecentQuickSyncOutcomeStore(dependencies: {
  now: () => number;
}): RecentQuickSyncOutcomeStore {
  let outcome: RecentQuickSyncOutcome | undefined;

  return {
    set(nextOutcome) {
      outcome = { ...nextOutcome };
    },
    read() {
      if (outcome === undefined) {
        return undefined;
      }
      if (outcome.expiresAt <= dependencies.now()) {
        outcome = undefined;
        return undefined;
      }
      return { ...outcome };
    },
    dismiss(message) {
      if (
        outcome === undefined ||
        outcome.tabId !== message.tabId ||
        outcome.expiresAt !== message.expiresAt
      ) {
        return 'stale';
      }
      outcome = undefined;
      return 'dismissed';
    },
  };
}

interface BadgeTextDetails {
  tabId: number;
  text: string;
}

interface BadgeTitleDetails {
  tabId: number;
  title: string;
}

export interface QuickSyncBadgeController {
  showUnsupported(tabId: number, candidateGeneration: number): Promise<void>;
}

export function createQuickSyncBadgeController(dependencies: {
  setBadgeText: (details: BadgeTextDetails) => Promise<void>;
  setTitle: (details: BadgeTitleDetails) => Promise<void>;
  getUnsupportedTitle: () => string;
  setTimer: typeof setTimeout;
}): QuickSyncBadgeController {
  const generations = new Map<number, { badgeGeneration: number; candidateGeneration: number }>();
  let badgeGeneration = 0;

  return {
    async showUnsupported(tabId, candidateGeneration) {
      badgeGeneration += 1;
      const current = { badgeGeneration, candidateGeneration };
      generations.set(tabId, current);
      await Promise.all([
        dependencies.setBadgeText({ tabId, text: '!' }),
        dependencies.setTitle({ tabId, title: dependencies.getUnsupportedTitle() }),
      ]);
      dependencies.setTimer(() => {
        const latest = generations.get(tabId);
        if (
          latest?.badgeGeneration !== current.badgeGeneration ||
          latest.candidateGeneration !== current.candidateGeneration
        ) {
          return;
        }
        generations.delete(tabId);
        void Promise.all([
          dependencies.setBadgeText({ tabId, text: '' }),
          dependencies.setTitle({ tabId, title: '' }),
        ]).catch(() => undefined);
      }, QUICK_SYNC_BADGE_DURATION_MS);
    },
  };
}

export const quickSyncHandshakeRegistry = createQuickSyncHandshakeRegistry({ now: Date.now });
export const recentQuickSyncOutcomeStore = createRecentQuickSyncOutcomeStore({ now: Date.now });
