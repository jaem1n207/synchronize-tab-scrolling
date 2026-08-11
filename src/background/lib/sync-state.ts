import { sendMessage } from 'webext-bridge/background';
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

/**
 * Time-boxed bridge for legacy in-place mutations in the pre-orchestrator background consumers.
 * No new caller may use this API; Tasks 9-11 remove it after transactional migration.
 */
export function persistCommittedSyncStateLegacy(): Promise<PersistSyncStateResult> {
  return persistSyncState(getSyncStateSnapshot());
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

  commitSyncState(parsedState.state);
  logger.info('Sync state restored from storage', {
    linkedTabCount: parsedState.state.linkedTabs.length,
    revision: parsedState.state.revision,
    sessionEpoch: parsedState.state.sessionEpoch,
  });
  return { status: 'ready' };
}

export async function broadcastSyncStatus(): Promise<void> {
  const tabs = await browser.tabs.query({ currentWindow: true });

  const tabInfoPromises = syncState.linkedTabs.map(async (tabId) => {
    const tab = tabs.find((candidate) => candidate.id === tabId);
    if (!tab) return null;

    return {
      id: tabId,
      title: tab.title || 'Untitled',
      url: tab.url || '',
      favIconUrl: tab.favIconUrl,
      eligible: true,
    };
  });

  const linkedTabsInfo = (await Promise.all(tabInfoPromises)).filter(
    (info): info is NonNullable<typeof info> => info !== null,
  );

  const statusPayload = {
    linkedTabs: linkedTabsInfo,
    connectionStatuses: syncState.connectionStatuses,
  };

  const promises = syncState.linkedTabs.map(async (tabId) => {
    await sendMessage(
      'sync:status',
      { ...statusPayload, currentTabId: tabId },
      { context: 'content-script', tabId },
    ).catch(() => {
      logger.debug(`Failed to send sync status to tab ${tabId}`, {
        reason: 'status-send-failed',
        tabId,
      });
    });
  });

  await Promise.all(promises);
}
