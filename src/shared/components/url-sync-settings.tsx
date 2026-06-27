import * as React from 'react';

import { Button } from '~/shared/components/ui/button';
import { Switch } from '~/shared/components/ui/switch';
import { t } from '~/shared/i18n';
import { cn } from '~/shared/lib/utils';
import type { UrlSyncMode, UrlSyncNotice } from '~/shared/types/url-sync';

interface UrlSyncSettingsProps {
  enabled: boolean;
  mode: UrlSyncMode;
  notice?: UrlSyncNotice | null;
  compact?: boolean;
  onEnabledChange: (enabled: boolean) => void | Promise<void>;
  onModeChange: (mode: UrlSyncMode) => void | Promise<void>;
}

const URL_SYNC_MODE_OPTIONS: Array<{
  mode: UrlSyncMode;
  labelKey: 'urlSyncModeFollowChangedTab' | 'urlSyncModeKeepEachTabsWebsite';
  descriptionKey:
    | 'urlSyncModeFollowChangedTabDescription'
    | 'urlSyncModeKeepEachTabsWebsiteDescription';
}> = [
  {
    mode: 'follow-changed-tab',
    labelKey: 'urlSyncModeFollowChangedTab',
    descriptionKey: 'urlSyncModeFollowChangedTabDescription',
  },
  {
    mode: 'keep-each-tabs-website',
    labelKey: 'urlSyncModeKeepEachTabsWebsite',
    descriptionKey: 'urlSyncModeKeepEachTabsWebsiteDescription',
  },
];

function getNoticeClassName(notice: UrlSyncNotice) {
  if (notice.severity === 'error') {
    return 'border-red-200 bg-red-50 text-red-800';
  }

  if (notice.severity === 'warning') {
    return 'border-yellow-200 bg-yellow-50 text-yellow-800';
  }

  return 'border-blue-200 bg-blue-50 text-blue-800';
}

export function UrlSyncSettings({
  enabled,
  mode,
  notice,
  compact = false,
  onEnabledChange,
  onModeChange,
}: UrlSyncSettingsProps) {
  const headingId = React.useId();
  const descriptionId = React.useId();
  const helperId = React.useId();

  return (
    <section
      aria-labelledby={headingId}
      className={cn('space-y-2', compact ? 'text-sm' : 'rounded-lg border bg-card/60 p-3')}
      data-compact={compact ? 'true' : 'false'}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-medium" id={headingId}>
            {t('urlSyncNavigation')}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground" id={descriptionId}>
            {t('urlSyncModeDescription')}
          </p>
        </div>
        <Switch
          aria-label={t('urlSyncNavigation')}
          checked={enabled}
          onCheckedChange={(checked) => {
            void onEnabledChange(checked);
          }}
        />
      </div>

      <div
        aria-describedby={helperId}
        aria-disabled={!enabled}
        aria-label={t('urlSyncNavigation')}
        className="grid grid-cols-1 gap-1.5"
        role="radiogroup"
      >
        {URL_SYNC_MODE_OPTIONS.map((option) => {
          const selected = option.mode === mode;

          return (
            <Button
              key={option.mode}
              aria-checked={selected}
              className={cn(
                'h-auto justify-start rounded-md px-3 py-2 text-left',
                'whitespace-normal leading-snug',
                selected && 'border-primary bg-primary/10 text-primary',
              )}
              disabled={!enabled}
              role="radio"
              type="button"
              variant={selected ? 'outline' : 'ghost'}
              onClick={() => {
                if (option.mode !== mode) {
                  void onModeChange(option.mode);
                }
              }}
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-medium">{t(option.labelKey)}</span>
                <span className="text-xs text-muted-foreground">{t(option.descriptionKey)}</span>
              </span>
            </Button>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground" id={helperId}>
        {t('urlSyncModeLanguageHelper')}
      </p>

      {notice && (
        <p
          aria-live="polite"
          className={cn('rounded-md border px-2 py-1.5 text-xs', getNoticeClassName(notice))}
          role="status"
        >
          {t(notice.key)}
        </p>
      )}
    </section>
  );
}
