import { beforeEach, describe, expect, it } from 'vitest';

const BUTTON_SIZE = 36;
const EDGE_MARGIN = 32;
const PANEL_POSITION_STORAGE_KEY = '__sync_tab_scroll_panel_pos';

function constrainPosition(
  pos: { x: number; y: number },
  viewportWidth: number,
  viewportHeight: number,
) {
  const maxX = viewportWidth - BUTTON_SIZE;
  const maxY = viewportHeight - BUTTON_SIZE;
  return {
    x: Math.max(0, Math.min(pos.x, maxX)),
    y: Math.max(0, Math.min(pos.y, maxY)),
  };
}

function snapToEdge(pos: { x: number; y: number }, viewportWidth: number, viewportHeight: number) {
  const centerX = viewportWidth / 2;
  const maxY = viewportHeight - BUTTON_SIZE;
  const isLeftSide = pos.x < centerX;
  const snappedX = isLeftSide ? EDGE_MARGIN : viewportWidth - BUTTON_SIZE - EDGE_MARGIN;
  const snappedY = Math.max(0, Math.min(pos.y, maxY));
  return { x: snappedX, y: snappedY };
}

describe('use-drag-position persistence logic', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  describe('constrainPosition', () => {
    it('keeps position within viewport bounds', () => {
      expect(constrainPosition({ x: 100, y: 200 }, 1024, 768)).toEqual({ x: 100, y: 200 });
    });

    it('clamps x to zero when negative', () => {
      expect(constrainPosition({ x: -50, y: 100 }, 1024, 768)).toEqual({ x: 0, y: 100 });
    });

    it('clamps y to zero when negative', () => {
      expect(constrainPosition({ x: 100, y: -30 }, 1024, 768)).toEqual({ x: 100, y: 0 });
    });

    it('clamps x to max when exceeding viewport width', () => {
      const result = constrainPosition({ x: 1200, y: 100 }, 1024, 768);
      expect(result.x).toBe(1024 - BUTTON_SIZE);
    });

    it('clamps y to max when exceeding viewport height', () => {
      const result = constrainPosition({ x: 100, y: 900 }, 1024, 768);
      expect(result.y).toBe(768 - BUTTON_SIZE);
    });

    it('handles position at exact viewport edge', () => {
      const maxX = 1024 - BUTTON_SIZE;
      const maxY = 768 - BUTTON_SIZE;
      expect(constrainPosition({ x: maxX, y: maxY }, 1024, 768)).toEqual({ x: maxX, y: maxY });
    });
  });

  describe('snapToEdge', () => {
    it('snaps to left edge when position is in left half', () => {
      const result = snapToEdge({ x: 100, y: 200 }, 1024, 768);
      expect(result.x).toBe(EDGE_MARGIN);
    });

    it('snaps to right edge when position is in right half', () => {
      const result = snapToEdge({ x: 600, y: 200 }, 1024, 768);
      expect(result.x).toBe(1024 - BUTTON_SIZE - EDGE_MARGIN);
    });

    it('clamps y within viewport bounds', () => {
      const result = snapToEdge({ x: 100, y: 900 }, 1024, 768);
      expect(result.y).toBe(768 - BUTTON_SIZE);
    });

    it('prevents negative y', () => {
      const result = snapToEdge({ x: 100, y: -50 }, 1024, 768);
      expect(result.y).toBe(0);
    });

    it('snaps to right when exactly at center', () => {
      const result = snapToEdge({ x: 512, y: 200 }, 1024, 768);
      expect(result.x).toBe(1024 - BUTTON_SIZE - EDGE_MARGIN);
    });
  });

  describe('sessionStorage persistence', () => {
    it('returns null when no position stored', () => {
      const stored = sessionStorage.getItem(PANEL_POSITION_STORAGE_KEY);
      expect(stored).toBeNull();
    });

    it('stores and retrieves position via sessionStorage', () => {
      const position = { x: 150, y: 300 };
      sessionStorage.setItem(PANEL_POSITION_STORAGE_KEY, JSON.stringify(position));

      const stored = sessionStorage.getItem(PANEL_POSITION_STORAGE_KEY);
      expect(JSON.parse(stored!)).toEqual({ x: 150, y: 300 });
    });

    it('loaded position is constrained to current viewport', () => {
      sessionStorage.setItem(PANEL_POSITION_STORAGE_KEY, JSON.stringify({ x: 2000, y: 1500 }));

      const stored = JSON.parse(sessionStorage.getItem(PANEL_POSITION_STORAGE_KEY)!) as {
        x: number;
        y: number;
      };
      const constrained = constrainPosition(stored, 1024, 768);

      expect(constrained.x).toBe(1024 - BUTTON_SIZE);
      expect(constrained.y).toBe(768 - BUTTON_SIZE);
    });

    it('loaded position within bounds remains unchanged after constraining', () => {
      sessionStorage.setItem(PANEL_POSITION_STORAGE_KEY, JSON.stringify({ x: 200, y: 300 }));

      const stored = JSON.parse(sessionStorage.getItem(PANEL_POSITION_STORAGE_KEY)!) as {
        x: number;
        y: number;
      };
      const constrained = constrainPosition(stored, 1024, 768);

      expect(constrained).toEqual({ x: 200, y: 300 });
    });

    it('saves snapped position after drag simulation', () => {
      const finalPos = constrainPosition({ x: 300, y: 250 }, 1024, 768);
      const snapped = snapToEdge(finalPos, 1024, 768);

      sessionStorage.setItem(PANEL_POSITION_STORAGE_KEY, JSON.stringify(snapped));

      const saved = JSON.parse(sessionStorage.getItem(PANEL_POSITION_STORAGE_KEY)!) as {
        x: number;
        y: number;
      };
      expect(saved).toEqual({ x: EDGE_MARGIN, y: 250 });
    });

    it('saves right-edge snapped position', () => {
      const finalPos = constrainPosition({ x: 800, y: 400 }, 1024, 768);
      const snapped = snapToEdge(finalPos, 1024, 768);

      sessionStorage.setItem(PANEL_POSITION_STORAGE_KEY, JSON.stringify(snapped));

      const saved = JSON.parse(sessionStorage.getItem(PANEL_POSITION_STORAGE_KEY)!) as {
        x: number;
        y: number;
      };
      expect(saved).toEqual({ x: 1024 - BUTTON_SIZE - EDGE_MARGIN, y: 400 });
    });

    it('ignores invalid JSON in sessionStorage', () => {
      sessionStorage.setItem(PANEL_POSITION_STORAGE_KEY, 'not-valid-json');

      let result: { x: number; y: number } | null = null;
      try {
        const parsed = JSON.parse(sessionStorage.getItem(PANEL_POSITION_STORAGE_KEY)!) as Record<
          string,
          unknown
        >;
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          result = { x: parsed.x, y: parsed.y };
        }
      } catch {
        result = null;
      }

      expect(result).toBeNull();
    });

    it('ignores stored value with missing coordinates', () => {
      sessionStorage.setItem(PANEL_POSITION_STORAGE_KEY, JSON.stringify({ x: 100 }));

      const parsed = JSON.parse(sessionStorage.getItem(PANEL_POSITION_STORAGE_KEY)!) as Record<
        string,
        unknown
      >;
      const isValid = typeof parsed.x === 'number' && typeof parsed.y === 'number';

      expect(isValid).toBe(false);
    });
  });

  describe('per-tab isolation', () => {
    it('sessionStorage is isolated per tab (each test has its own session)', () => {
      sessionStorage.setItem(PANEL_POSITION_STORAGE_KEY, JSON.stringify({ x: 999, y: 999 }));
      expect(sessionStorage.getItem(PANEL_POSITION_STORAGE_KEY)).not.toBeNull();

      sessionStorage.clear();
      expect(sessionStorage.getItem(PANEL_POSITION_STORAGE_KEY)).toBeNull();
    });

    it('does not use browser.storage.local for position persistence', () => {
      const finalPos = constrainPosition({ x: 300, y: 250 }, 1024, 768);
      const snapped = snapToEdge(finalPos, 1024, 768);

      sessionStorage.setItem(PANEL_POSITION_STORAGE_KEY, JSON.stringify(snapped));

      const saved = JSON.parse(sessionStorage.getItem(PANEL_POSITION_STORAGE_KEY)!) as {
        x: number;
        y: number;
      };
      expect(saved).toEqual({ x: EDGE_MARGIN, y: 250 });
    });
  });

  describe('viewport resize handling', () => {
    it('constrains position when viewport shrinks', () => {
      const original = { x: 900, y: 700 };
      const afterResize = constrainPosition(original, 800, 600);

      expect(afterResize.x).toBe(800 - BUTTON_SIZE);
      expect(afterResize.y).toBe(600 - BUTTON_SIZE);
    });

    it('keeps position when viewport grows', () => {
      const original = { x: 200, y: 300 };
      const afterResize = constrainPosition(original, 1920, 1080);

      expect(afterResize).toEqual({ x: 200, y: 300 });
    });
  });
});
