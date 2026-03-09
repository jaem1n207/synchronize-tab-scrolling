# Popup Hooks

Custom React hooks extracted from `ScrollSyncPopup` to separate state management concerns. Each hook encapsulates a specific domain of popup functionality.

## Hooks

| Hook                   | Lines | Responsibility                                                    |
| ---------------------- | ----- | ----------------------------------------------------------------- |
| `use-sync-control.ts`  | 330   | Core sync operations: start, stop, re-sync, connection management |
| `use-tab-discovery.ts` | 146   | Tab querying, eligibility filtering, auto-refresh                 |
| `use-popup-state.ts`   | 80    | UI state: search, selection, keyboard shortcut hints              |
| `use-auto-sync.ts`     | 67    | Auto-sync toggle and status fetching                              |
| `use-url-sync.ts`      | 38    | URL navigation sync toggle with storage persistence               |
| `index.ts`             | —     | Barrel file re-exporting all hooks                                |

## Key Design Decisions

### Circular Dependency Resolution

`useTabDiscovery` and `useSyncControl` both needed each other's outputs. Resolved by having `useTabDiscovery` expose its own `tabDiscoveryError` state instead of routing through `useSyncControl`'s error setter.

### Init Effect Guard

When splitting the monolithic init effect across hooks, a `useRef(false)` guard prevents double-execution when the `tabs` array reference changes.

### Cross-Hook Handlers

Select-all, toggle-all, and keyboard shortcuts that bridge multiple hooks remain in the component (`scroll-sync-popup.tsx`) to avoid circular dependencies.

## Import Pattern

```typescript
import {
  useSyncControl,
  useTabDiscovery,
  usePopupState,
  useAutoSync,
  useUrlSync,
} from '~/popup/hooks';
```

## Extraction History

Extracted from `ScrollSyncPopup` in Phase 5, reducing the component from 713 to 203 lines.
