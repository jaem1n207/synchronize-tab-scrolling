# Popup UI Components

This directory contains the extension popup. It preserves the manual tab picker while rendering
authoritative cross-window session state when synchronization is active.

## Component Architecture

| Component                                   | Responsibility                                                              |
| ------------------------------------------- | --------------------------------------------------------------------------- |
| `components/scroll-sync-popup.tsx`          | Root composition, inactive/active branching, popup-local keyboard shortcuts |
| `components/tab-command-palette.tsx`        | Inactive current-window search, eligibility, and selection                  |
| `components/active-sync-session.tsx`        | Authoritative cross-window linked-tab list, Reconnect, and Stop             |
| `components/quick-sync-shortcut-status.tsx` | Assigned/unassigned/unavailable Quick Sync state                            |
| `components/quick-sync-recent-outcome.tsx`  | Non-persisted delayed recovery for command failures                         |
| `components/actions-menu.tsx`               | Explicit auto-suggestion opt-in and inactive picker actions                 |
| `components/sync-control-buttons.tsx`       | Inactive Start control                                                      |
| `shared/components/url-sync-settings.tsx`   | URL Sync configuration for inactive and active states                       |

State and mutations live in hooks under `hooks/`:

- `use-manual-sync-session.ts` reads authoritative `loading | inactive | active | error` state and
  refetches after Stop/Reconnect.
- `use-sync-control.ts` owns popup Start only.
- `use-tab-discovery.ts` discovers current-window picker rows only; it is not session topology.
- `use-quick-sync-shortcut.ts` reads assignment truth from `commands.getAll()` and feature-detects
  optional change events.
- `use-auto-sync.ts` keeps same-page suggestions explicit opt-in.

## Quick Sync Responsibilities

### Inactive popup

- Keep search, filters, selection chips, checkboxes, Start, Actions, URL Sync settings, and
  popup-local `Cmd/Ctrl+S`.
- Show Quick Sync as an additional browser-wide shortcut, never a replacement Start button.
- Display the exact assignment returned by `commands.getAll()`, including honest unassigned and
  unavailable states.

### Active popup

- Replace picker controls with the authoritative background snapshot.
- Show linked tabs from every browser window with `current-tab`, `current-window`, or
  `other-window` location.
- Keep unavailable metadata rows without converting the whole session to inactive.
- Keep URL Sync settings, real Reconnect when needed, and Stop.
- Refetch after mutation rather than manufacturing local success.

The full command, transaction, remap, and QA contract is documented in
[`docs/guides/quick-sync-shortcut.md`](../../docs/guides/quick-sync-shortcut.md).

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

## State and Privacy Boundaries

- Picker rows may use tab URL/title locally for discovery and display, but must not log or export
  them.
- Active snapshot display needs title/favicon/window metadata but no raw URL.
- A status read failure is `error`, not `inactive`.
- Storage values and `commands` capabilities are runtime-validated or feature-detected.
