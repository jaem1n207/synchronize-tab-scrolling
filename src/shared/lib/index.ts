export {
  isLocalDevelopmentServer,
  isUrlExcluded,
  normalizeUrlForAutoSync,
} from './auto-sync-url-utils';
export {
  ANIMATION_DURATIONS,
  EASING_CSS,
  EASING_FUNCTIONS,
  getMotionTransition,
  getTransitionStyle,
  motionVariants,
  PANEL_ANIMATIONS,
  prefersReducedMotion,
} from './animations';
export { isFirefox } from './env';
export { matchesKoreanSearch } from './korean-search';
export {
  applyLocalePreservingSync,
  extractLocaleFromPath,
  removeLocaleFromPath,
} from './locale-utils';
export { ExtensionLogger } from './logger';
export { throttleAndDebounce } from './performance-utils';
export {
  calculateScrollRatio,
  clampScrollOffset,
  clampScrollPosition,
  findNearestIndex,
} from './scroll-math';
export type { Platform } from './platform';
export { getPlatform, isLinux, isMac, isWindows } from './platform';
export type { ManualScrollOffset } from './storage';
export {
  clearAllManualScrollOffsets,
  clearManualScrollOffset,
  clearStorage,
  getManualScrollOffset,
  loadAutoSyncEnabled,
  loadAutoSyncExcludedUrls,
  loadManualScrollOffsets,
  loadPanelMinimized,
  loadSelectedTabIds,
  loadSyncMode,
  loadUrlSyncEnabled,
  saveAutoSyncEnabled,
  saveAutoSyncExcludedUrls,
  saveManualScrollOffset,
  savePanelMinimized,
  saveSelectedTabIds,
  saveSyncMode,
  saveUrlSyncEnabled,
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
