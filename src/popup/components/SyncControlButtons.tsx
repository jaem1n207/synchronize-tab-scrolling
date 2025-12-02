import { useCallback } from 'react';

import { Play, Square, RefreshCw } from 'lucide-react';

import { Button } from '~/shared/components/ui/button';
import { Kbd } from '~/shared/components/ui/kbd';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/shared/components/ui/tooltip';

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
      <div aria-label="Sync controls" className="flex items-center gap-2" role="group">
        {!isActive ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={
                  canStart
                    ? 'Start synchronization'
                    : `Select at least 2 tabs to start (${selectedCount} selected)`
                }
                className="gap-2"
                disabled={!canStart}
                size="sm"
                onClick={onStart}
                onKeyDown={(e) => handleKeyDown(e, onStart, !canStart)}
              >
                <Play aria-hidden="true" className="w-4 h-4" />
                Start Sync
                <div className="flex items-center gap-0.5 text-xs text-muted-foreground">
                  <Kbd>⌘</Kbd>
                  <Kbd>S</Kbd>
                </div>
              </Button>
            </TooltipTrigger>
            {!canStart && (
              <TooltipContent>
                <p className="text-xs">Select at least 2 tabs to start</p>
              </TooltipContent>
            )}
          </Tooltip>
        ) : (
          <Button
            aria-label="Stop synchronization"
            className="gap-2"
            size="sm"
            variant="destructive"
            onClick={onStop}
            onKeyDown={(e) => handleKeyDown(e, onStop, false)}
          >
            <Square aria-hidden="true" className="w-4 h-4" />
            Stop Sync
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
                aria-label="Re-sync disconnected tabs"
                size="sm"
                variant="outline"
                onClick={onResync}
                onKeyDown={(e) => handleKeyDown(e, onResync, false)}
              >
                <RefreshCw aria-hidden="true" className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">Re-sync disconnected tabs</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}
