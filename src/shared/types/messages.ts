/**
 * Message types for webext-bridge communication
 * Implements P0 requirement: Basic Scroll Synchronization
 */

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
}

/**
 * Message to stop scroll synchronization
 */
export interface StopSyncMessage {
  tabIds: Array<number>;
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
 * Response message for scroll sync status
 */
export interface SyncStatusResponse {
  success: boolean;
  error?: string;
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
    normalizedUrl: string;
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
}

/**
 * Response to sync suggestion (user accepted or rejected)
 */
export interface SyncSuggestionResponseMessage {
  normalizedUrl: string;
  accepted: boolean;
}

/**
 * Message to suggest adding a new tab to existing manual sync
 */
export interface AddTabToSyncMessage {
  tabId: number;
  tabTitle: string;
  hasManualOffsets: boolean;
  normalizedUrl: string;
}

/**
 * Response to add tab suggestion (user accepted or rejected)
 */
export interface AddTabToSyncResponseMessage {
  tabId: number;
  accepted: boolean;
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

export interface ProtocolMap {
  'scroll:start': StartSyncMessage;
  'scroll:stop': StopSyncMessage;
  'scroll:sync': ScrollSyncMessage;
  'scroll:manual': ManualScrollMessage;
  'scroll:baseline-update': SyncBaselineUpdateMessage;
  'scroll:status': SyncStatusResponse;
  'url:sync': UrlSyncMessage;
  'element:match': ElementMatchMessage;
  'panel:position': PanelPositionMessage;
  'sync:url-enabled-changed': UrlSyncEnabledChangedMessage;
  'auto-sync:status-changed': AutoSyncStatusChangedMessage;
  'auto-sync:group-updated': AutoSyncGroupUpdatedMessage;
  'auto-sync:get-status': AutoSyncStatusResponse;
  'sync-suggestion:show': SyncSuggestionMessage;
  'sync-suggestion:response': SyncSuggestionResponseMessage;
  'sync-suggestion:add-tab': AddTabToSyncMessage;
  'sync-suggestion:add-tab-response': AddTabToSyncResponseMessage;
  'sync-suggestion:dismiss-add-tab': DismissAddTabToastMessage;
  'sync-suggestion:dismiss': DismissSyncSuggestionToastMessage;
}
