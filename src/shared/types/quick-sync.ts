export type QuickSyncFailureReason =
  | 'unsupported-page'
  | 'content-unreachable'
  | 'candidate-tab-missing'
  | 'connection-timeout'
  | 'invalid-acknowledgement'
  | 'persistence-failed'
  | 'auto-sync-degraded'
  | 'session-state-unavailable'
  | 'hud-unavailable';

interface QuickSyncFeedbackBase {
  generation: number;
}

export type QuickSyncFeedbackMessage =
  | (QuickSyncFeedbackBase & {
      outcome: 'candidate-selected' | 'same-candidate' | 'second-tab-failed';
      expiresAt: number;
      reason?: QuickSyncFailureReason;
    })
  | (QuickSyncFeedbackBase & {
      outcome: 'connecting';
    })
  | (QuickSyncFeedbackBase & {
      outcome: 'start-succeeded' | 'add-succeeded' | 'already-included' | 'add-failed';
      tabCount: number;
      reason?: QuickSyncFailureReason;
    })
  | (QuickSyncFeedbackBase & {
      outcome: 'clear';
      reason: 'expired' | 'consumed' | 'invalidated' | 'worker-disconnected';
    });

export type QuickSyncFeedbackResponse =
  | { status: 'ready'; generation: number }
  | {
      status: 'failed';
      generation: number;
      reason: 'hud-unavailable' | 'port-unavailable';
    };

export type QuickSyncCommandResult =
  | { status: 'candidate-armed'; generation: number; expiresAt: number }
  | { status: 'started' | 'added' | 'already-included'; tabCount: number }
  | { status: 'rejected'; reason: QuickSyncFailureReason };

export interface RecentQuickSyncOutcome {
  tabId: number;
  resultKind:
    | 'unsupported'
    | 'candidate-failed'
    | 'start-failed'
    | 'add-failed'
    | 'session-state-unavailable';
  reason: QuickSyncFailureReason;
  tabCount?: number;
  expiresAt: number;
}

export interface DismissQuickSyncRecentOutcomeMessage {
  tabId: number;
  expiresAt: number;
}

export type DismissQuickSyncRecentOutcomeResponse = { status: 'dismissed' } | { status: 'stale' };

export type QuickSyncShortcutAssignment =
  | { status: 'loading' }
  | { status: 'assigned'; rawShortcut: string; label: string }
  | { status: 'unassigned' }
  | { status: 'unavailable' };
