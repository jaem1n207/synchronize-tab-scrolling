# Background Handlers

Event handler modules that register message listeners and browser event listeners. Each module exports a single `register*Handlers()` function called from `main.ts` at startup.

## Module Overview

| Module                          | Events handled                                                                      |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| `quick-sync-command-handler.ts` | `commands.onCommand`, candidate runtime Port, recent-outcome dismiss                |
| `scroll-sync-handlers.ts`       | `scroll:start`, `scroll:stop`, guarded relay/manual/URL messages, URL Sync settings |
| `connection-handlers.ts`        | authoritative `sync:get-status`, health, reconnect, re-injection                    |
| `auto-sync-handlers.ts`         | auto-sync status and revision-aware accepted Replace/Add responses                  |
| `tab-event-handlers.ts`         | tab lifecycle, candidate invalidation, gated topology repair, storage changes       |
| `index.ts`                      | Barrel file re-exporting all register functions                                     |

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
registerQuickSyncCommandHandler();
registerScrollSyncHandlers();
registerConnectionHandlers();
registerAutoSyncHandlers();
registerTabEventHandlers();
```

## Handler Categories

### Scroll Sync Handlers

Popup Start/Stop delegates to the shared session orchestrator. Hot relay paths validate sender,
committed membership, and `sessionEpoch` synchronously.

### Quick Sync Command Handler

Captures the command event timestamp and invocation tab before awaiting background initialization,
then delegates candidate/Start/Add decisions to the coordinator under `syncTransitionGate`. It does
not mutate persisted session state directly.

### Connection Handlers

Connection health: status queries from content scripts, ping/pong health checks, reconnection after service worker restarts, content script re-injection.

### Auto-Sync Handlers

Automatic sync management: toggling explicit opt-in, querying group status, and routing accepted
suggestion responses through the same transition gate. Add uses the shared orchestrator; Replace
uses durable manual Stop plus the legacy auto-sync adapter.

### Tab Event Handlers

Browser lifecycle events: tab creation/removal/update/activation, storage change listeners. Maintains sync state consistency as tabs are opened, closed, or navigated.

## Testing

Each handler module has co-located integration tests (`*.test.ts`) that mock `webext-bridge`, `webextension-polyfill`, and background lib modules.

See [`docs/guides/quick-sync-shortcut.md`](../../../docs/guides/quick-sync-shortcut.md) for the
transaction and evidence contract.
