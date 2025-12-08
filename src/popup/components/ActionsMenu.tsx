import { useCallback, useEffect, useRef } from 'react';

import { Play, Pause, Check, X, Filter, ArrowUpDown, Link2, Globe } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import { Button } from '~/shared/components/ui/button';
import { Command, CommandGroup, CommandItem, CommandList } from '~/shared/components/ui/command';
import { Kbd } from '~/shared/components/ui/kbd';
import { Popover, PopoverContent, PopoverTrigger } from '~/shared/components/ui/popover';
import { Separator } from '~/shared/components/ui/separator';
import { t } from '~/shared/i18n';
import {
  ANIMATION_DURATIONS,
  EASING_FUNCTIONS,
  getMotionTransition,
  motionVariants,
} from '~/shared/lib/animations';

import type { SortOption } from '../types/filters';

interface ActionsMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isSyncActive: boolean;
  selectedCount: number;
  onStartSync: () => void;
  onStopSync: () => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  sameDomainFilter: boolean;
  onSameDomainFilterChange: (enabled: boolean) => void;
  autoSyncEnabled: boolean;
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
  onSelectAll,
  onClearAll,
  sortBy,
  onSortChange,
  sameDomainFilter,
  onSameDomainFilterChange,
  autoSyncEnabled,
  onAutoSyncChange,
  urlSyncEnabled,
  onUrlSyncChange,
}: ActionsMenuProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLDivElement>(null);
  const lastFocusedElement = useRef<HTMLElement | null>(null);

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
    onOpenChange(false);
  }, [isSyncActive, onStartSync, onStopSync, onOpenChange]);

  const handleSelectAll = useCallback(() => {
    onSelectAll();
    onOpenChange(false);
  }, [onSelectAll, onOpenChange]);

  const handleClearAll = useCallback(() => {
    onClearAll();
    onOpenChange(false);
  }, [onClearAll, onOpenChange]);

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
            <Kbd>⌘</Kbd>
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
                          <Pause aria-hidden="true" className="w-4 h-4" />
                        ) : (
                          <Play aria-hidden="true" className="w-4 h-4" />
                        )}
                        <span>{isSyncActive ? t('stopSync') : t('startSync')}</span>
                      </div>
                      <div className="flex items-center gap-0.5 text-xs text-muted-foreground">
                        <Kbd>⌘</Kbd>
                        <Kbd>S</Kbd>
                      </div>
                    </CommandItem>
                  </CommandGroup>

                  <Separator />

                  {/* Selection Controls */}
                  <CommandGroup heading={t('selectionHeading')}>
                    <CommandItem disabled={isSyncActive} onSelect={handleSelectAll}>
                      <div className="flex items-center gap-2 flex-1">
                        <Check aria-hidden="true" className="w-4 h-4" />
                        <span>{t('selectAllTabs')}</span>
                      </div>
                      <div className="flex items-center gap-0.5 text-xs text-muted-foreground">
                        <Kbd>⌘</Kbd>
                        <Kbd>A</Kbd>
                      </div>
                    </CommandItem>
                    <CommandItem
                      disabled={isSyncActive || selectedCount === 0}
                      onSelect={handleClearAll}
                    >
                      <div className="flex items-center gap-2 flex-1">
                        <X aria-hidden="true" className="w-4 h-4" />
                        <span>{t('clearAllSelections')}</span>
                      </div>
                      <div className="flex items-center gap-0.5 text-xs text-muted-foreground">
                        <Kbd>⌘</Kbd>
                        <Kbd>⇧</Kbd>
                        <Kbd>X</Kbd>
                      </div>
                    </CommandItem>
                  </CommandGroup>

                  <Separator />

                  {/* Filter Options */}
                  <CommandGroup heading={t('filtersHeading')}>
                    <CommandItem
                      onSelect={() => {
                        onSameDomainFilterChange(!sameDomainFilter);
                        onOpenChange(false);
                      }}
                    >
                      <div className="flex items-center gap-2 flex-1">
                        <Filter aria-hidden="true" className="w-4 h-4" />
                        <span>{t('sameDomainOnly')}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {sameDomainFilter && <Check aria-hidden="true" className="w-4 h-4" />}
                        <div className="flex items-center gap-0.5 text-xs text-muted-foreground">
                          <Kbd>⌘</Kbd>
                          <Kbd>D</Kbd>
                        </div>
                      </div>
                    </CommandItem>
                  </CommandGroup>

                  <Separator />

                  {/* Sort Options */}
                  <CommandGroup heading={t('sortByHeading')}>
                    <CommandItem
                      onSelect={() => {
                        onSortChange('similarity');
                        onOpenChange(false);
                      }}
                    >
                      <div className="flex items-center gap-2 flex-1">
                        {sortBy === 'similarity' && (
                          <Check aria-hidden="true" className="w-4 h-4" />
                        )}
                        <ArrowUpDown aria-hidden="true" className="w-4 h-4" />
                        <span>{t('sortSimilarity')}</span>
                      </div>
                      <div className="flex items-center gap-0.5 text-xs text-muted-foreground">
                        <Kbd>⌘</Kbd>
                        <Kbd>1</Kbd>
                      </div>
                    </CommandItem>
                    <CommandItem
                      onSelect={() => {
                        onSortChange('recent');
                        onOpenChange(false);
                      }}
                    >
                      <div className="flex items-center gap-2 flex-1">
                        {sortBy === 'recent' && <Check aria-hidden="true" className="w-4 h-4" />}
                        <ArrowUpDown aria-hidden="true" className="w-4 h-4" />
                        <span>{t('sortRecent')}</span>
                      </div>
                      <div className="flex items-center gap-0.5 text-xs text-muted-foreground">
                        <Kbd>⌘</Kbd>
                        <Kbd>2</Kbd>
                      </div>
                    </CommandItem>
                  </CommandGroup>

                  <Separator />

                  {/* Advanced Features */}
                  <CommandGroup heading={t('advancedFeatures')}>
                    <CommandItem
                      onSelect={() => {
                        onAutoSyncChange(!autoSyncEnabled);
                        onOpenChange(false);
                      }}
                    >
                      <div className="flex items-center gap-2 flex-1">
                        <Link2 aria-hidden="true" className="w-4 h-4" />
                        <span>{t('autoSyncSameUrl')}</span>
                      </div>
                      {autoSyncEnabled && <Check aria-hidden="true" className="w-4 h-4" />}
                    </CommandItem>
                    <CommandItem
                      onSelect={() => {
                        onUrlSyncChange(!urlSyncEnabled);
                        onOpenChange(false);
                      }}
                    >
                      <div className="flex items-center gap-2 flex-1">
                        <Globe aria-hidden="true" className="w-4 h-4" />
                        <span>{t('urlSyncNavigation')}</span>
                      </div>
                      {urlSyncEnabled && <Check aria-hidden="true" className="w-4 h-4" />}
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
