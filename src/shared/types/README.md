# Shared Type Definitions

TypeScript interfaces and types shared across all extension components (background, content scripts, popup).

## Type Files

| File                 | Purpose                                                                         |
| -------------------- | ------------------------------------------------------------------------------- |
| `messages.ts`        | All `webext-bridge` message types and the `ProtocolMap` for type-safe messaging |
| `sync-state.ts`      | `SyncState` interface for manual scroll sync state                              |
| `auto-sync-state.ts` | `AutoSyncGroup` and `AutoSyncState` interfaces for automatic URL-based sync     |
| `index.ts`           | Barrel file re-exporting all types                                              |

## Message Type Safety

`messages.ts` defines a `ProtocolMap` interface that maps message IDs to their payload types. This is augmented onto `webext-bridge`'s `ProtocolMap` in `shim.d.ts`, providing compile-time type checking for `sendMessage` and `onMessage` calls:

```typescript
// shim.d.ts augments webext-bridge
declare module 'webext-bridge' {
  export interface ProtocolMap extends import('./src/shared/types/messages').ProtocolMap {}
}
```

## Key Types

- **`SyncMode`**: `'ratio' | 'element'` — scroll position calculation strategy
- **`ConnectionStatus`**: `'connected' | 'disconnected' | 'error'` — per-tab health
- **`StartSyncMessage`**: Payload for initiating sync (tabIds, mode, isAutoSync flag)
- **`ScrollSyncMessage`**: Scroll position data relayed between tabs
- **`AutoSyncGroup`**: Internal group using `Set<number>` for O(1) tab lookups
- **`AutoSyncGroupInfo`**: Serialized group using `Array<number>` for message passing
