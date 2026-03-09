import * as React from 'react';

import * as PopoverPrimitive from '@radix-ui/react-popover';
import { AnimatePresence, motion } from 'motion/react';

import { Badge } from '~/shared/components/ui/badge';
import { Button } from '~/shared/components/ui/button';
import { Kbd } from '~/shared/components/ui/kbd';
import { Popover, PopoverTrigger } from '~/shared/components/ui/popover';
import { Switch } from '~/shared/components/ui/switch';
import { useModifierKey } from '~/shared/hooks/use-modifier-key';
import { useSystemTheme } from '~/shared/hooks/use-system-theme';
import { t } from '~/shared/i18n';
import {
  ANIMATION_DURATIONS,
  EASING_FUNCTIONS,
  getMotionTransition,
  PANEL_ANIMATIONS,
  prefersReducedMotion,
} from '~/shared/lib/animations';
import { cn } from '~/shared/lib/utils';

import { useDragPosition } from '../hooks/use-drag-position';
import { usePanelState } from '../hooks/use-panel-state';

import IconMenu from '~icons/lucide/menu';
import IconSettings2 from '~icons/lucide/settings-2';

interface SyncControlPanelProps {
  urlSyncEnabled: boolean;
  onToggle: () => void;
  isConnectionHealthy?: boolean;
  onReconnect?: () => void;
  className?: string;
}

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
  const containerRef = React.useRef<HTMLDivElement>(null);

  const {
    BUTTON_SIZE,
    position,
    isDragging,
    dragTransform,
    toolbarRef,
    wasDraggedRef,
    handleMouseDown,
  } = useDragPosition();

  const {
    isOpen,
    syncedTabs,
    autoSyncEnabled,
    isAutoSyncActive,
    autoSyncGroupCount,
    handleOpenChange,
    handleAutoSyncToggle,
  } = usePanelState({ wasDraggedRef });

  const systemTheme = useSystemTheme();
  const { controlKey } = useModifierKey();

  const handleTriggerMouseDown = React.useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (isOpen) {
        return;
      }
      handleMouseDown(e);
    },
    [isOpen, handleMouseDown],
  );

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
            onMouseDown={handleTriggerMouseDown}
          >
            <IconMenu className="h-4 w-4" />

            {/* Status indicator */}
            <div className="absolute -bottom-0.5 -right-0.5 pointer-events-none">
              <div
                className={cn(
                  'h-3 w-3 rounded-full',
                  'border-2',
                  systemTheme === 'dark' ? 'border-white' : 'border-black',
                  'transition-colors duration-200',
                  !isConnectionHealthy && 'bg-amber-500 animate-pulse',
                  isConnectionHealthy && urlSyncEnabled && 'bg-blue-500',
                  isConnectionHealthy && !urlSyncEnabled && 'bg-gray-400',
                )}
                title={
                  !isConnectionHealthy
                    ? t('connectionLost')
                    : urlSyncEnabled
                      ? t('syncActive')
                      : t('syncInactive')
                }
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
                    {controlKey}
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
                    <Kbd className="text-xs">{controlKey}</Kbd>
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
