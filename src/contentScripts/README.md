# Content Scripts

Injected into web pages to handle scroll synchronization on the page side. Communicates with the background script via `webext-bridge` and renders UI inside a Shadow DOM for style isolation.

## Architecture

```
contentScripts/
├── index.ts                 # Entry point — bootstraps scroll sync and UI rendering
├── scroll-sync.ts           # Core scroll synchronization logic (~1114 lines)
├── keyboard-handler.ts      # Option/Alt key detection for manual scroll adjustment
├── panel.tsx                # React root for SyncControlPanel (Shadow DOM mount)
├── suggestion-toast.tsx     # React root for SyncSuggestionToast (Shadow DOM mount)
├── quick-sync-hud.tsx       # Command-only feedback HUD + candidate Port lifecycle
├── lib/                     # Content script utilities
│   ├── instant-programmatic-scroll.ts # Instant receiver-side scroll apply + scheduler
│   ├── scroll-sync-state.ts           # Scroll sync state object and timing constants
│   └── translated-page-metadata.ts    # Canonical/alternate metadata extraction
├── components/              # React UI components (see components/README.md)
└── hooks/                   # Custom hooks extracted from components
```

## How It Works

1. **Injection**: Background script injects `index.global.js` into eligible tabs
2. **Initialization**: `scroll-sync.ts` sets up scroll event listeners and message handlers
3. **Scroll Capture**: When user scrolls, captures position (scrollTop, scrollHeight, clientHeight)
4. **Position Relay**: Sends logical scroll data to background via `webext-bridge`
5. **Position Apply**: Receives scroll data from other tabs, keeps only the latest pending target per
   animation frame, and applies the mapped target instantly
6. **URL Navigation Apply**: Receives `url:sync`, resolves the active URL Sync mode, and navigates
   only when the shared resolver returns a safe target URL
7. **UI Rendering**: Mounts independent Shadow roots for sync controls, suggestion toasts, and
   command-triggered Quick Sync feedback

## Receiver-Side Scroll Application

`scroll-sync.ts` does not directly call `window.scrollTo()` for incoming sync targets. It schedules
targets through `LatestProgrammaticScrollScheduler`, which applies only the newest target in the
next animation frame. The actual DOM update goes through `applyInstantProgrammaticScroll()` so pages
with CSS `scroll-behavior: smooth` cannot animate extension-driven sync updates.

The instant helper temporarily sets inline `scrollBehavior: auto` on the current scroll root and
`document.body` when they are distinct, writes `scrollTop`, then restores the previous inline
values. This keeps normal page anchor navigation and user-initiated smooth scrolling intact.

## Shadow DOM Isolation

Page overlays use three independent Shadow DOM roots to prevent style conflicts:

- `panel.tsx` mounts `SyncControlPanel` in a **closed** shadow root. Its active manual-session list
  may render only the allowlisted tab title, current-tab flag, signed manual pixel offset, and
  connection status. The status response must not contain URLs, favicons, or tab/window IDs.
- `suggestion-toast.tsx` mounts `SyncSuggestionToast` in a shadow root
- `quick-sync-hud.tsx` mounts the non-interactive top-center Quick Sync HUD
- Uses `import * as React from 'react'` pattern (differs from popup's named imports)

The Quick Sync HUD appears only after the browser command. Candidate feedback opens a
generation-bound `quick-sync-candidate:<generation>` runtime Port. Disconnect clears matching
feedback immediately; countdown ticks do not emit repeated live-region announcements. The HUD has
no controls, never takes focus, and does not reuse the passive auto-suggestion toast.

See [`docs/guides/quick-sync-shortcut.md`](../../docs/guides/quick-sync-shortcut.md) for the exact
10-second and Port lifecycle contract.

## Manual Scroll Adjustment

Users hold **Option** (Mac) / **Alt** (Windows) while scrolling to adjust individual tab positions without affecting sync. This is handled by `keyboard-handler.ts` which tracks modifier key state.
Pending receiver targets are cancelled before capturing a manual baseline so an unapplied future
target cannot pollute the saved offset.

Newly captured manual anchors are stored with `mode: 'pixel-delta'`. Source tabs convert local
movement into a logical scroll position by preserving the signed pixel distance from the aligned
anchor; receiver tabs apply that same signed delta to their own local anchor and clamp to the
current scrollable range. Mode-less persisted anchors and explicit `piecewise-ratio` anchors are
treated as legacy anchors for compatibility.

The active source and receiver paths must stay cache-only and numeric: use `cachedManualOffset`,
`scrollTop`, `scrollHeight`, and `clientHeight`; do not read storage, scan the DOM, or run semantic
matching from `handleScrollCore()` or the `scroll:sync` handler.

## URL Sync Receiver

The `url:sync` handler uses `resolveUrlSyncTarget()` from `translated-page-url-utils.ts`.
`follow-changed-tab` may move a target to the source website. `keep-each-tabs-website` navigates
only after the resolver confirms the source and target site boundaries are compatible.

When URL Sync resolution is blocked, the handler emits a notice, logs only non-sensitive metadata,
keeps `window.location.href` unchanged, and does not clear `cachedManualOffset` or the persisted
manual offset. Scroll sync remains active after the skipped navigation.

## Key Message Handlers (in scroll-sync.ts)

| Message               | Direction            | Purpose                              |
| --------------------- | -------------------- | ------------------------------------ |
| `scroll:start`        | Background → Content | Initialize sync session              |
| `scroll:stop`         | Background → Content | Stop sync session                    |
| `scroll:sync`         | Content ↔ Background | Relay scroll positions               |
| `scroll:ping`         | Background → Content | Health check                         |
| `sync:get-status`     | Content → Background | Read the allowlisted active snapshot |
| `quick-sync:feedback` | Background → Content | Generation-bound command HUD outcome |
