# Background Library Modules

Core business logic for the background service worker, organized by domain responsibility. Each module exports pure functions or controlled mutable state with clear interfaces.

## Module Overview

| Module                      | Lines | Responsibility                                                    |
| --------------------------- | ----- | ----------------------------------------------------------------- |
| `sync-state.ts`             | 115   | Manual sync state (active tabs, connection statuses, persistence) |
| `auto-sync-state.ts`        | 46    | Auto-sync state declarations (groups, flags, mutex lock)          |
| `auto-sync-groups.ts`       | 290   | Auto-sync group CRUD (add/remove tabs, URL-based grouping)        |
| `auto-sync-lifecycle.ts`    | 272   | Auto-sync enable/disable lifecycle, tab scanning                  |
| `auto-sync-suggestions.ts`  | 343   | Toast notification logic for sync suggestions                     |
| `content-script-manager.ts` | 66    | Content script health checks and re-injection                     |
| `keep-alive.ts`             | 63    | Service worker keep-alive mechanism via periodic health checks    |
| `messaging.ts`              | 22    | `sendMessageWithTimeout` utility for content script messaging     |
| `index.ts`                  | —     | Barrel file re-exporting all modules                              |

## State Management Pattern

State is managed through mutable module-level objects (not classes):

```typescript
// sync-state.ts — manual sync state
export const syncState: SyncState = { isActive: false, linkedTabs: [], ... };

// auto-sync-state.ts — auto-sync state + auxiliary sets
export const autoSyncState: AutoSyncState = { enabled: false, groups: new Map(), ... };
export const manualSyncOverriddenTabs = new Set<number>();
```

State objects are mutated in-place and persisted to `browser.storage.local` via `persistSyncState()`.

## Concurrency Control

`auto-sync-state.ts` provides a mutex lock (`withAutoSyncLock`) to serialize concurrent auto-sync group updates, preventing race conditions when multiple tabs trigger URL changes simultaneously.

## Dependencies

All modules depend on:

- `webext-bridge/background` for message passing
- `webextension-polyfill` for cross-browser tab/storage APIs
- `~/shared/lib/logger` for scoped logging
- `~/shared/types/` for TypeScript interfaces
