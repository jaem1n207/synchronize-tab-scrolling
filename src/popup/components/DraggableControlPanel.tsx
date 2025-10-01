import { useState, useCallback, useRef, useEffect } from 'react';

import { Minimize2, Maximize2, GripVertical } from 'lucide-react';

import { Button } from '~/shared/components/ui/button';
import {
  PANEL_ANIMATIONS,
  getTransitionStyle,
  prefersReducedMotion,
} from '~/shared/lib/animations';
import { cn } from '~/shared/lib/utils';

import type { PanelPosition } from '../types';

interface DraggableControlPanelProps {
  isMinimized: boolean;
  onToggleMinimize: () => void;
  children: React.ReactNode;
}

const MINIMIZED_SIZE = 30;
const SNAP_THRESHOLD = 100;

export function DraggableControlPanel({
  isMinimized,
  onToggleMinimize,
  children,
}: DraggableControlPanelProps) {
  const [position, setPosition] = useState<PanelPosition>({
    x: 0,
    y: 0,
    snapped: false,
  });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest('button')) {
        return;
      }

      e.preventDefault();
      setIsDragging(true);
      dragStartRef.current = {
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      };
    },
    [position],
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !panelRef.current) return;

      const newX = e.clientX - dragStartRef.current.x;
      const newY = e.clientY - dragStartRef.current.y;

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const panelWidth = panelRef.current.offsetWidth;
      const panelHeight = panelRef.current.offsetHeight;

      const clampedX = Math.max(0, Math.min(newX, viewportWidth - panelWidth));
      const clampedY = Math.max(0, Math.min(newY, viewportHeight - panelHeight));

      setPosition({
        x: clampedX,
        y: clampedY,
        snapped: false,
      });
    },
    [isDragging],
  );

  const handleMouseUp = useCallback(() => {
    if (!isDragging || !panelRef.current) return;

    setIsDragging(false);

    const viewportWidth = window.innerWidth;
    const panelWidth = panelRef.current.offsetWidth;

    let finalX = position.x;
    let snapped = false;

    if (position.x < SNAP_THRESHOLD) {
      finalX = 0;
      snapped = true;
    } else if (position.x > viewportWidth - panelWidth - SNAP_THRESHOLD) {
      finalX = viewportWidth - panelWidth;
      snapped = true;
    }

    if (snapped) {
      setPosition((prev) => ({
        ...prev,
        x: finalX,
        snapped: true,
      }));
    }
  }, [isDragging, position.x]);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const reducedMotion = prefersReducedMotion();

  const panelStyle: React.CSSProperties = {
    transform: `translate(${position.x}px, ${position.y}px)`,
    transition: isDragging
      ? 'none'
      : position.snapped
        ? getTransitionStyle(
            ['transform'],
            PANEL_ANIMATIONS.edgeSnap.duration,
            PANEL_ANIMATIONS.edgeSnap.easing,
          )
        : 'none',
    width: isMinimized ? `${MINIMIZED_SIZE}px` : '320px',
    height: isMinimized ? `${MINIMIZED_SIZE}px` : 'auto',
    opacity: reducedMotion ? 1 : undefined,
  };

  const contentStyle: React.CSSProperties = reducedMotion
    ? {}
    : {
        transition: getTransitionStyle(
          ['opacity', 'transform'],
          PANEL_ANIMATIONS.minimize.duration,
          PANEL_ANIMATIONS.minimize.easing,
        ),
        opacity: isMinimized ? 0 : 1,
        transform: isMinimized ? 'scale(0.95)' : 'scale(1)',
      };

  return (
    <div
      ref={panelRef}
      aria-label="Scroll synchronization control panel"
      className={cn(
        'fixed top-4 left-4 bg-background border rounded-lg shadow-lg',
        'will-change-transform',
        isDragging && 'cursor-grabbing select-none',
      )}
      role="region"
      style={panelStyle}
    >
      <div
        aria-label="Drag to reposition panel"
        className={cn(
          'flex items-center justify-between gap-2 p-3 border-b',
          'cursor-grab active:cursor-grabbing',
          isMinimized && 'border-0 p-0',
        )}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
          }
        }}
        onMouseDown={handleMouseDown}
      >
        {!isMinimized && (
          <>
            <div className="flex items-center gap-2">
              <GripVertical aria-hidden="true" className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Sync Control</h2>
            </div>
            <Button
              aria-expanded={!isMinimized}
              aria-label="Minimize panel"
              className="h-8 w-8"
              size="icon"
              variant="ghost"
              onClick={onToggleMinimize}
            >
              <Minimize2 aria-hidden="true" className="w-4 h-4" />
            </Button>
          </>
        )}
        {isMinimized && (
          <Button
            aria-expanded={!isMinimized}
            aria-label="Maximize panel"
            className="h-[30px] w-[30px] p-0"
            size="icon"
            variant="ghost"
            onClick={onToggleMinimize}
          >
            <Maximize2 aria-hidden="true" className="w-4 h-4" />
          </Button>
        )}
      </div>

      {!isMinimized && (
        <div className="p-4 space-y-3 overflow-y-auto max-h-[600px]" style={contentStyle}>
          {children}
        </div>
      )}
    </div>
  );
}
