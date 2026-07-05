# Manual Scroll Pixel Delta Anchor Design

## Problem

The current manual scroll anchor model still lets aligned content drift after the user scrolls a
little farther. The user reproduced this with an original Chrome Developers article on the left and
a translated D2 page on the right. After manually aligning the `Figure 8` figcaption, the next
small scroll moved the translated page farther down than expected.

This is not a timing bug in the receiver path. It is a model problem.

The current implementation stores:

```text
logical anchor ratio <-> local anchor scrollTop
```

When a tab scrolls after that anchor, the implementation maps progress through the whole remaining
post-anchor segment:

```text
progress = (currentScrollTop - anchorTop) / (currentMaxScroll - anchorTop)
logicalRatio = anchorLogical + progress * (1 - anchorLogical)
```

That solves fixed pre-anchor differences such as a table of contents, banner, or header. It does
not keep a just-aligned figure or paragraph at the same viewport height when the post-anchor
content has different paragraph heights, translated text length, captions, or spacing. Those
differences make "same remaining ratio" diverge from "same visible context."

## Goal

Make manual adjustment preserve the user's immediate visual alignment by default.

Accepted behavior:

- When the user manually aligns a point, that point becomes the local anchor.
- Continued scrolling near that anchor should preserve signed pixel delta from the anchor, not
  remaining document ratio.
- If the source moves 40px below the aligned point, anchored receivers should also move 40px below
  their aligned point, subject to normal clamping.
- If the source moves above the aligned point, anchored receivers should preserve that negative
  delta as well.
- The hot scroll path must stay cheap enough for low-end machines: no storage I/O, DOM scan, layout
  scan, or text matching during active scroll handling.
- Limited semantic assistance is allowed only outside the hot path, and only as a bounded,
  best-effort enhancement.

## Non-Goals

- Do not build a full document alignment engine.
- Do not continuously scan headings, paragraphs, figures, or captions while scrolling.
- Do not compare original and translated text semantically.
- Do not add a user-facing mode setting for this revision.
- Do not make manual anchors survive URL navigation or explicit sync stop.

## Chosen Approach

Use a pixel-delta anchor as the default mapping, with an optional semantic hint captured outside the
hot path.

The core invariant changes from:

```text
same logical ratio after the anchor
```

to:

```text
same signed pixel delta from the manually aligned anchor
```

This means the nearest visible context stays stable after a small or medium scroll above or below
the anchor, which matches the manual adjustment use case better than proportional post-anchor
mapping.

## Data Model

Keep the existing `ManualScrollOffset` shape compatible, but add a versioned anchor mode.

```typescript
interface ManualScrollAnchor {
  logicalRatio: number;
  localScrollTop: number;
  localMaxScrollAtCapture: number;
  mode?: 'piecewise-ratio' | 'pixel-delta';
  semanticHint?: ManualScrollSemanticHint;
}

interface ManualScrollSemanticHint {
  kind: 'figure' | 'figcaption' | 'heading' | 'paragraph';
  localTopAtCapture: number;
  viewportOffsetAtCapture: number;
}
```

Compatibility rules:

- Missing `mode` or explicit `piecewise-ratio` means legacy behavior for already-persisted anchor objects.
- Newly captured anchors use `mode: 'pixel-delta'`.
- Invalid optional fields are ignored during storage load.
- The existing `ratio` and `pixels` fields stay as legacy fallback and UI display data.

## Pixel Delta Mapping

### Anchored Source to Outgoing Logical Payload

When the anchored tab is the source, convert its local movement into a logical payload by preserving
signed pixel delta from the captured anchor.

```text
sourceAnchorScrollTop = anchor.logicalRatio * currentSourceMaxScroll
localDeltaPx = currentScrollTop - anchor.localScrollTop
outgoingLogicalScrollTop = sourceAnchorScrollTop + localDeltaPx
outgoingRatio = clamp(outgoingLogicalScrollTop / currentSourceMaxScroll, 0, 1)
```

The existing `scroll:sync` payload can keep encoding this as `scrollTop` relative to the source
document dimensions. No protocol change is required.

### Incoming Logical Payload to Anchored Receiver

When an anchored tab receives sync, recover the signed source pixel delta from the incoming payload and
apply that delta to the receiver's captured local anchor.

```text
sourceAnchorScrollTop = anchor.logicalRatio * payloadSourceMaxScroll
sourceDeltaPx = payload.scrollTop - sourceAnchorScrollTop
targetScrollTop = anchor.localScrollTop + sourceDeltaPx
targetScrollTop = clamp(targetScrollTop, 0, currentReceiverMaxScroll)
```

This deliberately does not use `currentReceiverMaxScroll - anchor.localScrollTop` unless clamping is
needed. The user's alignment is local to the anchor, so the first-order behavior should be local
pixel preservation.

### Why This Fixes the Reported Case

In the reported screenshots, `Figure 8` is aligned manually. With the current piecewise-ratio model,
the right page moves farther because its post-anchor remaining segment differs from the left page.
With pixel delta mapping, the next small scroll applies the same pixel delta from each page's saved
`Figure 8` anchor, so the caption remains at the same viewport height until a later correction is
needed.

## Limited Semantic Assistance

Pixel delta is the default and must work alone. Semantic assistance is only a bounded helper.

On manual mode exit, the content script may capture one nearby semantic hint:

- Search only within a small viewport-relative window around the aligned point.
- Prefer `figcaption`, then `figure`, then headings, then sufficiently long paragraphs.
- Limit candidates to a small fixed budget, for example 20 elements.
- Use at most one layout-read pass outside the scroll hot path.
- Store only non-sensitive local metadata. Do not log or persist raw page text or URLs.

During active scrolling, semantic hints are not used for continuous matching. A future enhancement
may use the hint after scroll settles or during bounded lazy-load catch-up to repair an anchor if
layout changes above the anchor, but only under these constraints:

- Run after a debounce or idle callback, never inside `handleScrollCore()`.
- Stop after a small fixed work budget.
- If confidence is low, keep the pixel-delta anchor unchanged.
- Never introduce permanent observers or polling loops.

For this revision, semantic assistance can be implemented as data capture plus tests, while actual
runtime correction can remain disabled unless the implementation plan proves it is safe and useful.

## Performance Contract

The performance contract is stricter than correctness convenience:

- `handleScrollCore()` performs only O(1) number arithmetic over cached state and current scroll
  metrics.
- The receiver `scroll:sync` path performs only O(1) number arithmetic plus the existing latest-wins
  programmatic scroll scheduling.
- No `await`, storage read/write, `querySelectorAll`, `getBoundingClientRect`, `getComputedStyle`,
  text matching, or DOM traversal in the active scroll path.
- Manual exit may do a bounded semantic capture because it is user-initiated and outside active
  synchronized scrolling.
- Lazy-load catch-up remains bounded. It may recompute pixel-delta targets from current dimensions,
  but must not start an unbounded observer or retry loop.
- All logging remains sanitized: tab IDs, booleans, ratios, pixel values, modes, and counts are
  allowed; URLs, titles, raw text, metadata payloads, and page content are not.

## Error Handling

- If a pixel-delta anchor is malformed, fall back to legacy ratio data.
- If a semantic hint is malformed, ignore only the hint and keep the pixel-delta anchor.
- If target scroll is outside the current scroll range, clamp to the nearest valid position.
- If the receiver is temporarily too short because content has not loaded, reuse the existing
  bounded lazy-load catch-up pattern with pixel-delta target recomputation.
- If a page inserts content above the saved anchor, pixel delta may no longer point to the same
  content. The safe fallback is to keep the current anchor until the user manually adjusts again;
  semantic repair can be considered only outside the hot path.

## Test Plan

Unit tests:

- Pixel-delta source mapping preserves local delta from anchor.
- Pixel-delta receiver mapping applies incoming source delta to local anchor.
- Target clamping works at top and bottom.
- Missing `mode` or explicit `piecewise-ratio` keeps legacy behavior for old saved anchors.
- Malformed semantic hints are ignored without dropping the valid anchor.

Scenario tests:

- Reproduce the reported `Figure 8` class of behavior: after manual alignment, a small source scroll
  keeps the receiver at the same pixel delta from its anchor instead of scaling through the remaining
  document length.
- Verify a fixed table-of-contents difference still stays aligned after the anchor.
- Verify an anchored source broadcasts stable logical payloads without hot-path storage calls.
- Verify an anchored receiver applies pixel-delta targets through the latest-wins scheduler.
- Verify bounded lazy-load catch-up recomputes pixel-delta target and stops within the retry budget.

Performance tests or guards:

- Assert no storage read/write is called from the active source scroll path.
- Assert no semantic scan helper is called from source or receiver scroll handling.
- Keep existing lint/privacy validation in the verification path.

## Rollout Notes

This is a revision to the open manual anchor PR, not a new feature surface. The implementation should
update the existing PR branch and explain that the first anchor model preserved post-anchor ratio,
while this revision preserves signed pixel delta around the anchor to match manual visual alignment.
