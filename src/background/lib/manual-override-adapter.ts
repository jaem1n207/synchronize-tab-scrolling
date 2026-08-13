import {
  isAutoSyncActivationId,
  type AutoSyncActivationId,
} from '~/shared/lib/auto-sync-activation';
import type { AutoSyncGroup } from '~/shared/types/auto-sync-state';

import {
  autoSyncState,
  manualSyncOverriddenTabs,
  pendingSuggestions,
  withAutoSyncLock,
} from './auto-sync-state';
import { sendMessageWithTimeout } from './messaging';
import { createManualCleanupRetryScheduler } from './sync-cleanup-retry';
import { getSyncStateSnapshot } from './sync-state';
import { syncTransitionGate } from './sync-transition-gate';

export interface ManualOverrideSnapshot {
  operationGeneration: number;
  joiningTabIds: Array<number>;
  previousOverrideTabIds: Array<number>;
  affectedGroupIds: Array<string>;
}

export interface ManualOverrideAdapter {
  prepare(
    operationGeneration: number,
    joiningTabIds: ReadonlyArray<number>,
  ): Promise<ManualOverrideSnapshot>;
  commit(
    snapshot: ManualOverrideSnapshot,
    committedJoiningTabIds: ReadonlyArray<number>,
  ): Promise<{ status: 'committed' } | { status: 'stale' }>;
  rollbackUncommitted(
    snapshot: ManualOverrideSnapshot,
    committedJoiningTabIds: ReadonlyArray<number>,
  ): Promise<{ status: 'rolled-back' } | { status: 'degraded' }>;
  rollback(
    snapshot: ManualOverrideSnapshot,
  ): Promise<{ status: 'rolled-back' } | { status: 'degraded' }>;
  cleanupResidualRuntime(
    snapshot: ManualOverrideSnapshot,
  ): Promise<{ status: 'cleaned' } | { status: 'degraded' }>;
}

interface ManualOverrideAdapterDependencies {
  groups: Map<string, AutoSyncGroup>;
  overrideTabIds: Set<number>;
  pendingSuggestions: Set<string>;
  withAutoSyncLock: <T>(operation: () => Promise<T>) => Promise<T>;
  restoreRuntime: (groupIds: ReadonlyArray<string>) => Promise<boolean>;
  stopResidualRuntime: (
    residuals: ReadonlyArray<{
      tabId: number;
      activationGeneration: AutoSyncActivationId;
    }>,
  ) => Promise<boolean>;
}

interface CapturedOverrideState {
  groups: Map<string, AutoSyncGroup>;
  pendingSuggestionGroupIds: Set<string>;
}

const provisionalManualOverrideOwners = new Map<number, number>();

export function isTabProvisionallyManuallyOverridden(tabId: number): boolean {
  return provisionalManualOverrideOwners.has(tabId);
}

function clearOwnedProvisionalOverrides(
  snapshot: ManualOverrideSnapshot,
  tabIds: ReadonlyArray<number> = snapshot.joiningTabIds,
): void {
  for (const tabId of tabIds) {
    if (provisionalManualOverrideOwners.get(tabId) === snapshot.operationGeneration) {
      provisionalManualOverrideOwners.delete(tabId);
    }
  }
}

function cloneGroup(group: AutoSyncGroup): AutoSyncGroup {
  const clone: AutoSyncGroup = {
    tabIds: new Set(group.tabIds),
    isActive: group.isActive,
  };

  if (group.activationGeneration !== undefined) {
    clone.activationGeneration = group.activationGeneration;
  }
  if (group.matchKind !== undefined) {
    clone.matchKind = group.matchKind;
  }
  if (group.matchConfidence !== undefined) {
    clone.matchConfidence = group.matchConfidence;
  }
  if (group.tabUrls !== undefined) {
    clone.tabUrls = new Map(group.tabUrls);
  }

  return clone;
}

function restoreOverrideIds(target: Set<number>, previousIds: ReadonlyArray<number>): void {
  target.clear();
  for (const tabId of previousIds) {
    target.add(tabId);
  }
}

function restorePendingSuggestions(
  target: Set<string>,
  affectedGroupIds: ReadonlyArray<string>,
  previousGroupIds: ReadonlySet<string>,
): void {
  for (const groupId of affectedGroupIds) {
    if (previousGroupIds.has(groupId)) {
      target.add(groupId);
    } else {
      target.delete(groupId);
    }
  }
}

export function createManualOverrideAdapter(
  dependencies: ManualOverrideAdapterDependencies,
): ManualOverrideAdapter {
  const capturedStates = new WeakMap<ManualOverrideSnapshot, CapturedOverrideState>();
  let latestOperationGeneration = 0;

  return {
    prepare(operationGeneration, joiningTabIds) {
      return dependencies.withAutoSyncLock(async () => {
        const uniqueJoiningTabIds = [...new Set(joiningTabIds)];
        const joiningIds = new Set(uniqueJoiningTabIds);
        const capturedGroups = new Map<string, AutoSyncGroup>();
        const pendingSuggestionGroupIds = new Set<string>();

        for (const tabId of uniqueJoiningTabIds) {
          provisionalManualOverrideOwners.set(tabId, operationGeneration);
        }

        for (const [groupId, group] of dependencies.groups) {
          if (![...group.tabIds].some((tabId) => joiningIds.has(tabId))) {
            continue;
          }

          capturedGroups.set(groupId, cloneGroup(group));
          if (dependencies.pendingSuggestions.has(groupId)) {
            pendingSuggestionGroupIds.add(groupId);
          }

          for (const tabId of uniqueJoiningTabIds) {
            group.tabIds.delete(tabId);
            group.tabUrls?.delete(tabId);
          }

          if (group.tabIds.size === 0) {
            dependencies.groups.delete(groupId);
          } else if (group.tabIds.size < 2) {
            group.isActive = false;
          }
          dependencies.pendingSuggestions.delete(groupId);
        }

        latestOperationGeneration = operationGeneration;
        const snapshot: ManualOverrideSnapshot = {
          operationGeneration,
          joiningTabIds: uniqueJoiningTabIds,
          previousOverrideTabIds: [...dependencies.overrideTabIds],
          affectedGroupIds: [...capturedGroups.keys()],
        };
        capturedStates.set(snapshot, {
          groups: capturedGroups,
          pendingSuggestionGroupIds,
        });
        return snapshot;
      });
    },

    commit(snapshot, committedJoiningTabIds) {
      return dependencies.withAutoSyncLock(async () => {
        const captured = capturedStates.get(snapshot);
        if (
          !captured ||
          snapshot.operationGeneration !== latestOperationGeneration ||
          committedJoiningTabIds.some((tabId) => !snapshot.joiningTabIds.includes(tabId))
        ) {
          clearOwnedProvisionalOverrides(snapshot);
          return { status: 'stale' };
        }

        for (const tabId of committedJoiningTabIds) {
          dependencies.overrideTabIds.add(tabId);
        }
        clearOwnedProvisionalOverrides(snapshot, committedJoiningTabIds);
        for (const groupId of [...dependencies.pendingSuggestions]) {
          const group = dependencies.groups.get(groupId);
          if (!group || group.tabIds.size < 2) {
            dependencies.pendingSuggestions.delete(groupId);
          }
        }
        return { status: 'committed' };
      });
    },

    rollbackUncommitted(snapshot, committedJoiningTabIds) {
      return dependencies.withAutoSyncLock(async () => {
        const captured = capturedStates.get(snapshot);
        if (!captured) {
          clearOwnedProvisionalOverrides(snapshot);
          return { status: 'degraded' };
        }

        const committedIds = new Set(committedJoiningTabIds);
        const excludedIds = new Set(
          snapshot.joiningTabIds.filter((tabId) => !committedIds.has(tabId)),
        );
        clearOwnedProvisionalOverrides(snapshot, [...excludedIds]);
        const restoredGroupIds: Array<string> = [];

        for (const [groupId, previousGroup] of captured.groups) {
          const restoredIds = [...previousGroup.tabIds].filter((tabId) => excludedIds.has(tabId));
          if (restoredIds.length === 0) {
            continue;
          }

          const currentGroup = dependencies.groups.get(groupId);
          const restoredGroup = currentGroup ? cloneGroup(currentGroup) : cloneGroup(previousGroup);
          if (!currentGroup) {
            restoredGroup.tabIds.clear();
            restoredGroup.tabUrls?.clear();
          }

          for (const tabId of restoredIds) {
            restoredGroup.tabIds.add(tabId);
            const previousUrl = previousGroup.tabUrls?.get(tabId);
            if (previousUrl !== undefined) {
              restoredGroup.tabUrls ??= new Map();
              restoredGroup.tabUrls.set(tabId, previousUrl);
            }
          }
          restoredGroup.isActive = previousGroup.isActive && restoredGroup.tabIds.size >= 2;
          dependencies.groups.set(groupId, restoredGroup);
          restoredGroupIds.push(groupId);
        }

        const runtimeRestored = await dependencies
          .restoreRuntime(restoredGroupIds)
          .catch(() => false);
        return runtimeRestored ? { status: 'rolled-back' } : { status: 'degraded' };
      });
    },

    rollback(snapshot) {
      return dependencies.withAutoSyncLock(async () => {
        const captured = capturedStates.get(snapshot);
        if (!captured) {
          clearOwnedProvisionalOverrides(snapshot);
          return { status: 'degraded' };
        }

        clearOwnedProvisionalOverrides(snapshot);
        for (const groupId of snapshot.affectedGroupIds) {
          dependencies.groups.delete(groupId);
        }
        for (const [groupId, group] of captured.groups) {
          dependencies.groups.set(groupId, cloneGroup(group));
        }
        restoreOverrideIds(dependencies.overrideTabIds, snapshot.previousOverrideTabIds);
        restorePendingSuggestions(
          dependencies.pendingSuggestions,
          snapshot.affectedGroupIds,
          captured.pendingSuggestionGroupIds,
        );

        const activeGroupIds = [...captured.groups]
          .filter(([, group]) => group.isActive)
          .map(([groupId]) => groupId);
        const runtimeRestored = await dependencies
          .restoreRuntime(activeGroupIds)
          .catch(() => false);
        return runtimeRestored ? { status: 'rolled-back' } : { status: 'degraded' };
      });
    },

    async cleanupResidualRuntime(snapshot) {
      const residuals = await dependencies.withAutoSyncLock(async () => {
        const captured = capturedStates.get(snapshot);
        if (!captured) {
          return null;
        }

        const result: Array<{
          tabId: number;
          activationGeneration: AutoSyncActivationId;
        }> = [];
        for (const [groupId, previousGroup] of captured.groups) {
          const currentGroup = dependencies.groups.get(groupId);
          if (
            !previousGroup.isActive ||
            currentGroup?.isActive !== false ||
            currentGroup.tabIds.size !== 1 ||
            currentGroup.activationGeneration !== previousGroup.activationGeneration ||
            !isAutoSyncActivationId(previousGroup.activationGeneration)
          ) {
            continue;
          }
          const tabId = currentGroup.tabIds.values().next().value;
          if (tabId !== undefined) {
            result.push({
              tabId,
              activationGeneration: previousGroup.activationGeneration,
            });
          }
        }
        return result;
      });
      if (residuals === null) {
        return { status: 'degraded' };
      }
      if (residuals.length === 0) {
        return { status: 'cleaned' };
      }

      const stopped = await dependencies.stopResidualRuntime(residuals).catch(() => false);
      return stopped ? { status: 'cleaned' } : { status: 'degraded' };
    },
  };
}

async function restoreAutoSyncRuntime(groupIds: ReadonlyArray<string>): Promise<boolean> {
  let fullyRestored = true;

  for (const groupId of groupIds) {
    const group = autoSyncState.groups.get(groupId);
    if (!group?.isActive || group.tabIds.size < 2) {
      continue;
    }
    if (!isAutoSyncActivationId(group.activationGeneration)) {
      fullyRestored = false;
      continue;
    }
    const activationGeneration = group.activationGeneration;
    const tabIds = [...group.tabIds];
    const results = await Promise.all(
      tabIds.map(async (tabId) => {
        try {
          const response = await sendMessageWithTimeout<{ success: boolean; tabId: number }>(
            'scroll:start',
            {
              tabIds,
              mode: 'ratio',
              currentTabId: tabId,
              isAutoSync: true,
              autoSyncGeneration: activationGeneration,
            },
            { context: 'content-script', tabId },
            1_000,
          );
          return response.success && response.tabId === tabId;
        } catch {
          return false;
        }
      }),
    );
    if (results.some((restored) => !restored)) {
      fullyRestored = false;
    }
  }

  return fullyRestored;
}

function getCurrentAutoSyncActivationId(tabId: number): AutoSyncActivationId | null {
  for (const [, group] of autoSyncState.groups) {
    if (group.tabIds.has(tabId) && isAutoSyncActivationId(group.activationGeneration)) {
      return group.activationGeneration;
    }
  }
  return null;
}

const residualCleanupScheduler = createManualCleanupRetryScheduler({
  transitionGate: syncTransitionGate,
  getState: getSyncStateSnapshot,
  getAutoSyncActivationId: getCurrentAutoSyncActivationId,
  sendStop: (tabId, autoSyncActivationId) => {
    if (autoSyncActivationId === undefined) {
      return Promise.resolve({ success: false, tabId });
    }
    return sendMessageWithTimeout<{ success: boolean; tabId?: number; reason?: string }>(
      'scroll:stop',
      { isAutoSync: true, autoSyncGeneration: autoSyncActivationId },
      { context: 'content-script', tabId },
      1_000,
    );
  },
  setTimer: (callback, delay) => setTimeout(callback, delay),
  clearTimer: (timer) => clearTimeout(timer),
});

async function stopResidualAutoSyncRuntime(
  residuals: ReadonlyArray<{
    tabId: number;
    activationGeneration: AutoSyncActivationId;
  }>,
): Promise<boolean> {
  const state = getSyncStateSnapshot();
  const results = await Promise.all(
    residuals.map(async ({ tabId, activationGeneration }) => {
      const stopped = await sendMessageWithTimeout<{
        success: boolean;
        tabId?: number;
        reason?: string;
      }>(
        'scroll:stop',
        { isAutoSync: true, autoSyncGeneration: activationGeneration },
        { context: 'content-script', tabId },
        1_000,
      ).then(
        (response) => response.success && response.tabId === tabId,
        () => false,
      );
      if (stopped) {
        residualCleanupScheduler.cancelForTab(tabId);
        return true;
      }

      residualCleanupScheduler.schedule({
        tabId,
        stoppedRevision: state.revision,
        stoppedSessionEpoch: state.sessionEpoch,
        attemptIndex: 0,
        autoSyncActivationId: activationGeneration,
      });
      return false;
    }),
  );
  return results.every(Boolean);
}

export const manualOverrideAdapter = createManualOverrideAdapter({
  groups: autoSyncState.groups,
  overrideTabIds: manualSyncOverriddenTabs,
  pendingSuggestions,
  withAutoSyncLock,
  restoreRuntime: restoreAutoSyncRuntime,
  stopResidualRuntime: stopResidualAutoSyncRuntime,
});
