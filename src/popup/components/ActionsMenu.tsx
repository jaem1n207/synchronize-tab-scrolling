import { useCallback, useEffect, useRef } from 'react';

import { Play, Pause, Check, X, Filter, ArrowUpDown } from 'lucide-react';

import { Button } from '~/shared/components/ui/button';
import { Command, CommandGroup, CommandItem, CommandList } from '~/shared/components/ui/command';
import { Kbd } from '~/shared/components/ui/kbd';
import { Popover, PopoverContent, PopoverTrigger } from '~/shared/components/ui/popover';
import { Separator } from '~/shared/components/ui/separator';

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
  inputRef?: React.RefObject<HTMLInputElement>;
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
  inputRef,
}: ActionsMenuProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);

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
          className="gap-2"
          size="sm"
          variant="outline"
          onClick={() => onOpenChange(!open)}
        >
          Actions
          <div className="flex items-center gap-0.5">
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 p-0"
        side="top"
        sideOffset={8}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          inputRef?.current?.focus();
        }}
      >
        <Command>
          <CommandList className="max-h-[400px]">
            {/* Sync Controls */}
            <CommandGroup heading="Sync Controls">
              <CommandItem
                disabled={!isSyncActive && selectedCount < 2}
                onSelect={handleSyncAction}
              >
                <div className="flex items-center gap-2 flex-1">
                  {isSyncActive ? (
                    <Pause aria-hidden="true" className="w-4 h-4" />
                  ) : (
                    <Play aria-hidden="true" className="w-4 h-4" />
                  )}
                  <span>{isSyncActive ? 'Stop Sync' : 'Start Sync'}</span>
                </div>
                <div className="flex items-center gap-0.5 text-xs text-muted-foreground">
                  <Kbd>⌘</Kbd>
                  <Kbd>S</Kbd>
                </div>
              </CommandItem>
            </CommandGroup>

            <Separator />

            {/* Selection Controls */}
            <CommandGroup heading="Selection">
              <CommandItem disabled={isSyncActive} onSelect={handleSelectAll}>
                <div className="flex items-center gap-2 flex-1">
                  <Check aria-hidden="true" className="w-4 h-4" />
                  <span>Select All Tabs</span>
                </div>
                <div className="flex items-center gap-0.5 text-xs text-muted-foreground">
                  <Kbd>⌘</Kbd>
                  <Kbd>A</Kbd>
                </div>
              </CommandItem>
              <CommandItem disabled={isSyncActive || selectedCount === 0} onSelect={handleClearAll}>
                <div className="flex items-center gap-2 flex-1">
                  <X aria-hidden="true" className="w-4 h-4" />
                  <span>Clear All Selections</span>
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
            <CommandGroup heading="Filters">
              <CommandItem
                onSelect={() => {
                  onSameDomainFilterChange(!sameDomainFilter);
                  onOpenChange(false);
                }}
              >
                <div className="flex items-center gap-2 flex-1">
                  <Filter aria-hidden="true" className="w-4 h-4" />
                  <span>Same Domain Only</span>
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
            <CommandGroup heading="Sort By">
              <CommandItem
                onSelect={() => {
                  onSortChange('similarity');
                  onOpenChange(false);
                }}
              >
                <div className="flex items-center gap-2 flex-1">
                  {sortBy === 'similarity' && <Check aria-hidden="true" className="w-4 h-4" />}
                  <ArrowUpDown aria-hidden="true" className="w-4 h-4" />
                  <span>Similarity (Domain Grouping)</span>
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
                  <span>Recent Visits</span>
                </div>
                <div className="flex items-center gap-0.5 text-xs text-muted-foreground">
                  <Kbd>⌘</Kbd>
                  <Kbd>2</Kbd>
                </div>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
