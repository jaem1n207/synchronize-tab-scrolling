# Popup Components

React UI components for the extension popup — the main user interface for selecting tabs and controlling scroll synchronization.

## Component Overview

| Component                  | Responsibility                                                        |
| -------------------------- | --------------------------------------------------------------------- |
| `scroll-sync-popup.tsx`    | Root component — coordinates hooks and child components (203 lines)   |
| `tab-command-palette.tsx`  | Command palette for tab search and selection with keyboard navigation |
| `sync-control-buttons.tsx` | Start/Stop/Re-sync buttons with state-dependent visibility            |
| `selected-tabs-chips.tsx`  | Chip display of selected tabs with removal capability                 |
| `actions-menu.tsx`         | Dropdown menu for auto-sync toggle, URL sync toggle, and settings     |
| `error-notification.tsx`   | Inline error display with auto-dismiss                                |
| `footer-info.tsx`          | Extension info and version display                                    |
| `index.ts`                 | Barrel file re-exporting all components                               |

## Component Hierarchy

```
ScrollSyncPopup
├── ErrorNotification
├── TabCommandPalette
│   └── (tab list with search/filter/keyboard nav)
├── SelectedTabsChips
├── SyncControlButtons
├── ActionsMenu
│   ├── Auto-sync toggle
│   └── URL sync toggle
└── FooterInfo
```

## State Management

All state is managed by custom hooks in `~/popup/hooks/`. Components are primarily presentational, receiving state and callbacks as props from `ScrollSyncPopup` which wires everything together.

## Accessibility

- Full keyboard navigation (Tab, Arrow keys, Enter, Space, Escape)
- ARIA labels and roles on all interactive elements
- Focus management for modal-like interactions
- Screen reader announcements for state changes
