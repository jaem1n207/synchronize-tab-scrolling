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
4. **Position Relay**: Sends scroll data to background via `webext-bridge`
5. **Position Apply**: Receives scroll data from other tabs, keeps only the latest pending target per
   animation frame, and applies proportional positioning instantly
6. **UI Rendering**: Mounts React components inside Shadow DOM for sync controls and toast notifications

## Receiver-Side Scroll Application

`scroll-sync.ts` does not directly call `window.scrollTo()` for incoming sync targets. It schedules
targets through `LatestProgrammaticScrollScheduler`, which applies only the newest target in the
next animation frame. The actual DOM update goes through `applyInstantProgrammaticScroll()` so pages
with CSS `scroll-behavior: smooth` cannot animate extension-driven sync updates.

The instant helper temporarily sets inline `scrollBehavior: auto` on the current scroll root and
`document.body` when they are distinct, writes `scrollTop`, then restores the previous inline
values. This keeps normal page anchor navigation and user-initiated smooth scrolling intact.

## Shadow DOM Isolation

All UI components render inside a Shadow DOM to prevent style conflicts with the host page:

- `panel.tsx` mounts `SyncControlPanel` in a shadow root
- `suggestion-toast.tsx` mounts `SyncSuggestionToast` in a shadow root
- Uses `import * as React from 'react'` pattern (differs from popup's named imports)

## Manual Scroll Adjustment

Users hold **Option** (Mac) / **Alt** (Windows) while scrolling to adjust individual tab positions without affecting sync. This is handled by `keyboard-handler.ts` which tracks modifier key state.
Pending receiver targets are cancelled before capturing a manual baseline so an unapplied future
target cannot pollute the saved offset.

## Key Message Handlers (in scroll-sync.ts)

| Message        | Direction            | Purpose                      |
| -------------- | -------------------- | ---------------------------- |
| `scroll:start` | Background → Content | Initialize sync session      |
| `scroll:stop`  | Background → Content | Stop sync session            |
| `scroll:sync`  | Content ↔ Background | Relay scroll positions       |
| `scroll:ping`  | Background → Content | Health check                 |
| `sync:status`  | Background → Content | Broadcast sync status update |
