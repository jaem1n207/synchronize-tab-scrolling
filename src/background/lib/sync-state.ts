import browser from 'webextension-polyfill';

import { ExtensionLogger } from '~/shared/lib/logger';
import type { SyncState } from '~/shared/types/sync-state';

import { parseStoredSyncState, type SyncStateValidationReason } from './sync-state-parser';

const logger = new ExtensionLogger({ scope: 'sync-state' });

export type RestoreSyncStateResult =
  | { status: 'ready' }
  | { status: 'storage-error' }
  | { status: 'invalid-state'; reason: SyncStateValidationReason };

export type PersistSyncStateResult = { status: 'persisted' } | { status: 'storage-error' };

/**
 * Temporary mutable surface for pre-orchestrator consumers.
 * Tasks 9-11 migrate these mutations to snapshot/persist/commit transitions.
 */
export const syncState: SyncState = {
  isActive: false,
  linkedTabs: [],
  connectionStatuses: {},
  lastActiveSyncedTabId: null,
  revision: 0,
  sessionEpoch: 0,
};

function cloneSyncState(state: SyncState): SyncState {
  const clonedState = {
    isActive: state.isActive,
    linkedTabs: [...state.linkedTabs],
    connectionStatuses: { ...state.connectionStatuses },
    lastActiveSyncedTabId: state.lastActiveSyncedTabId,
    revision: state.revision,
    sessionEpoch: state.sessionEpoch,
  };

  return state.mode === undefined ? clonedState : { ...clonedState, mode: state.mode };
}

export function getSyncStateSnapshot(): SyncState {
  return cloneSyncState(syncState);
}

export function commitSyncState(nextState: SyncState): void {
  const committedState = cloneSyncState(nextState);

  syncState.isActive = committedState.isActive;
  syncState.linkedTabs = committedState.linkedTabs;
  syncState.connectionStatuses = committedState.connectionStatuses;
  syncState.lastActiveSyncedTabId = committedState.lastActiveSyncedTabId;
  syncState.revision = committedState.revision;
  syncState.sessionEpoch = committedState.sessionEpoch;

  if (committedState.mode === undefined) {
    delete syncState.mode;
  } else {
    syncState.mode = committedState.mode;
  }
}

export async function persistSyncState(nextState: SyncState): Promise<PersistSyncStateResult> {
  const candidate = cloneSyncState(nextState);

  try {
    await browser.storage.local.set({ syncState: candidate });
    logger.debug('Sync state persisted to storage', {
      linkedTabCount: candidate.linkedTabs.length,
      revision: candidate.revision,
      sessionEpoch: candidate.sessionEpoch,
    });
    return { status: 'persisted' };
  } catch {
    logger.error('Failed to persist sync state', {
      reason: 'storage-write-failed',
      linkedTabCount: candidate.linkedTabs.length,
      revision: candidate.revision,
      sessionEpoch: candidate.sessionEpoch,
    });
    return { status: 'storage-error' };
  }
}

export async function restoreSyncState(): Promise<RestoreSyncStateResult> {
  let storedResult: unknown;
  try {
    storedResult = await browser.storage.local.get('syncState');
  } catch {
    logger.error('Failed to restore sync state', {
      reason: 'storage-read-failed',
    });
    return { status: 'storage-error' };
  }

  let storedValue: unknown;
  if (typeof storedResult === 'object' && storedResult !== null) {
    storedValue = Reflect.get(storedResult, 'syncState');
  }

  const parsedState = parseStoredSyncState(storedValue);
  if (parsedState.status === 'invalid') {
    logger.error('Stored sync state is invalid', {
      reason: parsedState.reason,
    });
    return { status: 'invalid-state', reason: parsedState.reason };
  }

  if (parsedState.migrated) {
    const persistResult = await persistSyncState(parsedState.state);
    if (persistResult.status === 'storage-error') {
      return persistResult;
    }
  }

  commitSyncState(parsedState.state);
  logger.info('Sync state restored from storage', {
    linkedTabCount: parsedState.state.linkedTabs.length,
    revision: parsedState.state.revision,
    sessionEpoch: parsedState.state.sessionEpoch,
  });
  return { status: 'ready' };
}

/**
 * Manual session status is pull-only through the source-authorized `sync:get-status` request.
 * Keep this lifecycle hook side-effect free while transition controllers share one interface.
 */
export function broadcastSyncStatus(): Promise<void> {
  return Promise.resolve();
}
