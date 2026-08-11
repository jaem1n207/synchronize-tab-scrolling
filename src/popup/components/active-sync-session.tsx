import { Button } from '~/shared/components/ui/button';
import { t } from '~/shared/i18n';
import type {
  AvailableManualSyncTab,
  PopupActiveManualSyncSnapshot,
} from '~/shared/types/sync-session';

import type { QuickSyncShortcutState } from '../hooks';

import IconAlertTriangle from '~icons/lucide/alert-triangle';
import IconFileQuestion from '~icons/lucide/file-question';
import IconRefreshCw from '~icons/lucide/refresh-cw';
import IconSquare from '~icons/lucide/square';

interface ActiveSyncSessionProps {
  snapshot: PopupActiveManualSyncSnapshot;
  shortcut: QuickSyncShortcutState;
  isStopping: boolean;
  isReconnecting: boolean;
  warning?: 'cleanup-incomplete';
  onOpenShortcutSettings: () => Promise<unknown>;
  onReconnect: () => void | Promise<void>;
  onStop: () => void | Promise<void>;
}

function getLocationLabel(location: AvailableManualSyncTab['location']): string {
  switch (location) {
    case 'current-tab':
      return t('currentTabLocation');
    case 'current-window':
      return t('currentWindowLocation');
    case 'other-window':
      return t('otherWindowLocation');
  }
}

function getConnectionLabel(
  status: PopupActiveManualSyncSnapshot['tabs'][number]['connectionStatus'],
): string {
  switch (status) {
    case 'connected':
      return t('connected');
    case 'disconnected':
      return t('disconnected');
    case 'error':
      return t('error');
  }
}

function ActiveTabRow({ tab }: { tab: PopupActiveManualSyncSnapshot['tabs'][number] }) {
  const statusTone =
    tab.connectionStatus === 'connected'
      ? 'bg-emerald-700 dark:bg-emerald-400'
      : tab.connectionStatus === 'disconnected'
        ? 'bg-slate-500 dark:bg-slate-400'
        : 'bg-destructive';

  if (tab.availability === 'unavailable') {
    return (
      <li className="flex min-w-0 items-center gap-3 rounded-lg border bg-muted/20 px-3 py-2.5">
        <div
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
        >
          <IconFileQuestion className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{t('activeSyncTabUnavailable')}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span aria-hidden="true" className={`h-2 w-2 rounded-full ${statusTone}`} />
            {getConnectionLabel(tab.connectionStatus)}
          </p>
        </div>
      </li>
    );
  }

  return (
    <li className="flex min-w-0 items-center gap-3 rounded-lg border bg-background px-3 py-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
        {tab.favIconUrl === undefined ? (
          <span aria-hidden="true" className="text-xs font-semibold text-muted-foreground">
            ?
          </span>
        ) : (
          <img alt="" className="h-5 w-5 object-contain" src={tab.favIconUrl} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={tab.title}>
          {tab.title}
        </p>
        <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-full border bg-muted/40 px-2 py-0.5">
            {getLocationLabel(tab.location)}
          </span>
          <span className="flex min-w-0 items-center gap-1.5">
            <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${statusTone}`} />
            {getConnectionLabel(tab.connectionStatus)}
          </span>
        </div>
      </div>
    </li>
  );
}

function ShortcutGuidance({
  shortcut,
  onOpenShortcutSettings,
}: Pick<ActiveSyncSessionProps, 'shortcut' | 'onOpenShortcutSettings'>) {
  if (shortcut.status === 'assigned') {
    return (
      <p className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-sm text-foreground">
        {t('activeSyncAddInstruction', shortcut.label)}
      </p>
    );
  }

  const message =
    shortcut.status === 'unassigned'
      ? t('quickSyncShortcutUnassigned')
      : shortcut.status === 'unavailable'
        ? t('quickSyncShortcutUnavailable')
        : t('loading');

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-700/30 bg-amber-50 px-3 py-2.5 text-amber-950 dark:border-amber-400/40 dark:bg-amber-950/30 dark:text-amber-100">
      <p aria-atomic="true" aria-live="polite" className="flex min-w-0 items-start gap-2 text-sm">
        {shortcut.status === 'loading' ? null : (
          <IconAlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
        )}
        <span>{message}</span>
      </p>
      {shortcut.status === 'loading' ? null : (
        <Button
          className="h-8 shrink-0 px-2.5 text-xs"
          size="sm"
          type="button"
          variant="outline"
          onClick={() => {
            void onOpenShortcutSettings();
          }}
        >
          {t('reassignQuickSyncShortcut')}
        </Button>
      )}
    </div>
  );
}

export function ActiveSyncSession({
  snapshot,
  shortcut,
  isStopping,
  isReconnecting,
  warning,
  onOpenShortcutSettings,
  onReconnect,
  onStop,
}: ActiveSyncSessionProps) {
  const hasConnectionFailure = snapshot.tabs.some(
    (tab) => tab.connectionStatus === 'disconnected' || tab.connectionStatus === 'error',
  );
  const isMutating = isStopping || isReconnecting;

  return (
    <section
      aria-labelledby="active-sync-heading"
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden"
    >
      <header className="space-y-1">
        <h2 className="text-base font-semibold" id="active-sync-heading">
          {t('activeSyncHeading')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t('activeSyncSummary', String(snapshot.linkedTabIds.length))}
        </p>
      </header>

      <ShortcutGuidance shortcut={shortcut} onOpenShortcutSettings={onOpenShortcutSettings} />

      {warning === 'cleanup-incomplete' ? (
        <p
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-foreground"
          role="alert"
        >
          {t('syncCleanupIncomplete')}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <h3 className="sr-only" id="active-sync-tabs-heading">
          {t('activeSyncTabsHeading')}
        </h3>
        <ul aria-labelledby="active-sync-tabs-heading" className="space-y-2">
          {snapshot.tabs.map((tab) => (
            <ActiveTabRow key={tab.tabId} tab={tab} />
          ))}
        </ul>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">{t('activeSyncEditNotice')}</p>

      <div aria-label={t('syncControls')} className="flex shrink-0 justify-end gap-2" role="group">
        {hasConnectionFailure ? (
          <Button
            aria-busy={isReconnecting ? true : undefined}
            aria-label={isReconnecting ? t('reconnecting') : t('resyncDisconnectedTabs')}
            disabled={isMutating}
            size="sm"
            type="button"
            variant="outline"
            onClick={() => {
              void onReconnect();
            }}
          >
            <IconRefreshCw aria-hidden="true" className="h-4 w-4" />
            {isReconnecting ? t('reconnecting') : t('resyncDisconnectedTabs')}
          </Button>
        ) : null}
        <Button
          aria-busy={isStopping ? true : undefined}
          aria-label={isStopping ? t('stoppingSynchronization') : t('stopSynchronization')}
          disabled={isMutating}
          size="sm"
          type="button"
          variant="destructive"
          onClick={() => {
            void onStop();
          }}
        >
          <IconSquare aria-hidden="true" className="h-4 w-4" />
          {isStopping ? t('stoppingSynchronization') : t('stopSync')}
        </Button>
      </div>
    </section>
  );
}
