# Command Item Highlight Design

## Context

Windows users cannot reliably see the active option in popup command lists when hovering with a
mouse or navigating with the keyboard. The same UI is visible on macOS, so this should preserve the
existing visual language instead of introducing a new highlight color.

The affected surfaces share the `CommandItem` primitive:

- `TabCommandPalette`: tab search and selection list.
- `ActionsMenu`: command-style action menu.

## Goal

Make hover and keyboard-active command items visibly use the existing accent highlight on Windows,
matching the macOS behavior as closely as the shared design tokens allow.

## Non-Goals

- Do not introduce a new color, theme token, or platform-specific palette.
- Do not redesign popup layout, spacing, typography, or selected-tab behavior.
- Do not change scroll-sync state, tab discovery, or action execution behavior.

## Design

Update the shared `CommandItem` styling in `src/shared/components/ui/command.tsx` so the item uses
the existing `bg-accent` and `text-accent-foreground` tokens for both mouse hover and cmdk's
keyboard-active state (`data-selected=true`).

This keeps the fix centralized. Every current and future popup command list receives the same
interaction feedback without repeating hover classes in individual components.

`TabCommandPalette` should keep its current selected-tab logic. The checkbox/checkmark represents
whether a tab is selected for sync. The command highlight represents the row currently hovered or
keyboard-active. These states can overlap, but the implementation should not add a separate
selected-tab color.

## Accessibility

The visible active row is required for keyboard users because arrow-key navigation depends on
knowing which option is active before pressing Enter. The shared command item should therefore
expose a visible state for:

- Mouse hover.
- cmdk keyboard navigation via `data-selected=true`.
- Existing disabled state, which must remain visually muted and non-interactive.

## Testing

Add focused regression coverage around the shared `CommandItem` contract. The test should verify
that the component includes the shared hover and `data-selected=true` accent classes so both
`TabCommandPalette` and `ActionsMenu` inherit the fix.

Run at least:

- A targeted Vitest command for the affected component or popup tests.
- `pnpm typecheck`.

## Acceptance Criteria

- Hovering a tab row or action menu item visibly highlights it on Windows light mode.
- Arrow-key navigation visibly highlights the cmdk-active row on Windows light mode.
- Dark mode continues to use the existing accent tokens.
- No new colors or theme tokens are introduced.
- The fix is shared through `CommandItem`, not duplicated across popup call sites.
