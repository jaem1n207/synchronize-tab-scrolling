export const DEFAULT_URL_SYNC_MODE = 'follow-changed-tab';

export type UrlSyncMode = 'follow-changed-tab' | 'keep-each-tabs-website';

export type UrlSyncNoticeKey =
  | 'urlSyncModeResetNotice'
  | 'urlSyncKeepWebsiteBlockedNotice'
  | 'urlSyncLanguagePreservationNotice'
  | 'urlSyncSettingSaveFailedNotice'
  | 'urlSyncSettingReadFailedNotice';

export type UrlSyncNoticeSeverity = 'info' | 'warning' | 'error';

export interface UrlSyncNotice {
  key: UrlSyncNoticeKey;
  severity: UrlSyncNoticeSeverity;
}

export interface UrlSyncPanelNoticeEventDetail {
  notice: UrlSyncNotice;
  mode?: UrlSyncMode;
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

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isUrlSyncNoticeSeverity(value: unknown): value is UrlSyncNoticeSeverity {
  return value === 'info' || value === 'warning' || value === 'error';
}

function isUrlSyncNoticeKey(value: unknown): value is UrlSyncNoticeKey {
  return (
    value === 'urlSyncModeResetNotice' ||
    value === 'urlSyncKeepWebsiteBlockedNotice' ||
    value === 'urlSyncLanguagePreservationNotice' ||
    value === 'urlSyncSettingSaveFailedNotice' ||
    value === 'urlSyncSettingReadFailedNotice'
  );
}

export function isUrlSyncNotice(value: unknown): value is UrlSyncNotice {
  if (!isObjectRecord(value)) {
    return false;
  }

  return isUrlSyncNoticeKey(value.key) && isUrlSyncNoticeSeverity(value.severity);
}

export function isUrlSyncPanelNoticeEventDetail(
  value: unknown,
): value is UrlSyncPanelNoticeEventDetail {
  if (!isObjectRecord(value) || !isUrlSyncNotice(value.notice)) {
    return false;
  }

  return value.mode === undefined || isUrlSyncMode(value.mode);
}
