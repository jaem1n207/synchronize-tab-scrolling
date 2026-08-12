import { useRef } from 'react';

import { Button } from '~/shared/components/ui/button';
import { t } from '~/shared/i18n';

import type { QuickSyncShortcutState, ShortcutSettingsResult } from '../hooks';

interface QuickSyncShortcutStatusProps {
  assignment: QuickSyncShortcutState;
  settingsResult: ShortcutSettingsResult;
  onOpenSettings: () => Promise<ShortcutSettingsResult>;
}

function ShortcutFallback({ result }: { result: ShortcutSettingsResult }) {
  if (result.status !== 'fallback') {
    return null;
  }

  const message =
    result.browser === 'firefox'
      ? t('quickSyncShortcutSettingsFallbackFirefox')
      : result.settingsUrl === undefined
        ? t('quickSyncShortcutUnavailable')
        : t('quickSyncShortcutSettingsFallbackChromium', result.settingsUrl);

  return (
    <p
      aria-atomic="true"
      className="rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-2 text-xs text-foreground"
      role="alert"
    >
      <span aria-hidden="true" className="mr-1.5 font-semibold text-destructive">
        !
      </span>
      {message}
    </p>
  );
}

export function QuickSyncShortcutStatus({
  assignment,
  settingsResult,
  onOpenSettings,
}: QuickSyncShortcutStatusProps) {
  const remapButtonRef = useRef<HTMLButtonElement>(null);
  const opening = settingsResult.status === 'opening';
  const assignmentMessage =
    assignment.status === 'unassigned'
      ? t('quickSyncShortcutUnassigned')
      : t('quickSyncShortcutUnavailable');

  const handleOpenSettings = async (): Promise<void> => {
    const result = await onOpenSettings();
    if (result.status === 'fallback') {
      remapButtonRef.current?.focus();
    }
  };

  if (assignment.status === 'loading') {
    return null;
  }

  if (assignment.status === 'assigned') {
    return <ShortcutFallback result={settingsResult} />;
  }

  return (
    <section
      aria-labelledby="quick-sync-shortcut-heading"
      className="space-y-2.5 rounded-lg border bg-muted/30 p-3"
    >
      <h2
        className="text-xs font-semibold tracking-wide text-muted-foreground"
        id="quick-sync-shortcut-heading"
      >
        {t('quickSyncShortcutHeading')}
      </h2>

      <p
        aria-atomic="true"
        aria-live="polite"
        className="flex items-start gap-1.5 text-sm text-foreground"
        role="status"
      >
        <span aria-hidden="true" className="font-semibold text-amber-700 dark:text-amber-400">
          !
        </span>
        <span>{assignmentMessage}</span>
      </p>

      {opening ? <p className="text-xs text-muted-foreground">{t('loading')}</p> : null}

      <Button
        ref={remapButtonRef}
        aria-busy={opening}
        className="h-8 px-2.5 text-xs"
        disabled={opening}
        size="sm"
        type="button"
        variant="outline"
        onClick={handleOpenSettings}
      >
        {t('reassignQuickSyncShortcut')}
      </Button>

      <ShortcutFallback result={settingsResult} />
    </section>
  );
}
