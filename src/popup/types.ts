export interface TabInfo {
  id: number;
  title: string;
  url: string;
  favIconUrl?: string;
  eligible: boolean;
  ineligibleReason?: string;
}

export interface SyncStatus {
  isActive: boolean;
  connectedTabs: Array<number>;
  connectionStatuses: Record<number, ConnectionStatus>;
}

export type ConnectionStatus = 'connected' | 'disconnected' | 'error';

export interface PanelPosition {
  x: number;
  y: number;
  snapped: boolean;
}
