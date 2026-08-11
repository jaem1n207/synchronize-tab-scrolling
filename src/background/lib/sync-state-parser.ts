import type { ConnectionStatus, SyncMode } from '~/shared/types/messages';
import type { SyncState } from '~/shared/types/sync-state';

export type SyncStateValidationReason =
  | 'not-an-object'
  | 'invalid-active-flag'
  | 'invalid-linked-tabs'
  | 'invalid-connection-statuses'
  | 'invalid-mode'
  | 'invalid-last-active-tab'
  | 'invalid-topology'
  | 'invalid-revision'
  | 'invalid-session-epoch';

export type ParseSyncStateResult =
  | { status: 'valid'; state: SyncState; migrated: boolean }
  | { status: 'invalid'; reason: SyncStateValidationReason };

interface OwnProperty {
  present: boolean;
  value: unknown;
}

function getOwnProperty(target: object, key: string): OwnProperty {
  if (!Object.prototype.hasOwnProperty.call(target, key)) {
    return { present: false, value: undefined };
  }

  const value: unknown = Reflect.get(target, key);
  return { present: true, value };
}

function isObjectRecord(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isConnectionStatus(value: unknown): value is ConnectionStatus {
  return value === 'connected' || value === 'disconnected' || value === 'error';
}

function isSyncMode(value: unknown): value is SyncMode {
  return value === 'ratio' || value === 'element';
}

export function parseStoredSyncState(storedValue: unknown): ParseSyncStateResult {
  if (storedValue === undefined) {
    return {
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
    };
  }

  if (!isObjectRecord(storedValue)) {
    return { status: 'invalid', reason: 'not-an-object' };
  }

  const activeProperty = getOwnProperty(storedValue, 'isActive');
  if (!activeProperty.present || typeof activeProperty.value !== 'boolean') {
    return { status: 'invalid', reason: 'invalid-active-flag' };
  }
  const isActive = activeProperty.value;

  const linkedTabsProperty = getOwnProperty(storedValue, 'linkedTabs');
  if (!linkedTabsProperty.present || !Array.isArray(linkedTabsProperty.value)) {
    return { status: 'invalid', reason: 'invalid-linked-tabs' };
  }

  const linkedTabs: Array<number> = [];
  const linkedTabIds = new Set<number>();
  for (const tabId of linkedTabsProperty.value) {
    if (!isPositiveSafeInteger(tabId) || linkedTabIds.has(tabId)) {
      return { status: 'invalid', reason: 'invalid-linked-tabs' };
    }
    linkedTabs.push(tabId);
    linkedTabIds.add(tabId);
  }

  if ((isActive && linkedTabs.length < 2) || (!isActive && linkedTabs.length !== 0)) {
    return { status: 'invalid', reason: 'invalid-topology' };
  }

  const statusesProperty = getOwnProperty(storedValue, 'connectionStatuses');
  if (!statusesProperty.present || !isObjectRecord(statusesProperty.value)) {
    return { status: 'invalid', reason: 'invalid-connection-statuses' };
  }

  const storedStatusKeys = Object.keys(statusesProperty.value);
  for (const statusKey of storedStatusKeys) {
    const status: unknown = Reflect.get(statusesProperty.value, statusKey);
    if (!isConnectionStatus(status)) {
      return { status: 'invalid', reason: 'invalid-connection-statuses' };
    }
  }

  let migrated = false;
  const connectionStatuses: Record<number, ConnectionStatus> = {};
  for (const tabId of linkedTabs) {
    const statusProperty = getOwnProperty(statusesProperty.value, String(tabId));
    if (!statusProperty.present) {
      connectionStatuses[tabId] = 'error';
      migrated = true;
      continue;
    }

    if (!isConnectionStatus(statusProperty.value)) {
      return { status: 'invalid', reason: 'invalid-connection-statuses' };
    }
    connectionStatuses[tabId] = statusProperty.value;
  }

  if (storedStatusKeys.some((statusKey) => !linkedTabIds.has(Number(statusKey)))) {
    migrated = true;
  }

  const modeProperty = getOwnProperty(storedValue, 'mode');
  let mode: SyncMode = 'ratio';
  if (modeProperty.present) {
    if (!isSyncMode(modeProperty.value)) {
      return { status: 'invalid', reason: 'invalid-mode' };
    }
    mode = modeProperty.value;
    if (!isActive) {
      migrated = true;
    }
  } else if (isActive) {
    migrated = true;
  }

  const lastActiveProperty = getOwnProperty(storedValue, 'lastActiveSyncedTabId');
  if (
    !lastActiveProperty.present ||
    (lastActiveProperty.value !== null && !isPositiveSafeInteger(lastActiveProperty.value))
  ) {
    return { status: 'invalid', reason: 'invalid-last-active-tab' };
  }

  let lastActiveSyncedTabId = lastActiveProperty.value;
  if (lastActiveSyncedTabId !== null && (!isActive || !linkedTabIds.has(lastActiveSyncedTabId))) {
    lastActiveSyncedTabId = null;
    migrated = true;
  }

  const revisionProperty = getOwnProperty(storedValue, 'revision');
  let revision = 0;
  if (revisionProperty.present) {
    if (!isNonNegativeSafeInteger(revisionProperty.value)) {
      return { status: 'invalid', reason: 'invalid-revision' };
    }
    revision = revisionProperty.value;
  } else {
    migrated = true;
  }

  const sessionEpochProperty = getOwnProperty(storedValue, 'sessionEpoch');
  let sessionEpoch = 0;
  if (sessionEpochProperty.present) {
    if (!isNonNegativeSafeInteger(sessionEpochProperty.value)) {
      return { status: 'invalid', reason: 'invalid-session-epoch' };
    }
    sessionEpoch = sessionEpochProperty.value;
  } else {
    migrated = true;
  }

  const baseState = {
    isActive,
    linkedTabs,
    connectionStatuses,
    lastActiveSyncedTabId,
    revision,
    sessionEpoch,
  };

  return {
    status: 'valid',
    migrated,
    state: isActive ? { ...baseState, mode } : baseState,
  };
}
