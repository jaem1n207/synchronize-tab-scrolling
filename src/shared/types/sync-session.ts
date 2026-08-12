import type { AutoSyncActivationId } from '~/shared/lib/auto-sync-activation';

import type { ConnectionStatus, SyncMode } from './messages';
import type { QuickSyncFailureReason, RecentQuickSyncOutcome } from './quick-sync';

export interface PopupSyncStatusRequestMessage {
  source: 'popup';
  viewerTabId: number;
  viewerWindowId: number;
}

export interface ContentSyncStatusRequestMessage {
  source: 'content-script';
}

export type SyncStatusRequestMessage =
  | PopupSyncStatusRequestMessage
  | ContentSyncStatusRequestMessage;

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

export interface PopupActiveManualSyncSnapshot {
  revision: number;
  sessionEpoch: number;
  mode: SyncMode;
  linkedTabIds: Array<number>;
  tabs: Array<AvailableManualSyncTab | UnavailableManualSyncTab>;
}

export interface ContentManualSyncTab {
  location: 'current-tab' | 'other-tab';
  connectionStatus: ConnectionStatus;
}

export interface ContentActiveManualSyncSnapshot {
  revision: number;
  sessionEpoch: number;
  mode: SyncMode;
  linkedTabCount: number;
  tabs: Array<ContentManualSyncTab>;
}

interface SyncStatusErrorResponse {
  status: 'error';
  reason: 'storage-error' | 'invalid-state' | 'invalid-viewer-context';
  source?: never;
  recentQuickSyncOutcome?: never;
}

export type PopupSyncStatusResponseMessage =
  | {
      status: 'inactive';
      source: 'popup';
      revision: number;
      sessionEpoch: number;
      recentQuickSyncOutcome?: RecentQuickSyncOutcome;
    }
  | {
      status: 'active';
      source: 'popup';
      snapshot: PopupActiveManualSyncSnapshot;
      recentQuickSyncOutcome?: RecentQuickSyncOutcome;
    }
  | SyncStatusErrorResponse;

export type ContentSyncStatusResponseMessage =
  | {
      status: 'inactive';
      source: 'content-script';
      revision: number;
      sessionEpoch: number;
      recentQuickSyncOutcome?: never;
    }
  | {
      status: 'active';
      source: 'content-script';
      snapshot: ContentActiveManualSyncSnapshot;
      recentQuickSyncOutcome?: never;
    }
  | SyncStatusErrorResponse;

export type SyncStatusResponseMessage =
  | PopupSyncStatusResponseMessage
  | ContentSyncStatusResponseMessage;

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

export interface AutoRuntimeRelayMessageIdentity extends AutoSyncMessageIdentity {
  autoSyncGeneration: AutoSyncActivationId;
  sessionEpoch?: never;
}

export type RuntimeRelayMessageIdentity =
  | ManualMessageIdentity
  | AutoRuntimeRelayMessageIdentity;

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
      warning?: 'auto-sync-degraded';
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
