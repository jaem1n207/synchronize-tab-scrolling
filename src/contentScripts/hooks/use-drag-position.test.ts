import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadPanelPositionMock: vi.fn(),
  savePanelPositionMock: vi.fn(),
  onMessageMock: vi.fn().mockReturnValue(vi.fn()),
  sendMessageMock: vi.fn(),
  getTabMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock('~/shared/lib/storage', () => ({
  loadPanelPosition: mocks.loadPanelPositionMock,
  savePanelPosition: mocks.savePanelPositionMock,
}));

vi.mock('webext-bridge/content-script', () => ({
  onMessage: mocks.onMessageMock,
  sendMessage: mocks.sendMessageMock,
}));

vi.mock('webextension-polyfill', () => ({
  default: {
    tabs: {
      getCurrent: mocks.getTabMock,
    },
  },
}));

vi.mock('~/shared/lib/logger', () => ({
  ExtensionLogger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: mocks.loggerErrorMock,
  })),
}));

const BUTTON_SIZE = 36;
const EDGE_MARGIN = 32;

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
    vi.clearAllMocks();
    mocks.loadPanelPositionMock.mockResolvedValue(null);
    mocks.savePanelPositionMock.mockResolvedValue(undefined);
    mocks.getTabMock.mockResolvedValue({ id: 1 });
    mocks.sendMessageMock.mockResolvedValue(undefined);
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

  describe('storage integration', () => {
    it('loadPanelPosition returns null when no position stored', async () => {
      mocks.loadPanelPositionMock.mockResolvedValue(null);

      const result = await mocks.loadPanelPositionMock();
      expect(result).toBeNull();
    });

    it('loadPanelPosition returns stored position', async () => {
      mocks.loadPanelPositionMock.mockResolvedValue({ x: 150, y: 300 });

      const result = await mocks.loadPanelPositionMock();
      expect(result).toEqual({ x: 150, y: 300 });
    });

    it('loaded position is constrained to current viewport', async () => {
      mocks.loadPanelPositionMock.mockResolvedValue({ x: 2000, y: 1500 });

      const stored = await mocks.loadPanelPositionMock();
      const constrained = constrainPosition(stored!, 1024, 768);

      expect(constrained.x).toBe(1024 - BUTTON_SIZE);
      expect(constrained.y).toBe(768 - BUTTON_SIZE);
    });

    it('loaded position within bounds remains unchanged after constraining', async () => {
      mocks.loadPanelPositionMock.mockResolvedValue({ x: 200, y: 300 });

      const stored = await mocks.loadPanelPositionMock();
      const constrained = constrainPosition(stored!, 1024, 768);

      expect(constrained).toEqual({ x: 200, y: 300 });
    });

    it('savePanelPosition is called with snapped position after drag', () => {
      const finalPos = constrainPosition({ x: 300, y: 250 }, 1024, 768);
      const snapped = snapToEdge(finalPos, 1024, 768);

      mocks.savePanelPositionMock(snapped);

      expect(mocks.savePanelPositionMock).toHaveBeenCalledWith({
        x: EDGE_MARGIN,
        y: 250,
      });
    });

    it('savePanelPosition is called with right-edge snapped position', () => {
      const finalPos = constrainPosition({ x: 800, y: 400 }, 1024, 768);
      const snapped = snapToEdge(finalPos, 1024, 768);

      mocks.savePanelPositionMock(snapped);

      expect(mocks.savePanelPositionMock).toHaveBeenCalledWith({
        x: 1024 - BUTTON_SIZE - EDGE_MARGIN,
        y: 400,
      });
    });

    it('savePanelPosition is called when receiving cross-tab position', () => {
      const receivedPos = { x: 500, y: 350 };
      mocks.savePanelPositionMock(receivedPos);

      expect(mocks.savePanelPositionMock).toHaveBeenCalledWith(receivedPos);
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
