# Command Item Leading Indicator Design

## Context

The previous `CommandItem` highlight fix made hover state use the existing accent background.
That improved state consistency, but it still depended on a subtle light-gray background tint.
Real device testing showed the tint can disappear on a QHD gaming monitor while remaining visible
on a 4K Mac-oriented monitor.

The failure mode is therefore not only OS-specific. It is a display-contrast and rendering problem:
active rows must not rely on a low-contrast background color alone.

This design supersedes `2026-04-30-command-item-highlight-design.md`.

## Goal

Make the active command row identifiable on lower-contrast displays by adding a non-color-field
structural cue: a leading indicator on the active row.

The affected surfaces still share the `CommandItem` primitive:

- `TabCommandPalette`: tab search and selection list.
- `ActionsMenu`: command-style action menu.

## Non-Goals

- Do not introduce a new theme color, custom hex color, or monitor-specific palette.
- Do not darken global `--accent`, `--muted`, or other theme tokens.
- Do not add platform, browser, or monitor detection.
- Do not redesign popup layout, typography, or tab selection behavior.
- Do not change scroll-sync state, tab discovery, or action execution behavior.

## Design

Replace the hover-only accent-background fix with a shared leading indicator in
`src/shared/components/ui/command.tsx`.

The active row should keep the existing `data-[selected='true']:bg-accent` keyboard-active
background as a secondary cue, but the reliable primary cue should be a leading bar rendered inside
the command item. The leading bar should:

- Appear on mouse hover.
- Appear when cmdk marks the item as keyboard-active via `data-selected=true`.
- Use the existing high-contrast semantic token `foreground`.
- Be implemented without layout shift as an absolutely positioned pseudo-element.
- Stay hidden for disabled command items.

This keeps the behavior centralized. Current and future command-list surfaces inherit the same
monitor-safe active-row cue without repeating popup-specific classes.

`TabCommandPalette` should keep its current selected-tab logic. The checkbox/checkmark still means
"selected for sync." The leading indicator means "currently hovered or keyboard-active." These
states can overlap, but the implementation should not add a separate selected-tab color.

## Accessibility

WCAG guidance for non-text contrast and focus appearance supports using visible indicators that do
not depend on barely distinguishable color fields. For this component, a leading indicator gives
keyboard and pointer users a shape-based cue even when the background tint is not perceptible on a
specific monitor.

The active command item should therefore expose a visible state for:

- Mouse hover.
- cmdk keyboard navigation via `data-selected=true`.
- Disabled state, which must remain visually muted and non-interactive.

## Testing

Update regression coverage around the shared `CommandItem` class contract. The test should verify
that the shared primitive includes:

- Existing keyboard-active background classes.
- Existing disabled-state classes.
- Leading-indicator pseudo-element base classes.
- Hover and `data-selected=true` classes that reveal the leading indicator.
- Disabled-state classes that keep the indicator hidden.

The test should stop treating `hover:bg-accent` as the core acceptance criterion. The reliable
acceptance criterion is the non-color-field leading indicator.

Run at least:

- A targeted Vitest command for `CommandItem`.
- `pnpm typecheck`.
- `git diff --check`.

## PR Handling

The existing draft PR should be revised rather than shipped as-is:

- Remove the hover-only `CommandItem` implementation added by the prior fix.
- Replace the prior test assertions that only check hover accent background.
- Keep or update documentation so the shipped PR does not claim subtle accent tint alone is
  sufficient.

## Acceptance Criteria

- Hovering a tab row or action menu item shows a visible leading indicator.
- Arrow-key navigation shows the same leading indicator on the cmdk-active row.
- The indicator remains visible on lower-contrast displays where the accent background is hard to
  distinguish.
- The implementation uses existing semantic tokens and introduces no new color palette.
- The fix is shared through `CommandItem`, not duplicated across popup call sites.
- Disabled command items do not show an active-row indicator.
