import * as React from 'react';

import { Menu, Settings2 } from 'lucide-react';

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
import { Kbd } from '~/shared/components/ui/kbd';
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

const BUTTON_SIZE = 36;
const DRAG_HANDLE_SIZE = 60;
const EDGE_MARGIN = 8;

export const SyncControlPanel = React.forwardRef<HTMLDivElement, SyncControlPanelProps>(
  ({ urlSyncEnabled, onToggle, className }, ref) => {
    const [isOpen, setIsOpen] = React.useState(false);
    const [position, setPosition] = React.useState<Position>({ x: EDGE_MARGIN, y: EDGE_MARGIN });
    const [isDragging, setIsDragging] = React.useState(false);
    const [dragOffset, setDragOffset] = React.useState<Position>({ x: 0, y: 0 });
    const [dragTransform, setDragTransform] = React.useState<Position>({ x: 0, y: 0 });

    const toolbarRef = React.useRef<HTMLDivElement>(null);

    const snapToEdge = React.useCallback((pos: Position): Position => {
      const maxX = window.innerWidth - BUTTON_SIZE;
      const maxY = window.innerHeight - BUTTON_SIZE;

      // Calculate distances to each edge
      const distToLeft = pos.x;
      const distToRight = maxX - pos.x;
      const distToTop = pos.y;
      const distToBottom = maxY - pos.y;

      // Find closest edge
      const minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);

      let snappedX = pos.x;
      let snappedY = pos.y;

      // Snap to closest edge
      if (minDist === distToLeft) {
        snappedX = EDGE_MARGIN;
      } else if (minDist === distToRight) {
        snappedX = maxX - EDGE_MARGIN;
      }

      if (minDist === distToTop) {
        snappedY = EDGE_MARGIN;
      } else if (minDist === distToBottom) {
        snappedY = maxY - EDGE_MARGIN;
      }

      return { x: snappedX, y: snappedY };
    }, []);

    const constrainPosition = React.useCallback((pos: Position): Position => {
      const maxX = window.innerWidth - BUTTON_SIZE;
      const maxY = window.innerHeight - BUTTON_SIZE;

      return {
        x: Math.max(0, Math.min(pos.x, maxX)),
        y: Math.max(0, Math.min(pos.y, maxY)),
      };
    }, []);

    const handleMouseDown = React.useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.button !== 0) return;
        e.preventDefault();

        setDragOffset({
          x: e.clientX - position.x,
          y: e.clientY - position.y,
        });
        setIsDragging(true);
      },
      [position],
    );

    const handleMouseMove = React.useCallback(
      (e: MouseEvent) => {
        if (!isDragging) return;

        // Use transform for smooth dragging performance
        const newPosition = constrainPosition({
          x: e.clientX - dragOffset.x,
          y: e.clientY - dragOffset.y,
        });

        setDragTransform(newPosition);
      },
      [isDragging, dragOffset, constrainPosition],
    );

    const handleMouseUp = React.useCallback(() => {
      if (!isDragging) return;

      // Snap to nearest edge and set final position
      const snappedPosition = snapToEdge(dragTransform);
      setPosition(snappedPosition);
      setDragTransform({ x: 0, y: 0 });
      setIsDragging(false);
    }, [isDragging, dragTransform, snapToEdge]);

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
        {/* Drag handle area (60px) */}
        <div
          ref={toolbarRef}
          className={cn(
            'fixed pointer-events-auto z-[2147483647]',
            'flex items-center justify-center',
            isDragging && 'cursor-grabbing',
            !isDragging && 'cursor-grab',
          )}
          role="presentation"
          style={{
            left: `${position.x}px`,
            top: `${position.y}px`,
            width: `${DRAG_HANDLE_SIZE}px`,
            height: `${DRAG_HANDLE_SIZE}px`,
            transform: isDragging
              ? `translate(${dragTransform.x - position.x}px, ${dragTransform.y - position.y}px)`
              : 'none',
          }}
          onMouseDown={handleMouseDown}
        >
          {/* Button (36px) */}
          <Button
            aria-label="Open sync control panel"
            className={cn(
              'rounded-full shadow-lg backdrop-blur-md',
              'bg-black/80 hover:bg-black/90',
              'border border-white/20',
              'transition-all duration-200',
              !isDragging && 'hover:scale-110 hover:shadow-xl',
              'group relative',
            )}
            size="icon"
            style={{
              width: `${BUTTON_SIZE}px`,
              height: `${BUTTON_SIZE}px`,
            }}
            onClick={handleClick}
          >
            <Menu className="h-4 w-4 text-white" />

            {/* Status badge */}
            <div className="absolute -bottom-0.5 -right-0.5">
              <Badge
                className={cn(
                  'h-3 w-3 rounded-full p-0 flex items-center justify-center',
                  'border-2 border-black',
                  'transition-colors duration-200',
                  urlSyncEnabled ? 'bg-blue-500' : 'bg-gray-400',
                )}
                variant="default"
              >
                <span className="sr-only">{urlSyncEnabled ? 'Active' : 'Inactive'}</span>
              </Badge>
            </div>

            {/* Keyboard shortcut tooltip */}
            <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap">
              <div className="bg-black/90 text-white px-2 py-1 rounded text-xs backdrop-blur-sm flex items-center gap-1">
                <Kbd className="bg-white/20 text-white text-xs px-1">⌃</Kbd>
              </div>
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
                      <Menu className="h-4 w-4 text-muted-foreground" />
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
                    <Kbd className="text-xs">⌃</Kbd>
                  </CommandItem>
                  <CommandItem className="justify-between cursor-default opacity-60">
                    <span className="text-sm">Close Panel</span>
                    <Kbd className="text-xs">Esc</Kbd>
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
