export const DEFAULT_URL_SYNC_MODE = 'follow-changed-tab';

export type UrlSyncMode = 'follow-changed-tab' | 'keep-each-tabs-website';

export type UrlSyncNoticeKey =
  | 'urlSyncModeResetNotice'
  | 'urlSyncKeepWebsiteBlockedNotice'
  | 'urlSyncLanguagePreservationNotice';

export type UrlSyncNoticeSeverity = 'info' | 'warning' | 'error';

export interface UrlSyncNotice {
  key: UrlSyncNoticeKey;
  severity: UrlSyncNoticeSeverity;
}

export interface UrlSyncNavigationResult {
  status: 'navigate';
  url: string;
  notice?: UrlSyncNotice;
}

export interface UrlSyncBlockedResult {
  status: 'blocked';
  reason: 'invalid-source-url' | 'invalid-target-url';
  notice: UrlSyncNotice;
}

export type UrlSyncResolutionResult = UrlSyncNavigationResult | UrlSyncBlockedResult;

export function isUrlSyncMode(value: unknown): value is UrlSyncMode {
  return value === 'follow-changed-tab' || value === 'keep-each-tabs-website';
}
