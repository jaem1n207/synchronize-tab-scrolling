# Content Script Hooks

Custom React hooks extracted from `SyncControlPanel` to improve readability and separation of concerns. These hooks encapsulate specific behavioral domains of the floating control panel.

## Hooks

### `useDragPosition` (204 lines)

Manages the draggable positioning of the floating control panel:

- **Drag-and-drop**: Pointer event handling for panel repositioning
- **Edge snapping**: Auto-snaps to left/right viewport edges
- **Boundary enforcement**: Keeps panel within viewport bounds
- **Position persistence**: Remembers position across drag operations
- **Reduced motion**: Respects `prefers-reduced-motion` for snap animations

### `usePanelState` (190 lines)

Manages the internal state and behavior of the sync control panel:

- **Sync status tracking**: Listens for `sync:status` broadcasts from background
- **URL sync toggle**: Handles URL navigation sync enable/disable with storage persistence
- **Connection display**: Tracks linked tab info and connection statuses
- **Toast notifications**: Manages collapse/expand state transitions

## Import Pattern

```typescript
import { useDragPosition, usePanelState } from '~/contentScripts/hooks';
```

## Extraction History

Extracted from `sync-control-panel.tsx` in Phase 6, reducing the component from 624 to 301 lines.
