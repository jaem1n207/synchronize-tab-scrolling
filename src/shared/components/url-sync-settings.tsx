import * as React from 'react';

import { Switch } from '~/shared/components/ui/switch';
import { t } from '~/shared/i18n';
import { cn } from '~/shared/lib/utils';
import type { UrlSyncMode, UrlSyncNotice } from '~/shared/types/url-sync';

import IconCheck from '~icons/lucide/check';
import IconChevronDown from '~icons/lucide/chevron-down';

type UrlSyncSettingsVariant = 'card' | 'inline-collapsible' | 'panel-compact';

interface UrlSyncSettingsProps {
  enabled: boolean;
  mode: UrlSyncMode;
  notice?: UrlSyncNotice | null;
  compact?: boolean;
  variant?: UrlSyncSettingsVariant;
  onEnabledChange: (enabled: boolean) => void | Promise<void>;
  onModeChange: (mode: UrlSyncMode) => boolean | void | Promise<boolean | void>;
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
  variant,
  onEnabledChange,
  onModeChange,
}: UrlSyncSettingsProps) {
  const headingId = React.useId();
  const descriptionId = React.useId();
  const radioGroupName = React.useId();
  const inlineEditorId = React.useId();
  const summaryId = React.useId();
  const resolvedVariant: UrlSyncSettingsVariant = variant ?? (compact ? 'panel-compact' : 'card');
  const selectedOption =
    URL_SYNC_MODE_OPTIONS.find((option) => option.mode === mode) ?? URL_SYNC_MODE_OPTIONS[0];
  const isInlineCollapsible = resolvedVariant === 'inline-collapsible';
  const [inlineEditorExpanded, setInlineEditorExpanded] = React.useState(false);
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
      .then((saved) => {
        if (isInlineCollapsible && saved !== false) {
          setInlineEditorExpanded(false);
        }
      })
      .catch(() => {})
      .finally(() => {
        pendingModeRef.current = null;
        rerenderPendingState();
      });
  };

  const renderModeOption = (
    option: (typeof URL_SYNC_MODE_OPTIONS)[number],
    layout: 'card' | 'inline',
  ) => {
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
            'flex min-w-0 cursor-pointer text-left transition-colors',
            'border border-transparent whitespace-normal leading-snug',
            'peer-focus-visible:outline-none peer-focus-visible:ring-2',
            'peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2',
            'peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
            layout === 'card' && 'flex-col gap-0.5 rounded-md px-3 py-2',
            layout === 'inline' && 'items-start gap-2 rounded-md px-2.5 py-2',
            selected && 'border-primary bg-primary/10 text-primary',
            !selected && enabled && 'hover:bg-accent hover:text-accent-foreground',
          )}
          htmlFor={optionId}
        >
          {layout === 'inline' && (
            <span
              aria-hidden="true"
              className={cn(
                'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                selected ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
              )}
            >
              {selected && <IconCheck className="h-3 w-3" />}
            </span>
          )}
          <span className="min-w-0">
            <span className="block text-sm font-medium">{t(option.labelKey)}</span>
            <span className="block text-xs text-muted-foreground">{t(option.descriptionKey)}</span>
          </span>
        </label>
      </div>
    );
  };

  if (isInlineCollapsible) {
    return (
      <section
        aria-labelledby={headingId}
        className="space-y-2 text-sm"
        data-variant="inline-collapsible"
      >
        <div className="flex min-w-0 items-center gap-2">
          <button
            aria-controls={inlineEditorId}
            aria-describedby={summaryId}
            aria-expanded={inlineEditorExpanded}
            aria-label={t(
              inlineEditorExpanded ? 'urlSyncCollapseSettings' : 'urlSyncExpandSettings',
            )}
            className={cn(
              'flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left',
              'transition-colors hover:bg-accent hover:text-accent-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'focus-visible:ring-offset-2',
            )}
            type="button"
            onClick={() => {
              setInlineEditorExpanded((value) => !value);
            }}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium" id={headingId}>
                {t('urlSyncNavigation')}
              </span>
              <span
                className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground"
                id={summaryId}
              >
                <span>{t(enabled ? 'urlSyncStateOn' : 'urlSyncStateOff')}</span>
                <span aria-hidden="true">·</span>
                <span className="min-w-0 truncate">{t(selectedOption.labelKey)}</span>
              </span>
            </span>
            <IconChevronDown
              aria-hidden="true"
              className={cn(
                'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                inlineEditorExpanded && 'rotate-180',
              )}
            />
          </button>
          <Switch
            aria-label={t('urlSyncNavigation')}
            checked={enabled}
            disabled={pendingEnabledRef.current}
            onCheckedChange={handleEnabledChange}
          />
        </div>

        {inlineEditorExpanded && (
          <fieldset className="grid grid-cols-1 gap-1" id={inlineEditorId}>
            <legend className="sr-only">{t('urlSyncNavigation')}</legend>
            {URL_SYNC_MODE_OPTIONS.map((option) => renderModeOption(option, 'inline'))}
          </fieldset>
        )}

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

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        'space-y-2',
        resolvedVariant === 'panel-compact' ? 'text-sm' : 'rounded-lg border bg-card/60 p-3',
      )}
      data-variant={resolvedVariant}
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

      <fieldset className="grid grid-cols-1 gap-1.5">
        <legend className="sr-only">{t('urlSyncNavigation')}</legend>
        {URL_SYNC_MODE_OPTIONS.map((option) => renderModeOption(option, 'card'))}
      </fieldset>

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
