import type { AutoSyncGroup } from '~/shared/types/auto-sync-state';

import {
  autoSyncState,
  manualSyncOverriddenTabs,
  pendingSuggestions,
  withAutoSyncLock,
} from './auto-sync-state';
import { sendMessageWithTimeout } from './messaging';

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
}

interface ManualOverrideAdapterDependencies {
  groups: Map<string, AutoSyncGroup>;
  overrideTabIds: Set<number>;
  pendingSuggestions: Set<string>;
  withAutoSyncLock: <T>(operation: () => Promise<T>) => Promise<T>;
  restoreRuntime: (groupIds: ReadonlyArray<string>) => Promise<boolean>;
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
  };
}

async function restoreAutoSyncRuntime(groupIds: ReadonlyArray<string>): Promise<boolean> {
  let fullyRestored = true;

  for (const groupId of groupIds) {
    const group = autoSyncState.groups.get(groupId);
    if (!group?.isActive || group.tabIds.size < 2) {
      continue;
    }

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

export const manualOverrideAdapter = createManualOverrideAdapter({
  groups: autoSyncState.groups,
  overrideTabIds: manualSyncOverriddenTabs,
  pendingSuggestions,
  withAutoSyncLock,
  restoreRuntime: restoreAutoSyncRuntime,
});
