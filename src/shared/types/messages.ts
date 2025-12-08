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
 * Webext-bridge protocol message definitions
 */
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
}
