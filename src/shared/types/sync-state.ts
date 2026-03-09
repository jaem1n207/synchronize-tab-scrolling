import type { ConnectionStatus, SyncMode } from './messages';

/**
 * Manual scroll sync state managed by the background script.
 * Tracks which tabs are linked, their connection health, and sync mode.
 */
export interface SyncState {
  isActive: boolean;
  linkedTabs: Array<number>;
  connectionStatuses: Record<number, ConnectionStatus>;
  mode?: SyncMode;
  lastActiveSyncedTabId: number | null;
}
