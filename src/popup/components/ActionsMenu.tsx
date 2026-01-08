import { useCallback, useEffect, useRef } from 'react';

import { motion, AnimatePresence } from 'motion/react';

import { Button } from '~/shared/components/ui/button';
import { Command, CommandGroup, CommandItem, CommandList } from '~/shared/components/ui/command';
import { Kbd } from '~/shared/components/ui/kbd';
import { Popover, PopoverContent, PopoverTrigger } from '~/shared/components/ui/popover';
import { Separator } from '~/shared/components/ui/separator';
import { useModifierKey } from '~/shared/hooks/useModifierKey';
import { t } from '~/shared/i18n';
import {
  ANIMATION_DURATIONS,
  EASING_FUNCTIONS,
  getMotionTransition,
  motionVariants,
} from '~/shared/lib/animations';

import type { SortOption } from '../types/filters';

import IconArrowUpDown from '~icons/lucide/arrow-up-down';
import IconCheck from '~icons/lucide/check';
import IconFilter from '~icons/lucide/filter';
import IconGlobe from '~icons/lucide/globe';
import IconLink2 from '~icons/lucide/link-2';
import IconPause from '~icons/lucide/pause';
import IconPlay from '~icons/lucide/play';
import IconX from '~icons/lucide/x';

interface ActionsMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isSyncActive: boolean;
  selectedCount: number;
  onStartSync: () => void;
  onStopSync: () => void;
  onToggleAllTabs: () => void;
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  sameDomainFilter: boolean;
  onSameDomainFilterChange: (enabled: boolean) => void;
  autoSyncEnabled: boolean;
  autoSyncTabCount?: number;
  onAutoSyncChange: (enabled: boolean) => void;
  urlSyncEnabled: boolean;
  onUrlSyncChange: (enabled: boolean) => void;
}

export function ActionsMenu({
  open,
  onOpenChange,
  isSyncActive,
  selectedCount,
  onStartSync,
  onStopSync,
  onToggleAllTabs,
  sortBy,
  onSortChange,
  sameDomainFilter,
  onSameDomainFilterChange,
  autoSyncEnabled,
  autoSyncTabCount,
  onAutoSyncChange,
  urlSyncEnabled,
  onUrlSyncChange,
}: ActionsMenuProps) {
  const { modKey, shiftKey } = useModifierKey();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLDivElement>(null);
  const lastFocusedElement = useRef<HTMLElement | null>(null);
  const autoSyncItemRef = useRef<HTMLDivElement>(null);

  // Store focused element before opening and focus first item when opened
  useEffect(() => {
    if (open) {
      // Store the currently focused element
      lastFocusedElement.current = document.activeElement as HTMLElement;

      // Focus the first item after a brief delay to ensure the menu is rendered
      setTimeout(() => {
        if (firstItemRef.current) {
          firstItemRef.current.focus();
        }
      }, 50);
    }
  }, [open]);

  // Keyboard shortcut: Cmd/Ctrl + K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        e.stopPropagation();
        onOpenChange(!open);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onOpenChange]);

  const handleSyncAction = useCallback(() => {
    if (isSyncActive) {
      onStopSync();
    } else {
      onStartSync();
    }
  }, [isSyncActive, onStartSync, onStopSync]);

  return (
    <Popover modal open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          aria-expanded={open}
          aria-label={
            sameDomainFilter ? `${t('actionsButton')} - ${t('filterActive')}` : t('actionsButton')
          }
          className="gap-2 relative"
          size="sm"
          variant="outline"
          onClick={() => onOpenChange(!open)}
        >
          {t('actionsButton')}
          {sameDomainFilter && (
            <span
              aria-hidden="true"
              className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full"
            />
          )}
          <div className="flex items-center gap-0.5">
            <Kbd>{modKey}</Kbd>
            <Kbd>K</Kbd>
          </div>
        </Button>
      </PopoverTrigger>
      <AnimatePresence>
        {open && (
          <PopoverContent
            asChild
            align="end"
            className="w-80 p-0"
            side="top"
            sideOffset={8}
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              // Restore focus to the element that was focused before opening
              if (
                lastFocusedElement.current &&
                typeof lastFocusedElement.current.focus === 'function'
              ) {
                setTimeout(() => {
                  lastFocusedElement.current?.focus();
                }, 0);
              }
            }}
          >
            <motion.div
              animate={motionVariants.scale.animate}
              exit={motionVariants.scale.exit}
              initial={motionVariants.scale.initial}
              transition={getMotionTransition(ANIMATION_DURATIONS.fast, EASING_FUNCTIONS.easeOut)}
            >
              <Command>
                <CommandList className="max-h-[400px]">
                  {/* Sync Controls */}
                  <CommandGroup heading={t('syncControlsHeading')}>
                    <CommandItem
                      ref={firstItemRef}
                      disabled={!isSyncActive && selectedCount < 2}
                      onSelect={handleSyncAction}
                    >
                      <div className="flex items-center gap-2 flex-1">
                        {isSyncActive ? (
                          <IconPause aria-hidden="true" className="w-4 h-4" />
                        ) : (
                          <IconPlay aria-hidden="true" className="w-4 h-4" />
                        )}
                        <span>{isSyncActive ? t('stopSync') : t('startSync')}</span>
                      </div>
                      <div className="flex items-center gap-0.5 text-xs text-muted-foreground">
                        <Kbd>{modKey}</Kbd>
                        <Kbd>S</Kbd>
                      </div>
                    </CommandItem>
                  </CommandGroup>

                  <Separator />

                  {/* Advanced Features */}
                  <CommandGroup heading={t('advancedFeatures')}>
                    <CommandItem
                      ref={autoSyncItemRef}
                      value="auto-sync-same-url"
                      onSelect={() => {
                        onAutoSyncChange(!autoSyncEnabled);
                        // Bug 14-2 fix: Use setTimeout(0) instead of requestAnimationFrame
                        // requestAnimationFrame fires before React re-render completes,
                        // setTimeout(0) uses macrotask queue which runs after re-render
                        setTimeout(() => {
                          autoSyncItemRef.current?.focus();
                        }, 0);
                      }}
                    >
                      <div className="flex items-center gap-2 flex-1">
                        <IconLink2 aria-hidden="true" className="w-4 h-4" />
                        <span>{t('autoSyncSameUrl')}</span>
                        {autoSyncEnabled && autoSyncTabCount != null && autoSyncTabCount > 0 && (
                          <span className="ml-1 px-1.5 py-0.5 text-xs bg-primary/10 text-primary rounded-full">
                            {autoSyncTabCount}
                          </span>
                        )}
                      </div>
                      {autoSyncEnabled && <IconCheck aria-hidden="true" className="w-4 h-4" />}
                    </CommandItem>
                    <CommandItem
                      onSelect={() => {
                        onUrlSyncChange(!urlSyncEnabled);
                      }}
                    >
                      <div className="flex items-center gap-2 flex-1">
                        <IconGlobe aria-hidden="true" className="w-4 h-4" />
                        <span>{t('urlSyncNavigation')}</span>
                      </div>
                      {urlSyncEnabled && <IconCheck aria-hidden="true" className="w-4 h-4" />}
                    </CommandItem>
                  </CommandGroup>

                  <Separator />

                  {/* Filter Options */}
                  <CommandGroup heading={t('filtersHeading')}>
                    <CommandItem
                      onSelect={() => {
                        onSameDomainFilterChange(!sameDomainFilter);
                      }}
                    >
                      <div className="flex items-center gap-2 flex-1">
                        <IconFilter aria-hidden="true" className="w-4 h-4" />
                        <span>{t('sameDomainOnly')}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {sameDomainFilter && <IconCheck aria-hidden="true" className="w-4 h-4" />}
                        <div className="flex items-center gap-0.5 text-xs text-muted-foreground">
                          <Kbd>{modKey}</Kbd>
                          <Kbd>D</Kbd>
                        </div>
                      </div>
                    </CommandItem>
                  </CommandGroup>

                  <Separator />

                  {/* Selection Controls */}
                  <CommandGroup heading={t('selectionHeading')}>
                    <CommandItem disabled={isSyncActive} onSelect={onToggleAllTabs}>
                      <div className="flex items-center gap-2 flex-1">
                        {selectedCount > 0 ? (
                          <>
                            <IconX aria-hidden="true" className="w-4 h-4" />
                            <span>{t('clearAllSelections')}</span>
                          </>
                        ) : (
                          <>
                            <IconCheck aria-hidden="true" className="w-4 h-4" />
                            <span>{t('selectAllTabs')}</span>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-0.5 text-xs text-muted-foreground">
                        <Kbd>{modKey}</Kbd>
                        <Kbd>{shiftKey}</Kbd>
                        <Kbd>X</Kbd>
                      </div>
                    </CommandItem>
                  </CommandGroup>

                  <Separator />

                  {/* Sort Options */}
                  <CommandGroup heading={t('sortByHeading')}>
                    <CommandItem
                      onSelect={() => {
                        onSortChange('similarity');
                      }}
                    >
                      <div className="flex items-center gap-2 flex-1">
                        {sortBy === 'similarity' && (
                          <IconCheck aria-hidden="true" className="w-4 h-4" />
                        )}
                        <IconArrowUpDown aria-hidden="true" className="w-4 h-4" />
                        <span>{t('sortSimilarity')}</span>
                      </div>
                      <div className="flex items-center gap-0.5 text-xs text-muted-foreground">
                        <Kbd>{modKey}</Kbd>
                        <Kbd>1</Kbd>
                      </div>
                    </CommandItem>
                    <CommandItem
                      onSelect={() => {
                        onSortChange('recent');
                      }}
                    >
                      <div className="flex items-center gap-2 flex-1">
                        {sortBy === 'recent' && (
                          <IconCheck aria-hidden="true" className="w-4 h-4" />
                        )}
                        <IconArrowUpDown aria-hidden="true" className="w-4 h-4" />
                        <span>{t('sortRecent')}</span>
                      </div>
                      <div className="flex items-center gap-0.5 text-xs text-muted-foreground">
                        <Kbd>{modKey}</Kbd>
                        <Kbd>2</Kbd>
                      </div>
                    </CommandItem>
                  </CommandGroup>
                </CommandList>
              </Command>
            </motion.div>
          </PopoverContent>
        )}
      </AnimatePresence>
    </Popover>
  );
}
