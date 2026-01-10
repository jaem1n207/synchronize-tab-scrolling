import * as React from 'react';

import * as PopoverPrimitive from '@radix-ui/react-popover';
import { AnimatePresence, motion } from 'motion/react';
import { onMessage, sendMessage } from 'webext-bridge/content-script';
import browser from 'webextension-polyfill';

import { Badge } from '~/shared/components/ui/badge';
import { Button } from '~/shared/components/ui/button';
import { Kbd } from '~/shared/components/ui/kbd';
import { Popover, PopoverTrigger } from '~/shared/components/ui/popover';
import { Switch } from '~/shared/components/ui/switch';
import { useSystemTheme } from '~/shared/hooks/use-system-theme';
import { t } from '~/shared/i18n';
import {
  ANIMATION_DURATIONS,
  EASING_FUNCTIONS,
  getMotionTransition,
  PANEL_ANIMATIONS,
  prefersReducedMotion,
} from '~/shared/lib/animations';
import { ExtensionLogger } from '~/shared/lib/logger';
import {
  loadAutoSyncEnabled,
  loadManualScrollOffsets,
  saveAutoSyncEnabled,
} from '~/shared/lib/storage';
import { cn } from '~/shared/lib/utils';

import { getAutoSyncStatus } from '../scrollSync';

const logger = new ExtensionLogger({ scope: 'sync-control-panel' });

import IconMenu from '~icons/lucide/menu';
import IconSettings2 from '~icons/lucide/settings-2';

interface SyncControlPanelProps {
  urlSyncEnabled: boolean;
  onToggle: () => void;
  isConnectionHealthy?: boolean;
  onReconnect?: () => void;
  className?: string;
}

interface Position {
  x: number;
  y: number;
}

interface SyncedTab {
  id: number;
  title: string;
  offsetPixels: number; // pixel offset value
  isCurrent: boolean;
}

const BUTTON_SIZE = 36;
const EDGE_MARGIN = 32; // Distance from screen edge

// Custom PopoverContent with container support for Shadow DOM
// Uses Motion for animations since UnoCSS @property animations don't work in Shadow DOM
function CustomPopoverContent({
  className,
  align = 'start',
  sideOffset = 8,
  container,
  children,
  ...props
}: Omit<React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>, 'children'> & {
  container?: HTMLElement | null;
  children?: React.ReactNode;
}) {
  const reducedMotion = prefersReducedMotion();

  return (
    <PopoverPrimitive.Portal forceMount container={container}>
      <PopoverPrimitive.Content asChild forceMount align={align} sideOffset={sideOffset} {...props}>
        <motion.div
          animate={{ opacity: 1, scale: 1 }}
          className={cn(
            'z-[2147483647] w-96 rounded-lg border bg-background/95 backdrop-blur-xl border-border/60 shadow-2xl p-0',
            'pointer-events-auto outline-none',
            className,
          )}
          exit={reducedMotion ? undefined : { opacity: 0, scale: 0.9 }}
          initial={reducedMotion ? false : { opacity: 0, scale: 0.9 }}
          transition={getMotionTransition(ANIMATION_DURATIONS.fast, EASING_FUNCTIONS.easeOutCubic)}
        >
          {children}
        </motion.div>
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
}
CustomPopoverContent.displayName = 'CustomPopoverContent';

export const SyncControlPanel = ({
  urlSyncEnabled,
  onToggle,
  isConnectionHealthy = true,
  onReconnect,
  className,
}: SyncControlPanelProps) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [position, setPosition] = React.useState<Position>({ x: EDGE_MARGIN, y: EDGE_MARGIN });
  const [isDragging, setIsDragging] = React.useState(false);
  const [dragTransform, setDragTransform] = React.useState<Position>({ x: 0, y: 0 });
  const [dragStartPos, setDragStartPos] = React.useState<Position>({ x: 0, y: 0 });
  const [syncedTabs, setSyncedTabs] = React.useState<SyncedTab[]>([]);
  const [autoSyncEnabled, setAutoSyncEnabled] = React.useState(false);
  const [isAutoSyncActive, setIsAutoSyncActive] = React.useState(false);
  const [autoSyncGroupCount, setAutoSyncGroupCount] = React.useState(0);

  const toolbarRef = React.useRef<HTMLButtonElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const wasDraggedRef = React.useRef<boolean>(false);
  const dragOffsetRef = React.useRef<Position>({ x: 0, y: 0 });
  const rafIdRef = React.useRef<number | null>(null);
  const ctrlOnlyRef = React.useRef<boolean>(false);

  const systemTheme = useSystemTheme();

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
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;

      // Prevent dragging when popover is open
      if (isOpen) return;

      e.preventDefault();
      e.stopPropagation();

      setDragStartPos({ x: e.clientX, y: e.clientY });
      dragOffsetRef.current = {
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      };
      // Initialize dragTransform with current position to prevent jump on drag start
      setDragTransform(position);
      setIsDragging(true);
    },
    [position, isOpen],
  );

  const handleMouseMove = React.useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;

      // Cancel any pending RAF to avoid stacking updates
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }

      // Use requestAnimationFrame for 60fps smooth dragging performance
      rafIdRef.current = requestAnimationFrame(() => {
        const newPosition = constrainPosition({
          x: e.clientX - dragOffsetRef.current.x,
          y: e.clientY - dragOffsetRef.current.y,
        });

        setDragTransform(newPosition);
        rafIdRef.current = null;
      });
    },
    [isDragging, constrainPosition],
  );

  const handleMouseUp = React.useCallback(
    async (e: MouseEvent) => {
      if (!isDragging) return;

      // Cancel any pending RAF
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }

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

        // Update both position and dragTransform to the snapped position
        // This ensures smooth visual transition when isDragging becomes false
        setPosition(snappedPosition);
        setDragTransform(snappedPosition);

        // Broadcast position change to other tabs
        try {
          const currentTab = await browser.tabs.getCurrent();
          if (currentTab?.id) {
            await sendMessage(
              'panel:position',
              { x: snappedPosition.x, y: snappedPosition.y, sourceTabId: currentTab.id },
              'background',
            );
          }
        } catch (error) {
          await logger.error('Failed to broadcast panel position:', error);
        }

        // Mark as dragged to prevent popover from opening
        wasDraggedRef.current = true;
        setTimeout(() => {
          wasDraggedRef.current = false;
        }, 50);
      }

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

  const loadSyncedTabsWithOffsets = React.useCallback(async () => {
    try {
      // 1. Get synced tabs list
      const response = await sendMessage('sync:get-status', {}, 'background');
      const status = response as {
        success: boolean;
        linkedTabs?: Array<{ id: number; title: string; url: string; favIconUrl?: string }>;
        currentTabId?: number;
      } | null;

      if (!status?.success || !status.linkedTabs) {
        setSyncedTabs([]);
        return;
      }

      // 2. Get all offsets
      const offsets = await loadManualScrollOffsets();

      // 3. Merge and update state
      const tabs = status.linkedTabs.map((tab) => ({
        id: tab.id,
        title: tab.title,
        offsetPixels: offsets[tab.id]?.pixels || 0,
        isCurrent: tab.id === status.currentTabId,
      }));

      setSyncedTabs(tabs);
    } catch (error) {
      await logger.error('Failed to load synced tabs with offsets:', error);
      setSyncedTabs([]);
    }
  }, []);

  // Load synced tabs when popover opens
  React.useEffect(() => {
    if (isOpen) {
      loadSyncedTabsWithOffsets();
    }
  }, [isOpen, loadSyncedTabsWithOffsets]);

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
      // Start tracking when Ctrl key is pressed
      if (e.key === 'Control') {
        ctrlOnlyRef.current = true;
        return;
      }

      // Mark as combination key if any other key is pressed while Ctrl is held
      if (e.ctrlKey && ctrlOnlyRef.current) {
        ctrlOnlyRef.current = false;
      }

      // Close with Escape
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // Toggle only when Ctrl is released and it was pressed alone
      if (e.key === 'Control' && ctrlOnlyRef.current) {
        ctrlOnlyRef.current = false;
        setIsOpen((prev) => !prev);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [isOpen]);

  React.useEffect(() => {
    const unsubscribe = onMessage('panel:position', async (message) => {
      const currentTab = await browser.tabs.getCurrent();
      const data = message.data;

      // Only update position if message is from a different tab
      if (currentTab?.id && data && typeof data === 'object' && 'sourceTabId' in data) {
        const { x, y, sourceTabId } = data as { x: number; y: number; sourceTabId: number };
        if (sourceTabId !== currentTab.id) {
          setPosition({ x, y });
        }
      }
    });

    return unsubscribe;
  }, []);

  // Fetch detailed auto-sync status from background
  const fetchAutoSyncDetailedStatus = React.useCallback(async () => {
    try {
      const response = (await sendMessage('auto-sync:get-detailed-status', {}, 'background')) as {
        success: boolean;
        enabled: boolean;
        currentTabGroup?: { tabCount: number; isActive: boolean };
      };

      if (response?.success && response.currentTabGroup) {
        setIsAutoSyncActive(response.currentTabGroup.isActive);
        // Show count of OTHER tabs (exclude current tab)
        setAutoSyncGroupCount(Math.max(0, response.currentTabGroup.tabCount - 1));
      } else {
        setIsAutoSyncActive(false);
        setAutoSyncGroupCount(0);
      }
    } catch {
      // Fallback to local status check
      const status = getAutoSyncStatus();
      setIsAutoSyncActive(status.isAutoSync && status.isActive);
      setAutoSyncGroupCount(0);
    }
  }, []);

  // Load auto-sync state and set up message listeners
  React.useEffect(() => {
    // Load initial auto-sync enabled state
    loadAutoSyncEnabled().then(setAutoSyncEnabled);

    // Check current auto-sync status
    fetchAutoSyncDetailedStatus();

    // Listen for auto-sync status changes
    const unsubscribeStatusChanged = onMessage('auto-sync:status-changed', (message) => {
      const data = message.data as { enabled: boolean };
      setAutoSyncEnabled(data.enabled);
      // Refetch detailed status when toggle changes
      fetchAutoSyncDetailedStatus();
    });

    // Listen for auto-sync group updates
    const unsubscribeGroupUpdated = onMessage('auto-sync:group-updated', () => {
      // Re-check auto-sync status when groups change
      fetchAutoSyncDetailedStatus();
    });

    return () => {
      unsubscribeStatusChanged();
      unsubscribeGroupUpdated();
    };
  }, [fetchAutoSyncDetailedStatus]);

  // Handle auto-sync toggle
  const handleAutoSyncToggle = React.useCallback(async (enabled: boolean) => {
    try {
      // Save to storage
      await saveAutoSyncEnabled(enabled);
      setAutoSyncEnabled(enabled);

      // Notify background script
      await sendMessage('auto-sync:status-changed', { enabled }, 'background');
    } catch (error) {
      await logger.error('Failed to toggle auto-sync:', error);
    }
  }, []);

  // Calculate popover side based on button position
  const popoverSide = position.x < window.innerWidth / 2 ? 'right' : 'left';

  return (
    <div ref={containerRef} className={className}>
      <Popover modal={false} open={isOpen} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            ref={toolbarRef}
            aria-label={t('openSyncControlPanel')}
            className={cn(
              'fixed pointer-events-auto z-[2147483647]',
              'rounded-full shadow-lg backdrop-blur-md p-0',
              systemTheme === 'dark'
                ? 'bg-white/90 hover:bg-white text-black'
                : 'bg-black/80 hover:bg-black/90 text-white',
              systemTheme === 'dark' ? 'border border-black/20' : 'border border-white/20',
              isDragging && 'cursor-grabbing',
              !isDragging &&
                !isOpen &&
                !prefersReducedMotion() &&
                'hover:scale-110 hover:shadow-xl',
              isOpen && 'cursor-default',
              'group relative flex items-center justify-center',
            )}
            style={{
              position: 'fixed',
              left: `${position.x}px`,
              top: `${position.y}px`,
              width: `${BUTTON_SIZE}px`,
              height: `${BUTTON_SIZE}px`,
              minWidth: `${BUTTON_SIZE}px`,
              minHeight: `${BUTTON_SIZE}px`,
              transform:
                isDragging && !prefersReducedMotion()
                  ? `translate(${dragTransform.x - position.x}px, ${dragTransform.y - position.y}px)`
                  : 'scale(1)',
              transition:
                isDragging || prefersReducedMotion()
                  ? 'none'
                  : `all ${PANEL_ANIMATIONS.edgeSnap.duration}ms ${PANEL_ANIMATIONS.edgeSnap.easing}`,
              willChange: isDragging && !prefersReducedMotion() ? 'transform' : 'auto',
              userSelect: 'none',
            }}
            tabIndex={-1}
            type="button"
            onMouseDown={handleMouseDown}
          >
            <IconMenu className="h-4 w-4" />

            {/* Status indicator */}
            <div className="absolute -bottom-0.5 -right-0.5 pointer-events-none">
              <div
                aria-label={
                  !isConnectionHealthy
                    ? t('connectionLost')
                    : urlSyncEnabled
                      ? t('syncActive')
                      : t('syncInactive')
                }
                className={cn(
                  'h-3 w-3 rounded-full',
                  'border-2',
                  systemTheme === 'dark' ? 'border-white' : 'border-black',
                  'transition-colors duration-200',
                  !isConnectionHealthy && 'bg-amber-500 animate-pulse',
                  isConnectionHealthy && urlSyncEnabled && 'bg-blue-500',
                  isConnectionHealthy && !urlSyncEnabled && 'bg-gray-400',
                )}
                role="status"
              />
            </div>

            {/* Keyboard shortcut tooltip */}
            {!isDragging && !isOpen && (
              <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap">
                <div
                  className={cn(
                    'px-2 py-1 rounded text-xs backdrop-blur-sm flex items-center gap-1',
                    systemTheme === 'dark' ? 'bg-white/90 text-black' : 'bg-black/90 text-white',
                  )}
                >
                  <Kbd
                    className={cn(
                      'text-xs px-1',
                      systemTheme === 'dark' ? 'bg-black/20 text-black' : 'bg-white/20 text-white',
                    )}
                  >
                    ⌃
                  </Kbd>
                </div>
              </div>
            )}
          </Button>
        </PopoverTrigger>

        <AnimatePresence>
          {isOpen && (
            <CustomPopoverContent container={containerRef.current} side={popoverSide}>
              <div className="p-4 space-y-4">
                {/* Header */}
                <div className="text-sm font-medium border-b border-border/70 pb-2">
                  {t('scrollSyncToolbar')}
                </div>

                {/* Connection lost warning */}
                {!isConnectionHealthy && onReconnect && (
                  <div className="flex items-center justify-between gap-3 py-2 px-3 bg-amber-500/10 rounded-md border border-amber-500/30">
                    <span className="text-sm text-amber-600 dark:text-amber-400">
                      {t('connectionLost')}
                    </span>
                    <Button size="sm" variant="outline" onClick={onReconnect}>
                      {t('reconnect')}
                    </Button>
                  </div>
                )}

                {/* URL Sync Navigation toggle */}
                <div className="flex items-center justify-between gap-3 py-2">
                  <div className="flex items-center gap-2">
                    <IconSettings2 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{t('urlSyncNavigation')}</span>
                  </div>
                  <Switch checked={urlSyncEnabled} onCheckedChange={onToggle} />
                </div>

                {/* Auto-sync same URL toggle */}
                <div className="flex items-center justify-between gap-3 py-2">
                  <div className="flex items-center gap-2">
                    <IconSettings2 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{t('autoSyncSameUrl')}</span>
                    {isAutoSyncActive && autoSyncGroupCount > 0 && (
                      <Badge className="text-xs px-1.5 py-0" variant="secondary">
                        {t('autoSyncingWithTabs', [String(autoSyncGroupCount)])}
                      </Badge>
                    )}
                  </div>
                  <Switch checked={autoSyncEnabled} onCheckedChange={handleAutoSyncToggle} />
                </div>

                {/* Synced Tabs list with offsets */}
                {syncedTabs.length > 0 && (
                  <div className="space-y-2 border-t border-border/70 pt-3">
                    <div className="text-xs text-muted-foreground">{t('syncedTabs')}</div>
                    {syncedTabs.map((tab) => (
                      <div key={tab.id} className="flex items-center justify-between text-sm">
                        <span
                          className={cn('truncate max-w-[200px]', tab.isCurrent && 'font-medium')}
                        >
                          {tab.title}
                          {tab.isCurrent && ` (${t('current')})`}
                        </span>
                        <span
                          className={cn(
                            'text-xs font-mono',
                            tab.offsetPixels > 0 && 'text-green-500',
                            tab.offsetPixels < 0 && 'text-red-500',
                            tab.offsetPixels === 0 && 'text-muted-foreground',
                          )}
                        >
                          {tab.offsetPixels >= 0
                            ? `+${tab.offsetPixels}px`
                            : `${tab.offsetPixels}px`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Keyboard Shortcuts Footer */}
                <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground border-t border-border/70 pt-2">
                  <div className="flex items-center gap-1.5">
                    <span>{t('toggleShortcut')}</span>
                    <Kbd className="text-xs">⌃</Kbd>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span>{t('closeShortcut')}</span>
                    <Kbd className="text-xs">Esc</Kbd>
                  </div>
                </div>
              </div>
            </CustomPopoverContent>
          )}
        </AnimatePresence>
      </Popover>
    </div>
  );
};
