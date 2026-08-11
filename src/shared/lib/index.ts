export {
  extractDomainFromUrl,
  isLocalDevelopmentServer,
  isUrlExcluded,
  normalizeDomain,
  normalizeUrlForAutoSync,
} from './auto-sync-url-utils';
export {
  ANIMATION_DURATIONS,
  EASING_CSS,
  EASING_FUNCTIONS,
  getMotionSpringTransition,
  getMotionTransition,
  getTransitionStyle,
  motionVariants,
  PANEL_ANIMATIONS,
  prefersReducedMotion,
} from './animations';
export { isFirefox } from './env';
export {
  getQuickSyncPortName,
  getQuickSyncRemainingSeconds,
  parseQuickSyncPortGeneration,
  QUICK_SYNC_BADGE_DURATION_MS,
  QUICK_SYNC_CANDIDATE_DURATION_MS,
  QUICK_SYNC_CONTROL_TIMEOUT_MS,
  QUICK_SYNC_FAILURE_HUD_DURATION_MS,
  QUICK_SYNC_PORT_PREFIX,
  QUICK_SYNC_RECONNECT_TIMEOUT_MS,
  QUICK_SYNC_RECENT_OUTCOME_DURATION_MS,
  QUICK_SYNC_SUCCESS_HUD_DURATION_MS,
  toQuickSyncShortcutLabel,
} from './quick-sync';
export {
  formatTitleWithKoreanJosa,
  isKoreanUiLanguage,
  type KoreanJosaParticle,
} from './korean-josa';
export { matchesKoreanSearch } from './korean-search';
export {
  applyLocalePreservingSync,
  extractLocaleFromPath,
  removeLocaleFromPath,
} from './locale-utils';
export { ExtensionLogger } from './logger';
export { throttleAndDebounce } from './performance-utils';
export * from './translated-page-url-utils';
export {
  calculateScrollRatio,
  clampScrollOffset,
  clampScrollPosition,
  findNearestIndex,
} from './scroll-math';
export type { Platform } from './platform';
export { getPlatform, isLinux, isMac, isWindows } from './platform';
export type { ManualScrollOffset, UrlSyncModeRepairResult } from './storage';
export {
  clearAllManualScrollOffsets,
  clearManualScrollOffset,
  clearManualScrollOffsetStrict,
  clearStorage,
  getManualScrollOffset,
  isContextualHintDismissed,
  loadAutoSyncEnabled,
  loadAutoSyncExcludedUrls,
  loadDismissedContextualHintIds,
  loadExcludedDomains,
  loadManualScrollOffsets,
  loadManualScrollOffsetsStrict,
  loadPanelMinimized,
  loadSelectedTabIds,
  loadSyncMode,
  loadUrlSyncEnabled,
  loadUrlSyncMode,
  repairUrlSyncMode,
  saveAutoSyncEnabled,
  saveAutoSyncExcludedUrls,
  saveDismissedContextualHintId,
  saveExcludedDomains,
  saveManualScrollOffset,
  saveManualScrollOffsetStrict,
  savePanelMinimized,
  saveSelectedTabIds,
  saveSyncMode,
  saveUrlSyncEnabled,
  saveUrlSyncMode,
} from './storage';
export {
  calculateTabSimilarity,
  filterTabsBySameDomain,
  sortTabsByRecentVisits,
  sortTabsBySimilarity,
  sortTabsWithDomainGrouping,
} from './tab-similarity';
export { detectBrowserType, isForbiddenUrl } from './url-utils';
export { cn } from './utils';
export * from './contextual-hints';
