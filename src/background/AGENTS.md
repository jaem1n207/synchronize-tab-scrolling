# Background Service Worker

Manifest V3 service worker (Chrome/Edge/Brave) / persistent background (Firefox). Orchestrates sync state, relays messages between tabs, manages auto-sync groups and suggestions.

## Key Files

| File                               | Purpose                                                                           |
| ---------------------------------- | --------------------------------------------------------------------------------- |
| `main.ts`                          | Entry point. Startup sequence: restore state → init auto-sync → register handlers |
| `lib/sync-state.ts`                | Manual sync state. Mutable `syncState` object, persisted to storage               |
| `lib/auto-sync-state.ts`           | Auto-sync state. `Map`-based groups, `withAutoSyncLock()` mutex                   |
| `lib/auto-sync-groups.ts`          | Group CRUD. URL normalization → tab grouping by same URL                          |
| `lib/auto-sync-lifecycle.ts`       | Enable/disable lifecycle. Scans open tabs on enable                               |
| `lib/auto-sync-suggestions.ts`     | Toast logic. Detects sync-eligible groups, shows suggestions                      |
| `lib/content-script-manager.ts`    | `isContentScriptAlive()`, `reinjectContentScript()`                               |
| `lib/keep-alive.ts`                | Prevent SW termination. 25s ping interval                                         |
| `lib/messaging.ts`                 | `sendMessageWithTimeout()` — 2s default timeout                                   |
| `handlers/scroll-sync-handlers.ts` | scroll:start, scroll:stop, scroll:sync, scroll:manual                             |
| `handlers/connection-handlers.ts`  | Health checks, reconnection, re-injection                                         |
| `handlers/auto-sync-handlers.ts`   | Auto-sync toggle, group updates, suggestion responses                             |
| `handlers/tab-event-handlers.ts`   | Tab close, activate, update, navigation events                                    |

## Startup Sequence (CRITICAL ORDER)

```
1. restoreSyncState()              — Restore manual sync from storage
2. initializeAutoSync()            — Init auto-sync groups (depends on sync state)
3. registerScrollSyncHandlers()    — Message handlers for scroll sync
4. registerConnectionHandlers()    — Health check and reconnection
5. registerAutoSyncHandlers()      — Auto-sync message handlers
6. registerTabEventHandlers()      — Browser tab events
7. initializeKeepAlive()           — Start keep-alive pings
```

**Changing this order WILL cause race conditions.** Step 1 must complete before step 2.

## State Architecture

### Manual Sync (`syncState` — mutable module-level object)

- `isActive`, `linkedTabs`, `connectionStatuses`, `mode`, `lastActiveSyncedTabId`
- Mutated in-place. Persisted via `persistSyncState()`. Broadcast via `broadcastSyncStatus()`

### Auto-Sync (`autoSyncState` — protected by mutex)

- `enabled`, `groups: Map<normalizedUrl, { tabIds, isActive }>`, `excludedUrls`
- **All writes** must go through `withAutoSyncLock()` to prevent concurrent mutation
- Auxiliary sets: `manualSyncOverriddenTabs`, `dismissedUrlGroups`, `pendingSuggestions`

## Anti-Patterns

- **NEVER** use `await` in hot-path message handlers (scroll:sync relay adds latency)
- **NEVER** skip `withAutoSyncLock()` when modifying auto-sync state
- **ALWAYS** restore in-memory `Set`/`Map` state after SW restart (lost on 30s idle termination)
- **ALWAYS** check `syncState` before pinging content scripts (Chrome throttles background tabs)
- **ALWAYS** send `scroll:stop` to old tabs BEFORE `scroll:start` to new tabs
- **ALWAYS** remove closed tabs from `manualSyncOverriddenTabs` set

## Timing Constants

| Constant                        | Value            | Constraint                                   |
| ------------------------------- | ---------------- | -------------------------------------------- |
| `KEEP_ALIVE_INTERVAL_MS`        | 25,000ms         | × 2 must be < CONNECTION_TIMEOUT (50s < 60s) |
| `CONNECTION_TIMEOUT_THRESHOLD`  | 60,000ms         | Mark connection lost after 2 missed pings    |
| `MESSAGE_TIMEOUT`               | 2,000ms          | Default `sendMessageWithTimeout()` timeout   |
| `SUGGESTION_SNOOZE_DURATION_MS` | 7,200,000ms (2h) | Temporary domain snooze                      |
| `MAX_AUTO_SYNC_GROUP_SIZE`      | 10               | Max tabs per auto-sync group                 |
