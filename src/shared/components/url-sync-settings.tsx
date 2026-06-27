import * as React from 'react';

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
  const radioGroupName = React.useId();
  const pendingEnabledRef = React.useRef(false);
  const pendingModeRef = React.useRef<UrlSyncMode | null>(null);
  const [, setPendingUpdateId] = React.useState(0);

  const rerenderPendingState = () => {
    setPendingUpdateId((value) => value + 1);
  };

  const handleEnabledChange = (checked: boolean) => {
    if (pendingEnabledRef.current || checked === enabled) {
      return;
    }

    pendingEnabledRef.current = true;
    rerenderPendingState();

    Promise.resolve()
      .then(() => onEnabledChange(checked))
      .catch(() => {})
      .finally(() => {
        pendingEnabledRef.current = false;
        rerenderPendingState();
      });
  };

  const handleModeChange = (nextMode: UrlSyncMode) => {
    if (
      !enabled ||
      nextMode === mode ||
      pendingEnabledRef.current ||
      pendingModeRef.current !== null
    ) {
      return;
    }

    pendingModeRef.current = nextMode;
    rerenderPendingState();

    Promise.resolve()
      .then(() => onModeChange(nextMode))
      .catch(() => {})
      .finally(() => {
        pendingModeRef.current = null;
        rerenderPendingState();
      });
  };

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
          disabled={pendingEnabledRef.current}
          onCheckedChange={handleEnabledChange}
        />
      </div>

      <fieldset aria-describedby={helperId} className="grid grid-cols-1 gap-1.5">
        <legend className="sr-only">{t('urlSyncNavigation')}</legend>
        {URL_SYNC_MODE_OPTIONS.map((option) => {
          const selected = option.mode === mode;
          const optionId = `${radioGroupName}-${option.mode}`;
          const enabledChangePending = pendingEnabledRef.current;
          const modeChangePending = pendingModeRef.current !== null;

          return (
            <div key={option.mode} className="relative">
              <input
                checked={selected}
                className="peer sr-only"
                disabled={!enabled || enabledChangePending || modeChangePending}
                id={optionId}
                name={radioGroupName}
                type="radio"
                value={option.mode}
                onChange={() => {
                  handleModeChange(option.mode);
                }}
              />
              <label
                className={cn(
                  'flex min-w-0 cursor-pointer flex-col gap-0.5 rounded-md px-3 py-2 text-left',
                  'border border-transparent whitespace-normal leading-snug transition-colors',
                  'peer-focus-visible:outline-none peer-focus-visible:ring-2',
                  'peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2',
                  'peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
                  selected && 'border-primary bg-primary/10 text-primary',
                  !selected && enabled && 'hover:bg-accent hover:text-accent-foreground',
                )}
                htmlFor={optionId}
              >
                <span className="text-sm font-medium">{t(option.labelKey)}</span>
                <span className="text-xs text-muted-foreground">{t(option.descriptionKey)}</span>
              </label>
            </div>
          );
        })}
      </fieldset>

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
