import { describe, expect, it } from 'vitest';

import { createManualScrollOffset } from './manual-scroll-offset';

describe('createManualScrollOffset', () => {
  it('creates a manual anchor offset from a baseline and current scroll position', () => {
    expect(
      createManualScrollOffset({
        baselineLogicalRatio: 0.3,
        currentScrollTop: 600,
        maxScroll: 1000,
      }),
    ).toEqual({
      ratio: 0.3,
      pixels: 300,
      anchor: {
        logicalRatio: 0.3,
        localScrollTop: 600,
        localMaxScrollAtCapture: 1000,
      },
    });
  });

  it('clamps the legacy ratio while preserving the exact local anchor position', () => {
    expect(
      createManualScrollOffset({
        baselineLogicalRatio: 0,
        currentScrollTop: 950,
        maxScroll: 1000,
      }),
    ).toEqual({
      ratio: 0.5,
      pixels: 500,
      anchor: {
        logicalRatio: 0,
        localScrollTop: 950,
        localMaxScrollAtCapture: 1000,
      },
    });
  });

  it('handles pages without scrollable area', () => {
    expect(
      createManualScrollOffset({
        baselineLogicalRatio: 0.3,
        currentScrollTop: 250,
        maxScroll: 0,
      }),
    ).toEqual({
      ratio: -0.3,
      pixels: 0,
      anchor: {
        logicalRatio: 0.3,
        localScrollTop: 250,
        localMaxScrollAtCapture: 0,
      },
    });
  });

  it('normalizes NaN current scroll top to a finite local anchor position and offset', () => {
    expect(
      createManualScrollOffset({
        baselineLogicalRatio: 0.3,
        currentScrollTop: Number.NaN,
        maxScroll: 1000,
      }),
    ).toEqual({
      ratio: -0.3,
      pixels: -300,
      anchor: {
        logicalRatio: 0.3,
        localScrollTop: 0,
        localMaxScrollAtCapture: 1000,
      },
    });
  });

  it('uses a custom max reasonable offset to clamp the legacy ratio', () => {
    expect(
      createManualScrollOffset({
        baselineLogicalRatio: 0,
        currentScrollTop: 950,
        maxScroll: 1000,
        maxReasonableOffset: 0.2,
      }),
    ).toEqual({
      ratio: 0.2,
      pixels: 200,
      anchor: {
        logicalRatio: 0,
        localScrollTop: 950,
        localMaxScrollAtCapture: 1000,
      },
    });
  });

  it('falls back to the default max reasonable offset for invalid custom limits', () => {
    expect(
      createManualScrollOffset({
        baselineLogicalRatio: 0,
        currentScrollTop: 950,
        maxScroll: 1000,
        maxReasonableOffset: Number.POSITIVE_INFINITY,
      }),
    ).toMatchObject({
      ratio: 0.5,
      pixels: 500,
    });

    expect(
      createManualScrollOffset({
        baselineLogicalRatio: 0,
        currentScrollTop: 950,
        maxScroll: 1000,
        maxReasonableOffset: -0.1,
      }),
    ).toMatchObject({
      ratio: 0.5,
      pixels: 500,
    });
  });

  it('clamps out-of-range baseline ratios to the anchor range', () => {
    expect(
      createManualScrollOffset({
        baselineLogicalRatio: 1.4,
        currentScrollTop: 300,
        maxScroll: 1000,
      }),
    ).toEqual({
      ratio: -0.5,
      pixels: -500,
      anchor: {
        logicalRatio: 1,
        localScrollTop: 300,
        localMaxScrollAtCapture: 1000,
      },
    });

    expect(
      createManualScrollOffset({
        baselineLogicalRatio: -0.4,
        currentScrollTop: 300,
        maxScroll: 1000,
      }),
    ).toEqual({
      ratio: 0.3,
      pixels: 300,
      anchor: {
        logicalRatio: 0,
        localScrollTop: 300,
        localMaxScrollAtCapture: 1000,
      },
    });
  });

  it('returns canonical zero for signed zero ratio and pixels', () => {
    const offset = createManualScrollOffset({
      baselineLogicalRatio: 0,
      currentScrollTop: -0,
      maxScroll: 1000,
    });

    expect(Object.is(offset.ratio, -0)).toBe(false);
    expect(Object.is(offset.pixels, -0)).toBe(false);
    expect(offset.ratio).toBe(0);
    expect(offset.pixels).toBe(0);
  });
});
