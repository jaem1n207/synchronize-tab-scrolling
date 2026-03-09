/**
 * Internal auto-sync group using Set for O(1) tab lookups.
 * Differs from AutoSyncGroupInfo (messages.ts) which uses Array for serialization.
 */
export interface AutoSyncGroup {
  tabIds: Set<number>;
  isActive: boolean;
}

/**
 * Auto-sync state for automatic synchronization of same-URL tabs.
 * Groups map normalizedUrl to their corresponding tab group.
 */
export interface AutoSyncState {
  enabled: boolean;
  groups: Map<string, AutoSyncGroup>;
  excludedUrls: Array<string>;
}
