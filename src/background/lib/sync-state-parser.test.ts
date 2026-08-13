import { describe, expect, it } from 'vitest';

import { parseStoredSyncState } from './sync-state-parser';

function createStoredState(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    isActive: true,
    linkedTabs: [10, 20],
    connectionStatuses: { 10: 'connected', 20: 'disconnected' },
    mode: 'ratio',
    lastActiveSyncedTabId: 10,
    revision: 2,
    sessionEpoch: 1,
    ...overrides,
  };
}

describe('parseStoredSyncState', () => {
  it('creates a safe inactive default for a missing value', () => {
    expect(parseStoredSyncState(undefined)).toEqual({
      status: 'valid',
      migrated: false,
      state: {
        isActive: false,
        linkedTabs: [],
        connectionStatuses: {},
        lastActiveSyncedTabId: null,
        revision: 0,
        sessionEpoch: 0,
      },
    });
  });

  it('preserves a fully valid current state without migration', () => {
    expect(parseStoredSyncState(createStoredState())).toEqual({
      status: 'valid',
      migrated: false,
      state: {
        isActive: true,
        linkedTabs: [10, 20],
        connectionStatuses: { 10: 'connected', 20: 'disconnected' },
        mode: 'ratio',
        lastActiveSyncedTabId: 10,
        revision: 2,
        sessionEpoch: 1,
      },
    });
  });

  it('migrates a legacy active state without mode, revision, or epoch', () => {
    expect(
      parseStoredSyncState({
        isActive: true,
        linkedTabs: [10, 20],
        connectionStatuses: { 10: 'connected', 20: 'connected' },
        lastActiveSyncedTabId: 10,
      }),
    ).toEqual({
      status: 'valid',
      migrated: true,
      state: {
        isActive: true,
        linkedTabs: [10, 20],
        connectionStatuses: { 10: 'connected', 20: 'connected' },
        mode: 'ratio',
        lastActiveSyncedTabId: 10,
        revision: 0,
        sessionEpoch: 0,
      },
    });
  });

  it.each([null, [], 'state', 42])('rejects a non-object value %#', (storedValue) => {
    expect(parseStoredSyncState(storedValue)).toEqual({
      status: 'invalid',
      reason: 'not-an-object',
    });
  });

  it.each([undefined, 'true', 1])('rejects an invalid active flag %#', (isActive) => {
    expect(parseStoredSyncState(createStoredState({ isActive }))).toEqual({
      status: 'invalid',
      reason: 'invalid-active-flag',
    });
  });

  it.each([
    'tabs',
    [10, 10],
    [0, 10],
    [-1, 10],
    [1.5, 10],
    [Number.MAX_SAFE_INTEGER + 1, 10],
    [10, '20'],
  ])('rejects invalid linked tabs %#', (linkedTabs) => {
    expect(parseStoredSyncState(createStoredState({ linkedTabs }))).toEqual({
      status: 'invalid',
      reason: 'invalid-linked-tabs',
    });
  });

  it.each([
    { isActive: true, linkedTabs: [10] },
    { isActive: false, linkedTabs: [10, 20] },
  ])('rejects invalid topology %#', ({ isActive, linkedTabs }) => {
    expect(parseStoredSyncState(createStoredState({ isActive, linkedTabs }))).toEqual({
      status: 'invalid',
      reason: 'invalid-topology',
    });
  });

  it.each([
    null,
    [],
    'statuses',
    { 10: 'connected', 20: 'unknown' },
    { 10: 'unknown', 999: 'connected' },
  ])('rejects invalid connection statuses %#', (connectionStatuses) => {
    expect(parseStoredSyncState(createStoredState({ connectionStatuses }))).toEqual({
      status: 'invalid',
      reason: 'invalid-connection-statuses',
    });
  });

  it('normalizes connection statuses to linked tabs only', () => {
    expect(
      parseStoredSyncState(
        createStoredState({
          connectionStatuses: { 10: 'connected', 999: 'disconnected' },
        }),
      ),
    ).toEqual({
      status: 'valid',
      migrated: true,
      state: {
        isActive: true,
        linkedTabs: [10, 20],
        connectionStatuses: { 10: 'connected', 20: 'error' },
        mode: 'ratio',
        lastActiveSyncedTabId: 10,
        revision: 2,
        sessionEpoch: 1,
      },
    });
  });

  it('drops noncanonical numeric status keys instead of conflating them with linked tabs', () => {
    expect(
      parseStoredSyncState(
        createStoredState({
          connectionStatuses: {
            10: 'connected',
            20: 'disconnected',
            '1e1': 'error',
            '010': 'connected',
          },
        }),
      ),
    ).toEqual({
      status: 'valid',
      migrated: true,
      state: {
        isActive: true,
        linkedTabs: [10, 20],
        connectionStatuses: { 10: 'connected', 20: 'disconnected' },
        mode: 'ratio',
        lastActiveSyncedTabId: 10,
        revision: 2,
        sessionEpoch: 1,
      },
    });
  });

  it('drops invalid advisory statuses on noncanonical and unlinked keys', () => {
    expect(
      parseStoredSyncState(
        createStoredState({
          connectionStatuses: {
            10: 'connected',
            20: 'disconnected',
            '010': 'unknown',
            999: 'unknown',
          },
        }),
      ),
    ).toEqual({
      status: 'valid',
      migrated: true,
      state: {
        isActive: true,
        linkedTabs: [10, 20],
        connectionStatuses: { 10: 'connected', 20: 'disconnected' },
        mode: 'ratio',
        lastActiveSyncedTabId: 10,
        revision: 2,
        sessionEpoch: 1,
      },
    });
  });

  it.each(['semantic', null, 1])('rejects an explicitly unknown mode %#', (mode) => {
    expect(parseStoredSyncState(createStoredState({ mode }))).toEqual({
      status: 'invalid',
      reason: 'invalid-mode',
    });
  });

  it('removes a known mode from an inactive state', () => {
    expect(
      parseStoredSyncState(
        createStoredState({
          isActive: false,
          linkedTabs: [],
          connectionStatuses: {},
          lastActiveSyncedTabId: null,
        }),
      ),
    ).toEqual({
      status: 'valid',
      migrated: true,
      state: {
        isActive: false,
        linkedTabs: [],
        connectionStatuses: {},
        lastActiveSyncedTabId: null,
        revision: 2,
        sessionEpoch: 1,
      },
    });
  });

  it.each([undefined, '10', 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects an invalid last active tab %#',
    (lastActiveSyncedTabId) => {
      expect(parseStoredSyncState(createStoredState({ lastActiveSyncedTabId }))).toEqual({
        status: 'invalid',
        reason: 'invalid-last-active-tab',
      });
    },
  );

  it('normalizes an unlinked last active tab to null', () => {
    const result = parseStoredSyncState(createStoredState({ lastActiveSyncedTabId: 999 }));

    expect(result).toEqual({
      status: 'valid',
      migrated: true,
      state: {
        isActive: true,
        linkedTabs: [10, 20],
        connectionStatuses: { 10: 'connected', 20: 'disconnected' },
        mode: 'ratio',
        lastActiveSyncedTabId: null,
        revision: 2,
        sessionEpoch: 1,
      },
    });
  });

  it.each([
    { revision: -1, sessionEpoch: 0, reason: 'invalid-revision' },
    { revision: 1.5, sessionEpoch: 0, reason: 'invalid-revision' },
    { revision: Number.MAX_SAFE_INTEGER + 1, sessionEpoch: 0, reason: 'invalid-revision' },
    { revision: 0, sessionEpoch: -1, reason: 'invalid-session-epoch' },
    { revision: 0, sessionEpoch: 1.5, reason: 'invalid-session-epoch' },
    {
      revision: 0,
      sessionEpoch: Number.MAX_SAFE_INTEGER + 1,
      reason: 'invalid-session-epoch',
    },
  ])('rejects unsafe counters %#', ({ revision, sessionEpoch, reason }) => {
    const result = parseStoredSyncState({
      isActive: false,
      linkedTabs: [],
      connectionStatuses: {},
      lastActiveSyncedTabId: null,
      revision,
      sessionEpoch,
    });

    expect(result).toEqual({ status: 'invalid', reason });
  });

  it('migrates missing counters to zero', () => {
    expect(
      parseStoredSyncState({
        isActive: false,
        linkedTabs: [],
        connectionStatuses: {},
        lastActiveSyncedTabId: null,
      }),
    ).toEqual({
      status: 'valid',
      migrated: true,
      state: {
        isActive: false,
        linkedTabs: [],
        connectionStatuses: {},
        lastActiveSyncedTabId: null,
        revision: 0,
        sessionEpoch: 0,
      },
    });
  });
});
