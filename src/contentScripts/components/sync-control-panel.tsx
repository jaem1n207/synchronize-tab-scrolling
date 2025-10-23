import * as React from 'react';

import { ArrowsUpFromLine, Settings2 } from 'lucide-react';

import { Badge } from '~/shared/components/ui/badge';
import { Button } from '~/shared/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '~/shared/components/ui/command';
import { Dialog, DialogContent, DialogTitle } from '~/shared/components/ui/dialog';
import { Kbd, KbdGroup } from '~/shared/components/ui/kbd';
import { Switch } from '~/shared/components/ui/switch';
import { cn } from '~/shared/lib/utils';

interface SyncControlPanelProps {
  urlSyncEnabled: boolean;
  onToggle: () => void;
  className?: string;
}

interface Position {
  x: number;
  y: number;
}

export const SyncControlPanel = React.forwardRef<HTMLDivElement, SyncControlPanelProps>(
  ({ urlSyncEnabled, onToggle, className }, ref) => {
    const [isOpen, setIsOpen] = React.useState(false);
    const [position, setPosition] = React.useState<Position>({ x: 20, y: 20 });
    const [isDragging, setIsDragging] = React.useState(false);
    const [dragOffset, setDragOffset] = React.useState<Position>({ x: 0, y: 0 });

    const toolbarRef = React.useRef<HTMLDivElement>(null);

    const constrainPosition = React.useCallback((pos: Position): Position => {
      const toolbar = toolbarRef.current;
      if (!toolbar) return pos;

      const rect = toolbar.getBoundingClientRect();
      const maxX = window.innerWidth - rect.width;
      const maxY = window.innerHeight - rect.height;

      return {
        x: Math.max(0, Math.min(pos.x, maxX)),
        y: Math.max(0, Math.min(pos.y, maxY)),
      };
    }, []);

    const handleMouseDown = React.useCallback((e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();

      const toolbar = toolbarRef.current;
      if (!toolbar) return;

      const rect = toolbar.getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
      setIsDragging(true);
    }, []);

    const handleMouseMove = React.useCallback(
      (e: MouseEvent) => {
        if (!isDragging) return;

        const newPosition = constrainPosition({
          x: e.clientX - dragOffset.x,
          y: e.clientY - dragOffset.y,
        });

        setPosition(newPosition);
      },
      [isDragging, dragOffset, constrainPosition],
    );

    const handleMouseUp = React.useCallback(() => {
      setIsDragging(false);
    }, []);

    const handleClick = React.useCallback(
      (e: React.MouseEvent<HTMLButtonElement>) => {
        if (isDragging) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        setIsOpen(true);
      },
      [isDragging],
    );

    React.useEffect(() => {
      if (isDragging) {
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
          document.removeEventListener('mousemove', handleMouseMove);
          document.removeEventListener('mouseup', handleMouseUp);
        };
      }
    }, [isDragging, handleMouseMove, handleMouseUp]);

    React.useEffect(() => {
      const handleResize = () => {
        setPosition((prev) => constrainPosition(prev));
      };

      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }, [constrainPosition]);

    React.useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
          const hasModifier = e.key === 'Control';
          if (hasModifier || isOpen) {
            e.preventDefault();
            setIsOpen((prev) => !prev);
          }
        }

        if (e.key === 'Escape' && isOpen) {
          setIsOpen(false);
        }
      };

      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen]);

    return (
      <div ref={ref} className={cn('pointer-events-none', className)}>
        <div
          ref={toolbarRef}
          className={cn(
            'fixed pointer-events-auto z-[2147483647]',
            'transition-shadow duration-200',
            isDragging && 'cursor-grabbing',
            !isDragging && 'cursor-grab',
          )}
          role="presentation"
          style={{
            left: `${position.x}px`,
            top: `${position.y}px`,
          }}
          onMouseDown={handleMouseDown}
        >
          <Button
            aria-label="Open sync control panel"
            className={cn(
              'h-12 w-12 rounded-full shadow-lg backdrop-blur-md',
              'bg-gradient-to-br from-blue-500/90 to-violet-600/90',
              'hover:from-blue-600/90 hover:to-violet-700/90',
              'border border-white/20',
              'transition-all duration-200',
              !isDragging && 'hover:scale-110 hover:shadow-xl',
              'group relative',
            )}
            size="icon"
            onClick={handleClick}
          >
            <ArrowsUpFromLine className="h-5 w-5 text-white" />

            <div className="absolute -bottom-1 -right-1">
              <Badge
                className={cn(
                  'h-5 w-5 rounded-full p-0 flex items-center justify-center',
                  'border-2 border-background',
                  'transition-colors duration-200',
                  urlSyncEnabled
                    ? 'bg-green-500 hover:bg-green-600'
                    : 'bg-gray-400 hover:bg-gray-500',
                )}
                variant="default"
              >
                <span className="sr-only">{urlSyncEnabled ? 'Active' : 'Inactive'}</span>
              </Badge>
            </div>

            <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap">
              <KbdGroup className="bg-black/80 text-white px-2 py-1 rounded text-xs backdrop-blur-sm">
                <Kbd className="bg-white/20 text-white">⌃</Kbd>
              </KbdGroup>
            </div>
          </Button>
        </div>

        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogContent className="sm:max-w-md backdrop-blur-xl bg-background/95 border-border/60 shadow-2xl">
            <DialogTitle className="sr-only">Sync Control Settings</DialogTitle>
            <Command className="rounded-lg border-none shadow-none">
              <CommandInput placeholder="Search settings..." />
              <CommandList>
                <CommandEmpty>No settings found.</CommandEmpty>
                <CommandGroup heading="Synchronization Settings">
                  <CommandItem
                    className="flex items-center justify-between py-3 cursor-pointer"
                    onSelect={() => {
                      onToggle();
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <Settings2 className="h-4 w-4 text-muted-foreground" />
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium">URL Sync Navigation</span>
                        <span className="text-xs text-muted-foreground">
                          Sync query parameters and hash fragments
                        </span>
                      </div>
                    </div>
                    <Switch
                      checked={urlSyncEnabled}
                      className="data-[state=checked]:bg-blue-500"
                      onCheckedChange={(checked) => {
                        if (checked !== urlSyncEnabled) {
                          onToggle();
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </CommandItem>

                  <CommandItem className="flex items-center justify-between py-3 opacity-60 cursor-not-allowed">
                    <div className="flex items-center gap-3">
                      <ArrowsUpFromLine className="h-4 w-4 text-muted-foreground" />
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium">Scroll Synchronization</span>
                        <span className="text-xs text-muted-foreground">
                          Currently {urlSyncEnabled ? 'active' : 'inactive'}
                        </span>
                      </div>
                    </div>
                    <Badge
                      className={cn(
                        urlSyncEnabled ? 'bg-green-500 hover:bg-green-600' : 'bg-gray-400',
                      )}
                      variant="default"
                    >
                      {urlSyncEnabled ? 'Active' : 'Inactive'}
                    </Badge>
                  </CommandItem>
                </CommandGroup>

                <CommandGroup heading="Keyboard Shortcuts">
                  <CommandItem className="justify-between cursor-default opacity-60">
                    <span className="text-sm">Toggle Panel</span>
                    <KbdGroup>
                      <Kbd>⌃</Kbd>
                    </KbdGroup>
                  </CommandItem>
                  <CommandItem className="justify-between cursor-default opacity-60">
                    <span className="text-sm">Close Panel</span>
                    <Kbd>Esc</Kbd>
                  </CommandItem>
                </CommandGroup>
              </CommandList>
            </Command>
          </DialogContent>
        </Dialog>
      </div>
    );
  },
);

SyncControlPanel.displayName = 'SyncControlPanel';
