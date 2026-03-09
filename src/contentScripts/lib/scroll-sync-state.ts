import type { SyncMode } from '~/shared/types/messages';

export const THROTTLE_DELAY = 50;
export const PROGRAMMATIC_SCROLL_GRACE_PERIOD = 100;
export const MOUSEMOVE_THROTTLE = 50;
export const CONNECTION_CHECK_INTERVAL = 30000;
export const CONNECTION_TIMEOUT_THRESHOLD = 60000;
export const MAX_RECONNECTION_ATTEMPTS = 3;
export const RECONNECTION_BACKOFF_MS = [500, 1000, 2000] as const;

export interface SyncState {
  isActive: boolean;
  isAutoSync: boolean;
  mode: SyncMode;
  tabId: number;
  isManualScrollEnabled: boolean;
  lastNavigationUrl: string;
  lastSyncedRatio: number;
  lastSyncedRatioSnapshot: number;
  lastProgrammaticScrollTime: number;
}

export interface WheelModeState {
  isActive: boolean;
  baselineSnapshot: number;
  mouseMoveHandler: ((e: MouseEvent) => void) | null;
  lastMouseMoveCheckTime: number;
}

export interface ConnectionState {
  healthCheckInterval: number | null;
  lastSuccessfulSync: number;
  isHealthy: boolean;
  isReconnecting: boolean;
  visibilityChangeHandler: (() => void) | null;
}

export interface UrlMonitorState {
  observer: MutationObserver | null;
  popstateHandler: (() => void) | null;
}

export function createInitialSyncState(): SyncState {
  return {
    isActive: false,
    isAutoSync: false,
    mode: 'ratio',
    tabId: 0,
    isManualScrollEnabled: false,
    lastNavigationUrl: window.location.href,
    lastSyncedRatio: 0,
    lastSyncedRatioSnapshot: 0,
    lastProgrammaticScrollTime: 0,
  };
}

export function createInitialWheelModeState(): WheelModeState {
  return {
    isActive: false,
    baselineSnapshot: 0,
    mouseMoveHandler: null,
    lastMouseMoveCheckTime: 0,
  };
}

export function createInitialConnectionState(): ConnectionState {
  return {
    healthCheckInterval: null,
    lastSuccessfulSync: Date.now(),
    isHealthy: true,
    isReconnecting: false,
    visibilityChangeHandler: null,
  };
}

export function createInitialUrlMonitorState(): UrlMonitorState {
  return {
    observer: null,
    popstateHandler: null,
  };
}
