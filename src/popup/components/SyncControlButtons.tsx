import { useCallback } from 'react';

import { Button } from '~/shared/components/ui/button';
import { Kbd } from '~/shared/components/ui/kbd';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/shared/components/ui/tooltip';
import { t } from '~/shared/i18n';

import IconPlay from '~icons/lucide/play';
import IconRefreshCw from '~icons/lucide/refresh-cw';
import IconSquare from '~icons/lucide/square';

interface SyncControlButtonsProps {
  isActive: boolean;
  selectedCount: number;
  hasConnectionError: boolean;
  onStart: () => void;
  onStop: () => void;
  onResync: () => void;
}

export function SyncControlButtons({
  isActive,
  selectedCount,
  hasConnectionError,
  onStart,
  onStop,
  onResync,
}: SyncControlButtonsProps) {
  const canStart = selectedCount >= 2;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, action: () => void, disabled: boolean) => {
      if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
        e.preventDefault();
        action();
      }
    },
    [],
  );

  return (
    <TooltipProvider delayDuration={300}>
      <div aria-label={t('syncControls')} className="flex items-center gap-2" role="group">
        {!isActive ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={
                  canStart
                    ? t('startSynchronization')
                    : t('selectAtLeastTwoTabsCount', [String(selectedCount)])
                }
                className="gap-2"
                disabled={!canStart}
                size="sm"
                onClick={onStart}
                onKeyDown={(e) => handleKeyDown(e, onStart, !canStart)}
              >
                <IconPlay aria-hidden="true" className="w-4 h-4" />
                {t('startSync')}
                <div className="flex items-center gap-0.5 text-xs text-muted-foreground">
                  <Kbd>⌘</Kbd>
                  <Kbd>S</Kbd>
                </div>
              </Button>
            </TooltipTrigger>
            {!canStart && (
              <TooltipContent>
                <p className="text-xs">{t('selectAtLeastTwoTabs')}</p>
              </TooltipContent>
            )}
          </Tooltip>
        ) : (
          <Button
            aria-label={t('stopSynchronization')}
            className="gap-2"
            size="sm"
            variant="destructive"
            onClick={onStop}
            onKeyDown={(e) => handleKeyDown(e, onStop, false)}
          >
            <IconSquare aria-hidden="true" className="w-4 h-4" />
            {t('stopSync')}
            <div className="flex items-center gap-0.5 text-xs text-muted-foreground">
              <Kbd>⌘</Kbd>
              <Kbd>S</Kbd>
            </div>
          </Button>
        )}

        {hasConnectionError && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={t('resyncDisconnectedTabs')}
                size="sm"
                variant="outline"
                onClick={onResync}
                onKeyDown={(e) => handleKeyDown(e, onResync, false)}
              >
                <IconRefreshCw aria-hidden="true" className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">{t('resyncDisconnectedTabs')}</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}
