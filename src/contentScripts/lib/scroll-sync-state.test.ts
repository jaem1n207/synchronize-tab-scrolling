import { describe, it, expect } from 'vitest';

import {
  THROTTLE_DELAY,
  PROGRAMMATIC_SCROLL_GRACE_PERIOD,
  MOUSEMOVE_THROTTLE,
  CONNECTION_CHECK_INTERVAL,
  CONNECTION_TIMEOUT_THRESHOLD,
  MAX_RECONNECTION_ATTEMPTS,
  RECONNECTION_BACKOFF_MS,
  createInitialSyncState,
  createInitialWheelModeState,
  createInitialConnectionState,
  createInitialUrlMonitorState,
} from './scroll-sync-state';

describe('scroll-sync-state constants', () => {
  it('THROTTLE_DELAY should equal 50', () => {
    expect(THROTTLE_DELAY).toBe(50);
  });

  it('PROGRAMMATIC_SCROLL_GRACE_PERIOD should equal 100', () => {
    expect(PROGRAMMATIC_SCROLL_GRACE_PERIOD).toBe(100);
  });

  it('MOUSEMOVE_THROTTLE should equal 50', () => {
    expect(MOUSEMOVE_THROTTLE).toBe(50);
  });

  it('CONNECTION_CHECK_INTERVAL should equal 30000', () => {
    expect(CONNECTION_CHECK_INTERVAL).toBe(30000);
  });

  it('CONNECTION_TIMEOUT_THRESHOLD should equal 60000', () => {
    expect(CONNECTION_TIMEOUT_THRESHOLD).toBe(60000);
  });

  it('MAX_RECONNECTION_ATTEMPTS should equal 3', () => {
    expect(MAX_RECONNECTION_ATTEMPTS).toBe(3);
  });

  it('RECONNECTION_BACKOFF_MS should be readonly tuple [500, 1000, 2000]', () => {
    expect(RECONNECTION_BACKOFF_MS).toEqual([500, 1000, 2000]);
    expect(RECONNECTION_BACKOFF_MS).toHaveLength(3);
  });
});

describe('createInitialSyncState', () => {
  it('should return object with isActive = false', () => {
    const state = createInitialSyncState();
    expect(state.isActive).toBe(false);
  });

  it('should return object with isAutoSync = false', () => {
    const state = createInitialSyncState();
    expect(state.isAutoSync).toBe(false);
  });

  it('should return object with mode = "ratio"', () => {
    const state = createInitialSyncState();
    expect(state.mode).toBe('ratio');
  });

  it('should return object with tabId = 0', () => {
    const state = createInitialSyncState();
    expect(state.tabId).toBe(0);
  });

  it('should return object with isManualScrollEnabled = false', () => {
    const state = createInitialSyncState();
    expect(state.isManualScrollEnabled).toBe(false);
  });

  it('should return object with lastSyncedRatio = 0', () => {
    const state = createInitialSyncState();
    expect(state.lastSyncedRatio).toBe(0);
  });

  it('should return object with lastSyncedRatioSnapshot = 0', () => {
    const state = createInitialSyncState();
    expect(state.lastSyncedRatioSnapshot).toBe(0);
  });

  it('should return object with lastProgrammaticScrollTime = 0', () => {
    const state = createInitialSyncState();
    expect(state.lastProgrammaticScrollTime).toBe(0);
  });

  it('should set lastNavigationUrl to window.location.href', () => {
    const state = createInitialSyncState();
    expect(state.lastNavigationUrl).toBe(window.location.href);
  });

  it('should return a new object on each call (not shared reference)', () => {
    const state1 = createInitialSyncState();
    const state2 = createInitialSyncState();
    expect(state1).not.toBe(state2);
  });

  it('should return object matching SyncState interface shape', () => {
    const state = createInitialSyncState();
    expect(state).toHaveProperty('isActive');
    expect(state).toHaveProperty('isAutoSync');
    expect(state).toHaveProperty('mode');
    expect(state).toHaveProperty('tabId');
    expect(state).toHaveProperty('isManualScrollEnabled');
    expect(state).toHaveProperty('lastNavigationUrl');
    expect(state).toHaveProperty('lastSyncedRatio');
    expect(state).toHaveProperty('lastSyncedRatioSnapshot');
    expect(state).toHaveProperty('lastProgrammaticScrollTime');
  });
});

describe('createInitialWheelModeState', () => {
  it('should return object with isActive = false', () => {
    const state = createInitialWheelModeState();
    expect(state.isActive).toBe(false);
  });

  it('should return object with baselineSnapshot = 0', () => {
    const state = createInitialWheelModeState();
    expect(state.baselineSnapshot).toBe(0);
  });

  it('should return object with mouseMoveHandler = null', () => {
    const state = createInitialWheelModeState();
    expect(state.mouseMoveHandler).toBeNull();
  });

  it('should return object with lastMouseMoveCheckTime = 0', () => {
    const state = createInitialWheelModeState();
    expect(state.lastMouseMoveCheckTime).toBe(0);
  });

  it('should return a new object on each call (not shared reference)', () => {
    const state1 = createInitialWheelModeState();
    const state2 = createInitialWheelModeState();
    expect(state1).not.toBe(state2);
  });

  it('should return object matching WheelModeState interface shape', () => {
    const state = createInitialWheelModeState();
    expect(state).toHaveProperty('isActive');
    expect(state).toHaveProperty('baselineSnapshot');
    expect(state).toHaveProperty('mouseMoveHandler');
    expect(state).toHaveProperty('lastMouseMoveCheckTime');
  });
});

describe('createInitialConnectionState', () => {
  it('should return object with healthCheckInterval = null', () => {
    const state = createInitialConnectionState();
    expect(state.healthCheckInterval).toBeNull();
  });

  it('should return object with isHealthy = true', () => {
    const state = createInitialConnectionState();
    expect(state.isHealthy).toBe(true);
  });

  it('should return object with isReconnecting = false', () => {
    const state = createInitialConnectionState();
    expect(state.isReconnecting).toBe(false);
  });

  it('should return object with visibilityChangeHandler = null', () => {
    const state = createInitialConnectionState();
    expect(state.visibilityChangeHandler).toBeNull();
  });

  it('should set lastSuccessfulSync to approximately Date.now()', () => {
    const beforeTime = Date.now();
    const state = createInitialConnectionState();
    const afterTime = Date.now();
    expect(state.lastSuccessfulSync).toBeGreaterThanOrEqual(beforeTime);
    expect(state.lastSuccessfulSync).toBeLessThanOrEqual(afterTime);
  });

  it('should return a new object on each call (not shared reference)', () => {
    const state1 = createInitialConnectionState();
    const state2 = createInitialConnectionState();
    expect(state1).not.toBe(state2);
  });

  it('should return object matching ConnectionState interface shape', () => {
    const state = createInitialConnectionState();
    expect(state).toHaveProperty('healthCheckInterval');
    expect(state).toHaveProperty('lastSuccessfulSync');
    expect(state).toHaveProperty('isHealthy');
    expect(state).toHaveProperty('isReconnecting');
    expect(state).toHaveProperty('visibilityChangeHandler');
  });
});

describe('createInitialUrlMonitorState', () => {
  it('should return object with observer = null', () => {
    const state = createInitialUrlMonitorState();
    expect(state.observer).toBeNull();
  });

  it('should return object with popstateHandler = null', () => {
    const state = createInitialUrlMonitorState();
    expect(state.popstateHandler).toBeNull();
  });

  it('should return a new object on each call (not shared reference)', () => {
    const state1 = createInitialUrlMonitorState();
    const state2 = createInitialUrlMonitorState();
    expect(state1).not.toBe(state2);
  });

  it('should return object matching UrlMonitorState interface shape', () => {
    const state = createInitialUrlMonitorState();
    expect(state).toHaveProperty('observer');
    expect(state).toHaveProperty('popstateHandler');
  });
});
