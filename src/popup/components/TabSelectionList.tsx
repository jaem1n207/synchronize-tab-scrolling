import { useCallback } from 'react';

import { Check } from 'lucide-react';

import { Button } from '~/shared/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/shared/components/ui/tooltip';
import { cn } from '~/shared/lib/utils';

import type { TabInfo } from '../types';

interface TabSelectionListProps {
  tabs: TabInfo[];
  selectedTabIds: number[];
  onToggleTab: (tabId: number) => void;
}

export function TabSelectionList({ tabs, selectedTabIds, onToggleTab }: TabSelectionListProps) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, tabId: number, eligible: boolean) => {
      if ((e.key === 'Enter' || e.key === ' ') && eligible) {
        e.preventDefault();
        onToggleTab(tabId);
      }
    },
    [onToggleTab],
  );

  return (
    <TooltipProvider delayDuration={300}>
      <div
        aria-label="Tab selection list"
        className="flex flex-col gap-2 max-h-[300px] overflow-y-auto p-1"
        role="group"
      >
        {tabs.map((tab) => {
          const isSelected = selectedTabIds.includes(tab.id);
          const TabWrapper = tab.eligible ? 'div' : Tooltip;
          const content = (
            <Button
              aria-checked={isSelected}
              aria-label={`${tab.title}${isSelected ? ' - selected' : ''}${!tab.eligible ? ` - ${tab.ineligibleReason}` : ''}`}
              className={cn(
                'w-full justify-start gap-3 h-auto py-2 px-3 transition-colors duration-200',
                !tab.eligible && 'opacity-50 cursor-not-allowed',
                isSelected && 'ring-2 ring-ring ring-offset-2',
              )}
              disabled={!tab.eligible}
              role="checkbox"
              variant={isSelected ? 'default' : 'outline'}
              onClick={() => tab.eligible && onToggleTab(tab.id)}
              onKeyDown={(e) => handleKeyDown(e, tab.id, tab.eligible)}
            >
              {tab.favIconUrl && (
                <img alt="" aria-hidden="true" className="w-4 h-4 shrink-0" src={tab.favIconUrl} />
              )}
              <span className="flex-1 text-left truncate text-sm">{tab.title}</span>
              {isSelected && <Check aria-hidden="true" className="w-4 h-4 shrink-0" />}
            </Button>
          );

          if (!tab.eligible && tab.ineligibleReason) {
            return (
              <TabWrapper key={tab.id}>
                <TooltipTrigger asChild>{content}</TooltipTrigger>
                <TooltipContent className="max-w-[250px]" side="right">
                  <p className="text-xs">{tab.ineligibleReason}</p>
                </TooltipContent>
              </TabWrapper>
            );
          }

          return <div key={tab.id}>{content}</div>;
        })}
      </div>
    </TooltipProvider>
  );
}
