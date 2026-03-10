import * as React from 'react';

interface Position {
  x: number;
  y: number;
}

interface UseDragPositionReturn {
  BUTTON_SIZE: number;
  EDGE_MARGIN: number;
  position: Position;
  isDragging: boolean;
  dragTransform: Position;
  dragStartPos: Position;
  toolbarRef: React.RefObject<HTMLButtonElement | null>;
  wasDraggedRef: React.RefObject<boolean>;
  dragOffsetRef: React.RefObject<Position>;
  rafIdRef: React.RefObject<number | null>;
  handleMouseDown: (e: React.MouseEvent<HTMLButtonElement>) => void;
  handleMouseMove: (e: MouseEvent) => void;
  handleMouseUp: (e: MouseEvent) => void;
}

const BUTTON_SIZE = 36;
const EDGE_MARGIN = 32;

const PANEL_POSITION_STORAGE_KEY = '__sync_tab_scroll_panel_pos';

function savePositionToSession(position: Position): void {
  try {
    sessionStorage.setItem(PANEL_POSITION_STORAGE_KEY, JSON.stringify(position));
  } catch {
    // Gracefully handle unavailable sessionStorage (e.g. restrictive page policies)
  }
}

function loadPositionFromSession(): Position | null {
  try {
    const stored = sessionStorage.getItem(PANEL_POSITION_STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as Record<string, unknown>;
    if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
      return { x: parsed.x, y: parsed.y };
    }
    return null;
  } catch {
    return null;
  }
}

export const useDragPosition = (): UseDragPositionReturn => {
  const [position, setPosition] = React.useState<Position>(() => {
    const stored = loadPositionFromSession();
    if (stored) {
      return {
        x: Math.max(0, Math.min(stored.x, window.innerWidth - BUTTON_SIZE)),
        y: Math.max(0, Math.min(stored.y, window.innerHeight - BUTTON_SIZE)),
      };
    }
    return { x: EDGE_MARGIN, y: EDGE_MARGIN };
  });
  const [isDragging, setIsDragging] = React.useState(false);
  const [dragTransform, setDragTransform] = React.useState<Position>({ x: 0, y: 0 });
  const [dragStartPos, setDragStartPos] = React.useState<Position>({ x: 0, y: 0 });

  const toolbarRef = React.useRef<HTMLButtonElement>(null);
  const wasDraggedRef = React.useRef<boolean>(false);
  const dragOffsetRef = React.useRef<Position>({ x: 0, y: 0 });
  const rafIdRef = React.useRef<number | null>(null);

  const snapToEdge = React.useCallback((pos: Position): Position => {
    const centerX = window.innerWidth / 2;
    const maxY = window.innerHeight - BUTTON_SIZE;

    const isLeftSide = pos.x < centerX;
    const snappedX = isLeftSide ? EDGE_MARGIN : window.innerWidth - BUTTON_SIZE - EDGE_MARGIN;
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

      e.preventDefault();
      e.stopPropagation();

      setDragStartPos({ x: e.clientX, y: e.clientY });
      dragOffsetRef.current = {
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      };
      setDragTransform(position);
      setIsDragging(true);
    },
    [position],
  );

  const handleMouseMove = React.useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;

      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }

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
    (e: MouseEvent) => {
      if (!isDragging) return;

      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }

      const dragDistance = Math.sqrt(
        Math.pow(e.clientX - dragStartPos.x, 2) + Math.pow(e.clientY - dragStartPos.y, 2),
      );

      if (dragDistance > 5) {
        const finalPosition = constrainPosition({
          x: e.clientX - dragOffsetRef.current.x,
          y: e.clientY - dragOffsetRef.current.y,
        });
        const snappedPosition = snapToEdge(finalPosition);

        setPosition(snappedPosition);
        setDragTransform(snappedPosition);
        savePositionToSession(snappedPosition);

        wasDraggedRef.current = true;
        setTimeout(() => {
          wasDraggedRef.current = false;
        }, 50);
      }

      setIsDragging(false);
    },
    [isDragging, constrainPosition, snapToEdge, dragStartPos],
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

  return {
    BUTTON_SIZE,
    EDGE_MARGIN,
    position,
    isDragging,
    dragTransform,
    dragStartPos,
    toolbarRef,
    wasDraggedRef,
    dragOffsetRef,
    rafIdRef,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
  };
};
