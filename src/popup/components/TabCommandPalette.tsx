import { useState, useCallback, useMemo } from 'react';

import { AlertCircle, Check } from 'lucide-react';

import { Badge } from '~/shared/components/ui/badge';
import { Checkbox } from '~/shared/components/ui/checkbox';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '~/shared/components/ui/command';
import { ScrollArea } from '~/shared/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/shared/components/ui/tooltip';
import { matchesKoreanSearch } from '~/shared/lib/korean-search';
import { cn } from '~/shared/lib/utils';

import { SelectedTabsChips } from './SelectedTabsChips';

import type { TabInfo } from '../types';

interface TabCommandPaletteProps {
  tabs: Array<TabInfo>;
  selectedTabIds: Array<number>;
  currentTabId?: number;
  onToggleTab: (tabId: number) => void;
}

export function TabCommandPalette({
  tabs,
  selectedTabIds,
  currentTabId,
  onToggleTab,
}: TabCommandPaletteProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // Callback ref for auto-focus on search input (avoiding useEffect)
  const searchInputRef = useCallback((node: HTMLInputElement | null) => {
    if (node) {
      node.focus();
    }
  }, []);

  const handleToggle = useCallback(
    (tabId: number, eligible: boolean) => {
      if (eligible) {
        onToggleTab(tabId);
      }
    },
    [onToggleTab],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, tabId: number, eligible: boolean) => {
      if (e.key === ' ') {
        e.preventDefault();
        handleToggle(tabId, eligible);
      }
    },
    [handleToggle],
  );

  // Separate eligible and ineligible tabs without sorting
  const { eligibleTabs, ineligibleTabs } = useMemo(() => {
    return tabs.reduce(
      (acc, tab) => {
        if (tab.eligible) {
          acc.eligibleTabs.push(tab);
        } else {
          acc.ineligibleTabs.push(tab);
        }
        return acc;
      },
      { eligibleTabs: [] as Array<TabInfo>, ineligibleTabs: [] as Array<TabInfo> },
    );
  }, [tabs]);

  // Count selected tabs
  const selectedCount = selectedTabIds.length;

  // Get selected tabs info
  const selectedTabsInfo = tabs.filter((tab) => selectedTabIds.includes(tab.id));

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col gap-2">
        <div
          aria-live="polite"
          aria-relevant="text"
          className="flex items-center justify-between px-1"
        >
          <h2 className="text-sm font-medium" id="tab-selection-heading">
            Select Tabs to Sync
          </h2>
          {selectedCount > 0 && (
            <Badge aria-label={`${selectedCount} tabs selected`} className="ml-2" variant="default">
              {selectedCount} selected
            </Badge>
          )}
        </div>

        <SelectedTabsChips tabs={selectedTabsInfo} onRemoveTab={onToggleTab} />

        <Command
          aria-labelledby="tab-selection-heading"
          className="rounded-lg border shadow-sm"
          shouldFilter={false}
        >
          <CommandInput
            ref={searchInputRef}
            aria-label="Search tabs"
            placeholder="Search tabs by title or URL..."
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandList asChild>
            <ScrollArea className="max-h-[300px]">
              <CommandEmpty>
                <div className="py-6 text-center text-sm text-muted-foreground">
                  <p>No tabs found matching &quot;{searchQuery}&quot;</p>
                </div>
              </CommandEmpty>

              {eligibleTabs.length > 0 && (
                <CommandGroup heading="Available Tabs">
                  {eligibleTabs
                    .filter(
                      (tab) =>
                        !searchQuery ||
                        matchesKoreanSearch(tab.title, searchQuery) ||
                        matchesKoreanSearch(tab.url, searchQuery),
                    )
                    .map((tab) => {
                      const isSelected = selectedTabIds.includes(tab.id);
                      const isCurrentTab = currentTabId === tab.id;

                      return (
                        <CommandItem
                          key={tab.id}
                          aria-selected={isSelected}
                          className={cn(
                            'flex items-center gap-3 py-3 px-3 cursor-pointer',
                            isSelected && 'bg-accent',
                          )}
                          role="option"
                          value={`${tab.title}-${tab.url}-${tab.id}`}
                          onKeyDown={(e) => handleKeyDown(e, tab.id, tab.eligible)}
                          onSelect={() => handleToggle(tab.id, tab.eligible)}
                        >
                          <Checkbox
                            aria-label={`Select ${tab.title}`}
                            checked={isSelected}
                            className="shrink-0"
                            onCheckedChange={() => handleToggle(tab.id, tab.eligible)}
                          />

                          {tab.favIconUrl && (
                            <img
                              alt=""
                              aria-hidden="true"
                              className="w-4 h-4 shrink-0"
                              src={tab.favIconUrl}
                            />
                          )}

                          <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium truncate">{tab.title}</span>
                              {isCurrentTab && (
                                <Badge
                                  aria-label="Current tab"
                                  className="shrink-0 text-xs"
                                  variant="outline"
                                >
                                  Current
                                </Badge>
                              )}
                            </div>
                            <span
                              className="text-xs text-muted-foreground truncate"
                              title={tab.url}
                            >
                              {tab.url}
                            </span>
                          </div>

                          {isSelected && (
                            <Check aria-hidden="true" className="w-4 h-4 shrink-0 text-primary" />
                          )}
                        </CommandItem>
                      );
                    })}
                </CommandGroup>
              )}

              {ineligibleTabs.length > 0 && (
                <CommandGroup heading="Unavailable Tabs">
                  {ineligibleTabs
                    .filter(
                      (tab) =>
                        !searchQuery ||
                        matchesKoreanSearch(tab.title, searchQuery) ||
                        matchesKoreanSearch(tab.url, searchQuery),
                    )
                    .map((tab) => {
                      const isCurrentTab = currentTabId === tab.id;

                      return (
                        <Tooltip key={tab.id}>
                          <TooltipTrigger asChild>
                            <CommandItem
                              disabled
                              aria-disabled="true"
                              aria-label={`${tab.title} - ${tab.ineligibleReason}`}
                              className="flex items-center gap-3 py-3 px-3 opacity-50 cursor-not-allowed"
                              role="option"
                              value={`${tab.title}-${tab.url}-${tab.id}`}
                            >
                              <Checkbox
                                disabled
                                aria-label={`Cannot select ${tab.title}`}
                                checked={false}
                                className="shrink-0"
                              />

                              {tab.favIconUrl && (
                                <img
                                  alt=""
                                  aria-hidden="true"
                                  className="w-4 h-4 shrink-0"
                                  src={tab.favIconUrl}
                                />
                              )}

                              <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium truncate">{tab.title}</span>
                                  {isCurrentTab && (
                                    <Badge
                                      aria-label="Current tab"
                                      className="shrink-0 text-xs"
                                      variant="outline"
                                    >
                                      Current
                                    </Badge>
                                  )}
                                </div>
                                <span
                                  className="text-xs text-muted-foreground truncate"
                                  title={tab.url}
                                >
                                  {tab.url}
                                </span>
                              </div>

                              <AlertCircle
                                aria-hidden="true"
                                className="w-4 h-4 shrink-0 text-destructive"
                              />
                            </CommandItem>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-[280px]" side="right">
                            <div className="flex items-start gap-2">
                              <AlertCircle className="w-4 h-4 shrink-0 text-destructive mt-0.5" />
                              <div>
                                <p className="font-medium text-xs mb-1">Cannot Sync</p>
                                <p className="text-xs text-muted-foreground">
                                  {tab.ineligibleReason}
                                </p>
                              </div>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                </CommandGroup>
              )}
            </ScrollArea>
          </CommandList>
        </Command>
      </div>
    </TooltipProvider>
  );
}
