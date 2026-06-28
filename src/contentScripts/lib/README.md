# Content Script Utilities

Utilities used by `src/contentScripts/scroll-sync.ts` and related content-script modules.

## Files

| File                             | Purpose                                                                 |
| -------------------------------- | ----------------------------------------------------------------------- |
| `instant-programmatic-scroll.ts` | Instant receiver-side scroll application and latest-wins rAF scheduling |
| `scroll-sync-state.ts`           | Scroll sync state factories, timing constants, and state transitions    |
| `translated-page-metadata.ts`    | Canonical/alternate metadata extraction for translated-page matching    |

## Instant Programmatic Scroll

Use `applyInstantProgrammaticScroll()` for extension-driven receiver scroll updates. Some pages,
including MDN, define `scroll-behavior: smooth` on the scroll root. Browser-native smooth scrolling
can make `window.scrollTo({ behavior: 'auto' })` animate anyway because the computed page style still
applies.

The helper temporarily sets inline `scrollBehavior: auto !important` on the active scroll root and
`document.body` when they are distinct, writes `scrollTop`, then restores the previous inline values
and priorities. Keep this override scoped to the actual programmatic assignment so page anchor
navigation and user scrolling keep their original behavior.

`LatestProgrammaticScrollScheduler` coalesces incoming receiver targets so only the newest target is
applied in the next animation frame. When integrating it, update scroll sync state such as
`lastSyncedRatio` at apply time, not message receipt time, and cancel pending targets before manual
baselines, resets, and stop transitions.

## Hot-Path Rules

- Do not add async I/O to `handleScrollCore()` or the receiver `scroll:sync` calculation path.
- Do not log raw URLs, titles, full payloads, or page metadata from content-script utilities.
- Keep `PROGRAMMATIC_SCROLL_GRACE_PERIOD` larger than the full pipeline delay, including receiver
  rAF coalescing.
