import { useCallback } from 'react';

import { Avatar, AvatarFallback, AvatarImage } from '~/shared/components/ui/avatar';
import { Button } from '~/shared/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/shared/components/ui/tooltip';
import { cn } from '~/shared/lib/utils';

import type { TabInfo } from '../types';

import IconCheck from '~icons/lucide/check';

interface TabSelectionListProps {
  tabs: Array<TabInfo>;
  selectedTabIds: Array<number>;
  onToggleTab: (tabId: number) => void;
}

/**
 * Extract distinguishing part of URL for similar URLs
 * e.g., 'https://example.com/docs#section' -> 'docs#section'
 */
function getUrlDistinguisher(url: string): string {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname.split('/').filter(Boolean).pop() || '';
    const hash = urlObj.hash;
    const search = urlObj.search;
    return [path, search, hash].filter(Boolean).join('');
  } catch {
    return url;
  }
}

/**
 * Check if tabs have similar URLs and need differentiation
 */
function getSimilarUrlGroups(tabs: Array<TabInfo>): Map<string, Array<TabInfo>> {
  const groups = new Map<string, Array<TabInfo>>();

  for (const tab of tabs) {
    if (!tab.url) continue;

    try {
      const urlObj = new URL(tab.url);
      const base = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;

      if (!groups.has(base)) {
        groups.set(base, []);
      }
      groups.get(base)!.push(tab);
    } catch {
      // Invalid URL, skip
    }
  }

  // Only return groups with more than one tab
  return new Map([...groups].filter(([, tabsInGroup]) => tabsInGroup.length > 1));
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

  // Find tabs with similar URLs that need differentiation
  const similarUrlGroups = getSimilarUrlGroups(tabs);
  const tabsNeedingDifferentiation = new Set<number>();
  for (const group of similarUrlGroups.values()) {
    for (const tab of group) {
      tabsNeedingDifferentiation.add(tab.id);
    }
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div
        aria-label="Tab selection list"
        className="flex flex-col gap-2 max-h-[300px] overflow-y-auto p-1"
        role="group"
      >
        {tabs.map((tab) => {
          const isSelected = selectedTabIds.includes(tab.id);
          const needsDifferentiation = tabsNeedingDifferentiation.has(tab.id);
          const urlDistinguisher =
            needsDifferentiation && tab.url ? getUrlDistinguisher(tab.url) : null;
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
              <Avatar className="w-4 h-4 shrink-0">
                <AvatarImage alt="" src={tab.favIconUrl} />
                <AvatarFallback className="bg-muted text-[8px] text-muted-foreground">
                  ?
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 flex flex-col items-start gap-0.5 min-w-0">
                <span className="text-left truncate text-sm w-full">{tab.title}</span>
                {urlDistinguisher && (
                  <span className="text-[10px] text-muted-foreground truncate w-full font-mono">
                    {urlDistinguisher}
                  </span>
                )}
              </div>
              {isSelected && <IconCheck aria-hidden="true" className="w-4 h-4 shrink-0" />}
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
