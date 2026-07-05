# Manual Scroll Anchor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace ratio-only manual scroll offsets with anchor-based piecewise mapping so manually aligned paragraphs stay aligned while scrolling.

**Architecture:** Add pure O(1) scroll-math helpers for anchor mapping, extend the persisted manual offset shape with validated optional anchor data, and wire keyboard/wheel manual mode plus `scroll-sync.ts` source/receiver paths to use logical anchor ratios. Keep storage I/O out of scroll hot paths and make lazy-load catch-up bounded.

**Tech Stack:** TypeScript, Vitest, webext-bridge content-script tests, webextension-polyfill storage mocks, pnpm.

---

## File Structure

- Modify: `src/shared/lib/scroll-math.ts`
  - Responsibility: pure scroll ratio, clamp, and anchor mapping math. No DOM, no storage, no async.
- Modify: `src/shared/lib/scroll-math.test.ts`
  - Responsibility: prove piecewise anchor mapping, inverse mapping, legacy clamps, and lazy height growth math.
- Modify: `src/shared/lib/storage.ts`
  - Responsibility: define and validate persisted `ManualScrollOffset` and optional `ManualScrollAnchor`.
- Modify: `src/shared/lib/storage.test.ts`
  - Responsibility: prove storage migration, valid anchor persistence, invalid anchor fallback, and invalid offset rejection.
- Create: `src/contentScripts/lib/manual-scroll-offset.ts`
  - Responsibility: build a `ManualScrollOffset` from a manual-mode baseline and current local scroll metrics.
- Create: `src/contentScripts/lib/manual-scroll-offset.test.ts`
  - Responsibility: prove keyboard and wheel manual mode can share one anchor offset creation path.
- Modify: `src/contentScripts/keyboard-handler.ts`
  - Responsibility: save anchor offsets on Option/Alt release and update the in-memory cache before sync resumes.
- Modify: `src/contentScripts/keyboard-handler.test.ts`
  - Responsibility: prove keyboard manual mode saves anchors, updates cache first, and keeps legacy display pixels.
- Modify: `src/contentScripts/scroll-sync.ts`
  - Responsibility: use anchored local-to-logical mapping when broadcasting, anchored logical-to-local mapping when receiving, anchor offsets for wheel manual mode, and bounded catch-up for temporarily short lazy-loaded pages.
- Modify: `src/__tests__/scenarios.test.ts`
  - Responsibility: prove the actual content-script `scroll:sync` path uses anchors and remains latest-wins.
- Modify: `docs/guides/scroll-sync-pipeline.md`
  - Responsibility: update the manual offset lifecycle and hot-path invariants.
- Modify: `src/contentScripts/README.md`
  - Responsibility: update the module overview so future agents do not reintroduce ratio-only offset assumptions.
- Modify: `src/contentScripts/AGENTS.md`
  - Responsibility: update local agent guidance that currently describes manual mode as ratio-only offsets.
- No changes: `src/shared/types/messages.ts`, `shim.d.ts`, popup UI, locale JSON, background relay protocol, landing, release, deploy, or store-stats workflows.

## Task 1: Add Pure Anchor Mapping Math

**Files:**

- Modify: `src/shared/lib/scroll-math.test.ts`
- Modify: `src/shared/lib/scroll-math.ts`

- [ ] **Step 1: Write failing tests for anchored logical-to-local mapping**

In `src/shared/lib/scroll-math.test.ts`, extend the import:

```typescript
import {
  calculateAnchoredLogicalRatio,
  calculateAnchoredScrollTop,
  calculateScrollRatio,
  clampScrollOffset,
  clampScrollPosition,
  findNearestIndex,
} from './scroll-math';
```

Add this block after `describe('clampScrollPosition', ...)` and before `describe('findNearestIndex', ...)`:

```typescript
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
```

- [ ] **Step 2: Write failing tests for anchored local-to-logical inverse mapping**

In the same file, add this block after the `calculateAnchoredScrollTop` tests:

```typescript
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
```

- [ ] **Step 3: Run the focused math test and verify the expected failure**

Run:

```bash
pnpm vitest run src/shared/lib/scroll-math.test.ts
```

Expected before implementation: FAIL with missing exports:

```text
No matching export in "src/shared/lib/scroll-math.ts" for import "calculateAnchoredLogicalRatio"
```

- [ ] **Step 4: Implement anchor mapping helpers**

In `src/shared/lib/scroll-math.ts`, add these exports after `clampScrollPosition()` and before `findNearestIndex()`:

```typescript
export interface ScrollAnchor {
  logicalRatio: number;
  localScrollTop: number;
}

export interface AnchoredScrollTarget {
  scrollTop: number;
  wasClamped: boolean;
}

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
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

  const scrollTop = clampScrollPosition(rawTarget, safeMaxScroll);

  return {
    scrollTop,
    wasClamped: anchor.localScrollTop > safeMaxScroll || rawTarget !== scrollTop,
  };
}
```

- [ ] **Step 5: Run the focused math test and verify it passes**

Run:

```bash
pnpm vitest run src/shared/lib/scroll-math.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the math helpers**

Run:

```bash
git add src/shared/lib/scroll-math.ts src/shared/lib/scroll-math.test.ts
git commit -m "feat: add manual scroll anchor math"
```

## Task 2: Extend Manual Offset Storage With Validated Anchors

**Files:**

- Modify: `src/shared/lib/storage.test.ts`
- Modify: `src/shared/lib/storage.ts`

- [ ] **Step 1: Add storage tests for valid anchor persistence**

In `src/shared/lib/storage.test.ts`, inside `describe('loadManualScrollOffsets')`, add this test after `returns stored manual scroll offsets in new object format`:

```typescript
it('returns stored manual scroll offsets with valid anchor data', async () => {
  storageGetMock.mockResolvedValue({
    manualScrollOffsets: {
      1: {
        ratio: 0.25,
        pixels: 120,
        anchor: {
          logicalRatio: 0.3,
          localScrollTop: 600,
          localMaxScrollAtCapture: 1200,
        },
      },
    },
  });

  await expect(loadManualScrollOffsets()).resolves.toEqual({
    1: {
      ratio: 0.25,
      pixels: 120,
      anchor: {
        logicalRatio: 0.3,
        localScrollTop: 600,
        localMaxScrollAtCapture: 1200,
      },
    },
  });
});
```

Inside `describe('saveManualScrollOffset')`, add this test after `saves offset for a tab while preserving existing offsets`:

```typescript
it('saves offset anchor data for a tab', async () => {
  storageGetMock.mockResolvedValue({ manualScrollOffsets: {} });
  storageSetMock.mockResolvedValue(undefined);

  await saveManualScrollOffset(2, 0.35, 140, {
    logicalRatio: 0.3,
    localScrollTop: 600,
    localMaxScrollAtCapture: 1200,
  });

  expect(storageSetMock).toHaveBeenCalledWith({
    manualScrollOffsets: {
      2: {
        ratio: 0.35,
        pixels: 140,
        anchor: {
          logicalRatio: 0.3,
          localScrollTop: 600,
          localMaxScrollAtCapture: 1200,
        },
      },
    },
  });
});
```

- [ ] **Step 2: Add storage tests for invalid values**

In `src/shared/lib/storage.test.ts`, inside `describe('loadManualScrollOffsets')`, add these tests after `migrates mixed legacy and new formats`:

```typescript
it('drops invalid anchor data while preserving a valid legacy offset object', async () => {
  storageGetMock.mockResolvedValue({
    manualScrollOffsets: {
      7: {
        ratio: 0.2,
        pixels: 88,
        anchor: {
          logicalRatio: 'bad',
          localScrollTop: 600,
          localMaxScrollAtCapture: 1200,
        },
      },
    },
  });

  await expect(loadManualScrollOffsets()).resolves.toEqual({
    7: { ratio: 0.2, pixels: 88 },
  });
});

it('skips invalid manual offset objects', async () => {
  storageGetMock.mockResolvedValue({
    manualScrollOffsets: {
      8: { ratio: 'bad', pixels: 88 },
      9: { ratio: 0.1, pixels: Number.NaN },
      10: { ratio: 0.15, pixels: 30 },
    },
  });

  await expect(loadManualScrollOffsets()).resolves.toEqual({
    10: { ratio: 0.15, pixels: 30 },
  });
});
```

- [ ] **Step 3: Run the storage tests and verify the expected failure**

Run:

```bash
pnpm vitest run src/shared/lib/storage.test.ts
```

Expected before implementation: FAIL because `saveManualScrollOffset()` does not accept or persist the anchor argument, and invalid object validation is not implemented.

- [ ] **Step 4: Implement anchor types and runtime validation**

In `src/shared/lib/storage.ts`, replace the current manual offset interface:

```typescript
export interface ManualScrollOffset {
  ratio: number; // -1 to 1, where 0 means no offset
  pixels: number; // actual pixel offset value
}
```

with:

```typescript
export interface ManualScrollAnchor {
  logicalRatio: number;
  localScrollTop: number;
  localMaxScrollAtCapture: number;
}

export interface ManualScrollOffset {
  ratio: number; // -1 to 1, where 0 means no offset
  pixels: number; // actual pixel offset value
  anchor?: ManualScrollAnchor;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function readManualScrollAnchor(value: unknown): ManualScrollAnchor | undefined {
  if (!isRecord(value)) return undefined;

  const { logicalRatio, localScrollTop, localMaxScrollAtCapture } = value;

  if (
    !isFiniteNumber(logicalRatio) ||
    !isFiniteNumber(localScrollTop) ||
    !isFiniteNumber(localMaxScrollAtCapture)
  ) {
    return undefined;
  }

  return { logicalRatio, localScrollTop, localMaxScrollAtCapture };
}

function readManualScrollOffset(value: unknown): ManualScrollOffset | null {
  if (isFiniteNumber(value)) {
    return { ratio: value, pixels: 0 };
  }

  if (!isRecord(value)) return null;

  const { ratio, pixels, anchor } = value;

  if (!isFiniteNumber(ratio) || !isFiniteNumber(pixels)) {
    return null;
  }

  const parsedAnchor = readManualScrollAnchor(anchor);

  return parsedAnchor ? { ratio, pixels, anchor: parsedAnchor } : { ratio, pixels };
}
```

Then replace the current `loadManualScrollOffsets()` body with this validation-based version:

```typescript
export async function loadManualScrollOffsets(): Promise<Record<number, ManualScrollOffset>> {
  try {
    const result = await browser.storage.local.get(STORAGE_KEYS.MANUAL_SCROLL_OFFSETS);
    const stored = result[STORAGE_KEYS.MANUAL_SCROLL_OFFSETS];

    if (!isRecord(stored)) return {};

    const converted: Record<number, ManualScrollOffset> = {};
    for (const [tabId, value] of Object.entries(stored)) {
      const numericTabId = Number(tabId);
      if (!Number.isFinite(numericTabId)) continue;

      const parsedOffset = readManualScrollOffset(value);
      if (parsedOffset) {
        converted[numericTabId] = parsedOffset;
      }
    }
    return converted;
  } catch (error) {
    await logger.error('Failed to load manual scroll offsets:', error);
    return {};
  }
}
```

Finally, update the `saveManualScrollOffset()` signature and stored object:

```typescript
export async function saveManualScrollOffset(
  tabId: number,
  ratio: number,
  pixels: number,
  anchor?: ManualScrollAnchor,
): Promise<void> {
  try {
    const offsets = await loadManualScrollOffsets();
    offsets[tabId] = anchor ? { ratio, pixels, anchor } : { ratio, pixels };
    await browser.storage.local.set({
      [STORAGE_KEYS.MANUAL_SCROLL_OFFSETS]: offsets,
    });
  } catch (error) {
    await logger.error('Failed to save manual scroll offset:', error);
  }
}
```

- [ ] **Step 5: Run storage tests and typecheck**

Run:

```bash
pnpm vitest run src/shared/lib/storage.test.ts
pnpm typecheck
```

Expected: both PASS.

- [ ] **Step 6: Commit the storage change**

Run:

```bash
git add src/shared/lib/storage.ts src/shared/lib/storage.test.ts
git commit -m "feat: validate manual scroll anchors"
```

## Task 3: Add A Shared Manual Offset Builder

**Files:**

- Create: `src/contentScripts/lib/manual-scroll-offset.test.ts`
- Create: `src/contentScripts/lib/manual-scroll-offset.ts`

- [ ] **Step 1: Write failing tests for manual offset creation**

Create `src/contentScripts/lib/manual-scroll-offset.test.ts` with:

```typescript
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
});
```

- [ ] **Step 2: Run the helper test and verify the expected failure**

Run:

```bash
pnpm vitest run src/contentScripts/lib/manual-scroll-offset.test.ts
```

Expected before implementation: FAIL because `src/contentScripts/lib/manual-scroll-offset.ts` does not exist.

- [ ] **Step 3: Implement the manual offset builder**

Create `src/contentScripts/lib/manual-scroll-offset.ts` with:

```typescript
import { clampScrollOffset } from '~/shared/lib/scroll-math';
import type { ManualScrollOffset } from '~/shared/lib/storage';

interface CreateManualScrollOffsetInput {
  baselineLogicalRatio: number;
  currentScrollTop: number;
  maxScroll: number;
  maxReasonableOffset?: number;
}

export function createManualScrollOffset({
  baselineLogicalRatio,
  currentScrollTop,
  maxScroll,
  maxReasonableOffset = 0.5,
}: CreateManualScrollOffsetInput): ManualScrollOffset {
  const safeMaxScroll = Number.isFinite(maxScroll) ? Math.max(0, maxScroll) : 0;
  const safeBaselineLogicalRatio = Number.isFinite(baselineLogicalRatio)
    ? Math.max(0, Math.min(1, baselineLogicalRatio))
    : 0;
  const currentRatio = safeMaxScroll > 0 ? currentScrollTop / safeMaxScroll : 0;
  const offsetRatio = currentRatio - safeBaselineLogicalRatio;
  const clampedOffsetRatio = clampScrollOffset(offsetRatio, maxReasonableOffset);
  const offsetPixels = Math.round(clampedOffsetRatio * safeMaxScroll);

  return {
    ratio: clampedOffsetRatio,
    pixels: offsetPixels,
    anchor: {
      logicalRatio: safeBaselineLogicalRatio,
      localScrollTop: currentScrollTop,
      localMaxScrollAtCapture: safeMaxScroll,
    },
  };
}
```

- [ ] **Step 4: Run the helper test**

Run:

```bash
pnpm vitest run src/contentScripts/lib/manual-scroll-offset.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the shared manual offset builder**

Run:

```bash
git add src/contentScripts/lib/manual-scroll-offset.ts src/contentScripts/lib/manual-scroll-offset.test.ts
git commit -m "feat: build manual scroll anchor offsets"
```

## Task 4: Save Anchors From Keyboard Manual Mode

**Files:**

- Modify: `src/contentScripts/keyboard-handler.test.ts`
- Modify: `src/contentScripts/keyboard-handler.ts`

- [ ] **Step 1: Update keyboard tests to expect anchor offsets**

In `src/contentScripts/keyboard-handler.test.ts`, update existing `saveManualScrollOffsetMock` expectations that currently use three arguments.

For the test named `snapshots baseline from lastSyncedRatio for later offset calculation`, replace:

```typescript
expect(mocks.saveManualScrollOffsetMock).toHaveBeenCalledWith(13, 0.3, 300);
```

with:

```typescript
expect(mocks.saveManualScrollOffsetMock).toHaveBeenCalledWith(13, 0.3, 300, {
  logicalRatio: 0.3,
  localScrollTop: 600,
  localMaxScrollAtCapture: 1000,
});
```

For the test named `calculates offsetRatio as currentRatio minus baseline`, replace:

```typescript
expect(mocks.saveManualScrollOffsetMock).toHaveBeenCalledWith(23, 0.35, 350);
```

with:

```typescript
expect(mocks.saveManualScrollOffsetMock).toHaveBeenCalledWith(23, 0.35, 350, {
  logicalRatio: 0.1,
  localScrollTop: 450,
  localMaxScrollAtCapture: 1000,
});
```

For the positive clamp test, replace the expectation with:

```typescript
expect(mocks.saveManualScrollOffsetMock).toHaveBeenCalledWith(24, 0.5, 500, {
  logicalRatio: 0,
  localScrollTop: 950,
  localMaxScrollAtCapture: 1000,
});
```

For the negative clamp test, replace the expectation with:

```typescript
expect(mocks.saveManualScrollOffsetMock).toHaveBeenCalledWith(25, -0.5, -500, {
  logicalRatio: 0.9,
  localScrollTop: 100,
  localMaxScrollAtCapture: 1000,
});
```

In the `uses currentRatio=0 when maxScroll is 0` test, update the call inspection:

```typescript
const [savedTabId, savedRatio, savedPixels, savedAnchor] =
  mocks.saveManualScrollOffsetMock.mock.calls[0];
expect(savedTabId).toBe(26);
expect(savedRatio).toBe(-0.3);
expect(Math.abs(savedPixels)).toBe(0);
expect(savedAnchor).toEqual({
  logicalRatio: 0.3,
  localScrollTop: 250,
  localMaxScrollAtCapture: 0,
});
```

- [ ] **Step 2: Add a cache-order test**

In the `keyup handling and disableManualMode math` describe block, add:

```typescript
it('updates the offset cache before re-enabling sync', async () => {
  const calls: Array<string> = [];
  const setManualModeActive = vi.fn((active: boolean) => {
    calls.push(`manual:${String(active)}`);
  });
  const updateOffsetCache = vi.fn(() => {
    calls.push('cache');
  });

  initKeyboardHandler(28, () => ({
    currentScrollTop: 450,
    lastSyncedRatio: 0.1,
    setManualModeActive,
    updateOffsetCache,
  }));

  setDocumentScrollState(2000, 1000, 450);
  window.dispatchEvent(new KeyboardEvent('keydown', { altKey: true }));
  window.dispatchEvent(new KeyboardEvent('keyup', { altKey: false }));
  await flushAsyncHandlers();

  expect(calls).toEqual(['manual:true', 'cache', 'manual:false']);
});
```

- [ ] **Step 3: Run keyboard tests and verify the expected failure**

Run:

```bash
pnpm vitest run src/contentScripts/keyboard-handler.test.ts
```

Expected before implementation: FAIL because the handler still saves only `(tabId, ratio, pixels)` and calls `setManualModeActive(false)` before cache update.

- [ ] **Step 4: Update keyboard handler callback types**

In `src/contentScripts/keyboard-handler.ts`, update imports:

```typescript
import { saveManualScrollOffset, type ManualScrollOffset } from '~/shared/lib/storage';

import { createManualScrollOffset } from './lib/manual-scroll-offset';
```

Change both callback type declarations so `updateOffsetCache` accepts the whole offset:

```typescript
updateOffsetCache: (offset: ManualScrollOffset) => void;
```

- [ ] **Step 5: Update keyboard manual mode exit**

In `disableManualMode()`, replace the current ratio calculation and save block with:

```typescript
  let saveOffsetPromise: Promise<void> | null = null;

  if (getScrollInfoCallback) {
    try {
      const { currentScrollTop, lastSyncedRatio, updateOffsetCache } = getScrollInfoCallback();

      const myMaxScroll =
        document.documentElement.scrollHeight - document.documentElement.clientHeight;
      const manualOffset = createManualScrollOffset({
        baselineLogicalRatio: manualModeBaselineSnapshot,
        currentScrollTop,
        maxScroll: myMaxScroll,
      });

      if (Math.abs(lastSyncedRatio - manualModeBaselineSnapshot) > 0.0001) {
        logger.debug('Manual baseline differs from latest logical ratio at release', {
          lastSyncedRatio,
          manualModeBaselineSnapshot,
        });
      }

      updateOffsetCache(manualOffset);
      saveOffsetPromise = saveManualScrollOffset(
        currentTabId,
        manualOffset.ratio,
        manualOffset.pixels,
        manualOffset.anchor,
      );

      logger.info('Manual scroll offset cache updated', {
        tabId: currentTabId,
        offsetRatio: manualOffset.ratio,
        offsetPixels: manualOffset.pixels,
      });
    } catch (error) {
      logger.error('Failed to prepare manual scroll offset', { error });
    }
  }

  if (getScrollInfoCallback) {
    const { setManualModeActive } = getScrollInfoCallback();
    setManualModeActive(false);
  }
```

Keep the existing `scroll:manual` disabled message and class removal after this block. Before the end of `disableManualMode()`, add:

```typescript
  if (saveOffsetPromise) {
    await saveOffsetPromise.catch((error) => {
      logger.error('Failed to persist manual scroll offset', { error });
    });
  }
```

Remove the old early `setManualModeActive(false)` call at the top of `disableManualMode()`.

- [ ] **Step 6: Run keyboard tests and typecheck**

Run:

```bash
pnpm vitest run src/contentScripts/keyboard-handler.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit keyboard anchor saving**

Run:

```bash
git add src/contentScripts/keyboard-handler.ts src/contentScripts/keyboard-handler.test.ts
git commit -m "feat: save keyboard manual scroll anchors"
```

## Task 5: Use Anchors In Scroll Sync Source, Receiver, And Wheel Mode

**Files:**

- Modify: `src/__tests__/scenarios.test.ts`
- Modify: `src/contentScripts/scroll-sync.ts`

- [ ] **Step 1: Add content-script scenarios for anchored source and receiver behavior**

In `src/__tests__/scenarios.test.ts`, add this helper near `setDocumentScrollMetrics()`:

```typescript
function setWindowScrollY(scrollY: number): void {
  Object.defineProperty(window, 'scrollY', {
    configurable: true,
    value: scrollY,
  });
  document.documentElement.scrollTop = scrollY;
}
```

Add this describe block after `describe('Scenario: scroll start acknowledgements', ...)`:

```typescript
describe('Scenario: manual scroll anchors', () => {
  it('anchored source broadcasts logical ratio instead of local ratio', async () => {
    setDocumentScrollMetrics(2000, 1000);
    setWindowScrollY(650);
    await saveManualScrollOffset(61, 0.3, 300, {
      logicalRatio: 0.3,
      localScrollTop: 600,
      localMaxScrollAtCapture: 1000,
    });

    await startContentSync(61);
    window.dispatchEvent(new Event('scroll'));
    await flushAsync();

    expect(mocks.sendMessageContentMock).toHaveBeenCalledWith(
      'scroll:sync',
      expect.objectContaining({
        scrollTop: 350,
        scrollHeight: 2000,
        clientHeight: 1000,
        sourceTabId: 61,
        mode: 'ratio',
      }),
      'background',
    );
  });

  it('anchored receiver maps incoming logical ratio through the post-anchor segment', async () => {
    setDocumentScrollMetrics(2400, 1000);
    await saveManualScrollOffset(62, 0.2, 280, {
      logicalRatio: 0.3,
      localScrollTop: 700,
      localMaxScrollAtCapture: 1400,
    });

    await startContentSync(62);
    await invokeContentMessage('scroll:sync', {
      scrollTop: 650,
      scrollHeight: 2000,
      clientHeight: 1000,
      sourceTabId: 99,
      mode: 'ratio',
      timestamp: Date.now(),
    });

    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });

    expect(document.documentElement.scrollTop).toBe(1050);
  });
});
```

- [ ] **Step 2: Run the scenario tests and verify the expected failure**

Run:

```bash
pnpm vitest run src/__tests__/scenarios.test.ts -t "manual scroll anchors"
```

Expected before implementation: FAIL. The source test broadcasts ratio-offset math and the receiver test applies `sourceRatio + offsetRatio`.

- [ ] **Step 3: Update scroll-sync imports and zero offset helper**

In `src/contentScripts/scroll-sync.ts`, extend the scroll math import:

```typescript
  calculateAnchoredLogicalRatio,
  calculateAnchoredScrollTop,
```

Add:

```typescript
import { createManualScrollOffset } from './lib/manual-scroll-offset';
```

Add a small helper near `let cachedManualOffset`:

```typescript
const EMPTY_MANUAL_OFFSET: ManualScrollOffset = { ratio: 0, pixels: 0 };

function clearCachedManualOffset(): void {
  cachedManualOffset = EMPTY_MANUAL_OFFSET;
}
```

Use `clearCachedManualOffset()` in the three existing clear paths instead of repeating `{ ratio: 0, pixels: 0 }`.

- [ ] **Step 4: Update wheel manual mode to save anchor offsets**

In `exitWheelManualMode()`, replace the current offset calculation and save block with:

```typescript
  const { scrollTop, scrollHeight, clientHeight } = getScrollInfo();
  const maxScroll = scrollHeight - clientHeight;
  const manualOffset = createManualScrollOffset({
    baselineLogicalRatio: wheelState.baselineSnapshot,
    currentScrollTop: scrollTop,
    maxScroll,
  });

  logger.debug('Wheel manual mode exiting, saving offset', {
    currentRatio: calculateScrollRatio(scrollTop, scrollHeight, clientHeight),
    wheelBaselineSnapshot: wheelState.baselineSnapshot,
    offsetRatio: manualOffset.ratio,
    offsetPixels: manualOffset.pixels,
  });

  cachedManualOffset = manualOffset;
  await saveManualScrollOffset(
    syncState.tabId,
    manualOffset.ratio,
    manualOffset.pixels,
    manualOffset.anchor,
  );
```

- [ ] **Step 5: Update source broadcast mapping**

In `handleScrollCore()`, replace the current pure ratio calculation:

```typescript
  const currentRatio = calculateScrollRatio(
    scrollInfo.scrollTop,
    scrollInfo.scrollHeight,
    scrollInfo.clientHeight,
  );

  // Calculate pure ratio by removing this tab's offset
  const pureRatio = currentRatio - offsetData.ratio;
```

with:

```typescript
  const currentRatio = calculateScrollRatio(
    scrollInfo.scrollTop,
    scrollInfo.scrollHeight,
    scrollInfo.clientHeight,
  );

  const pureRatio = offsetData.anchor
    ? calculateAnchoredLogicalRatio(scrollInfo.scrollTop, myMaxScroll, offsetData.anchor)
    : currentRatio - offsetData.ratio;
```

Update the debug metadata key from `offsetRatio` only to both legacy and anchor context:

```typescript
    offsetRatio: offsetData.ratio,
    hasManualAnchor: Boolean(offsetData.anchor),
```

- [ ] **Step 6: Update receiver mapping**

In the `scroll:sync` receiver, replace:

```typescript
    const sourceRatio = payload.scrollTop / (payload.scrollHeight - payload.clientHeight);
```

with:

```typescript
    const sourceRatio = calculateScrollRatio(
      payload.scrollTop,
      payload.scrollHeight,
      payload.clientHeight,
    );
```

Replace the target ratio block:

```typescript
    const targetRatio = sourceRatio + offsetData.ratio;
    const targetScrollTop = targetRatio * myMaxScroll;
    const clampedScrollTop = clampScrollPosition(targetScrollTop, myMaxScroll);
```

with:

```typescript
    const anchoredTarget = offsetData.anchor
      ? calculateAnchoredScrollTop(sourceRatio, myMaxScroll, offsetData.anchor)
      : null;
    const targetRatio = sourceRatio + offsetData.ratio;
    const targetScrollTop = anchoredTarget?.scrollTop ?? targetRatio * myMaxScroll;
    const clampedScrollTop = anchoredTarget
      ? anchoredTarget.scrollTop
      : clampScrollPosition(targetScrollTop, myMaxScroll);
```

Add `hasManualAnchor: Boolean(offsetData.anchor)` and `wasAnchoredTargetClamped: anchoredTarget?.wasClamped ?? false` to the sanitized debug metadata.

- [ ] **Step 7: Update keyboard handler callback in scroll start**

In the `initKeyboardHandler()` callback inside the `scroll:start` handler, replace:

```typescript
        updateOffsetCache: (ratio: number, pixels: number) => {
          cachedManualOffset = { ratio, pixels };
        },
```

with:

```typescript
        updateOffsetCache: (offset: ManualScrollOffset) => {
          cachedManualOffset = offset;
        },
```

- [ ] **Step 8: Run focused scenarios and keyboard tests**

Run:

```bash
pnpm vitest run src/__tests__/scenarios.test.ts -t "manual scroll anchors"
pnpm vitest run src/contentScripts/keyboard-handler.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit scroll-sync anchor wiring**

Run:

```bash
git add src/contentScripts/scroll-sync.ts src/__tests__/scenarios.test.ts
git commit -m "feat: apply manual scroll anchors"
```

## Task 6: Add Bounded Lazy-Load Catch-Up

**Files:**

- Modify: `src/__tests__/scenarios.test.ts`
- Modify: `src/contentScripts/scroll-sync.ts`

- [ ] **Step 1: Add a scenario for temporarily short receivers**

In `src/__tests__/scenarios.test.ts`, inside `describe('Scenario: manual scroll anchors')`, add:

```typescript
it('retries anchored receiver mapping when lazy-loaded height grows after clamping', async () => {
  vi.useFakeTimers();

  try {
    setDocumentScrollMetrics(1500, 1000);
    await saveManualScrollOffset(63, 0.2, 700, {
      logicalRatio: 0.3,
      localScrollTop: 700,
      localMaxScrollAtCapture: 1400,
    });

    await startContentSync(63);
    await invokeContentMessage('scroll:sync', {
      scrollTop: 650,
      scrollHeight: 2000,
      clientHeight: 1000,
      sourceTabId: 99,
      mode: 'ratio',
      timestamp: Date.now(),
    });

    await vi.advanceTimersByTimeAsync(16);
    expect(document.documentElement.scrollTop).toBe(500);

    setDocumentScrollMetrics(2400, 1000);
    await vi.advanceTimersByTimeAsync(75);
    await vi.advanceTimersByTimeAsync(16);

    expect(document.documentElement.scrollTop).toBe(1050);
  } finally {
    vi.useRealTimers();
  }
});
```

- [ ] **Step 2: Run the lazy-load scenario and verify the expected failure**

Run:

```bash
pnpm vitest run src/__tests__/scenarios.test.ts -t "retries anchored receiver mapping"
```

Expected before implementation: FAIL because no bounded catch-up retry is scheduled after clamping.

- [ ] **Step 3: Add bounded catch-up state and constants**

In `src/contentScripts/scroll-sync.ts`, after `const urlMonitorState = createInitialUrlMonitorState();`, add:

```typescript
const MANUAL_ANCHOR_CATCH_UP_DELAY_MS = 75;
const MANUAL_ANCHOR_CATCH_UP_MAX_ATTEMPTS = 4;

interface ManualAnchorCatchUpState {
  timerId: number | null;
  sourceRatio: number;
  mode: typeof syncState.mode;
  sourceTabId: number;
  attemptsRemaining: number;
}

let manualAnchorCatchUpState: ManualAnchorCatchUpState | null = null;
```

- [ ] **Step 4: Implement bounded catch-up helpers**

Add these helpers near `cancelPendingProgrammaticScroll()`:

```typescript
function cancelManualAnchorCatchUp(): void {
  if (manualAnchorCatchUpState?.timerId !== null && manualAnchorCatchUpState?.timerId !== undefined) {
    window.clearTimeout(manualAnchorCatchUpState.timerId);
  }
  manualAnchorCatchUpState = null;
}

function runManualAnchorCatchUp(): void {
  const state = manualAnchorCatchUpState;
  if (!state || !syncState.isActive || syncState.isManualScrollEnabled || !cachedManualOffset.anchor) {
    cancelManualAnchorCatchUp();
    return;
  }

  const { scrollHeight, clientHeight } = getScrollInfo();
  const myMaxScroll = scrollHeight - clientHeight;
  const anchoredTarget = calculateAnchoredScrollTop(
    state.sourceRatio,
    myMaxScroll,
    cachedManualOffset.anchor,
  );

  scheduleProgrammaticScroll({
    top: anchoredTarget.scrollTop,
    sourceRatio: state.sourceRatio,
    mode: state.mode,
    sourceTabId: state.sourceTabId,
  });

  if (!anchoredTarget.wasClamped || state.attemptsRemaining <= 1) {
    manualAnchorCatchUpState = null;
    return;
  }

  manualAnchorCatchUpState = {
    ...state,
    timerId: window.setTimeout(runManualAnchorCatchUp, MANUAL_ANCHOR_CATCH_UP_DELAY_MS),
    attemptsRemaining: state.attemptsRemaining - 1,
  };
}

function scheduleManualAnchorCatchUp(
  sourceRatio: number,
  mode: typeof syncState.mode,
  sourceTabId: number,
): void {
  cancelManualAnchorCatchUp();
  manualAnchorCatchUpState = {
    timerId: window.setTimeout(runManualAnchorCatchUp, MANUAL_ANCHOR_CATCH_UP_DELAY_MS),
    sourceRatio,
    mode,
    sourceTabId,
    attemptsRemaining: MANUAL_ANCHOR_CATCH_UP_MAX_ATTEMPTS,
  };
}
```

- [ ] **Step 5: Wire catch-up scheduling and cancellation**

In the receiver after scheduling `nextScrollTop`, add:

```typescript
    if (anchoredTarget?.wasClamped) {
      scheduleManualAnchorCatchUp(sourceRatio, payload.mode, payload.sourceTabId);
    } else {
      cancelManualAnchorCatchUp();
    }
```

Call `cancelManualAnchorCatchUp()` in these existing transitions:

- At the beginning of `scroll:start`, next to `cancelPendingProgrammaticScroll()`.
- In the `scroll:stop` handler, before `clearManualScrollOffset()`.
- In the `url:sync` handler before clearing manual offset and navigating.
- In manual mode entry before freezing the baseline.

- [ ] **Step 6: Run lazy-load and full scenario tests**

Run:

```bash
pnpm vitest run src/__tests__/scenarios.test.ts -t "manual scroll anchors"
pnpm vitest run src/__tests__/scenarios.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit bounded lazy-load catch-up**

Run:

```bash
git add src/contentScripts/scroll-sync.ts src/__tests__/scenarios.test.ts
git commit -m "feat: bound manual anchor lazy load catch-up"
```

## Task 7: Update Scroll Sync Documentation

**Files:**

- Modify: `docs/guides/scroll-sync-pipeline.md`
- Modify: `src/contentScripts/README.md`
- Modify: `src/contentScripts/AGENTS.md`

- [ ] **Step 1: Update the pipeline guide manual offset lifecycle**

In `docs/guides/scroll-sync-pipeline.md`, replace the `수동 오프셋 (Manual Scroll Offset)` lifecycle block with:

````markdown
### 오프셋 생명주기

```
Alt keydown
  → pending receiver target 취소
  → syncState.isManualScrollEnabled = true (동기화 메시지 무시)
  → 공통 logical ratio 스냅샷

Alt keyup
  → 현재 탭의 local scrollTop과 current maxScroll 측정
  → logicalRatio <-> localScrollTop manual anchor 저장
  → legacy ratio/pixels 값도 panel 표시와 fallback용으로 저장
  → cachedManualOffset을 먼저 갱신
  → syncState.isManualScrollEnabled = false

이후 스크롤 동기화:
  발신: anchor가 있으면 local scrollTop → logical ratio로 역변환
        anchor가 없으면 기존 currentRatio - offsetRatio fallback
  수신: anchor가 있으면 logical ratio → local scrollTop으로 piecewise 매핑
        anchor가 없으면 기존 sourceRatio + offsetRatio fallback
```
````

Add this paragraph after the lifecycle block:

```markdown
Manual anchor mapping은 항상 현재 `scrollHeight - clientHeight`를 사용한다. 저장 당시
`localMaxScrollAtCapture`는 검증과 디버깅용 metadata이고, lazy loading으로 anchor 아래
content가 늘어난 경우 다음 sync 계산은 늘어난 현재 높이를 기준으로 다시 매핑한다. 수신
페이지가 아직 너무 짧아서 target이 clamp되면 제한된 catch-up retry만 수행하며, 무한
MutationObserver나 polling loop는 사용하지 않는다.
```

- [ ] **Step 2: Update the content script README manual section**

In `src/contentScripts/README.md`, replace the current `Manual Scroll Adjustment` section with:

```markdown
## Manual Scroll Adjustment

1. User holds **Option** (Mac) / **Alt** (Win) → snapshot the shared logical ratio synchronously
2. Scroll freely — incoming sync messages are ignored during manual mode
3. Release key → save a manual anchor: `logicalRatio <-> localScrollTop`
4. Keep legacy `ratio` and `pixels` values for fallback and panel display
5. Resume sync with anchor-based piecewise mapping:
   - source tabs convert local scrollTop back to logical ratio
   - receiver tabs convert logical ratio into local scrollTop

**Wheel mode** (unfocused tabs — Arc/Dia split view) uses the same manual anchor save path as keyboard mode.

**Lazy loading**: Anchor mapping uses the current scrollable height on every calculation. When a
receiver is temporarily too short, it may run a bounded catch-up retry, but it must not install an
unbounded observer or polling loop.
```

- [ ] **Step 3: Update content script AGENTS manual offset guidance**

In `src/contentScripts/AGENTS.md`, replace the `Manual Offset System` section with:

```markdown
## Manual Offset System

1. User holds **Option** (Mac) / **Alt** (Win) → snapshot shared logical ratio synchronously
2. Scroll freely — incoming sync messages are ignored during manual mode
3. Release key → save `logicalRatio <-> localScrollTop` as a manual anchor
4. Keep legacy `ratio` and `pixels` values for fallback and panel display
5. Resume sync with anchor-based piecewise mapping

**Wheel mode** (unfocused tabs — Arc/Dia split view): Detect Alt via `wheel.altKey` and save the
same manual anchor shape as keyboard mode. Release detection still uses throttled `mousemove`.

**Offset cleared on**: URL navigation, sync stop, or manual reset.
Pending receiver targets and bounded anchor catch-up retries are cancelled before manual baselines,
resets, URL navigation, and stop transitions so unapplied future targets cannot pollute offsets or
apply after state changes.
```

- [ ] **Step 4: Format docs**

Run:

```bash
pnpm format:fix docs/guides/scroll-sync-pipeline.md src/contentScripts/README.md src/contentScripts/AGENTS.md
```

Expected: files are formatted without unrelated changes.

- [ ] **Step 5: Commit docs**

Run:

```bash
git add docs/guides/scroll-sync-pipeline.md src/contentScripts/README.md src/contentScripts/AGENTS.md
git commit -m "docs: explain manual scroll anchors"
```

## Task 8: Final Verification And Privacy Scan

**Files:**

- Verify only; no code edits expected.

- [ ] **Step 1: Run focused tests**

Run:

```bash
pnpm vitest run src/shared/lib/scroll-math.test.ts
pnpm vitest run src/shared/lib/storage.test.ts
pnpm vitest run src/contentScripts/lib/manual-scroll-offset.test.ts
pnpm vitest run src/contentScripts/keyboard-handler.test.ts
pnpm vitest run src/__tests__/scenarios.test.ts -t "manual scroll anchors"
```

Expected: all PASS.

- [ ] **Step 2: Run project validation**

Run:

```bash
pnpm typecheck
pnpm test
pnpm i18n:validate
pnpm privacy:logging
```

Expected: all PASS.

- [ ] **Step 3: Run required privacy search for touched sync/logging/storage code**

Run:

```bash
rg -n "logger\\.|url|Url|URL|tab\\.url|window\\.location\\.href|payload|normalizedUrl|sourceUrl|targetUrl" src/contentScripts src/shared/lib/storage.ts docs/guides/scroll-sync-pipeline.md src/contentScripts/README.md src/contentScripts/AGENTS.md
```

Expected: review matches manually. No new logger call may include raw URLs, titles, page metadata, or full payload objects. Existing URL logic in `url:sync` is acceptable only when not logged or externally leaked.

- [ ] **Step 4: Review commit history**

Run:

```bash
git log --oneline -8
git status --short
```

Expected:

```text
feat: bound manual anchor lazy load catch-up
feat: apply manual scroll anchors
feat: save keyboard manual scroll anchors
feat: build manual scroll anchor offsets
feat: validate manual scroll anchors
feat: add manual scroll anchor math
```

`git status --short` should have no implementation or docs changes left except pre-existing unrelated files such as `.playwright-mcp/`.
