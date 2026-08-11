import type { AutoSyncGroup } from '~/shared/types/auto-sync-state';
import type { StartSyncContentMessage } from '~/shared/types/messages';
import type { SyncState } from '~/shared/types/sync-state';

import type { SyncSessionOrchestrator } from './sync-session-orchestrator';
import type { PersistSyncStateResult } from './sync-state';
import type { SyncTransitionContext } from './sync-transition-gate';

export interface AcceptedAutoSyncInput {
  normalizedUrl: string;
  tabIds: Array<number>;
  expectedRevision: number;
}

export type AcceptedAutoSyncResult =
  | { status: 'committed'; revision: number }
  | {
      status: 'rejected';
      reason: 'stale-revision' | 'auto-start-failed' | 'persistence-failed';
    };

export interface LegacyAutoSyncAdapter {
  startAcceptedGroup(
    input: AcceptedAutoSyncInput,
  ): Promise<{ status: 'started' } | { status: 'failed' }>;
  rollbackAcceptedGroup(input: AcceptedAutoSyncInput): Promise<void>;
}

interface CreateLegacyAutoSyncAdapterDependencies {
  groups: Map<string, AutoSyncGroup>;
  withLock: <T>(operation: () => Promise<T>) => Promise<T>;
  sendStart: (tabId: number, message: StartSyncContentMessage) => Promise<boolean>;
  sendStop: (tabId: number) => Promise<void>;
}

interface ReplaceAcceptedAutoSyncDependencies {
  orchestrator: SyncSessionOrchestrator;
  legacyAutoSyncAdapter: LegacyAutoSyncAdapter;
  getState: () => SyncState;
  persistState: (nextState: SyncState) => Promise<PersistSyncStateResult>;
  commitState: (nextState: SyncState) => void;
}

function createInactiveRevisionCandidate(state: SyncState): SyncState {
  return {
    isActive: false,
    linkedTabs: [],
    connectionStatuses: {},
    lastActiveSyncedTabId: null,
    revision: state.revision + 1,
    sessionEpoch: state.sessionEpoch,
  };
}

function isValidAcceptedTabId(tabId: number): boolean {
  return Number.isSafeInteger(tabId) && tabId > 0;
}

function hasExactMembers(group: AutoSyncGroup, tabIds: ReadonlyArray<number>): boolean {
  return group.tabIds.size === tabIds.length && tabIds.every((tabId) => group.tabIds.has(tabId));
}

async function cleanupAcceptedTabs(
  dependencies: CreateLegacyAutoSyncAdapterDependencies,
  tabIds: ReadonlyArray<number>,
): Promise<void> {
  await Promise.all(tabIds.map((tabId) => dependencies.sendStop(tabId).catch(() => undefined)));
}

export function createLegacyAutoSyncAdapter(
  dependencies: CreateLegacyAutoSyncAdapterDependencies,
): LegacyAutoSyncAdapter {
  return {
    async startAcceptedGroup(input) {
      const tabIds = [...new Set(input.tabIds)];
      if (
        tabIds.length < 2 ||
        tabIds.length !== input.tabIds.length ||
        !tabIds.every(isValidAcceptedTabId)
      ) {
        return { status: 'failed' };
      }

      const canStart = await dependencies.withLock(async () => {
        const group = dependencies.groups.get(input.normalizedUrl);
        return Boolean(group && !group.isActive && hasExactMembers(group, tabIds));
      });
      if (!canStart) {
        return { status: 'failed' };
      }

      const connectedTabIds: Array<number> = [];
      for (const tabId of tabIds) {
        const connected = await dependencies
          .sendStart(tabId, {
            tabIds,
            mode: 'ratio',
            currentTabId: tabId,
            isAutoSync: true,
          })
          .catch(() => false);
        if (connected) {
          connectedTabIds.push(tabId);
        }
      }

      if (connectedTabIds.length < 2) {
        await cleanupAcceptedTabs(dependencies, connectedTabIds);
        return { status: 'failed' };
      }

      const committed = await dependencies.withLock(async () => {
        const group = dependencies.groups.get(input.normalizedUrl);
        if (!group || group.isActive || !hasExactMembers(group, tabIds)) {
          return false;
        }

        group.tabIds = new Set(connectedTabIds);
        if (group.tabUrls) {
          group.tabUrls = new Map(
            Array.from(group.tabUrls.entries()).filter(([tabId]) =>
              connectedTabIds.includes(tabId),
            ),
          );
        }
        group.isActive = true;
        return true;
      });

      if (!committed) {
        await cleanupAcceptedTabs(dependencies, connectedTabIds);
        return { status: 'failed' };
      }

      return { status: 'started' };
    },

    async rollbackAcceptedGroup(input) {
      await dependencies.withLock(async () => {
        const group = dependencies.groups.get(input.normalizedUrl);
        if (group) {
          group.isActive = false;
        }
      });
      await cleanupAcceptedTabs(dependencies, input.tabIds);
    },
  };
}

export async function replaceManualWithAcceptedAutoSync(
  context: SyncTransitionContext,
  input: AcceptedAutoSyncInput,
  dependencies: ReplaceAcceptedAutoSyncDependencies,
): Promise<AcceptedAutoSyncResult> {
  const initialState = dependencies.getState();
  if (
    input.expectedRevision !== context.expectedRevision ||
    initialState.revision !== context.expectedRevision
  ) {
    return { status: 'rejected', reason: 'stale-revision' };
  }

  if (initialState.isActive) {
    const stopResult = await dependencies.orchestrator.stopManualSession(
      context,
      'suggestion-replace',
    );
    if (stopResult.status === 'rejected') {
      return {
        status: 'rejected',
        reason:
          stopResult.reason === 'persistence-failed' ? 'persistence-failed' : 'stale-revision',
      };
    }
  }

  const startResult = await dependencies.legacyAutoSyncAdapter.startAcceptedGroup(input);
  if (startResult.status === 'failed') {
    return { status: 'rejected', reason: 'auto-start-failed' };
  }

  const candidate = createInactiveRevisionCandidate(dependencies.getState());
  const persistence = await dependencies.persistState(candidate);
  if (persistence.status === 'storage-error') {
    await dependencies.legacyAutoSyncAdapter.rollbackAcceptedGroup(input).catch(() => undefined);
    return { status: 'rejected', reason: 'persistence-failed' };
  }

  dependencies.commitState(candidate);
  return { status: 'committed', revision: candidate.revision };
}
