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
