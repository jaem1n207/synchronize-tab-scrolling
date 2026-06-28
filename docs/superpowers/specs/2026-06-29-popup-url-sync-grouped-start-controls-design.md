# Popup URL Sync Grouped Start Controls Design

## Context

PR #385 added URL Sync modes, then compacted the popup control from a large settings card into a
small inline row. Manual popup review found one remaining UX issue: the "select 2 or more tabs"
guidance visually belonged to the tab selection workflow, but the URL Sync row sat between that
guidance and the tab list. This made the popup feel like three unrelated chunks instead of one
clear setup flow.

The final layout should keep tab selection dominant, keep URL Sync mode visible and editable in the
popup, and make the URL Sync label understandable to non-developer users.

## Goals

- Group the tab selection heading, start guidance, search input, and tab list as one visual section.
- Place URL Sync as a secondary start behavior option directly above the start/action buttons.
- Keep URL Sync enabled by default and easy to turn off with a switch.
- Keep mode changes available in the popup; do not move them into the Actions menu.
- Rename the top-level label from a technical URL phrase to user-facing behavior copy.
- Explain mode differences with examples only in the expanded editor, not in the collapsed row.

## Non-Goals

- Do not change URL Sync runtime behavior, defaults, storage semantics, save failure handling, or
  state repair behavior.
- Do not restore the removed language helper copy.
- Do not move mode selection into a popover, drawer, dialog, page, or Actions menu.
- Do not redesign the tab list, bottom buttons, or Actions menu beyond the placement needed for
  this grouping change.

## Chosen Layout

The popup should read as:

```text
동기화할 탭 선택
[동기화를 시작하려면 2개 이상의 탭을 선택하세요]
[검색 입력]
[탭 리스트]

[페이지 이동도 동기화        switch]
 켜짐 · 변경한 탭 따라가기   chevron

[동기화 시작] [작업]
```

When the URL Sync row is expanded, the mode editor opens in place above the start/action buttons:

```text
[페이지 이동도 동기화        switch]
 켜짐 · 변경한 탭 따라가기   chevron-up

(*) 변경한 탭 따라가기
    예: A탭이 example.com/products로 이동하면 다른 탭도 example.com/products로 이동

( ) 각 탭의 웹사이트 유지
    예: A탭이 docs.example.com/pricing으로 이동하면 B탭은 shop.example.com/pricing 열기

[동기화 시작] [작업]
```

The row belongs to the final start decision, not the tab selection list itself. Its visual weight
should be lower than the tab list and lower than the primary start button.

## Copy

Use `페이지 이동도 동기화` for Korean and `Sync page changes` for English.

The collapsed row should show only compact state:

- `켜짐 · 변경한 탭 따라가기`
- `켜짐 · 각 탭의 웹사이트 유지`
- `꺼짐 · 변경한 탭 따라가기`
- `꺼짐 · 각 탭의 웹사이트 유지`

Do not show long URL examples in the collapsed row. At popup width, those examples truncate and make
the row harder to scan.

Expanded mode descriptions should include deterministic example domains, never current tab URLs,
tab titles, or page metadata. Example copy should use fixed safe domains such as `example.com`,
`docs.example.com`, and `shop.example.com`.

## Component Design

Keep `UrlSyncSettings` as the shared component and keep the `inline-collapsible` variant for the
popup. The parent popup layout should move this component below `TabCommandPalette` and above the
bottom control buttons.

`UrlSyncSettings` should still:

- show the active mode in the collapsed row
- expose the switch separately from the disclosure control
- expand/collapse mode choices in place
- collapse after a successful mode change
- stay expanded and show the notice after a failed mode change
- keep the visible mode truthful to the actual persisted or repaired state

The content script panel compact variant should keep its existing behavior unless a shared label
change naturally affects it.

## Visual Design

Use an icon, label weight, muted summary text, and switch placement to make the row feel like a
supporting behavior option. The label should be bold enough to be legible, but the row must not
compete with the tab list or primary start button.

The row should avoid floating by using one of these subtle anchors:

- a light border and muted background
- a small top divider
- consistent spacing with the bottom button group

Text must fit at the popup width. Use `min-w-0` and intentional truncation for the mode summary.
Expanded examples can wrap to two lines if needed, but should stay concise.

## Accessibility

- Keep `aria-expanded` and `aria-controls` on the disclosure button.
- Keep the switch label tied to the new user-facing label.
- Keep mode options as radio inputs with normal keyboard behavior.
- Keep notices near the URL Sync row and announce them with the existing live region behavior.
- Do not change CJK IME behavior; this component does not handle text input.

## Testing

Update component tests for:

- the popup inline-collapsible variant rendering the new label
- collapsed state showing state plus active mode without URL examples
- expanded state showing both mode options with their example copy
- selecting a mode calling `onModeChange`
- successful mode change collapsing the editor
- failed mode change keeping the editor open and showing the notice
- disabled URL Sync preserving the visible selected mode while disabling mode choices

Update E2E selectors for the new switch/disclosure accessible names. Run i18n validation after
updating both locale trees.

## Acceptance Criteria

- The tab selection heading, guidance, search input, and tab list read as one grouped section.
- URL Sync appears directly above the start/action buttons as a secondary start behavior option.
- The top-level label is `페이지 이동도 동기화` in Korean and `Sync page changes` in English.
- The collapsed URL Sync row shows the active mode but does not include URL examples.
- The expanded editor keeps mode selection in the popup and includes safe fixed-domain examples.
- The removed language helper copy does not return.
- No raw user URLs, tab titles, page metadata, payloads, or storage values are logged or exposed.
