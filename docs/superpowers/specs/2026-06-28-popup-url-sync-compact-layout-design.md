# Popup URL Sync Compact Layout Design

> Follow-up: `2026-06-29-popup-url-sync-grouped-start-controls-design.md` supersedes this document's
> popup placement, top-level label, and URL Sync helper/example-copy details. This document remains
> the base rationale for keeping URL Sync compact.

## Context

URL Sync mode selection was added so users can choose between the existing behavior and the new
staging/production comparison behavior from issue #384. The behavior is important enough to be
visible in the popup, but the current popup layout gives the URL Sync setting too much vertical
space.

The popup is a fixed 480px by 600px surface. Its primary job is selecting tabs to synchronize. In
the current layout, the URL Sync card sits above the tab list with a heading, description, switch,
two large option cards, helper text, and possible notice. On ordinary popup sizes this leaves only a
small portion of the tab selection UI visible, which makes the main workflow harder to use.

The UI still must satisfy the URL Sync mode requirements from
`docs/superpowers/specs/2026-06-27-url-sync-mode-design.md`:

- users must be able to see whether URL Sync is on
- users must be able to see the active mode
- the UI must not hide the mode behind an icon-only control
- language preservation must remain visible
- notices must make failure states understandable and actionable
- the displayed state must match the actual behavior

## Goal

Make the popup URL Sync settings compact enough that tab selection remains the dominant area, while
keeping the current URL Sync state and active mode obvious to non-developer users.

The popup should show URL Sync as a compact inline settings row by default and expand in place only
when the user wants to change the mode.

## Non-Goals

- Do not move URL Sync mode selection into a popover, drawer, dialog, or separate page.
- Do not hide the active mode behind an icon-only button.
- Do not remove mode descriptions entirely.
- Do not change URL Sync runtime behavior, storage semantics, or error handling in this UI pass.
- Do not change the in-page sync control panel unless needed to preserve shared component behavior.
- Do not redesign the tab selection list or bottom action buttons in this pass.

## Chosen Direction

Use a compact collapsible row in the popup.

Collapsed state:

```text
URL Sync   On   Keep each tab's website     [switch] [chevron]
           Languages kept when possible
```

Expanded state:

```text
URL Sync   On                             [switch] [chevron]

[ Follow changed tab      ]
  Other tabs move to the website you changed.

[ Keep each tab's website ]
  Other tabs stay on their own website and open the matching page.

Languages kept when possible
```

This keeps the active behavior readable on the first screen, avoids a heavier popup/drawer flow for
only two modes, and gives the tab list back most of the vertical space.

## Layout Behavior

### Collapsed Row

The popup should render URL Sync settings as a slim row instead of a full card.

The row should contain:

- a short setting label, such as `URL Sync`
- an on/off status, such as `On` or `Off`
- the active mode label
- the existing switch, visually reduced if the component allows it
- an expand/collapse affordance

The active mode text must remain visible in the collapsed row. Users should not need to expand the
row just to know whether synced tabs will follow the changed website or keep each tab's website.

The collapsed row should be short enough to preserve tab list space. A target visual height around
44px to 52px is appropriate. Do not add a persistent helper line below the row; the row should spend
its limited space on the current state and active mode.

### Expanded Inline Editor

Expanding the row should reveal the two mode options directly below it in the popup flow.

The expanded area should be compact:

- use two rows or compact radio options, not large card-like blocks
- keep each option label readable
- show a short description for each option
- use a strong selected state through border, background, checkmark, or radio indicator
- keep spacing tight enough that the tab selection area is still meaningfully usable

After the user selects a different mode, the control should return to the collapsed state. This
keeps mode changes quick and returns attention to tab selection.

### Off State

When URL Sync is off:

- keep the selected mode visible in the collapsed row
- disable mode option changes
- make the off state clear through text and disabled styling

This preserves the user's mental model: turning URL Sync back on will use the visible mode.

### Notices

Notices should stay close to the URL Sync row, but they must not recreate the large card problem.

Use a compact inline notice below the row. The notice should:

- use the existing `UrlSyncNotice` severity
- remain readable at popup size
- avoid raw URL, tab title, or page metadata
- explain what happened and what the user can do next

If a notice means the persisted setting was repaired, the visible mode must already reflect the
repaired mode. If a selected mode could not navigate safely, the visible mode should remain selected
and the notice should explain that no navigation was synced.

## Component Design

Keep `UrlSyncSettings` as the shared UI component, but avoid making the existing `compact` prop do
two unrelated jobs.

Recommended API shape:

```typescript
interface UrlSyncSettingsProps {
  enabled: boolean;
  mode: UrlSyncMode;
  notice?: UrlSyncNotice | null;
  variant?: 'card' | 'inline-collapsible' | 'panel-compact';
  onEnabledChange: (enabled: boolean) => void | Promise<void>;
  onModeChange: (mode: UrlSyncMode) => void | Promise<void>;
}
```

Use cases:

- popup: `variant="inline-collapsible"`
- content script panel: preserve the current compact panel behavior through `variant="panel-compact"`
- other full settings surfaces: `variant="card"`

For backward compatibility during implementation, the current `compact` prop can be mapped to
`panel-compact`, but new popup code should use the explicit variant.

The expanded/collapsed state should be local UI state. It should not be saved to extension storage.

## Visual Constraints

The row information and buttons should be smaller than the current card controls, but not tiny.

Minimum expectations:

- labels should remain legible at popup size
- the active mode should use a normal readable text size, not tooltip-only text
- icon buttons should have an accessible hit target even when the visual icon is small
- the switch should be easy to click
- text must truncate or wrap intentionally instead of overlapping adjacent controls
- grid or flex children that can truncate must use `min-w-0`
- focus rings must remain visible

The popup should feel like a working tool, not a settings page. The compact URL Sync row is
supporting information; the tab list is the primary surface.

## Interaction Details

Collapsed row:

- clicking the disclosure area expands the editor
- toggling the switch only changes URL Sync on/off
- the active mode label should not be mistaken for a separate button unless it expands the editor

Expanded editor:

- selecting a mode calls the existing `onModeChange`
- while a mode update is pending, mode controls should be disabled as they are today
- after a successful mode change, collapse the editor
- if mode change fails, keep the editor open and show the compact notice

Keyboard:

- the disclosure control should expose `aria-expanded` and `aria-controls`
- Enter and Space should toggle expansion on the disclosure control
- radio options should retain normal radio keyboard behavior
- CJK IME behavior should not be affected because this component does not handle text input

## Copy

Prefer existing strings where they already communicate the behavior clearly:

```text
URL Sync
Follow changed tab
Other tabs move to the website you changed.
Keep each tab's website
Other tabs stay on their own website and open the matching page.
```

Additional compact labels may be needed:

```text
On
Off
Expand URL Sync settings
Collapse URL Sync settings
```

All added strings must be added to both locale trees:

- `extension/_locales`
- `src/shared/i18n/_locales`

All nine supported locales must remain complete.

## Testing

Update or add `UrlSyncSettings` component tests for:

- popup inline-collapsible variant renders in collapsed state by default
- collapsed state shows enabled/off status and active mode label
- collapsed state does not render the language helper copy
- disclosure expands and collapses the mode editor
- expanded state shows both mode descriptions
- selecting a mode calls `onModeChange`
- successful mode change collapses the editor
- failed mode change keeps the editor open and shows the notice
- disabled URL Sync keeps the visible selected mode but disables mode options
- content script panel compact variant keeps its current behavior

Run the existing validation commands for the UI change:

```bash
pnpm test -- --run src/shared/components/url-sync-settings.test.tsx
pnpm typecheck
pnpm i18n:validate
```

Before opening or updating a pull request, also run the relevant popup or extension checks if the
branch includes implementation changes.

## Acceptance Criteria

- In the popup, URL Sync no longer consumes a large settings-card area by default.
- The active mode is visible without opening another surface.
- Users can change modes inline without a popover, drawer, or dialog.
- Tab selection regains most of the vertical space lost to the original URL Sync card.
- The switch, disclosure, and mode choices remain easy to click.
- Notices remain close to the setting and do not expose raw URLs, titles, or page metadata.
- `UrlSyncSettings` remains usable from the content script panel without forcing the popup layout
  into that panel.
