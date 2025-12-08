# Popup UI Components

This directory contains the UI components for the scroll synchronization control panel, following the PRD requirements and accessibility standards.

## Component Architecture

### Main Components

1. **ScrollSyncPopup** (`components/ScrollSyncPopup.tsx`)
   - Main entry point for the popup UI
   - Manages state for tab selection, sync status, and panel visibility
   - Coordinates all child components

2. **DraggableControlPanel** (`components/DraggableControlPanel.tsx`)
   - Draggable panel container with minimize/maximize functionality
   - Auto-snap to viewport edges (left/right) with 200ms ease-out-quad animation
   - Minimize: 30x30px button with 250ms ease-out-cubic animation
   - Respects `prefers-reduced-motion` for accessibility

3. **TabSelectionList** (`components/TabSelectionList.tsx`)
   - Displays eligible tabs with titles and favicons
   - Shows ineligible tabs with explanation tooltips
   - Visual feedback for selection state (checkmarks)
   - Full keyboard navigation support

4. **LinkedSitesPanel** (`components/LinkedSitesPanel.tsx`)
   - Collapsible list of synchronized tabs (collapsed by default)
   - Connection status indicators per tab
   - Click-to-switch functionality
   - Real-time status updates

5. **SyncControlButtons** (`components/SyncControlButtons.tsx`)
   - Start/Stop sync button with state management
   - Disabled when < 2 tabs selected
   - Re-sync button when connection errors detected
   - Visual feedback for active sync state

6. **StatusIndicator** (`components/StatusIndicator.tsx`)
   - Visual connection status indicators
   - States: connected (pulsing green), disconnected (gray), error (pulsing red)
   - Includes ARIA labels for screen readers

## Animation Guidelines

All animations follow PRD specifications:

- **Fast animations**: 200-300ms default
- **Easing functions**:
  - `ease-out` for entering elements
  - `ease-out-quad` for edge snapping (200ms)
  - `ease-out-cubic` for minimize/maximize (250ms)
  - `ease-out-expo` for panel appearance (300ms)
- **Hardware acceleration**: Uses `transform` and `opacity` only
- **Accessibility**: Respects `prefers-reduced-motion` media query

## Accessibility (WCAG 2.1 AA)

### Keyboard Navigation

- All interactive elements accessible via Tab key
- Enter/Space key activation for buttons
- Escape key support (via parent handlers)
- Logical tab order maintained

### Screen Reader Support

- Semantic HTML structure (`role`, `aria-*` attributes)
- All buttons have descriptive `aria-label`
- Status changes announced via `aria-live` regions
- Proper heading hierarchy

### Visual Design

- 4.5:1 contrast ratio for text
- 3:1 contrast ratio for UI components
- Visible focus indicators
- Supports high contrast modes

### Form Accessibility

- Checkboxes use `aria-checked` and `role="checkbox"`
- Disabled states clearly indicated
- Error messages associated with controls
- Tooltips provide context for restrictions

## Type Definitions

See `types.ts` for core type definitions:

- `TabInfo`: Tab metadata and eligibility
- `SyncStatus`: Synchronization state
- `ConnectionStatus`: Per-tab connection states
- `PanelPosition`: Panel positioning data

## Usage Example

```tsx
import { ScrollSyncPopup } from './components/ScrollSyncPopup';

function App() {
  return <ScrollSyncPopup />;
}
```

## Future Enhancements

- Integration with browser tabs API
- Persistent panel position via storage API
- Multi-language support (i18n)
- Advanced sync mode selection UI
- Performance metrics display
