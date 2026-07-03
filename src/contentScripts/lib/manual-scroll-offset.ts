import { clampScrollOffset } from '~/shared/lib/scroll-math';
import type { ManualScrollOffset } from '~/shared/lib/storage';

interface CreateManualScrollOffsetInput {
  baselineLogicalRatio: number;
  currentScrollTop: number;
  maxScroll: number;
  maxReasonableOffset?: number;
}

function canonicalizeZero(value: number): number {
  return value === 0 ? 0 : value;
}

export function createManualScrollOffset({
  baselineLogicalRatio,
  currentScrollTop,
  maxScroll,
  maxReasonableOffset = 0.5,
}: CreateManualScrollOffsetInput): ManualScrollOffset {
  const safeMaxScroll = Number.isFinite(maxScroll) ? Math.max(0, maxScroll) : 0;
  const safeCurrentScrollTop = Number.isFinite(currentScrollTop) ? currentScrollTop : 0;
  const safeBaselineLogicalRatio = Number.isFinite(baselineLogicalRatio)
    ? Math.max(0, Math.min(1, baselineLogicalRatio))
    : 0;
  const safeMaxReasonableOffset =
    Number.isFinite(maxReasonableOffset) && maxReasonableOffset >= 0 ? maxReasonableOffset : 0.5;
  const currentRatio = safeMaxScroll > 0 ? safeCurrentScrollTop / safeMaxScroll : 0;
  const offsetRatio = currentRatio - safeBaselineLogicalRatio;
  const clampedOffsetRatio = canonicalizeZero(
    clampScrollOffset(offsetRatio, safeMaxReasonableOffset),
  );
  const offsetPixels = canonicalizeZero(
    safeMaxScroll > 0 ? Math.round(clampedOffsetRatio * safeMaxScroll) : 0,
  );

  return {
    ratio: clampedOffsetRatio,
    pixels: offsetPixels,
    anchor: {
      logicalRatio: safeBaselineLogicalRatio,
      localScrollTop: safeCurrentScrollTop,
      localMaxScrollAtCapture: safeMaxScroll,
    },
  };
}
