import { useState, useCallback, useMemo, useRef, useImperativeHandle } from 'react';

import { Badge } from '~/shared/components/ui/badge';
import { Button } from '~/shared/components/ui/button';
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

import type { TabInfo } from '../types';

import IconAlertCircle from '~icons/lucide/alert-circle';
import IconCheck from '~icons/lucide/check';
import IconFilter from '~icons/lucide/filter';

export interface TabCommandPaletteHandle {
  focus: () => void;
}

export interface TabCommandPaletteProps {
  ref?: React.Ref<TabCommandPaletteHandle>;
  tabs: Array<TabInfo>;
  allTabs?: Array<TabInfo>;
  selectedTabIds: Array<number>;
  currentTabId?: number;
  isSyncActive: boolean;
  onToggleTab: (tabId: number) => void;
  totalTabCount?: number;
  sameDomainFilter?: boolean;
  onClearFilter?: () => void;
}

export function TabCommandPalette({
  ref,
  tabs,
  allTabs,
  selectedTabIds,
  currentTabId,
  isSyncActive,
  onToggleTab,
  totalTabCount,
  sameDomainFilter,
  onClearFilter,
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

  // Check if matching tabs exist in other domains (hidden by filter)
  const hasMatchingTabsInOtherDomains = useMemo(() => {
    if (!searchQuery || !sameDomainFilter || !allTabs) return false;

    // Only check when current domain-filtered results are empty
    const currentResults = tabs.filter(
      (tab) =>
        matchesKoreanSearch(tab.title, searchQuery) || matchesKoreanSearch(tab.url, searchQuery),
    );
    if (currentResults.length > 0) return false;

    // Check if any unfiltered tabs match the search
    return allTabs.some(
      (tab) =>
        matchesKoreanSearch(tab.title, searchQuery) || matchesKoreanSearch(tab.url, searchQuery),
    );
  }, [searchQuery, sameDomainFilter, allTabs, tabs]);

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
                {sameDomainFilter &&
                !searchQuery &&
                eligibleTabs.length === 0 &&
                ineligibleTabs.length === 0 ? (
                  // Case 1: Filter ON + No search + No tabs
                  <div className="py-6 text-center">
                    <p className="text-sm text-muted-foreground mb-3">
                      {t('noTabsMatchingFilter')}
                    </p>
                    {onClearFilter && (
                      <Button size="sm" variant="outline" onClick={onClearFilter}>
                        {t('clearDomainFilter')}
                      </Button>
                    )}
                  </div>
                ) : hasMatchingTabsInOtherDomains ? (
                  // Case 2: Filter ON + Search + Matching tabs hidden by filter
                  <div className="py-6 text-center">
                    <p className="text-sm text-muted-foreground mb-3">
                      {t('tabsMatchingSearchHiddenByFilter', [searchQuery])}
                    </p>
                    {onClearFilter && (
                      <Button size="sm" variant="outline" onClick={onClearFilter}>
                        {t('clearDomainFilter')}
                      </Button>
                    )}
                  </div>
                ) : (
                  // Case 3 & 4: No matching tabs anywhere
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    <p>{t('noTabsMatchingSearch', [searchQuery])}</p>
                  </div>
                )}
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
                            <IconCheck
                              aria-hidden="true"
                              className="w-4 h-4 shrink-0 text-primary"
                            />
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

                              <IconAlertCircle
                                aria-hidden="true"
                                className="w-4 h-4 shrink-0 text-destructive"
                              />
                            </CommandItem>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-[280px]" side="right">
                            <div className="flex items-start gap-2">
                              <IconAlertCircle className="w-4 h-4 shrink-0 text-destructive mt-0.5" />
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

              {sameDomainFilter && totalTabCount !== undefined && tabs.length < totalTabCount && (
                <div className="flex items-center justify-center gap-2 py-2 px-3 text-xs text-muted-foreground border-t">
                  <IconFilter className="w-3 h-3" />
                  <span>{t('hiddenByFilter', [String(totalTabCount - tabs.length)])}</span>
                </div>
              )}
            </ScrollArea>
          </CommandList>
        </Command>
      </div>
    </TooltipProvider>
  );
}

TabCommandPalette.displayName = 'TabCommandPalette';
