export interface TabInfo {
  id: number;
  title: string;
  url: string;
  favIconUrl?: string;
  eligible: boolean;
  ineligibleReason?: string;
  lastAccessed?: number; // Timestamp when tab was last accessed
}

export interface SyncStatus {
  isActive: boolean;
  connectedTabs: Array<number>;
  connectionStatuses: Record<number, ConnectionStatus>;
}

export type ConnectionStatus = 'connected' | 'disconnected' | 'error' | 'connecting';

export interface PanelPosition {
  x: number;
  y: number;
  snapped: boolean;
}

export type ErrorSeverity = 'info' | 'warning' | 'error';

export interface ErrorState {
  message: string;
  severity: ErrorSeverity;
  timestamp: number;
  action?: {
    label: string;
    handler: () => void;
  };
}
