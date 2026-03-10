# Content Scripts

Injected into web pages to handle scroll synchronization on the page side. Communicates with the background script via `webext-bridge` and renders UI inside a Shadow DOM for style isolation.

## Architecture

```
contentScripts/
├── index.ts                 # Entry point — bootstraps scroll sync and UI rendering
├── scroll-sync.ts           # Core scroll synchronization logic (~977 lines)
├── keyboard-handler.ts      # Option/Alt key detection for manual scroll adjustment
├── panel.tsx                # React root for SyncControlPanel (Shadow DOM mount)
├── suggestion-toast.tsx     # React root for SyncSuggestionToast (Shadow DOM mount)
├── lib/                     # Content script utilities
│   └── scroll-sync-state.ts # Scroll sync state object and pure state transitions
├── components/              # React UI components (see components/README.md)
└── hooks/                   # Custom hooks extracted from components
```

## How It Works

1. **Injection**: Background script injects `index.global.js` into eligible tabs
2. **Initialization**: `scroll-sync.ts` sets up scroll event listeners and message handlers
3. **Scroll Capture**: When user scrolls, captures position (scrollTop, scrollHeight, clientHeight)
4. **Position Relay**: Sends scroll data to background via `webext-bridge`
5. **Position Apply**: Receives scroll data from other tabs and applies proportional positioning
6. **UI Rendering**: Mounts React components inside Shadow DOM for sync controls and toast notifications

## Shadow DOM Isolation

All UI components render inside a Shadow DOM to prevent style conflicts with the host page:

- `panel.tsx` mounts `SyncControlPanel` in a shadow root
- `suggestion-toast.tsx` mounts `SyncSuggestionToast` in a shadow root
- Uses `import * as React from 'react'` pattern (differs from popup's named imports)

## Manual Scroll Adjustment

Users hold **Option** (Mac) / **Alt** (Windows) while scrolling to adjust individual tab positions without affecting sync. This is handled by `keyboard-handler.ts` which tracks modifier key state.

## Key Message Handlers (in scroll-sync.ts)

| Message        | Direction            | Purpose                      |
| -------------- | -------------------- | ---------------------------- |
| `scroll:start` | Background → Content | Initialize sync session      |
| `scroll:stop`  | Background → Content | Stop sync session            |
| `scroll:sync`  | Content ↔ Background | Relay scroll positions       |
| `scroll:ping`  | Background → Content | Health check                 |
| `sync:status`  | Background → Content | Broadcast sync status update |
