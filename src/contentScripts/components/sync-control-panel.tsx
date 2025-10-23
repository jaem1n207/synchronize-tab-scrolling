import * as React from 'react';

import { Card, CardContent } from '~/shared/components/ui/card';
import { Label } from '~/shared/components/ui/label';
import { Switch } from '~/shared/components/ui/switch';
import { cn } from '~/shared/lib/utils';

interface SyncControlPanelProps {
  urlSyncEnabled: boolean;
  onToggle: () => void;
  className?: string;
}

export const SyncControlPanel = React.forwardRef<HTMLDivElement, SyncControlPanelProps>(
  ({ urlSyncEnabled, onToggle, className }, ref) => {
    const switchId = React.useId();

    return (
      <div
        ref={ref}
        className={cn(
          'fixed top-4 right-4 z-[2147483647]',
          'animate-in fade-in slide-in-from-top-2 duration-300',
          className,
        )}
      >
        <Card className="w-80 backdrop-blur-lg bg-background/95 shadow-lg border-border/50">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-1">
                <Label
                  className="text-sm font-medium leading-none cursor-pointer"
                  htmlFor={switchId}
                >
                  Sync URL Navigation
                </Label>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Preserves query parameters and hash fragments
                </p>
              </div>
              <Switch
                aria-describedby={`${switchId}-description`}
                aria-label="Toggle URL navigation synchronization"
                checked={urlSyncEnabled}
                className="mt-0.5"
                id={switchId}
                onCheckedChange={onToggle}
              />
            </div>
            <span className="sr-only" id={`${switchId}-description`}>
              When enabled, URL query parameters and hash fragments will be synchronized across tabs
            </span>
          </CardContent>
        </Card>
      </div>
    );
  },
);

SyncControlPanel.displayName = 'SyncControlPanel';
