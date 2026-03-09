# Background Handlers

Event handler modules that register message listeners and browser event listeners. Each module exports a single `register*Handlers()` function called from `main.ts` at startup.

## Module Overview

| Module                    | Lines | Events Handled                                                                                                                                      |
| ------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scroll-sync-handlers.ts` | 291   | `scroll:start`, `scroll:stop`, `scroll:sync`, `scroll:manual`, `url:sync`, `sync:url-enabled-changed`                                               |
| `connection-handlers.ts`  | 160   | `sync:get-status`, `scroll:ping`, `scroll:reconnect`, `scroll:request-reinject`                                                                     |
| `auto-sync-handlers.ts`   | 291   | `auto-sync:status-changed`, `auto-sync:get-status`, `auto-sync:get-detailed-status`, `sync-suggestion:response`, `sync-suggestion:add-tab-response` |
| `tab-event-handlers.ts`   | 353   | `tabs.onRemoved`, `tabs.onCreated`, `tabs.onUpdated`, `tabs.onActivated`, `storage.onChanged`                                                       |
| `index.ts`                | —     | Barrel file re-exporting all register functions                                                                                                     |

## Registration Pattern

Each handler module follows the same pattern:

```typescript
export function registerScrollSyncHandlers(): void {
  onMessage('scroll:start', async ({ data, sender }) => { ... });
  onMessage('scroll:stop', async ({ data }) => { ... });
  // ...
}
```

`main.ts` calls all registration functions at startup:

```typescript
registerScrollSyncHandlers();
registerConnectionHandlers();
registerAutoSyncHandlers();
registerTabEventHandlers();
```

## Handler Categories

### Scroll Sync Handlers

Core synchronization flow: starting/stopping sync sessions, relaying scroll positions between tabs, forwarding manual mode toggles and URL navigation.

### Connection Handlers

Connection health: status queries from content scripts, ping/pong health checks, reconnection after service worker restarts, content script re-injection.

### Auto-Sync Handlers

Automatic sync management: toggling auto-sync, querying group status, processing user responses to sync suggestion toasts.

### Tab Event Handlers

Browser lifecycle events: tab creation/removal/update/activation, storage change listeners. Maintains sync state consistency as tabs are opened, closed, or navigated.

## Testing

Each handler module has co-located integration tests (`*.test.ts`) that mock `webext-bridge`, `webextension-polyfill`, and background lib modules.
