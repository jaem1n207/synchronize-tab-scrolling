# Popup Components

React UI components for the extension popup — the main user interface for selecting tabs and controlling scroll synchronization.

## Component Overview

| Component                  | Responsibility                                                                          |
| -------------------------- | --------------------------------------------------------------------------------------- |
| `scroll-sync-popup.tsx`    | Root component — coordinates hooks and child components (248 lines)                     |
| `tab-command-palette.tsx`  | Tab selection group with heading, selection summary, search, list, and settings actions |
| `sync-control-buttons.tsx` | Start/Stop/Re-sync buttons with state-dependent visibility                              |
| `selected-tabs-chips.tsx`  | Chip display of selected tabs with removal capability                                   |
| `actions-menu.tsx`         | Dropdown menu for same-page tab suggestions and excluded-domain settings                |
| `url-sync-settings.tsx`    | Shared compact/inline control for "Sync page changes" and URL sync mode selection       |
| `error-notification.tsx`   | Inline error display with auto-dismiss                                                  |
| `footer-info.tsx`          | Extension info and version display                                                      |
| `index.ts`                 | Barrel file re-exporting all components                                                 |

## Component Hierarchy

```
ScrollSyncPopup
├── ErrorNotification
├── TabCommandPalette
│   ├── SelectedTabsChips summary
│   └── tab list with search/filter/keyboard nav
├── UrlSyncSettings
├── SyncControlButtons
├── ActionsMenu
│   ├── Same-page tab suggestion toggle
│   └── Excluded-domain settings
└── FooterInfo
```

## State Management

All state is managed by custom hooks in `~/popup/hooks/`. Components are primarily presentational, receiving state and callbacks as props from `ScrollSyncPopup` which wires everything together.

## Accessibility

- Full keyboard navigation (Tab, Arrow keys, Enter, Space, Escape)
- ARIA labels and roles on all interactive elements
- Focus management for modal-like interactions
- Screen reader announcements for state changes

## Local File Rows

Unavailable local-file rows can include a settings action that opens the browser extension details
page when Chromium file URL access is disabled. Browser-readable local file rows also show a privacy
note clarifying that sync uses scroll position only and does not upload file contents.
