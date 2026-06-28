# Instant Scroll Sync Design

## Context

MDN reference pages set smooth scrolling on the root document:

```css
html {
  scroll-behavior: smooth;
}
```

The current receiver path applies synchronized positions with:

```typescript
window.scrollTo({
  top: clampedScrollTop,
  behavior: 'auto',
});
```

For pages with root-level smooth scrolling, `behavior: 'auto'` can follow the page's computed
`scroll-behavior` instead of forcing an instant jump. That makes the receiver animate toward each
incoming target. While the receiver is still animating, stale intermediate positions can continue to
arrive, and receiver-generated scroll events can interfere with the source tab. The user-visible
failure is severe: the source tab feels blocked until the target tab finishes catching up.

This was observed when syncing the Korean and English MDN `Object.assign()` pages. Naver did not
show the same issue because it does not trigger the same root smooth-scroll behavior for the sync
path.

## Goal

Make synchronized programmatic scrolls feel immediate and controllable on pages that define smooth
scrolling.

The accepted product behavior is:

- Extension-driven scroll sync must always bypass page-defined smooth scrolling.
- The source tab must never feel blocked or pulled back by a receiver tab's scroll animation.
- The receiver should apply the latest source position quickly instead of replaying stale
  intermediate positions.
- Existing ratio sync, element sync, manual offset, URL sync, and health-check behavior should stay
  intact unless directly required for this fix.

## Non-Goals

- Preserve user-initiated anchor link behavior on the page.
- Keep smooth scrolling enabled for the whole page outside the programmatic sync assignment.
- Leave `THROTTLE_DELAY` and `PROGRAMMATIC_SCROLL_GRACE_PERIOD` unchanged as the primary fix.
- Avoid adding a user-facing setting for smooth-scroll bypass.
- Keep the background relay protocol intact unless implementation evidence proves a rewrite is needed.
- Continue excluding raw URLs, tab titles, document titles, page metadata, and full message payloads
  from logs.

## Chosen Approach

Use a receiver-side instant programmatic scroll helper plus a latest-wins frame scheduler.

### Instant Programmatic Scroll Helper

Add a small content-script helper that applies one extension-origin scroll while temporarily forcing
the document scroll root to `scroll-behavior: auto`.

The helper should:

1. Identify the scroll root with `document.scrollingElement ?? document.documentElement`.
2. Save the current inline `scrollBehavior` value and priority for the root.
3. Save the current inline `scrollBehavior` value and priority for `document.body` only when the
   body exists and is different from the root.
4. Set those inline declarations to `auto !important`.
5. Apply the target immediately by setting `scrollRoot.scrollTop = top`.
6. Fall back to `window.scrollTo(0, top)` only if direct root assignment does not move the page in
   the current browser.
7. Restore the saved inline values in a `finally` block after the scroll command has been issued.

The override must be scoped to the extension's programmatic sync operation. It must not permanently
modify page CSS or affect later user anchor navigation.

### Latest-Wins Frame Scheduler

Do not apply every incoming `scroll:sync` receiver message immediately. Store the latest computed
target for the tab and schedule one `requestAnimationFrame` callback if one is not already pending.

When the frame runs:

- Apply only the newest pending target.
- Drop older targets received in the same frame.
- Set `lastProgrammaticScrollTime` immediately before applying the scroll.
- Keep the existing manual-mode guard before scheduling or applying the target.

This prevents the receiver from replaying stale positions while the source tab is moving quickly.

## Performance Model

The fix is not free. It adds a few inline style writes around each applied receiver scroll.

The expected performance tradeoff is favorable because it replaces long native smooth-scroll
animations with a bounded synchronous operation:

- At most one receiver scroll is applied per animation frame.
- Multiple incoming messages in the same frame collapse to one latest target.
- The helper must avoid layout read-after-write patterns. After writing `scrollBehavior`, it should
  not call `getBoundingClientRect`, `getComputedStyle`, or read layout-dependent dimensions before
  restoring the styles.
- Existing document dimension reads should happen before scheduling or before the style override
  begins.

The implementation should not increase hot-path async I/O. `handleScrollCore()` and the receiver's
`scroll:sync` handler must continue to avoid storage reads in the active scroll path.

## Data Flow

Current simplified receiver flow:

```text
scroll:sync received
  -> compute source ratio
  -> apply manual offset
  -> compute target pixels
  -> window.scrollTo({ top, behavior: 'auto' })
```

New simplified receiver flow:

```text
scroll:sync received
  -> compute source ratio
  -> apply manual offset
  -> compute target pixels
  -> store latest pending target
  -> schedule requestAnimationFrame if needed

animation frame
  -> read latest pending target
  -> set lastProgrammaticScrollTime
  -> temporarily force scroll-behavior: auto
  -> apply instant scroll
  -> restore inline scroll-behavior values
```

## Element Mode

Element mode currently does extra DOM work by finding semantic elements and then calling
`window.scrollTo()` with the chosen target. The same instant helper should be used for its final
scroll application.

With latest-wins scheduling, element mode should schedule the final pixel target rather than
schedule raw message payloads. This keeps DOM querying out of the frame callback.

## Error Handling

The helper should be defensive:

- When `document.scrollingElement` is unavailable, fall back to `document.documentElement`.
- Missing `document.body` means only the root is overridden.
- Non-finite scroll targets are skipped.
- Scroll application failures must restore inline styles before rethrowing or logging a sanitized
  warning.

Logs must include only non-sensitive metadata such as mode, source tab id, or reason. They must not
include URL, title, payload, target URL, source URL, or page metadata.

## Testing

Unit or integration tests should cover:

- A root with inline or stylesheet smooth scrolling receives an instant scroll command.
- Inline `scrollBehavior` values and priorities are restored after programmatic sync.
- Body style restoration works when body is present and separate from the root.
- Multiple receiver messages before the next animation frame apply only the newest target.
- Manual mode still ignores incoming sync messages and does not schedule a pending target.
- Ratio mode and element mode both use the instant application path.
- Non-finite target positions are ignored.

Manual QA should cover:

- MDN Korean `Object.assign()` synced with MDN English `Object.assign()`.
- A normal page such as Naver to confirm no regression on pages without root smooth scrolling.
- Fast trackpad or wheel scrolling from either tab.
- Manual offset mode after the instant-scroll changes.

Run at minimum:

```bash
pnpm typecheck
pnpm test
pnpm i18n:validate
```

For final PR confidence, also run the extension E2E suite if local browser setup is available:

```bash
pnpm test:e2e
```

## Acceptance Criteria

- MDN synchronized scrolling updates the receiver without a visible smooth-scroll catch-up
  animation.
- The source tab remains scrollable while the receiver is applying synchronized positions.
- Rapid source scrolling does not cause the receiver to replay stale intermediate positions.
- Existing manual offset behavior still works.
- Existing URL sync behavior from PR #385 is untouched.
- No raw URL, title, page metadata, or full payload logging is introduced.
- Tests cover smooth-scroll bypass and latest-wins scheduling.
