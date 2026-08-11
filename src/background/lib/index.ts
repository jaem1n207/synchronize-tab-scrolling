export { sendMessageWithTimeout } from './messaging';
export {
  initializeBackground,
  waitForBackgroundInitialization,
  getManualReadinessSnapshot,
  reconcileRestoredManualSession,
} from './background-initialization';
export type {
  AutoSyncReadiness,
  BackgroundReadiness,
  ManualReadinessSnapshot,
} from './background-initialization';
export {
  syncState,
  getSyncStateSnapshot,
  commitSyncState,
  persistSyncState,
  restoreSyncState,
  broadcastSyncStatus,
} from './sync-state';
export type { PersistSyncStateResult, RestoreSyncStateResult } from './sync-state';
export { parseStoredSyncState } from './sync-state-parser';
export type { ParseSyncStateResult, SyncStateValidationReason } from './sync-state-parser';
export { isContentScriptAlive, reinjectContentScript } from './content-script-manager';
export { startKeepAlive, stopKeepAlive } from './keep-alive';
export {
  autoSyncState,
  manualSyncOverriddenTabs,
  autoSyncRetryTimers,
  dismissedUrlGroups,
  pendingSuggestions,
  MAX_AUTO_SYNC_GROUP_SIZE,
  autoSyncFlags,
  isTabManuallyOverridden,
  withAutoSyncLock,
} from './auto-sync-state';
export {
  showSyncSuggestion,
  sendSuggestionToSingleTab,
  showAddTabSuggestion,
} from './auto-sync-suggestions';
export {
  removeTabFromAllAutoSyncGroups,
  getAutoSyncGroupMembers,
  isTabInActiveAutoSyncGroup,
  updateAutoSyncGroup,
  refreshTranslatedPageCandidateGroups,
  cancelAutoSyncRetry,
  stopAutoSyncForGroup,
  broadcastAutoSyncGroupUpdate,
} from './auto-sync-groups';
export { initializeAutoSync, toggleAutoSync } from './auto-sync-lifecycle';
export type { AutoSyncInitializationResult } from './auto-sync-lifecycle';
export { createSyncTransitionGate, syncTransitionGate } from './sync-transition-gate';
export type { SyncTransitionContext, SyncTransitionGate } from './sync-transition-gate';
