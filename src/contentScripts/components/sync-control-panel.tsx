import * as React from 'react';

import * as PopoverPrimitive from '@radix-ui/react-popover';
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
import { Kbd } from '~/shared/components/ui/kbd';
import { Popover, PopoverTrigger } from '~/shared/components/ui/popover';
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
const EDGE_MARGIN = 32; // Distance from screen edge

// Custom PopoverContent with container support for Shadow DOM
const CustomPopoverContent = React.forwardRef<
  React.ComponentRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> & {
    container?: HTMLElement | null;
  }
>(({ className, align = 'start', sideOffset = 8, container, ...props }, ref) => (
  <PopoverPrimitive.Portal container={container}>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      className={cn(
        'z-[2147483647] w-96 rounded-lg border bg-background/95 backdrop-blur-xl border-border/60 shadow-2xl p-0',
        'outline-none data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
        'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2',
        'data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
        className,
      )}
      sideOffset={sideOffset}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
CustomPopoverContent.displayName = 'CustomPopoverContent';

export const SyncControlPanel: React.FC<SyncControlPanelProps> = ({
  urlSyncEnabled,
  onToggle,
  className,
}) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [position, setPosition] = React.useState<Position>({ x: EDGE_MARGIN, y: EDGE_MARGIN });
  const [isDragging, setIsDragging] = React.useState(false);
  const [dragTransform, setDragTransform] = React.useState<Position>({ x: 0, y: 0 });
  const [dragStartPos, setDragStartPos] = React.useState<Position>({ x: 0, y: 0 });

  const toolbarRef = React.useRef<HTMLDivElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const wasDraggedRef = React.useRef<boolean>(false);
  const dragOffsetRef = React.useRef<Position>({ x: 0, y: 0 });

  const snapToEdge = React.useCallback((pos: Position): Position => {
    const centerX = window.innerWidth / 2;
    const maxY = window.innerHeight - BUTTON_SIZE;

    // Snap X to left or right edge based on which half of screen
    const isLeftSide = pos.x < centerX;
    const snappedX = isLeftSide ? EDGE_MARGIN : window.innerWidth - BUTTON_SIZE - EDGE_MARGIN;

    // Keep Y position, allow full height movement (no EDGE_MARGIN on Y axis)
    const snappedY = Math.max(0, Math.min(pos.y, maxY));

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

      setDragStartPos({ x: e.clientX, y: e.clientY });
      dragOffsetRef.current = {
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      };
      // Initialize dragTransform with current position to prevent jump on drag start
      setDragTransform(position);
      setIsDragging(true);
    },
    [position],
  );

  const handleMouseMove = React.useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;

      // Use transform for smooth dragging performance
      const newPosition = constrainPosition({
        x: e.clientX - dragOffsetRef.current.x,
        y: e.clientY - dragOffsetRef.current.y,
      });

      setDragTransform(newPosition);
    },
    [isDragging, constrainPosition],
  );

  const handleMouseUp = React.useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;

      // Calculate drag distance
      const dragDistance = Math.sqrt(
        Math.pow(e.clientX - dragStartPos.x, 2) + Math.pow(e.clientY - dragStartPos.y, 2),
      );

      // Only snap to edge if user actually dragged (>5px)
      if (dragDistance > 5) {
        // Calculate final position directly from mouse event using ref to get latest offset
        const finalPosition = constrainPosition({
          x: e.clientX - dragOffsetRef.current.x,
          y: e.clientY - dragOffsetRef.current.y,
        });
        const snappedPosition = snapToEdge(finalPosition);
        setPosition(snappedPosition);

        // Mark as dragged to prevent popover from opening
        wasDraggedRef.current = true;
        setTimeout(() => {
          wasDraggedRef.current = false;
        }, 50);
      }

      setDragTransform({ x: 0, y: 0 });
      setIsDragging(false);
    },
    [isDragging, constrainPosition, snapToEdge, dragStartPos],
  );

  const handleOpenChange = React.useCallback((open: boolean) => {
    // Prevent opening if user just dragged
    if (open && wasDraggedRef.current) {
      return;
    }
    setIsOpen(open);
  }, []);

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

  // Calculate popover side based on button position
  const popoverSide = position.x < window.innerWidth / 2 ? 'right' : 'left';

  return (
    <div ref={containerRef} className={cn('pointer-events-none', className)}>
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
          position: 'fixed',
          left: `${position.x}px`,
          top: `${position.y}px`,
          width: `${DRAG_HANDLE_SIZE}px`,
          height: `${DRAG_HANDLE_SIZE}px`,
          transform: isDragging
            ? `translate(${dragTransform.x - position.x}px, ${dragTransform.y - position.y}px)`
            : 'none',
          userSelect: 'none',
        }}
        onMouseDown={handleMouseDown}
      >
        <Popover open={isOpen} onOpenChange={handleOpenChange}>
          <PopoverTrigger asChild>
            {/* Button (36px) */}
            <Button
              aria-label="Open sync control panel"
              className={cn(
                'rounded-full shadow-lg backdrop-blur-md p-0',
                'bg-black/80 hover:bg-black/90',
                'border border-white/20',
                'transition-all duration-200',
                !isDragging && 'hover:scale-110 hover:shadow-xl',
                'group relative flex items-center justify-center',
              )}
              style={{
                width: `${BUTTON_SIZE}px`,
                height: `${BUTTON_SIZE}px`,
                minWidth: `${BUTTON_SIZE}px`,
                minHeight: `${BUTTON_SIZE}px`,
              }}
              tabIndex={-1}
              type="button"
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
          </PopoverTrigger>

          <CustomPopoverContent container={containerRef.current} side={popoverSide}>
            <Command className="rounded-lg border-none shadow-none">
              <div className="border-b border-border/50 px-3 py-2">
                <div className="text-xs font-medium text-muted-foreground">Scroll Sync Toolbar</div>
              </div>
              <CommandInput className="border-none" placeholder="Search settings..." />
              <CommandList className="max-h-[400px]">
                <CommandEmpty>No settings found.</CommandEmpty>

                <CommandGroup heading="Settings">
                  <CommandItem
                    className="flex items-center justify-between py-3 px-4 cursor-pointer aria-selected:bg-accent"
                    onSelect={() => {
                      onToggle();
                    }}
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
                        <Settings2 className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex flex-col gap-0.5 flex-1">
                        <span className="text-sm font-medium">URL Sync Navigation</span>
                        <span className="text-xs text-muted-foreground">
                          Preserve query parameters and hash fragments across tabs
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {urlSyncEnabled && (
                        <Badge className="bg-green-500/10 text-green-500 hover:bg-green-500/20 border-green-500/20">
                          On
                        </Badge>
                      )}
                      {!urlSyncEnabled && (
                        <Badge className="text-muted-foreground" variant="outline">
                          Off
                        </Badge>
                      )}
                      <Switch
                        checked={urlSyncEnabled}
                        className="data-[state=checked]:bg-primary"
                        onCheckedChange={(checked) => {
                          if (checked !== urlSyncEnabled) {
                            onToggle();
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  </CommandItem>

                  <CommandItem className="flex items-center justify-between py-3 px-4 opacity-60 cursor-not-allowed">
                    <div className="flex items-center gap-3 flex-1">
                      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                        <Menu className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex flex-col gap-0.5 flex-1">
                        <span className="text-sm font-medium">Scroll Synchronization</span>
                        <span className="text-xs text-muted-foreground">
                          Synchronized scrolling is {urlSyncEnabled ? 'active' : 'inactive'}
                        </span>
                      </div>
                    </div>
                    {urlSyncEnabled && (
                      <Badge className="bg-green-500/10 text-green-500 hover:bg-green-500/20 border-green-500/20">
                        Active
                      </Badge>
                    )}
                    {!urlSyncEnabled && (
                      <Badge className="text-muted-foreground" variant="outline">
                        Inactive
                      </Badge>
                    )}
                  </CommandItem>
                </CommandGroup>

                <CommandGroup heading="Keyboard Shortcuts">
                  <CommandItem className="justify-between cursor-default opacity-60 px-4">
                    <span className="text-sm">Toggle Panel</span>
                    <Kbd className="text-xs bg-muted">⌃</Kbd>
                  </CommandItem>
                  <CommandItem className="justify-between cursor-default opacity-60 px-4">
                    <span className="text-sm">Close Panel</span>
                    <Kbd className="text-xs bg-muted">Esc</Kbd>
                  </CommandItem>
                </CommandGroup>
              </CommandList>
            </Command>
          </CustomPopoverContent>
        </Popover>
      </div>
    </div>
  );
};
