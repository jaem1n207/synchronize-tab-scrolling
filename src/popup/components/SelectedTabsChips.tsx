import { X } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '~/shared/components/ui/avatar';
import { Badge } from '~/shared/components/ui/badge';
import { Button } from '~/shared/components/ui/button';

import type { TabInfo } from '../types';

interface SelectedTabsChipsProps {
  tabs: Array<TabInfo>;
  isSyncActive: boolean;
  onRemoveTab: (tabId: number) => void;
}

export function SelectedTabsChips({ tabs, isSyncActive, onRemoveTab }: SelectedTabsChipsProps) {
  return (
    <div className="h-[64px] overflow-y-auto border rounded-lg p-2 bg-muted/30">
      {tabs.length === 0 ? (
        <div className="flex items-center justify-center h-full">
          <p className="text-xs text-muted-foreground">Select 2 or more tabs to start syncing</p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <Badge
              key={tab.id}
              className="flex items-center gap-1.5 pr-1 py-1 max-w-[200px]"
              variant="secondary"
            >
              <Avatar className="w-4 h-4 shrink-0">
                <AvatarImage alt="" src={tab.favIconUrl} />
                <AvatarFallback className="bg-muted text-[8px] text-muted-foreground">
                  ?
                </AvatarFallback>
              </Avatar>
              <span className="text-xs truncate flex-1">{tab.title}</span>
              <Button
                aria-label={
                  isSyncActive ? `Cannot remove ${tab.title} during sync` : `Remove ${tab.title}`
                }
                className="h-4 w-4 p-0 hover:bg-muted rounded-sm shrink-0"
                disabled={isSyncActive}
                size="icon"
                variant="ghost"
                onClick={(e) => {
                  if (!isSyncActive) {
                    e.stopPropagation();
                    onRemoveTab(tab.id);
                  }
                }}
              >
                <X aria-hidden="true" className="h-3 w-3" />
              </Button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
