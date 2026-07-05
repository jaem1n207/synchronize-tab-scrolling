/**
 * Scroll ratio from current position, document height, and viewport height.
 *
 * Returns a value between 0 (top) and 1 (bottom). Returns 0 when the
 * document is shorter than the viewport (no scrollable area).
 */
export function calculateScrollRatio(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
): number {
  const maxScroll = scrollHeight - clientHeight;
  return maxScroll > 0 ? scrollTop / maxScroll : 0;
}

/**
 * Symmetric clamp of an offset ratio around zero.
 *
 * Used to constrain manual scroll offsets so a tab can't drift more
 * than ±maxOffset of the document length from the synced position.
 */
export function clampScrollOffset(offsetRatio: number, maxOffset: number = 0.5): number {
  return Math.max(-maxOffset, Math.min(maxOffset, offsetRatio));
}

/**
 * Clamp a scroll position to the valid pixel range [0, maxScroll].
 */
export function clampScrollPosition(position: number, maxScroll: number): number {
  return Math.max(0, Math.min(maxScroll, position));
}

export interface ScrollAnchor {
  logicalRatio: number;
  localScrollTop: number;
}

export interface AnchoredScrollTarget {
  scrollTop: number;
  wasClamped: boolean;
}

function normalizeScrollMathValue(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(12));
}

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return normalizeScrollMathValue(Math.max(0, Math.min(1, value)));
}

function getSafeMaxScroll(maxScroll: number): number {
  if (!Number.isFinite(maxScroll)) return 0;
  return Math.max(0, maxScroll);
}

export function calculateAnchoredLogicalRatio(
  scrollTop: number,
  maxScroll: number,
  anchor: ScrollAnchor,
): number {
  const safeMaxScroll = getSafeMaxScroll(maxScroll);
  if (safeMaxScroll <= 0) return 0;

  const anchorLogical = clampRatio(anchor.logicalRatio);
  const anchorTop = clampScrollPosition(anchor.localScrollTop, safeMaxScroll);
  const localTop = clampScrollPosition(scrollTop, safeMaxScroll);

  if (localTop <= anchorTop) {
    if (anchorTop <= 0 || anchorLogical <= 0) return 0;
    return clampRatio((localTop / anchorTop) * anchorLogical);
  }

  const remainingLocal = safeMaxScroll - anchorTop;
  const remainingLogical = 1 - anchorLogical;

  if (remainingLocal <= 0 || remainingLogical <= 0) return 1;

  const progress = (localTop - anchorTop) / remainingLocal;
  return clampRatio(anchorLogical + progress * remainingLogical);
}

export function calculateAnchoredScrollTop(
  logicalRatio: number,
  maxScroll: number,
  anchor: ScrollAnchor,
): AnchoredScrollTarget {
  const safeMaxScroll = getSafeMaxScroll(maxScroll);
  if (safeMaxScroll <= 0) return { scrollTop: 0, wasClamped: anchor.localScrollTop > 0 };

  const sourceRatio = clampRatio(logicalRatio);
  const anchorLogical = clampRatio(anchor.logicalRatio);
  const anchorTop = clampScrollPosition(anchor.localScrollTop, safeMaxScroll);

  let rawTarget: number;

  if (sourceRatio <= anchorLogical) {
    const progress = anchorLogical > 0 ? sourceRatio / anchorLogical : 0;
    rawTarget = progress * anchorTop;
  } else {
    const remainingLogical = 1 - anchorLogical;
    const remainingLocal = safeMaxScroll - anchorTop;
    const progress = remainingLogical > 0 ? (sourceRatio - anchorLogical) / remainingLogical : 1;
    rawTarget = anchorTop + progress * remainingLocal;
  }

  const clampedTarget = clampScrollPosition(rawTarget, safeMaxScroll);
  const scrollTop = normalizeScrollMathValue(clampedTarget);

  return {
    scrollTop,
    wasClamped: anchor.localScrollTop > safeMaxScroll || rawTarget !== clampedTarget,
  };
}

export function calculatePixelDeltaLogicalRatio(
  scrollTop: number,
  maxScroll: number,
  anchor: ScrollAnchor,
): number {
  const safeMaxScroll = getSafeMaxScroll(maxScroll);
  if (safeMaxScroll <= 0) return 0;

  const anchorLogical = clampRatio(anchor.logicalRatio);
  const localAnchorTop = clampScrollPosition(anchor.localScrollTop, safeMaxScroll);
  const localTop = clampScrollPosition(scrollTop, safeMaxScroll);
  const logicalAnchorTop = anchorLogical * safeMaxScroll;
  const logicalScrollTop = clampScrollPosition(
    logicalAnchorTop + (localTop - localAnchorTop),
    safeMaxScroll,
  );

  return clampRatio(logicalScrollTop / safeMaxScroll);
}

export function calculatePixelDeltaScrollTop(
  logicalScrollTop: number,
  logicalMaxScroll: number,
  maxScroll: number,
  anchor: ScrollAnchor,
): AnchoredScrollTarget {
  const safeLogicalMaxScroll = getSafeMaxScroll(logicalMaxScroll);
  const safeMaxScroll = getSafeMaxScroll(maxScroll);
  if (safeMaxScroll <= 0) {
    return { scrollTop: 0, wasClamped: anchor.localScrollTop > 0 || logicalScrollTop > 0 };
  }

  const anchorLogical = clampRatio(anchor.logicalRatio);
  const safeLogicalScrollTop = clampScrollPosition(logicalScrollTop, safeLogicalMaxScroll);
  const logicalAnchorTop = anchorLogical * safeLogicalMaxScroll;
  const sourceDeltaPx = safeLogicalScrollTop - logicalAnchorTop;
  const rawTarget = anchor.localScrollTop + sourceDeltaPx;
  const clampedTarget = clampScrollPosition(rawTarget, safeMaxScroll);

  return {
    scrollTop: normalizeScrollMathValue(clampedTarget),
    wasClamped: rawTarget !== clampedTarget,
  };
}

/**
 * Index of the element whose scrollTop is closest to `currentScroll`.
 *
 * Returns -1 for an empty array.
 */
export function findNearestIndex(
  elements: ReadonlyArray<{ scrollTop: number }>,
  currentScroll: number,
): number {
  if (elements.length === 0) return -1;

  let nearestIndex = 0;
  let minDistance = Math.abs(elements[0].scrollTop - currentScroll);

  for (let i = 1; i < elements.length; i++) {
    const distance = Math.abs(elements[i].scrollTop - currentScroll);
    if (distance < minDistance) {
      minDistance = distance;
      nearestIndex = i;
    }
  }

  return nearestIndex;
}
