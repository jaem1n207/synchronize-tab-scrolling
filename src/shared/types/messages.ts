/**
 * Message types for webext-bridge communication
 * Implements P0 requirement: Basic Scroll Synchronization
 */

import type {
  AutoSyncSuggestionMatchKind,
  TranslatedPageConfidence,
  TranslatedPageMetadata,
} from '~/shared/lib/translated-page-url-utils';

import type { ContextualHintShowMessage, ContextualHintScrollMetrics } from './contextual-hints';
import type { UrlSyncMode, UrlSyncNotice } from './url-sync';

/**
 * Scroll sync mode types
 * - ratio: Proportional positioning based on document height ratios (P0)
 * - element: DOM structure analysis for content matching (P1)
 */
export type SyncMode = 'ratio' | 'element';

/**
 * Message to start scroll synchronization
 */
export interface StartSyncMessage {
  tabIds: Array<number>;
  mode: SyncMode;
  /** When true, sync was initiated by auto-sync (not user action) */
  isAutoSync?: boolean;
  currentTabId?: number;
}

export type StartSyncConnectionResults = Record<number, { success: boolean; error?: string }>;

/**
 * Acknowledgement returned by content scripts after scroll sync starts.
 * Type aliases keep responses assignable to JsonValue for messaging helpers.
 */
export type StartSyncContentResponse = {
  success: boolean;
  tabId: number;
  metrics?: ContextualHintScrollMetrics;
};

export type StartSyncBackgroundResponse = {
  success: boolean;
  connectedTabs: Array<number>;
  connectionResults: StartSyncConnectionResults;
  error?: string;
};

export type StartSyncResponse = StartSyncContentResponse | StartSyncBackgroundResponse;

/**
 * Message to stop scroll synchronization
 */
export interface StopSyncMessage {
  tabIds?: Array<number>;
  /** When true, stop was initiated by auto-sync (not user action) */
  isAutoSync?: boolean;
}

/**
 * Message to synchronize scroll position
 */
export interface ScrollSyncMessage {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  sourceTabId: number;
  mode: SyncMode;
  timestamp: number;
}

/**
 * Message to handle manual scroll adjustment (P1)
 * When user holds Option/Alt key to scroll individual tab
 */
export interface ManualScrollMessage {
  tabId: number;
  enabled: boolean;
}

/**
 * Message to update sync baseline ratio across all tabs
 * Sent when a tab finishes manual adjustment to prevent jumps
 */
export interface SyncBaselineUpdateMessage {
  sourceTabId: number;
  baselineRatio: number;
  timestamp: number;
}

/**
 * Message for URL navigation synchronization (P1)
 */
export interface UrlSyncMessage {
  url: string;
  sourceTabId: number;
}

/**
 * Connection health status for a synced tab
 */
export type ConnectionStatus = 'connected' | 'disconnected' | 'error';

/**
 * Tab information included in sync status broadcasts
 */
export interface SyncedTabInfo {
  id: number;
  title: string;
  url: string;
  favIconUrl?: string;
  eligible: boolean;
}

/**
 * Broadcast payload for sync status updates to content scripts.
 * Sent by background to all synced tabs when sync state changes.
 */
export interface SyncStatusBroadcastMessage {
  linkedTabs: Array<SyncedTabInfo>;
  connectionStatuses: Record<number, ConnectionStatus>;
  currentTabId: number;
}

/**
 * Health check ping between background and content script
 */
export interface ScrollPingMessage {
  tabId: number;
  timestamp: number;
}

/**
 * Content script reconnection request after connection loss
 */
export interface ScrollReconnectMessage {
  tabId: number;
  timestamp: number;
}

/**
 * Content script request to re-inject itself after recovery failure
 */
export interface ScrollRequestReinjectMessage {
  tabId: number;
}

/**
 * Message to request element matching for element-based sync (P1)
 */
export interface ElementMatchMessage {
  elementSelector: string;
  elementIndex: number;
  scrollRatio: number;
}

/**
 * Message to synchronize panel position across tabs
 */
export interface PanelPositionMessage {
  x: number;
  y: number;
  sourceTabId: number;
}

/**
 * Message to synchronize URL sync enabled state across tabs
 */
export interface UrlSyncEnabledChangedMessage {
  enabled: boolean;
}

/**
 * Message to synchronize URL sync mode across tabs
 */
export interface UrlSyncModeChangedMessage {
  mode: UrlSyncMode;
  notice?: UrlSyncNotice;
}

/**
 * Message for auto-sync status change notification
 */
export interface AutoSyncStatusChangedMessage {
  enabled: boolean;
}

/**
 * Auto-sync group information
 */
export interface AutoSyncGroupInfo {
  normalizedUrl: string;
  tabIds: Array<number>;
  isActive: boolean;
  matchKind?: AutoSyncSuggestionMatchKind;
  matchConfidence?: TranslatedPageConfidence;
}

/**
 * Message for auto-sync group update notification
 */
export interface AutoSyncGroupUpdatedMessage {
  groups: Array<AutoSyncGroupInfo>;
}

/**
 * Webext-bridge protocol message definitions
 */
/**
 * Response for auto-sync status request
 */
export interface AutoSyncStatusResponse {
  success: boolean;
  enabled: boolean;
  groups: Array<AutoSyncGroupInfo>;
}

/**
 * Response for detailed auto-sync status (for UI display)
 */
export interface AutoSyncDetailedStatusResponse {
  success: boolean;
  enabled: boolean;
  activeGroupCount: number;
  totalSyncedTabs: number;
  currentTabGroup?: {
    tabCount: number;
    isActive: boolean;
  };
}

/**
 * Message to show sync suggestion toast (same-URL tabs detected)
 */
export interface SyncSuggestionMessage {
  normalizedUrl: string;
  tabCount: number;
  tabIds: Array<number>;
  tabTitles: Array<string>;
  matchKind?: AutoSyncSuggestionMatchKind;
  matchConfidence?: TranslatedPageConfidence;
  /** When true, another sync session is already active. Accepting this suggestion will replace it. */
  hasExistingSync?: boolean;
  /** Number of tabs in the currently active sync session (present only when hasExistingSync is true) */
  existingSyncTabCount?: number;
}

export interface TranslatedPageMetadataRequestMessage {
  tabId: number;
}

export type TranslatedPageMetadataResponseMessage =
  | ({ success: true } & TranslatedPageMetadata)
  | { success: false; error?: string };

/**
 * Response to sync suggestion (user accepted or rejected)
 */
export interface SyncSuggestionResponseMessage {
  normalizedUrl: string;
  accepted: boolean;
  /** When true, the domain is snoozed for a duration (explicit dismiss via button/X) */
  snooze?: boolean;
  /** When true, the domain is permanently excluded from suggestions */
  permanent?: boolean;
}

/**
 * Message to suggest adding a new tab to existing manual sync
 */
export interface AddTabToSyncMessage {
  tabId: number;
  tabTitle: string;
  hasManualOffsets: boolean;
  normalizedUrl: string;
  matchKind?: AutoSyncSuggestionMatchKind;
  matchConfidence?: TranslatedPageConfidence;
}

/**
 * Response to add tab suggestion (user accepted or rejected)
 */
export interface AddTabToSyncResponseMessage {
  tabId: number;
  accepted: boolean;
  /** When true, the domain is snoozed for a duration (explicit dismiss via button/X) */
  snooze?: boolean;
  /** When true, the domain is permanently excluded from suggestions */
  permanent?: boolean;
  normalizedUrl?: string;
}

/**
 * Message to dismiss add-tab toast on all tabs (when one tab responds)
 */
export interface DismissAddTabToastMessage {
  tabId: number;
}

/**
 * Message to dismiss sync suggestion toast on all tabs (when one tab responds)
 */
export interface DismissSyncSuggestionToastMessage {
  normalizedUrl: string;
}

/**
 * Message to notify that permanently excluded domains have changed
 */
export interface ExcludedDomainsChangedMessage {
  domains: Array<string>;
}

/**
 * Response for excluded domains query
 */
export interface ExcludedDomainsResponse {
  domains: Array<string>;
}

export interface ProtocolMap {
  'scroll:start': StartSyncMessage;
  'scroll:stop': StopSyncMessage;
  'scroll:sync': ScrollSyncMessage;
  'scroll:manual': ManualScrollMessage;
  'scroll:baseline-update': SyncBaselineUpdateMessage;
  'scroll:ping': ScrollPingMessage;
  'scroll:reconnect': ScrollReconnectMessage;
  'scroll:request-reinject': ScrollRequestReinjectMessage;
  'sync:status': SyncStatusBroadcastMessage;
  'url:sync': UrlSyncMessage;
  'element:match': ElementMatchMessage;
  'panel:position': PanelPositionMessage;
  'sync:url-enabled-changed': UrlSyncEnabledChangedMessage;
  'sync:url-mode-changed': UrlSyncModeChangedMessage;
  'auto-sync:status-changed': AutoSyncStatusChangedMessage;
  'auto-sync:group-updated': AutoSyncGroupUpdatedMessage;
  'auto-sync:get-status': AutoSyncStatusResponse;
  'sync-suggestion:show': SyncSuggestionMessage;
  'sync-suggestion:response': SyncSuggestionResponseMessage;
  'translated-page:get-metadata': TranslatedPageMetadataRequestMessage;
  'sync-suggestion:add-tab': AddTabToSyncMessage;
  'sync-suggestion:add-tab-response': AddTabToSyncResponseMessage;
  'sync-suggestion:dismiss-add-tab': DismissAddTabToastMessage;
  'sync-suggestion:dismiss': DismissSyncSuggestionToastMessage;
  'auto-sync:excluded-domains-changed': ExcludedDomainsChangedMessage;
  'auto-sync:get-excluded-domains': ExcludedDomainsResponse;
  'contextual-hint:show': ContextualHintShowMessage;
}
