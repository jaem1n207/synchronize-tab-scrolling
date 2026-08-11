import browser from 'webextension-polyfill';

import type { SyncState } from '~/shared/types/sync-state';

import { initializeAutoSync } from './auto-sync-lifecycle';
import { manualSyncOverriddenTabs } from './auto-sync-state';
import { startKeepAlive } from './keep-alive';
import {
  commitSyncState,
  getSyncStateSnapshot,
  persistSyncState,
  restoreSyncState,
} from './sync-state';
import { syncTransitionGate } from './sync-transition-gate';

import type { RestoreSyncStateResult } from './sync-state';

export type AutoSyncReadiness =
  | { status: 'ready' }
  | {
      status: 'degraded';
      reason: 'initialization-failed' | 'manual-state-unavailable';
    };

export interface BackgroundReadiness {
  manual: RestoreSyncStateResult;
  auto: AutoSyncReadiness;
}

export type ManualReadinessSnapshot = 'pending' | 'ready' | 'unavailable';

let manualReadinessSnapshot: ManualReadinessSnapshot = 'pending';
let initializationPromise: Promise<BackgroundReadiness> | null = null;

function createRepairedState(restoredState: SyncState, survivingTabIds: Array<number>): SyncState {
  const nextRevision = restoredState.revision + 1;

  if (survivingTabIds.length < 2) {
    return {
      isActive: false,
      linkedTabs: [],
      connectionStatuses: {},
      lastActiveSyncedTabId: null,
      revision: nextRevision,
      sessionEpoch: restoredState.sessionEpoch,
    };
  }

  const connectionStatuses = Object.fromEntries(
    survivingTabIds.map((tabId) => [tabId, restoredState.connectionStatuses[tabId] ?? 'error']),
  );
  const lastActiveSyncedTabId =
    restoredState.lastActiveSyncedTabId !== null &&
    survivingTabIds.includes(restoredState.lastActiveSyncedTabId)
      ? restoredState.lastActiveSyncedTabId
      : (survivingTabIds[0] ?? null);

  return {
    isActive: true,
    linkedTabs: survivingTabIds,
    connectionStatuses,
    mode: restoredState.mode ?? 'ratio',
    lastActiveSyncedTabId,
    revision: nextRevision,
    sessionEpoch: restoredState.sessionEpoch,
  };
}

export function reconcileRestoredManualSession(): Promise<RestoreSyncStateResult> {
  return syncTransitionGate.run(async () => {
    const restoredState = getSyncStateSnapshot();

    if (!restoredState.isActive) {
      return { status: 'ready' };
    }

    const tabResults = await Promise.all(
      restoredState.linkedTabs.map(async (tabId) => {
        try {
          await browser.tabs.get(tabId);
          return tabId;
        } catch {
          return null;
        }
      }),
    );
    const survivingTabIds = tabResults.filter((tabId): tabId is number => tabId !== null);

    if (survivingTabIds.length === restoredState.linkedTabs.length) {
      return { status: 'ready' };
    }

    const repairedState = createRepairedState(restoredState, survivingTabIds);
    const persistResult = await persistSyncState(repairedState);
    if (persistResult.status === 'storage-error') {
      return persistResult;
    }

    commitSyncState(repairedState);
    return { status: 'ready' };
  });
}

async function runBackgroundInitialization(): Promise<BackgroundReadiness> {
  const restoreResult = await restoreSyncState();
  if (restoreResult.status !== 'ready') {
    manualReadinessSnapshot = 'unavailable';
    return {
      manual: restoreResult,
      auto: { status: 'degraded', reason: 'manual-state-unavailable' },
    };
  }

  const reconcileResult = await reconcileRestoredManualSession();
  if (reconcileResult.status !== 'ready') {
    manualReadinessSnapshot = 'unavailable';
    return {
      manual: reconcileResult,
      auto: { status: 'degraded', reason: 'manual-state-unavailable' },
    };
  }

  const finalManualState = getSyncStateSnapshot();
  manualSyncOverriddenTabs.clear();
  if (finalManualState.isActive && finalManualState.linkedTabs.length >= 2) {
    for (const tabId of finalManualState.linkedTabs) {
      manualSyncOverriddenTabs.add(tabId);
    }
    startKeepAlive();
  }

  manualReadinessSnapshot = 'ready';

  const autoResult = await initializeAutoSync();
  return {
    manual: reconcileResult,
    auto:
      autoResult.status === 'ready'
        ? { status: 'ready' }
        : { status: 'degraded', reason: 'initialization-failed' },
  };
}

export function initializeBackground(): Promise<BackgroundReadiness> {
  initializationPromise ??= runBackgroundInitialization();
  return initializationPromise;
}

export function waitForBackgroundInitialization(): Promise<BackgroundReadiness> {
  return initializeBackground();
}

export function getManualReadinessSnapshot(): ManualReadinessSnapshot {
  return manualReadinessSnapshot;
}
