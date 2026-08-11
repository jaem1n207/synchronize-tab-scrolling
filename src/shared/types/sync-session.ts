import type { ConnectionStatus, SyncMode } from './messages';
import type { QuickSyncFailureReason, RecentQuickSyncOutcome } from './quick-sync';

export type SyncStatusRequestMessage =
  | {
      source: 'popup';
      viewerTabId: number;
      viewerWindowId: number;
    }
  | { source: 'content-script' };

export interface SyncStatusViewerContext {
  viewerTabId: number;
  viewerWindowId: number;
}

export interface AvailableManualSyncTab {
  availability: 'available';
  tabId: number;
  title: string;
  favIconUrl?: string;
  windowId: number;
  location: 'current-tab' | 'current-window' | 'other-window';
  connectionStatus: ConnectionStatus;
}

export interface UnavailableManualSyncTab {
  availability: 'unavailable';
  tabId: number;
  connectionStatus: ConnectionStatus;
}

export interface ActiveManualSyncSnapshot {
  revision: number;
  sessionEpoch: number;
  mode: SyncMode;
  linkedTabIds: Array<number>;
  tabs: Array<AvailableManualSyncTab | UnavailableManualSyncTab>;
}

export type SyncStatusResponseMessage =
  | {
      status: 'inactive';
      revision: number;
      sessionEpoch: number;
      recentQuickSyncOutcome?: RecentQuickSyncOutcome;
    }
  | {
      status: 'active';
      snapshot: ActiveManualSyncSnapshot;
      recentQuickSyncOutcome?: RecentQuickSyncOutcome;
    }
  | {
      status: 'error';
      reason: 'storage-error' | 'invalid-state' | 'invalid-viewer-context';
      recentQuickSyncOutcome?: RecentQuickSyncOutcome;
    };

export interface ManualMessageIdentity {
  isAutoSync: false;
  sourceTabId: number;
  sessionEpoch: number;
}

export interface AutoSyncMessageIdentity {
  isAutoSync: true;
  sourceTabId: number;
}

export type SessionMessageIdentity = ManualMessageIdentity | AutoSyncMessageIdentity;

export interface ManualTransitionRejection {
  status: 'rejected';
  reason: QuickSyncFailureReason | 'stale-revision' | 'not-active';
  warning?: 'auto-sync-degraded';
}

export type ManualStartResult =
  | {
      status: 'committed';
      connectedTabIds: Array<number>;
      revision: number;
      sessionEpoch: number;
      warning?: 'auto-sync-degraded';
    }
  | ManualTransitionRejection;

export type ManualAddResult =
  | {
      status: 'committed';
      linkedTabIds: Array<number>;
      revision: number;
      sessionEpoch: number;
    }
  | ManualTransitionRejection;

export type ManualStopResult =
  | {
      status: 'committed';
      revision: number;
      warning?: 'cleanup-incomplete';
    }
  | ManualTransitionRejection;

export type ManualReconnectResult =
  | { status: 'committed'; revision: number }
  | { status: 'refresh-required'; revision: number }
  | ManualTransitionRejection;

export interface ReconnectManualSessionMessage {
  expectedRevision: number;
}
