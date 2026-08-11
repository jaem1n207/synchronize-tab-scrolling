import { useState } from 'react';

import { sendMessage } from 'webext-bridge/popup';

import { Button } from '~/shared/components/ui/button';
import { t } from '~/shared/i18n';
import type { RecentQuickSyncOutcome } from '~/shared/types/quick-sync';

import IconAlertTriangle from '~icons/lucide/alert-triangle';
import IconX from '~icons/lucide/x';

interface QuickSyncRecentOutcomeProps {
  outcome?: RecentQuickSyncOutcome;
  onAuthoritativeRefetch: () => Promise<void>;
}

function getOutcomeCopy(outcome: RecentQuickSyncOutcome): {
  title: string;
  supportingText?: string;
} {
  switch (outcome.resultKind) {
    case 'unsupported':
      return { title: t('quickSyncUnsupportedTab') };
    case 'candidate-failed':
    case 'start-failed':
      return { title: t('quickSyncSecondTabFailedTitle') };
    case 'add-failed':
      return {
        title: t('quickSyncAddFailedTitle'),
        supportingText:
          outcome.tabCount === undefined
            ? undefined
            : t('quickSyncExistingTabsContinue', String(outcome.tabCount)),
      };
    case 'session-state-unavailable':
      return { title: t('manualSyncStateUnavailable') };
  }
}

export function QuickSyncRecentOutcome({
  outcome,
  onAuthoritativeRefetch,
}: QuickSyncRecentOutcomeProps) {
  const [dismissedIdentity, setDismissedIdentity] = useState<{
    tabId: number;
    expiresAt: number;
  }>();
  const [isDismissing, setIsDismissing] = useState(false);

  if (
    outcome === undefined ||
    outcome.expiresAt <= Date.now() ||
    (dismissedIdentity?.tabId === outcome.tabId &&
      dismissedIdentity.expiresAt === outcome.expiresAt)
  ) {
    return null;
  }

  const copy = getOutcomeCopy(outcome);

  const handleDismiss = async (): Promise<void> => {
    if (isDismissing) {
      return;
    }

    setIsDismissing(true);
    try {
      const result = await sendMessage(
        'quick-sync:dismiss-recent-outcome',
        { tabId: outcome.tabId, expiresAt: outcome.expiresAt },
        'background',
      );
      if (result.status === 'dismissed') {
        setDismissedIdentity({
          tabId: outcome.tabId,
          expiresAt: outcome.expiresAt,
        });
        return;
      }

      await onAuthoritativeRefetch();
    } catch {
      // Keep the authoritative notice visible when dismissal cannot be confirmed.
    } finally {
      setIsDismissing(false);
    }
  };

  return (
    <aside
      className="flex items-start gap-2 rounded-lg border border-amber-700/30 bg-amber-50 px-3 py-2.5 text-amber-950 dark:border-amber-400/40 dark:bg-amber-950/30 dark:text-amber-100"
      role="alert"
    >
      <IconAlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{copy.title}</p>
        {copy.supportingText === undefined ? null : (
          <p className="mt-0.5 text-xs">{copy.supportingText}</p>
        )}
      </div>
      <Button
        aria-label={t('dismiss')}
        className="h-7 w-7 shrink-0 text-current hover:bg-amber-950/10 dark:hover:bg-amber-50/10"
        disabled={isDismissing}
        size="icon"
        type="button"
        variant="ghost"
        onClick={() => {
          void handleDismiss();
        }}
      >
        <IconX aria-hidden="true" className="h-4 w-4" />
      </Button>
    </aside>
  );
}
