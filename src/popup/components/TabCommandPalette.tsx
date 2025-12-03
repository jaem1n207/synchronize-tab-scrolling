import { useState, useCallback, useMemo, useRef, useImperativeHandle } from 'react';

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
import { t } from '~/shared/i18n';
import { matchesKoreanSearch } from '~/shared/lib/korean-search';
import { sortTabsWithDomainGrouping } from '~/shared/lib/tab-similarity';
import { cn } from '~/shared/lib/utils';

import { SelectedTabsChips } from './SelectedTabsChips';

import type { TabInfo } from '../types';

export interface TabCommandPaletteHandle {
  focus: () => void;
}

export interface TabCommandPaletteProps {
  ref?: React.Ref<TabCommandPaletteHandle>;
  tabs: Array<TabInfo>;
  selectedTabIds: Array<number>;
  currentTabId?: number;
  isSyncActive: boolean;
  onToggleTab: (tabId: number) => void;
}

export function TabCommandPalette({
  ref,
  tabs,
  selectedTabIds,
  currentTabId,
  isSyncActive,
  onToggleTab,
}: TabCommandPaletteProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Expose focus method to parent
  useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        inputRef.current?.focus();
      },
    }),
    [],
  );

  const handleToggle = useCallback(
    (tabId: number, eligible: boolean) => {
      if (eligible && !isSyncActive) {
        onToggleTab(tabId);
      }
    },
    [onToggleTab, isSyncActive],
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

  // Separate eligible and ineligible tabs, then sort with domain-based grouping
  const { eligibleTabs, ineligibleTabs } = useMemo(() => {
    const separated = tabs.reduce(
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

    // Sort both lists with domain grouping (current tab first, then grouped by domain)
    return {
      eligibleTabs: sortTabsWithDomainGrouping(separated.eligibleTabs, currentTabId),
      ineligibleTabs: sortTabsWithDomainGrouping(separated.ineligibleTabs, currentTabId),
    };
  }, [tabs, currentTabId]);

  // Count selected tabs
  const selectedCount = selectedTabIds.length;

  // Get selected tabs info
  const selectedTabsInfo = tabs.filter((tab) => selectedTabIds.includes(tab.id));

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col gap-2">
        {!isSyncActive && (
          <div
            aria-live="polite"
            aria-relevant="text"
            className="flex items-center justify-between px-1"
          >
            <h2 className="text-sm font-medium" id="tab-selection-heading">
              {t('tabSelectionHeading')}
            </h2>
            {selectedCount > 0 && (
              <Badge
                aria-label={t('tabsSelectedLabel', [String(selectedCount)])}
                className="ml-2"
                variant="default"
              >
                {t('selectedCount', [String(selectedCount)])}
              </Badge>
            )}
          </div>
        )}

        <SelectedTabsChips
          isSyncActive={isSyncActive}
          tabs={selectedTabsInfo}
          onRemoveTab={onToggleTab}
        />

        <Command
          aria-labelledby="tab-selection-heading"
          className="rounded-lg border shadow-sm"
          shouldFilter={false}
        >
          <CommandInput
            ref={inputRef}
            aria-label={t('searchTabsLabel')}
            placeholder={t('searchTabsPlaceholder')}
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandList asChild>
            <ScrollArea className="max-h-[300px]">
              <CommandEmpty>
                <div className="py-6 text-center text-sm text-muted-foreground">
                  <p>{t('noTabsMatchingSearch', [searchQuery])}</p>
                </div>
              </CommandEmpty>

              {eligibleTabs.length > 0 && (
                <CommandGroup heading={t('availableTabs')}>
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
                          aria-disabled={isSyncActive}
                          aria-label={
                            isSyncActive
                              ? t('cannotChangeSelectionDuringSync', [tab.title])
                              : undefined
                          }
                          aria-selected={isSelected}
                          className={cn(
                            'flex items-center gap-3 py-3 px-3',
                            isSyncActive ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
                            isSelected && 'bg-accent',
                          )}
                          disabled={isSyncActive}
                          role="option"
                          value={`${tab.title}-${tab.url}-${tab.id}`}
                          onKeyDown={(e) => handleKeyDown(e, tab.id, tab.eligible)}
                          onSelect={() => handleToggle(tab.id, tab.eligible)}
                        >
                          <Checkbox
                            aria-label={t('selectTab', [tab.title])}
                            checked={isSelected}
                            className="shrink-0"
                            disabled={isSyncActive}
                            onCheckedChange={() => handleToggle(tab.id, tab.eligible)}
                            onClick={(e) => e.stopPropagation()}
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
                                  aria-label={t('currentTabLabel')}
                                  className="shrink-0 text-xs"
                                  variant="outline"
                                >
                                  {t('currentTab')}
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
                <CommandGroup heading={t('unavailableTabs')}>
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
                                aria-label={t('cannotSelectTab', [tab.title])}
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
                                      aria-label={t('currentTabLabel')}
                                      className="shrink-0 text-xs"
                                      variant="outline"
                                    >
                                      {t('currentTab')}
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
                                <p className="font-medium text-xs mb-1">{t('cannotSync')}</p>
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

TabCommandPalette.displayName = 'TabCommandPalette';
