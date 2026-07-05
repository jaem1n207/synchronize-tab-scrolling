# Manual Scroll Anchor Design

## Context

Manual scroll adjustment currently stores an offset ratio. When a user holds Option or Alt and
scrolls one tab, the extension saves:

```text
offsetRatio = currentRatio - baselineRatio
```

Later, source tabs subtract that ratio before broadcasting and receiver tabs add it back:

```text
source pure ratio = currentRatio - offsetRatio
target ratio = sourceRatio + offsetRatio
```

This keeps the implementation simple, but it does not preserve the user's aligned context. If tab A
has a scrollable height of `10889`, tab B has a scrollable height of `13094`, and B was manually
adjusted by `-395px`, a small source scroll can still move B by a larger pixel delta because B keeps
following its longer document ratio. The user-visible result is that paragraphs drift apart again
after the user has already aligned them.

The intended product behavior is not "keep a ratio offset." It is "keep the manually aligned
anchor meaningful, then map movement before and after that anchor."

## Goal

Make manual scroll adjustment preserve the user-selected alignment point.

Accepted behavior:

- The point aligned by the user becomes a manual anchor.
- When the source is above that anchor, receivers map progress through the pre-anchor segment.
- When the source is below that anchor, receivers map progress through the post-anchor segment.
- If two pages differ only by a table of contents, banner, or header before the aligned content,
  scrolling after the anchor should keep the matching content aligned instead of reintroducing ratio
  drift.
- If the remaining content lengths differ, movement after the anchor should be proportional within
  the remaining segment.
- Existing ratio sync, instant receiver scrolls, manual-mode guards, URL sync offset clearing, and
  privacy logging rules should remain intact.

## Non-Goals

- Do not analyze page structure, headings, paragraphs, images, or semantic elements to find matching
  content.
- Do not add a user-facing setting for anchor behavior.
- Do not change the `scroll:sync` message protocol unless implementation proves the current payload
  cannot encode the logical ratio safely.
- Do not make manual anchors survive URL sync navigation or explicit sync stop.
- Do not guarantee automatic correction when a page inserts new content above the saved anchor. That
  changes the pixel location of the aligned content and requires either semantic page analysis or a
  new user adjustment.

## Chosen Approach

Use an anchor-based piecewise ratio mapping.

Each tab with a manual adjustment stores the logical sync ratio that was active when manual mode
started and the local scroll position chosen by the user when manual mode ended. Future sync uses
that pair as the fixed correspondence:

```text
logical anchor ratio <-> local anchor scrollTop
```

The mapping is piecewise:

- Above the anchor, map progress from the document top to the anchor.
- Below the anchor, map progress from the anchor to the current document bottom.

This keeps the aligned point stable while still allowing documents of different remaining lengths
to move naturally.

## Data Model

Extend the stored manual offset format instead of replacing it outright:

```typescript
interface ManualScrollAnchor {
  logicalRatio: number;
  localScrollTop: number;
  localMaxScrollAtCapture: number;
}

interface ManualScrollOffset {
  ratio: number;
  pixels: number;
  anchor?: ManualScrollAnchor;
}
```

Field meanings:

- `logicalRatio`: the common sync position captured when manual mode begins.
- `localScrollTop`: the tab's actual scroll position when the user releases Option or Alt.
- `localMaxScrollAtCapture`: the tab's max scroll at capture time. This is stored for diagnostics,
  validation, and display context, but active mapping must use the current max scroll.
- `ratio`: legacy offset ratio for old saved values and fallback behavior.
- `pixels`: display value for the panel.

Storage values are untrusted. When loading offsets, the implementation should accept an anchor only
when all anchor fields are finite numbers and the main `ratio` and `pixels` fields are valid
numbers. Invalid anchor data is ignored while the valid legacy ratio data remains available.
Malformed offset objects are skipped instead of being normalized to `{ ratio: 0, pixels: 0 }`.

## Mapping Math

Keep the current hot-path shape: read `cachedManualOffset`, compute a logical ratio, and send or
apply a sync message without storage I/O.

### Local Scroll to Logical Ratio

When an anchored tab is the source, convert its local scroll position back to the common logical
ratio before broadcasting.

```text
anchorLogical = anchor.logicalRatio
anchorTop = clamp(anchor.localScrollTop, 0, currentMaxScroll)

if currentScrollTop <= anchorTop:
  progress = anchorTop > 0 ? currentScrollTop / anchorTop : 0
  logicalRatio = progress * anchorLogical
else:
  remainingLocal = currentMaxScroll - anchorTop
  progress = remainingLocal > 0 ? (currentScrollTop - anchorTop) / remainingLocal : 1
  logicalRatio = anchorLogical + progress * (1 - anchorLogical)
```

Clamp the result to `[0, 1]`. If no valid anchor exists, use the existing legacy calculation:

```text
logicalRatio = currentRatio - offsetRatio
```

The outgoing `scroll:sync` payload can continue to encode the logical ratio as `scrollTop` relative
to the source document's current max scroll. Receiver tabs already derive `sourceRatio` from
`scrollTop / maxScroll`.

### Logical Ratio to Local Scroll

When an anchored tab receives sync, convert the incoming logical ratio to this tab's local target.

```text
anchorLogical = anchor.logicalRatio
anchorTop = clamp(anchor.localScrollTop, 0, currentMaxScroll)

if sourceRatio <= anchorLogical:
  progress = anchorLogical > 0 ? sourceRatio / anchorLogical : 0
  targetScrollTop = progress * anchorTop
else:
  remainingLogical = 1 - anchorLogical
  remainingLocal = currentMaxScroll - anchorTop
  progress = remainingLogical > 0 ? (sourceRatio - anchorLogical) / remainingLogical : 1
  targetScrollTop = anchorTop + progress * remainingLocal
```

Clamp the final target to `[0, currentMaxScroll]`. If no valid anchor exists, use the existing
legacy calculation:

```text
targetRatio = sourceRatio + offsetRatio
targetScrollTop = targetRatio * currentMaxScroll
```

`syncState.lastSyncedRatio` should continue to mean the common logical ratio, not the tab's local
ratio. That keeps future manual baseline snapshots stable even when the current tab has an anchor.

## Manual Adjustment Lifecycle

Manual mode entry stays synchronous:

1. Cancel pending receiver targets.
2. Snapshot the current logical ratio from `syncState.lastSyncedRatio`.
3. Set `syncState.isManualScrollEnabled = true`.
4. Notify background with `scroll:manual`.

Manual mode exit stores the anchor:

1. Read current local `scrollTop`, `scrollHeight`, and `clientHeight`.
2. Compute current local max scroll.
3. Store `anchor.logicalRatio` from the entry snapshot.
4. Store `anchor.localScrollTop` from the current local position.
5. Store `anchor.localMaxScrollAtCapture` from the current local max scroll.
6. Compute legacy `ratio` and `pixels` for fallback and panel display.
7. Update `cachedManualOffset` synchronously with the new anchor.
8. Set `syncState.isManualScrollEnabled = false` and resume normal sync.
9. Persist the offset once outside the scroll hot path.

Keyboard manual mode and wheel-based manual mode should use the same save path so their behavior
does not diverge.

## Lazy Loading and Infinite Scroll

The active mapping must always use the current max scroll, not `localMaxScrollAtCapture`.

This handles the common lazy-load case where content is appended below the anchor:

- The anchor's pixel position from the top remains stable.
- The post-anchor segment grows as the page loads.
- The next sync calculation maps the same logical ratio into the newly available local space.

For receivers that are temporarily too short, use a bounded catch-up path:

- If the computed anchored target is clamped because `currentMaxScroll` is shorter than the needed
  segment, remember the latest inbound logical ratio in memory.
- Schedule a small, bounded number of rechecks with `requestAnimationFrame` or short timers.
- On each recheck, read current scroll metrics and recompute from the latest logical ratio.
- Stop after the bounded retry budget is exhausted or once the target no longer clamps.
- Do not use an unbounded `MutationObserver` or continuous polling loop for this feature.

This lets pages that append content after reaching the bottom settle into the correct anchored
position without adding a permanent observer cost to every scroll.

Limitations:

- If a page inserts content above the anchor, the saved `localScrollTop` may no longer point to the
  same paragraph. The v1 behavior should preserve safety and allow the user to re-anchor manually.
- If an infinite page keeps appending content indefinitely, the extension should keep responding to
  new user/source scroll events, but bounded catch-up must not chase the page forever after a single
  inbound sync.

## Performance Model

This change touches the scroll hot path, so the performance contract is strict:

- No new storage reads or writes in `handleScrollCore()` or the receiver's active `scroll:sync`
  calculation.
- Anchor mapping helpers must be pure O(1) arithmetic over numbers already available in memory.
- Do not add DOM queries, semantic element scans, `querySelector`, `getBoundingClientRect`, or
  `getComputedStyle` to ratio-mode anchor mapping.
- Continue reading only the scroll metrics already needed for sync: `scrollY`, `scrollHeight`, and
  `clientHeight`.
- Keep receiver application on the existing latest-wins `requestAnimationFrame` scheduler.
- Bounded lazy-load catch-up should be inactive unless a target clamps because the receiver is too
  short or the anchor is beyond the current scrollable range.
- Manual anchor persistence happens only on manual mode exit, not during scroll.

The implementation should add tests or assertions that make hot-path storage calls and unbounded
lazy-load scheduling visible regressions.

## Error Handling

Use conservative fallbacks:

- Missing or invalid `anchor` data falls back to legacy ratio offset behavior.
- Non-finite calculated ratios or targets are skipped or clamped before scheduling.
- `currentMaxScroll <= 0` maps to top.
- `anchor.localScrollTop` is clamped to the current valid scroll range before mapping.
- Storage write failure on manual mode exit should log sanitized metadata. The current session can
  keep using the already-updated in-memory anchor, but the failure should not pretend persistence
  succeeded.

Logs must include only non-sensitive metadata such as tab id, mode, reason, booleans, and numeric
offsets. Do not log URLs, titles, page metadata, full payloads, source URLs, target URLs, or
normalized URLs.

## Testing

Add pure scroll math unit tests for:

- Logical-to-local mapping below the anchor.
- Logical-to-local mapping above the anchor.
- Local-to-logical inverse mapping for an anchored source tab.
- A table-of-contents case where the post-anchor content has the same pixel length and target delta
  matches source delta.
- A translated-document case where post-anchor lengths differ and movement is proportional within
  the post-anchor segment.
- Capture-time max scroll growth: mapping uses the current max scroll, not
  `localMaxScrollAtCapture`.
- `currentMaxScroll < anchor.localScrollTop` clamps safely.
- Anchor at top and anchor at bottom avoid division by zero.
- Legacy offsets without `anchor` keep the existing ratio fallback.

Add content-script or integration tests for:

- Keyboard manual mode saves anchor data and updates `cachedManualOffset`.
- Wheel manual mode saves the same anchor shape.
- An anchored source broadcasts a stable logical ratio.
- An anchored receiver applies the target through the latest-wins scheduler.
- Bounded lazy-load catch-up does not schedule unbounded retries.
- URL change, `scroll:stop`, and offset clear paths clear anchor data with the rest of the offset.

Minimum verification:

```bash
pnpm vitest run src/shared/lib/scroll-math.test.ts
pnpm vitest run src/contentScripts/keyboard-handler.test.ts
pnpm typecheck
```

For final PR confidence, also run:

```bash
pnpm test
pnpm privacy:logging
pnpm i18n:validate
```

## Acceptance Criteria

- Manual adjustment creates a stable anchor instead of a ratio-only offset.
- The aligned paragraph remains aligned after continued scrolling in pages that differ by fixed
  pre-anchor content.
- Pages with different post-anchor lengths move proportionally after the anchor.
- Anchored source tabs and anchored receiver tabs both use the same logical anchor model.
- Lazy-loaded content appended below the anchor is handled by current-height recalculation and
  bounded catch-up.
- Scroll hot paths still avoid async storage I/O and unbounded observers.
- Legacy stored offsets continue to work.
- No raw URL, title, page metadata, or full payload logging is introduced.
