import type { AutoSyncState } from '~/shared/types/auto-sync-state';

export const autoSyncState: AutoSyncState = {
  enabled: false,
  groups: new Map(),
  excludedUrls: [],
};

export const manualSyncOverriddenTabs = new Set<number>();

export const autoSyncRetryTimers = new Map<string, ReturnType<typeof setTimeout>>();

export const dismissedUrlGroups = new Set<string>();

export const pendingSuggestions = new Set<string>();

/** Dedup guard: tabs already shown add-tab suggestion this sync session. Cleared on sync stop. */
export const addTabSuggestedTabs = new Set<number>();

export const MAX_AUTO_SYNC_GROUP_SIZE = 10;

export const autoSyncFlags = {
  isToggling: false,
  isInitializing: false,
  pendingToggleRequest: null as boolean | null,
};

const mutexState = {
  current: Promise.resolve() as Promise<void>,
};

export function isTabManuallyOverridden(tabId: number): boolean {
  return manualSyncOverriddenTabs.has(tabId);
}

export async function withAutoSyncLock<T>(fn: () => Promise<T>): Promise<T> {
  const previousMutex = mutexState.current;
  let releaseLock: () => void;
  mutexState.current = new Promise((resolve) => {
    releaseLock = resolve;
  });

  try {
    await previousMutex;
    return await fn();
  } finally {
    releaseLock!();
  }
}
