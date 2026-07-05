import { describe, expect, it } from 'vitest';

import {
  calculateAnchoredLogicalRatio,
  calculateAnchoredScrollTop,
  calculatePixelDeltaLogicalRatio,
  calculatePixelDeltaScrollTop,
  calculateScrollRatio,
  clampScrollOffset,
  clampScrollPosition,
  findNearestIndex,
} from './scroll-math';

describe('calculateScrollRatio', () => {
  it('should calculate correct ratio for normal case', () => {
    const ratio = calculateScrollRatio(500, 2000, 800);
    expect(ratio).toBe(500 / 1200);
  });

  it('should return 0 when at top', () => {
    expect(calculateScrollRatio(0, 2000, 800)).toBe(0);
  });

  it('should return 1 when at bottom', () => {
    const maxScroll = 2000 - 800;
    expect(calculateScrollRatio(maxScroll, 2000, 800)).toBe(1);
  });

  it('should return 0 when no scrollable area exists', () => {
    expect(calculateScrollRatio(0, 800, 800)).toBe(0);
    expect(calculateScrollRatio(0, 600, 800)).toBe(0);
  });

  it('should handle zero clientHeight', () => {
    expect(calculateScrollRatio(500, 2000, 0)).toBe(0.25);
  });

  it('should handle various scroll positions', () => {
    expect(calculateScrollRatio(250, 2000, 800)).toBe(250 / 1200);
    expect(calculateScrollRatio(1000, 2000, 800)).toBe(1000 / 1200);
  });
});

describe('clampScrollOffset', () => {
  it('should not clamp offset within range', () => {
    expect(clampScrollOffset(0.3, 0.5)).toBe(0.3);
    expect(clampScrollOffset(-0.2, 0.5)).toBe(-0.2);
  });

  it('should clamp positive offset exceeding max', () => {
    expect(clampScrollOffset(0.7, 0.5)).toBe(0.5);
    expect(clampScrollOffset(1.0, 0.5)).toBe(0.5);
  });

  it('should clamp negative offset exceeding max', () => {
    expect(clampScrollOffset(-0.7, 0.5)).toBe(-0.5);
    expect(clampScrollOffset(-1.0, 0.5)).toBe(-0.5);
  });

  it('should use custom maxOffset parameter', () => {
    expect(clampScrollOffset(0.3, 0.2)).toBe(0.2);
    expect(clampScrollOffset(-0.3, 0.2)).toBe(-0.2);
    expect(clampScrollOffset(0.15, 0.2)).toBe(0.15);
  });

  it('should handle zero offset', () => {
    expect(clampScrollOffset(0, 0.5)).toBe(0);
    expect(clampScrollOffset(0, 0.2)).toBe(0);
  });

  it('should use default maxOffset of 0.5', () => {
    expect(clampScrollOffset(0.6)).toBe(0.5);
    expect(clampScrollOffset(-0.6)).toBe(-0.5);
    expect(clampScrollOffset(0.3)).toBe(0.3);
  });
});

describe('clampScrollPosition', () => {
  it('should not clamp position within range', () => {
    expect(clampScrollPosition(500, 2000)).toBe(500);
    expect(clampScrollPosition(0, 2000)).toBe(0);
    expect(clampScrollPosition(2000, 2000)).toBe(2000);
  });

  it('should clamp negative position to 0', () => {
    expect(clampScrollPosition(-100, 2000)).toBe(0);
    expect(clampScrollPosition(-1, 2000)).toBe(0);
  });

  it('should clamp position exceeding maxScroll', () => {
    expect(clampScrollPosition(2500, 2000)).toBe(2000);
    expect(clampScrollPosition(3000, 2000)).toBe(2000);
  });

  it('should handle zero maxScroll', () => {
    expect(clampScrollPosition(100, 0)).toBe(0);
    expect(clampScrollPosition(0, 0)).toBe(0);
    expect(clampScrollPosition(-100, 0)).toBe(0);
  });

  it('should handle various positions', () => {
    expect(clampScrollPosition(1000, 2000)).toBe(1000);
    expect(clampScrollPosition(1500, 2000)).toBe(1500);
  });
});

describe('calculateAnchoredScrollTop', () => {
  it('maps logical progress below the anchor into the local pre-anchor segment', () => {
    expect(
      calculateAnchoredScrollTop(0.15, 1200, {
        logicalRatio: 0.3,
        localScrollTop: 600,
      }),
    ).toEqual({ scrollTop: 300, wasClamped: false });
  });

  it('maps logical progress above the anchor into the local post-anchor segment', () => {
    expect(
      calculateAnchoredScrollTop(0.65, 1400, {
        logicalRatio: 0.3,
        localScrollTop: 700,
      }),
    ).toEqual({ scrollTop: 1050, wasClamped: false });
  });

  it('keeps equal post-anchor pixel deltas when remaining local lengths match', () => {
    const sourceDeltaFromAnchor = 42;
    const sourceMaxScroll = 1000;
    const sourceAnchorTop = 300;
    const sourceLogicalRatio = sourceAnchorTop / sourceMaxScroll;
    const logicalRatio = (sourceAnchorTop + sourceDeltaFromAnchor) / sourceMaxScroll;

    expect(
      calculateAnchoredScrollTop(logicalRatio, 1100, {
        logicalRatio: sourceLogicalRatio,
        localScrollTop: 400,
      }),
    ).toEqual({ scrollTop: 442, wasClamped: false });
  });

  it('uses the current max scroll after lazy-loaded content grows below the anchor', () => {
    expect(
      calculateAnchoredScrollTop(0.65, 2200, {
        logicalRatio: 0.3,
        localScrollTop: 700,
      }),
    ).toEqual({ scrollTop: 1450, wasClamped: false });
  });

  it('clamps safely when the current page is shorter than the saved anchor', () => {
    expect(
      calculateAnchoredScrollTop(0.65, 500, {
        logicalRatio: 0.3,
        localScrollTop: 700,
      }),
    ).toEqual({ scrollTop: 500, wasClamped: true });
  });

  it('handles anchors at the top and bottom without division by zero', () => {
    expect(
      calculateAnchoredScrollTop(0.4, 1000, {
        logicalRatio: 0,
        localScrollTop: 0,
      }),
    ).toEqual({ scrollTop: 400, wasClamped: false });

    expect(
      calculateAnchoredScrollTop(0.9, 1000, {
        logicalRatio: 1,
        localScrollTop: 1000,
      }),
    ).toEqual({ scrollTop: 900, wasClamped: false });
  });
});

describe('calculateAnchoredLogicalRatio', () => {
  it('maps local pre-anchor progress back to the logical pre-anchor segment', () => {
    expect(
      calculateAnchoredLogicalRatio(300, 1200, {
        logicalRatio: 0.3,
        localScrollTop: 600,
      }),
    ).toBe(0.15);
  });

  it('maps local post-anchor progress back to the logical post-anchor segment', () => {
    expect(
      calculateAnchoredLogicalRatio(1050, 1400, {
        logicalRatio: 0.3,
        localScrollTop: 700,
      }),
    ).toBe(0.65);
  });

  it('clamps the returned logical ratio to the valid range', () => {
    expect(
      calculateAnchoredLogicalRatio(2000, 1000, {
        logicalRatio: 0.25,
        localScrollTop: 250,
      }),
    ).toBe(1);

    expect(
      calculateAnchoredLogicalRatio(-50, 1000, {
        logicalRatio: 0.25,
        localScrollTop: 250,
      }),
    ).toBe(0);
  });

  it('returns 0 when there is no scrollable area', () => {
    expect(
      calculateAnchoredLogicalRatio(100, 0, {
        logicalRatio: 0.3,
        localScrollTop: 300,
      }),
    ).toBe(0);
  });
});

describe('calculatePixelDeltaLogicalRatio', () => {
  it('maps local source movement to the same pixel delta from the logical anchor', () => {
    expect(
      calculatePixelDeltaLogicalRatio(642, 1000, {
        logicalRatio: 0.3,
        localScrollTop: 600,
      }),
    ).toBe(0.342);
  });

  it('uses the current source max scroll while preserving local pixel delta', () => {
    expect(
      calculatePixelDeltaLogicalRatio(642, 2000, {
        logicalRatio: 0.3,
        localScrollTop: 600,
      }),
    ).toBe(0.321);
  });

  it('clamps pixel-delta logical ratio at document boundaries', () => {
    expect(
      calculatePixelDeltaLogicalRatio(-100, 1000, {
        logicalRatio: 0.3,
        localScrollTop: 600,
      }),
    ).toBe(0);

    expect(
      calculatePixelDeltaLogicalRatio(2000, 1000, {
        logicalRatio: 0.3,
        localScrollTop: 600,
      }),
    ).toBe(0.7);
  });

  it('clamps source scroll top before calculating pixel delta', () => {
    expect(
      calculatePixelDeltaLogicalRatio(-100, 1000, {
        logicalRatio: 0.9,
        localScrollTop: 0,
      }),
    ).toBe(0.9);
  });
});

describe('calculatePixelDeltaScrollTop', () => {
  it('applies source pixel delta to the receiver local anchor', () => {
    expect(
      calculatePixelDeltaScrollTop(342, 1000, 1600, {
        logicalRatio: 0.3,
        localScrollTop: 800,
      }),
    ).toEqual({ scrollTop: 842, wasClamped: false });
  });

  it('does not scale source delta by receiver remaining document length', () => {
    expect(
      calculatePixelDeltaScrollTop(342, 1000, 3000, {
        logicalRatio: 0.3,
        localScrollTop: 1200,
      }),
    ).toEqual({ scrollTop: 1242, wasClamped: false });
  });

  it('clamps receiver target when pixel delta points outside the valid range', () => {
    expect(
      calculatePixelDeltaScrollTop(950, 1000, 900, {
        logicalRatio: 0.3,
        localScrollTop: 700,
      }),
    ).toEqual({ scrollTop: 900, wasClamped: true });
  });

  it('clamps receiver target when negative pixel delta points above the valid range', () => {
    expect(
      calculatePixelDeltaScrollTop(0, 1000, 900, {
        logicalRatio: 0.8,
        localScrollTop: 100,
      }),
    ).toEqual({ scrollTop: 0, wasClamped: true });
  });
});

describe('findNearestIndex', () => {
  it('should return -1 for empty array', () => {
    expect(findNearestIndex([], 500)).toBe(-1);
  });

  it('should return 0 for single element', () => {
    const elements = [{ scrollTop: 100 }];
    expect(findNearestIndex(elements, 500)).toBe(0);
  });

  it('should find exact match at element position', () => {
    const elements = [{ scrollTop: 100 }, { scrollTop: 500 }, { scrollTop: 1000 }];
    expect(findNearestIndex(elements, 500)).toBe(1);
  });

  it('should pick closest element between two elements', () => {
    const elements = [{ scrollTop: 100 }, { scrollTop: 500 }, { scrollTop: 1000 }];
    expect(findNearestIndex(elements, 450)).toBe(1);
    expect(findNearestIndex(elements, 550)).toBe(1);
    expect(findNearestIndex(elements, 750)).toBe(1);
  });

  it('should handle scroll position before all elements', () => {
    const elements = [{ scrollTop: 100 }, { scrollTop: 500 }, { scrollTop: 1000 }];
    expect(findNearestIndex(elements, 0)).toBe(0);
    expect(findNearestIndex(elements, 50)).toBe(0);
  });

  it('should handle scroll position after all elements', () => {
    const elements = [{ scrollTop: 100 }, { scrollTop: 500 }, { scrollTop: 1000 }];
    expect(findNearestIndex(elements, 1500)).toBe(2);
    expect(findNearestIndex(elements, 2000)).toBe(2);
  });

  it('should handle equal distances by returning first match', () => {
    const elements = [{ scrollTop: 100 }, { scrollTop: 300 }, { scrollTop: 500 }];
    expect(findNearestIndex(elements, 200)).toBe(0);
  });

  it('should work with negative scrollTop values', () => {
    const elements = [{ scrollTop: -100 }, { scrollTop: 0 }, { scrollTop: 100 }];
    expect(findNearestIndex(elements, -50)).toBe(0);
    expect(findNearestIndex(elements, 0)).toBe(1);
  });
});
