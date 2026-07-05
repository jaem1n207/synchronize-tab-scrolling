# Manual Scroll Pixel Delta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace manual anchor post-anchor proportional mapping with pixel-delta preservation so manually aligned content remains at the same viewport height during nearby scrolling.

**Architecture:** Keep the existing manual offset storage and scroll-sync pipeline, but add a versioned anchor mode. Newly captured anchors use `pixel-delta`; old anchors without a mode keep the existing `piecewise-ratio` behavior. Scroll hot paths stay O(1) arithmetic over cached state and current scroll metrics.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, webext-bridge, webextension-polyfill.

---

## File Structure

- Modify `src/shared/lib/scroll-math.ts`
  - Add pixel-delta mapping helpers next to the existing piecewise anchor helpers.
  - Keep helpers pure, DOM-free, and storage-free.
- Modify `src/shared/lib/scroll-math.test.ts`
  - Add unit coverage for source-to-logical and logical-to-receiver pixel-delta mapping.
- Modify `src/shared/lib/storage.ts`
  - Add `ManualScrollAnchorMode` and `ManualScrollSemanticHint` types.
  - Runtime-validate optional `mode` and optional semantic hint fields.
  - Preserve old persisted anchors by leaving missing `mode` undefined.
- Modify `src/shared/lib/storage.test.ts`
  - Cover valid pixel-delta anchors, missing-mode legacy anchors, invalid modes, and invalid semantic hints.
- Modify `src/contentScripts/lib/manual-scroll-offset.ts`
  - Save newly captured manual anchors with `mode: 'pixel-delta'`.
- Modify `src/contentScripts/lib/manual-scroll-offset.test.ts`
  - Update expected anchor shape.
- Modify `src/contentScripts/keyboard-handler.test.ts`
  - Update keyboard manual-save expectations to include `mode: 'pixel-delta'`.
- Modify `src/contentScripts/scroll-sync.ts`
  - Use pixel-delta mapping for anchors whose mode is `pixel-delta`.
  - Keep existing piecewise mapping for missing-mode anchors.
  - Carry source scroll pixel information through bounded lazy-load catch-up.
- Modify `src/__tests__/scenarios.test.ts`
  - Add the reported class of regression: post-anchor lengths differ, small scroll preserves pixel delta.
  - Update existing anchor expectations that newly saved anchors are pixel-delta.
  - Add a guard that semantic helpers are not called from active scroll paths if a helper is introduced.
- Modify `docs/guides/scroll-sync-pipeline.md`
  - Document pixel-delta as the new default manual anchor mode and piecewise as legacy.
- Modify `docs/guides/known-pitfalls.md`
  - Add the invariant: manual anchor hot path must not scan DOM or storage, and post-anchor ratio drift is a known failure mode.

Semantic assistance is not wired into active scrolling in this implementation. Storage supports an optional semantic hint shape so a separate bounded helper revision can use the persisted contract, but this plan does not add runtime DOM scanning.

## Task 1: Add Pixel-Delta Scroll Math

**Files:**

- Modify: `src/shared/lib/scroll-math.ts`
- Test: `src/shared/lib/scroll-math.test.ts`

- [ ] **Step 1: Add failing source mapping tests**

Add these tests inside `describe('calculateAnchoredLogicalRatio', ...)` or in a new `describe('calculatePixelDeltaLogicalRatio', ...)` block in `src/shared/lib/scroll-math.test.ts`:

```typescript
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
    ).toBe(1);
  });
});
```

Add the missing import in the same file:

```typescript
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
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm exec vitest run src/shared/lib/scroll-math.test.ts
```

Expected: FAIL because `calculatePixelDeltaLogicalRatio` and `calculatePixelDeltaScrollTop` are not exported yet.

- [ ] **Step 3: Add receiver mapping tests**

Add this test block to `src/shared/lib/scroll-math.test.ts`:

```typescript
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
});
```

- [ ] **Step 4: Implement pixel-delta helpers**

Add these exports to `src/shared/lib/scroll-math.ts` after `calculateAnchoredScrollTop()`:

```typescript
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
```

- [ ] **Step 5: Run the focused test and verify it passes**

Run:

```bash
pnpm exec vitest run src/shared/lib/scroll-math.test.ts
```

Expected: PASS for all `scroll-math.test.ts` tests.

- [ ] **Step 6: Commit Task 1**

```bash
git add src/shared/lib/scroll-math.ts src/shared/lib/scroll-math.test.ts
git commit -m "feat: add pixel delta scroll math"
```

## Task 2: Version Manual Anchor Storage and Capture

**Files:**

- Modify: `src/shared/lib/storage.ts`
- Modify: `src/shared/lib/storage.test.ts`
- Modify: `src/contentScripts/lib/manual-scroll-offset.ts`
- Modify: `src/contentScripts/lib/manual-scroll-offset.test.ts`
- Modify: `src/contentScripts/keyboard-handler.test.ts`
- Modify: `src/__tests__/scenarios.test.ts`

- [ ] **Step 1: Add failing storage tests for anchor mode**

Add these tests inside `describe('loadManualScrollOffsets', ...)` in `src/shared/lib/storage.test.ts`:

```typescript
it('returns stored manual scroll offsets with pixel-delta anchor mode', async () => {
  storageGetMock.mockResolvedValue({
    manualScrollOffsets: {
      1: {
        ratio: 0.25,
        pixels: 120,
        anchor: {
          logicalRatio: 0.3,
          localScrollTop: 600,
          localMaxScrollAtCapture: 1200,
          mode: 'pixel-delta',
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
        mode: 'pixel-delta',
      },
    },
  });
});

it('drops invalid manual anchor mode while preserving valid anchor numbers', async () => {
  storageGetMock.mockResolvedValue({
    manualScrollOffsets: {
      1: {
        ratio: 0.25,
        pixels: 120,
        anchor: {
          logicalRatio: 0.3,
          localScrollTop: 600,
          localMaxScrollAtCapture: 1200,
          mode: 'semantic-every-scroll',
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

- [ ] **Step 2: Add failing storage tests for semantic hint validation**

Add these tests in the same `describe('loadManualScrollOffsets', ...)` block:

```typescript
it('keeps valid semantic hint metadata on manual anchors', async () => {
  storageGetMock.mockResolvedValue({
    manualScrollOffsets: {
      1: {
        ratio: 0.25,
        pixels: 120,
        anchor: {
          logicalRatio: 0.3,
          localScrollTop: 600,
          localMaxScrollAtCapture: 1200,
          mode: 'pixel-delta',
          semanticHint: {
            kind: 'figcaption',
            localTopAtCapture: 590,
            viewportOffsetAtCapture: 300,
          },
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
        mode: 'pixel-delta',
        semanticHint: {
          kind: 'figcaption',
          localTopAtCapture: 590,
          viewportOffsetAtCapture: 300,
        },
      },
    },
  });
});

it('drops invalid semantic hint metadata without dropping the anchor', async () => {
  storageGetMock.mockResolvedValue({
    manualScrollOffsets: {
      1: {
        ratio: 0.25,
        pixels: 120,
        anchor: {
          logicalRatio: 0.3,
          localScrollTop: 600,
          localMaxScrollAtCapture: 1200,
          mode: 'pixel-delta',
          semanticHint: {
            kind: 'script',
            localTopAtCapture: 590,
            viewportOffsetAtCapture: 300,
          },
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
        mode: 'pixel-delta',
      },
    },
  });
});
```

- [ ] **Step 3: Run storage tests and verify they fail**

Run:

```bash
pnpm exec vitest run src/shared/lib/storage.test.ts
```

Expected: FAIL because `mode` and `semanticHint` are not preserved yet.

- [ ] **Step 4: Add typed storage model and validators**

Update `src/shared/lib/storage.ts` manual offset interfaces:

```typescript
export type ManualScrollAnchorMode = 'piecewise-ratio' | 'pixel-delta';

export interface ManualScrollSemanticHint {
  kind: 'figure' | 'figcaption' | 'heading' | 'paragraph';
  localTopAtCapture: number;
  viewportOffsetAtCapture: number;
}

export interface ManualScrollAnchor {
  logicalRatio: number;
  localScrollTop: number;
  localMaxScrollAtCapture: number;
  mode?: ManualScrollAnchorMode;
  semanticHint?: ManualScrollSemanticHint;
}
```

Add these helpers below `isFiniteNumber()`:

```typescript
function readManualScrollAnchorMode(value: unknown): ManualScrollAnchorMode | undefined {
  if (value === 'piecewise-ratio' || value === 'pixel-delta') return value;
  return undefined;
}

function readManualScrollSemanticKind(
  value: unknown,
): ManualScrollSemanticHint['kind'] | undefined {
  if (
    value === 'figure' ||
    value === 'figcaption' ||
    value === 'heading' ||
    value === 'paragraph'
  ) {
    return value;
  }

  return undefined;
}

function readManualScrollSemanticHint(value: unknown): ManualScrollSemanticHint | undefined {
  if (!isRecord(value)) return undefined;

  const { kind, localTopAtCapture, viewportOffsetAtCapture } = value;
  const parsedKind = readManualScrollSemanticKind(kind);

  if (
    !parsedKind ||
    !isFiniteNumber(localTopAtCapture) ||
    !isFiniteNumber(viewportOffsetAtCapture)
  ) {
    return undefined;
  }

  return {
    kind: parsedKind,
    localTopAtCapture,
    viewportOffsetAtCapture,
  };
}
```

Replace the return block in `readManualScrollAnchor()` with:

```typescript
const parsedMode = readManualScrollAnchorMode(value.mode);
const parsedSemanticHint = readManualScrollSemanticHint(value.semanticHint);

return {
  logicalRatio,
  localScrollTop,
  localMaxScrollAtCapture,
  ...(parsedMode ? { mode: parsedMode } : {}),
  ...(parsedSemanticHint ? { semanticHint: parsedSemanticHint } : {}),
};
```

- [ ] **Step 5: Update newly captured manual offsets to pixel-delta**

In `src/contentScripts/lib/manual-scroll-offset.ts`, update the returned anchor:

```typescript
    anchor: {
      logicalRatio: safeBaselineLogicalRatio,
      localScrollTop: safeCurrentScrollTop,
      localMaxScrollAtCapture: safeMaxScroll,
      mode: 'pixel-delta',
    },
```

- [ ] **Step 6: Update manual offset builder tests**

In `src/contentScripts/lib/manual-scroll-offset.test.ts`, update every expected `anchor` object to include:

```typescript
mode: 'pixel-delta',
```

For example, the first test should expect:

```typescript
anchor: {
  logicalRatio: 0.3,
  localScrollTop: 600,
  localMaxScrollAtCapture: 1000,
  mode: 'pixel-delta',
},
```

- [ ] **Step 7: Update keyboard and scenario expectations**

In `src/contentScripts/keyboard-handler.test.ts`, update manual-save expectations:

```typescript
expect(mocks.saveManualScrollOffsetMock).toHaveBeenCalledWith(13, 0.3, 300, {
  logicalRatio: 0.3,
  localScrollTop: 600,
  localMaxScrollAtCapture: 1000,
  mode: 'pixel-delta',
});
```

In `src/__tests__/scenarios.test.ts`, update newly saved wheel manual mode expectations:

```typescript
anchor: {
  logicalRatio: 0.3,
  localScrollTop: 600,
  localMaxScrollAtCapture: 1000,
  mode: 'pixel-delta',
},
```

Do not add `mode` to tests that intentionally exercise legacy stored anchors unless that test should use the new pixel-delta behavior.

- [ ] **Step 8: Run focused storage and capture tests**

Run:

```bash
pnpm exec vitest run src/shared/lib/storage.test.ts src/contentScripts/lib/manual-scroll-offset.test.ts src/contentScripts/keyboard-handler.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit Task 2**

```bash
git add src/shared/lib/storage.ts src/shared/lib/storage.test.ts src/contentScripts/lib/manual-scroll-offset.ts src/contentScripts/lib/manual-scroll-offset.test.ts src/contentScripts/keyboard-handler.test.ts src/__tests__/scenarios.test.ts
git commit -m "feat: version manual scroll anchors"
```

## Task 3: Apply Pixel-Delta Mapping in Scroll Sync

**Files:**

- Modify: `src/contentScripts/scroll-sync.ts`
- Test: `src/__tests__/scenarios.test.ts`

- [ ] **Step 1: Add a failing scenario for the reported drift class**

In `src/__tests__/scenarios.test.ts`, add this test inside `describe('Scenario: manual scroll offset adjustment and scroll correctness', ...)`:

```typescript
it('keeps the receiver at the same pixel delta from anchor when post-anchor lengths differ', async () => {
  installImmediateAnimationFrame();
  setDocumentScrollMetrics(2600, 1000);
  await saveManualScrollOffset(31, 0.2, 600, {
    logicalRatio: 0.3,
    localScrollTop: 900,
    localMaxScrollAtCapture: 1600,
    mode: 'pixel-delta',
  });
  await startContentSync(31);

  await invokeContentMessage('scroll:sync', {
    sourceTabId: 99,
    mode: 'ratio',
    scrollTop: 342,
    scrollHeight: 2000,
    clientHeight: 1000,
    timestamp: Date.now(),
  });
  await flushAsync();

  expect(document.documentElement.scrollTop).toBe(942);
});
```

This test models source anchor logical top `300`, source scroll top `342`, and source delta `42`.
The receiver anchor is `900`, so the expected target is `942`. The existing piecewise-ratio model
would produce `984`, proving the drift.

- [ ] **Step 2: Add a legacy piecewise scenario**

Add this adjacent test to prove missing-mode anchors keep the current behavior:

```typescript
it('keeps missing-mode anchors on the legacy piecewise-ratio mapping', async () => {
  installImmediateAnimationFrame();
  setDocumentScrollMetrics(2600, 1000);
  await saveManualScrollOffset(32, 0.2, 600, {
    logicalRatio: 0.3,
    localScrollTop: 900,
    localMaxScrollAtCapture: 1600,
  });
  await startContentSync(32);

  await invokeContentMessage('scroll:sync', {
    sourceTabId: 99,
    mode: 'ratio',
    scrollTop: 342,
    scrollHeight: 2000,
    clientHeight: 1000,
    timestamp: Date.now(),
  });
  await flushAsync();

  expect(document.documentElement.scrollTop).toBe(984);
});
```

- [ ] **Step 3: Run the scenario test and verify the new pixel-delta test fails**

Run:

```bash
pnpm exec vitest run src/__tests__/scenarios.test.ts -t "post-anchor lengths differ"
```

Expected: FAIL with actual scroll top near `984` instead of `942`.

- [ ] **Step 4: Import pixel-delta helpers**

Update the import from `~/shared/lib/scroll-math` in `src/contentScripts/scroll-sync.ts`:

```typescript
import {
  calculateAnchoredLogicalRatio,
  calculateAnchoredScrollTop,
  calculatePixelDeltaLogicalRatio,
  calculatePixelDeltaScrollTop,
  calculateScrollRatio,
  clampScrollPosition,
  findNearestIndex,
} from '~/shared/lib/scroll-math';
```

- [ ] **Step 5: Add a small local target helper**

Add this helper near `getScrollableHeight()` in `src/contentScripts/scroll-sync.ts`:

```typescript
function isPixelDeltaManualAnchor(anchor: ManualScrollOffset['anchor']): boolean {
  return anchor?.mode === 'pixel-delta';
}

function calculateManualAnchorReceiverTarget({
  anchor,
  sourceRatio,
  sourceScrollTop,
  sourceMaxScroll,
  targetMaxScroll,
}: {
  anchor: NonNullable<ManualScrollOffset['anchor']>;
  sourceRatio: number;
  sourceScrollTop: number;
  sourceMaxScroll: number;
  targetMaxScroll: number;
}) {
  if (isPixelDeltaManualAnchor(anchor)) {
    return calculatePixelDeltaScrollTop(sourceScrollTop, sourceMaxScroll, targetMaxScroll, anchor);
  }

  return calculateAnchoredScrollTop(sourceRatio, targetMaxScroll, anchor);
}
```

Add `ManualScrollOffset` to the existing type-only storage import:

```typescript
import type { ManualScrollOffset } from '~/shared/lib/storage';
```

- [ ] **Step 6: Use pixel-delta mapping when this tab is the source**

Replace the `pureRatio` calculation in `handleScrollCore()` with:

```typescript
const pureRatio = offsetData.anchor
  ? isPixelDeltaManualAnchor(offsetData.anchor)
    ? calculatePixelDeltaLogicalRatio(scrollInfo.scrollTop, myMaxScroll, offsetData.anchor)
    : calculateAnchoredLogicalRatio(scrollInfo.scrollTop, myMaxScroll, offsetData.anchor)
  : currentRatio - offsetData.ratio;
```

Keep `pureScrollTop` as:

```typescript
const pureScrollTop = clampScrollPosition(pureRatio * myMaxScroll, myMaxScroll);
```

- [ ] **Step 7: Use pixel-delta mapping on receivers**

In the `scroll:sync` receiver, compute source max and clamped source scroll top before target
calculation:

```typescript
const sourceMaxScroll = getScrollableHeight(payload.scrollHeight, payload.clientHeight);
const sourceScrollTop = clampScrollPosition(payload.scrollTop, sourceMaxScroll);
```

Replace the `anchoredTarget` block with:

```typescript
const anchoredTarget = offsetData.anchor
  ? calculateManualAnchorReceiverTarget({
      anchor: offsetData.anchor,
      sourceRatio,
      sourceScrollTop,
      sourceMaxScroll,
      targetMaxScroll: myMaxScroll,
    })
  : null;
```

Add safe debug metadata:

```typescript
      manualAnchorMode: offsetData.anchor?.mode ?? 'legacy-piecewise-ratio',
      sourceMaxScroll,
```

Do not log payload objects, URLs, titles, or text.

- [ ] **Step 8: Update bounded lazy-load catch-up inputs**

Change `scheduleLazyLoadAnchorCatchUp()` to accept and retain `sourceScrollTop` and `sourceMaxScroll`:

```typescript
function scheduleLazyLoadAnchorCatchUp({
  sourceRatio,
  sourceScrollTop,
  sourceMaxScroll,
  mode,
  sourceTabId,
  attempt,
}: {
  sourceRatio: number;
  sourceScrollTop: number;
  sourceMaxScroll: number;
  mode: ProgrammaticScrollTarget['mode'];
  sourceTabId: number;
  attempt: number;
}): void {
```

Inside the timeout, replace direct `calculateAnchoredScrollTop(...)` with:

```typescript
const target = calculateManualAnchorReceiverTarget({
  anchor: cachedManualOffset.anchor,
  sourceRatio,
  sourceScrollTop,
  sourceMaxScroll,
  targetMaxScroll: maxScroll,
});
```

When recursively scheduling another attempt, pass through `sourceScrollTop` and `sourceMaxScroll`.

When calling `scheduleLazyLoadAnchorCatchUp()` from the receiver, pass:

```typescript
        sourceRatio,
        sourceScrollTop,
        sourceMaxScroll,
```

- [ ] **Step 9: Run focused scenario tests**

Run:

```bash
pnpm exec vitest run src/__tests__/scenarios.test.ts -t "manual scroll offset adjustment"
```

Expected: PASS.

- [ ] **Step 10: Run related tests**

Run:

```bash
pnpm exec vitest run src/__tests__/scenarios.test.ts src/shared/lib/scroll-math.test.ts src/contentScripts/lib/manual-scroll-offset.test.ts src/contentScripts/keyboard-handler.test.ts src/shared/lib/storage.test.ts
```

Expected: PASS.

- [ ] **Step 11: Commit Task 3**

```bash
git add src/contentScripts/scroll-sync.ts src/__tests__/scenarios.test.ts
git commit -m "feat: apply pixel delta manual anchors"
```

## Task 4: Add Performance Guard Coverage

**Files:**

- Modify: `src/__tests__/scenarios.test.ts`

- [ ] **Step 1: Add a hot-path storage guard scenario**

First expose the storage mock calls at the top of `src/__tests__/scenarios.test.ts`.

Change the hoisted mock return value to include storage mocks:

```typescript
    storageGetMock: vi.fn(),
    storageSetMock: vi.fn(),
    storageClearMock: vi.fn(),
```

Then replace the inline `vi.fn(async ...)` storage methods with named mocks:

```typescript
        get: mocks.storageGetMock,
        set: mocks.storageSetMock,
        clear: mocks.storageClearMock,
```

Add these default implementations in `beforeEach()` before scenario setup uses storage:

```typescript
mocks.storageGetMock.mockImplementation(async (key?: unknown) => {
  if (typeof key === 'string') {
    const value = mocks.storageData.get(key);
    return value !== undefined ? { [key]: value } : {};
  }

  if (Array.isArray(key)) {
    const result: Record<string, unknown> = {};
    for (const item of key) {
      if (typeof item === 'string' && mocks.storageData.has(item)) {
        result[item] = mocks.storageData.get(item);
      }
    }
    return result;
  }

  if (key && typeof key === 'object') {
    const defaults = key;
    const result: Record<string, unknown> = {};
    for (const [entryKey, entryValue] of Object.entries(defaults)) {
      result[entryKey] = mocks.storageData.has(entryKey)
        ? mocks.storageData.get(entryKey)
        : entryValue;
    }
    return result;
  }

  const result: Record<string, unknown> = {};
  for (const [entryKey, entryValue] of mocks.storageData.entries()) {
    result[entryKey] = entryValue;
  }
  return result;
});

mocks.storageSetMock.mockImplementation(async (data: Record<string, unknown>) => {
  for (const [key, value] of Object.entries(data)) {
    mocks.storageData.set(key, value);
  }
});

mocks.storageClearMock.mockImplementation(async () => {
  mocks.storageData.clear();
});
```

Then add this test inside the manual scroll scenario block:

```typescript
it('does not read manual offset storage while handling active source scroll', async () => {
  setDocumentScrollMetrics(2000, 1000);
  await saveManualScrollOffset(33, 0.3, 300, {
    logicalRatio: 0.3,
    localScrollTop: 600,
    localMaxScrollAtCapture: 1000,
    mode: 'pixel-delta',
  });
  await startContentSync(33);
  mocks.storageGetMock.mockClear();

  setWindowScrollTop(642);
  window.dispatchEvent(new Event('scroll'));
  await flushAsync();

  expect(mocks.storageGetMock).not.toHaveBeenCalled();
});
```

The assertion must stay on `mocks.storageGetMock`, which is the scenario test's
`browser.storage.local.get` mock.

- [ ] **Step 2: Add a semantic hot-path guard**

If a semantic helper is introduced during implementation, mock it and assert it is not called from
active source or receiver scroll paths:

```typescript
expect(captureManualScrollSemanticHintMock).not.toHaveBeenCalled();
```

If no semantic helper is introduced, add this comment to the scenario block above the storage guard:

```typescript
// Semantic anchor repair is intentionally not wired into active scroll handling.
// The hot path must stay limited to cached state and numeric scroll metrics.
```

- [ ] **Step 3: Run the guarded scenario tests**

Run:

```bash
pnpm exec vitest run src/__tests__/scenarios.test.ts -t "manual scroll offset adjustment"
```

Expected: PASS.

- [ ] **Step 4: Commit Task 4**

```bash
git add src/__tests__/scenarios.test.ts
git commit -m "test: guard manual anchor hot path"
```

## Task 5: Update Documentation

**Files:**

- Modify: `docs/guides/scroll-sync-pipeline.md`
- Modify: `docs/guides/known-pitfalls.md`

- [ ] **Step 1: Update scroll pipeline guide**

In `docs/guides/scroll-sync-pipeline.md`, replace text that describes new manual anchors as
post-anchor piecewise ratio by default with:

```markdown
새로 저장되는 manual anchor는 기본적으로 `pixel-delta` 모드입니다. 사용자가 Option/Alt로
맞춘 지점 이후에는 문서 끝까지의 남은 비율을 다시 계산하지 않고, anchor에서 이동한 픽셀
delta를 다른 탭의 local anchor에 적용합니다. 이 덕분에 번역문처럼 anchor 이후 문단 높이가
달라도 방금 맞춘 figure, caption, paragraph는 가까운 스크롤에서 같은 viewport 높이를
유지합니다.

기존 저장값처럼 `mode`가 없는 anchor는 compatibility를 위해 `piecewise-ratio`로 처리합니다.
이 값은 anchor 위/아래 구간을 문서 길이에 비례 매핑하므로, 오래된 저장값을 유지하되 새 수동
조정부터는 pixel-delta behavior를 사용합니다.
```

- [ ] **Step 2: Update known pitfalls**

In `docs/guides/known-pitfalls.md`, add this pitfall near the manual offset cache section:

```markdown
### Manual anchor에서 post-anchor ratio를 기본값으로 되돌리지 말 것

수동 조정의 핵심은 사용자가 방금 맞춘 문맥의 viewport 위치를 보존하는 것입니다. 새 manual
anchor는 `pixel-delta` 모드로 저장되어야 하며, active scroll path에서는 `scrollTop -
anchor.localScrollTop`만큼의 delta를 다른 탭 anchor에 적용해야 합니다.

`currentMaxScroll - anchorTop`으로 post-anchor 남은 구간을 다시 비례 매핑하면 번역문,
figcaption, 이미지 간격처럼 anchor 이후 길이가 다른 문서에서 다시 drift가 생깁니다.

- [ ] 새로 저장되는 anchor에 `mode: 'pixel-delta'`가 포함되는가?
- [ ] `mode`가 없는 기존 anchor만 legacy piecewise-ratio로 처리되는가?
- [ ] active scroll path에 DOM scan, storage I/O, layout read가 추가되지 않았는가?
```

- [ ] **Step 3: Run docs diff check**

Run:

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 4: Commit Task 5**

```bash
git add docs/guides/scroll-sync-pipeline.md docs/guides/known-pitfalls.md
git commit -m "docs: explain pixel delta manual anchors"
```

## Task 6: Final Verification and PR Handoff

**Files:**

- No source edits unless verification reveals a failure.

- [ ] **Step 1: Run focused related tests**

Run:

```bash
pnpm exec vitest run src/__tests__/scenarios.test.ts src/shared/lib/scroll-math.test.ts src/contentScripts/lib/manual-scroll-offset.test.ts src/contentScripts/keyboard-handler.test.ts src/shared/lib/storage.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
pnpm exec tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Run lint on changed code files**

Run:

```bash
pnpm exec eslint src/contentScripts/scroll-sync.ts src/__tests__/scenarios.test.ts src/contentScripts/keyboard-handler.test.ts src/shared/lib/scroll-math.ts src/shared/lib/scroll-math.test.ts src/shared/lib/storage.ts src/shared/lib/storage.test.ts src/contentScripts/lib/manual-scroll-offset.ts src/contentScripts/lib/manual-scroll-offset.test.ts --max-warnings=0
```

Expected: PASS.

- [ ] **Step 4: Run privacy validation**

Run:

```bash
pnpm privacy:logging
```

Expected: PASS. If the sandbox blocks `tsx` IPC under `/var/folders`, rerun the same command with
escalated permissions and record that the first failure was environmental.

- [ ] **Step 5: Run i18n validation**

Run:

```bash
pnpm i18n:validate
```

Expected: PASS. If the sandbox blocks `tsx` IPC under `/var/folders`, rerun the same command with
escalated permissions and record that the first failure was environmental.

- [ ] **Step 6: Build Arc/Chromium unpacked extension**

Run:

```bash
pnpm build
```

Expected: PASS and generated files under:

```text
extension/manifest.json
extension/dist/background/index.mjs
extension/dist/contentScripts/index.global.js
```

If the sandbox blocks `tsx` IPC, rerun `pnpm build` with escalated permissions.

- [ ] **Step 7: Check final git state**

Run:

```bash
git status --short
git log --oneline origin/manual-scroll-anchor..HEAD
```

Expected: only pre-existing untracked `.playwright-mcp/` remains unstaged. The log contains the new
pixel-delta commits.

- [ ] **Step 8: Push and update PR**

Run:

```bash
git push
gh pr edit 394 --body-file /tmp/manual-scroll-anchor-pr-body.md
```

Before `gh pr edit`, write `/tmp/manual-scroll-anchor-pr-body.md` with the final summary and
verification results:

```markdown
## Summary

- replace post-anchor proportional manual mapping with pixel-delta anchor preservation
- keep missing-mode anchors on legacy piecewise mapping for compatibility
- keep scroll hot paths free of storage I/O, DOM scans, layout reads, and text matching
- document the pixel-delta manual anchor invariant

## Verification

- pnpm exec vitest run src/**tests**/scenarios.test.ts src/shared/lib/scroll-math.test.ts src/contentScripts/lib/manual-scroll-offset.test.ts src/contentScripts/keyboard-handler.test.ts src/shared/lib/storage.test.ts
- pnpm exec tsc --noEmit
- pnpm exec eslint src/contentScripts/scroll-sync.ts src/**tests**/scenarios.test.ts src/contentScripts/keyboard-handler.test.ts src/shared/lib/scroll-math.ts src/shared/lib/scroll-math.test.ts src/shared/lib/storage.ts src/shared/lib/storage.test.ts src/contentScripts/lib/manual-scroll-offset.ts src/contentScripts/lib/manual-scroll-offset.test.ts --max-warnings=0
- pnpm privacy:logging
- pnpm i18n:validate
- pnpm build

## Manual testing

- Arc/Chromium unpacked extension root: `extension`
- Arc: open `arc://extensions`, enable Developer Mode, Load unpacked, select the repository `extension` folder
```

Expected: branch push succeeds and PR #394 reflects the revised behavior and verification.
