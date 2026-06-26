# Popup Hooks

Custom React hooks extracted from `ScrollSyncPopup` to separate state management concerns. Each hook encapsulates a specific domain of popup functionality.

## Hooks

| Hook                   | Lines | Responsibility                                                             |
| ---------------------- | ----- | -------------------------------------------------------------------------- |
| `use-sync-control.ts`  | 386   | Core sync operations, connection management, local-file failure guidance   |
| `use-tab-discovery.ts` | 173   | Tab querying, eligibility filtering, local-file access state, auto-refresh |
| `use-popup-state.ts`   | 80    | UI state: search, selection, keyboard shortcut hints                       |
| `use-auto-sync.ts`     | 67    | Auto-sync toggle and status fetching                                       |
| `use-url-sync.ts`      | 38    | URL navigation sync toggle with storage persistence                        |
| `index.ts`             | —     | Barrel file re-exporting all hooks                                         |

## Key Design Decisions

### Circular Dependency Resolution

`useTabDiscovery` and `useSyncControl` both needed each other's outputs. Resolved by having `useTabDiscovery` expose its own `tabDiscoveryError` state instead of routing through `useSyncControl`'s error setter.

### Init Effect Guard

When splitting the monolithic init effect across hooks, a `useRef(false)` guard prevents double-execution when the `tabs` array reference changes.

### Cross-Hook Handlers

Select-all, toggle-all, and keyboard shortcuts that bridge multiple hooks remain in the component (`scroll-sync-popup.tsx`) to avoid circular dependencies.

### Local File Access

`useTabDiscovery` queries browser tabs and `getFileSchemeAccessInfo()` in parallel, then marks
browser-readable `file://` tabs eligible only when access is allowed or cannot be checked. If Chrome
or Edge reports file URL access as disabled, the tab gets an unavailable settings action.

`useSyncControl` only shows the file-access-specific retry guidance when `scroll:start` reports that
a selected `file://` tab actually failed. Mixed selections preserve the generic connection error when
only web tabs fail.

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
