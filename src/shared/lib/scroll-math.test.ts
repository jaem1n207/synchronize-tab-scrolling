import { describe, expect, it } from 'vitest';

import {
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
