# Contextual Onboarding Hints Design

## Context

The extension has a simple primary job: the user selects two or more tabs and starts scroll
synchronization. A conventional first-run onboarding flow would slow that down. It would also force
users to read about features before they have a reason to care.

The product should introduce features only when the current situation makes the feature useful. The
onboarding system should therefore work as contextual hints, not as a tour, wizard, or checklist.

This design follows Toss-style writing principles:

- concise copy
- friendly `해요체`
- reliable, factual guidance
- active voice
- one idea per sentence
- concrete action buttons
- no technical terms in user-facing copy when a plain word works

## Goals

- Keep the first-run and normal popup flow focused on tab selection and starting sync.
- Introduce every major feature only when a relevant situation occurs.
- Let users hide each hint independently with `이 안내 숨기기`.
- Auto-dismiss hints without treating dismissal as permanent.
- Use OS-aware shortcut copy for manual scroll adjustment.
- Guide users directly to the relevant setting when a setting can resolve the situation.
- Avoid exposing raw URLs, tab titles, page titles, or page metadata in new hint copy or logs.

## Non-Goals

- Do not add a first-run onboarding screen.
- Do not add a step-by-step tour.
- Do not add a global "hide all tips" setting.
- Do not change scroll sync math, timing constants, or the hot scroll path.
- Do not add analytics or external telemetry.
- Do not introduce URL-specific or site-specific hint history.

## Chosen Approach

Use a small contextual hint layer with two surfaces:

| Surface | Use When | Shape |
| --- | --- | --- |
| Popup inline hint | The situation starts in the popup and can be solved there. | Thin inline row that does not compete with tab selection. |
| Webpage overlay hint | The situation happens while the user is viewing or scrolling a synced page. | Small bottom-right overlay that auto-dismisses after 8-10 seconds. |

Every hint has a stable hint id. Only an explicit `이 안내 숨기기` action stores that id. Auto-dismiss
and `다음에 보기` close the hint for now, but the same hint can appear again when the situation
returns.

## Hint Trigger Matrix

| Hint | Trigger | Surface | Copy |
| --- | --- | --- | --- |
| `start-minimum-tabs` | User tries to start sync with fewer than two selected tabs. | Popup inline or existing button tooltip. | `동기화할 탭을 2개 이상 선택하세요.` |
| `manual-scroll-adjustment` | Sync starts and connected pages cross the page-length threshold below. | Webpage overlay. | See manual scroll adjustment copy below. |
| `page-change-synced` | A page change in one synced tab is applied to another synced tab. | Webpage overlay. | `다른 탭도 같은 페이지로 이동했어요` / `원하지 않으면 페이지 이동 동기화를 끌 수 있어요.` |
| `keep-website-path-synced` | URL Sync is in keep-website mode and a compatible path change is applied while each tab keeps its site. | Webpage overlay. | `각 탭의 사이트를 유지했어요` / `가능한 같은 경로로만 이동했어요.` |
| `sync-suggestion` | Two or more same-page or translated-page candidates are detected. | Existing suggestion toast. | `함께 볼 수 있는 탭을 찾았어요` / `선택한 탭을 같이 스크롤할 수 있어요.` |
| `add-tab-to-sync` | A same-page or translated-page tab is detected while a manual sync is active. | Existing add-tab toast. | See add-tab copy below. |
| `floating-panel` | User first opens or focuses the floating panel while sync is active. | Floating panel inline hint. | `이곳에서 동기화 상태와 페이지 이동 설정을 볼 수 있어요.` |

### Manual Scroll Adjustment Copy

This hint appears only when page lengths cross the threshold in the manual adjustment trigger
section. It should describe the action and result without using words like offset or ratio.

macOS:

```text
페이지 길이가 달라 보이나요?
⌥ Option을 누른 채 이 탭만 스크롤해보세요.
손을 떼면 지금 차이가 유지돼요.
```

Windows and Linux:

```text
페이지 길이가 달라 보이나요?
Alt를 누른 채 이 탭만 스크롤해보세요.
손을 떼면 지금 차이가 유지돼요.
```

Unknown platform:

```text
페이지 길이가 달라 보이나요?
Alt 또는 Option을 누른 채 이 탭만 스크롤해보세요.
손을 떼면 지금 차이가 유지돼요.
```

Actions:

- `다음에 보기`
- `이 안내 숨기기`

The key label should come from the existing platform detection pattern used by
`getPlatform()` and `useModifierKey()`.

### Add Tab To Sync Copy

The copy must make it clear that the tab joins the current sync session. It must not sound like a
new sync session.

```text
현재 동기화에 이 탭을 추가할까요?
추가하면 이 탭도 지금 동기화 중인 탭들과 함께 스크롤돼요.
```

Actions:

- `동기화에 추가하기`
- `다음에 하기`
- `이 안내 숨기기`

If adding the tab resets existing manual scroll differences:

```text
추가하면 조정한 스크롤 차이는 초기화돼요.
```

## Architecture

The feature should be built from four small pieces.

| Unit | Purpose |
| --- | --- |
| Hint registry | Defines stable hint ids, surfaces, copy keys, dismiss behavior, and optional CTA metadata. |
| Dismissed hint storage | Stores only hint ids that the user explicitly hid. |
| Hint trigger emitter | Creates hint candidates when sync, page movement, or suggestion events occur. |
| Hint surfaces | Render popup inline hints and webpage overlay hints. |

The normal flow is:

```text
User action or sync event
  -> trigger emitter creates a hint candidate
  -> dismissed hint storage checks the hint id
  -> session cooldown checks repeated hints
  -> matching surface renders the hint
  -> hint auto-dismisses after 8-10 seconds
  -> only "이 안내 숨기기" persists the hint id
```

### Manual Adjustment Trigger

The manual adjustment hint should be evaluated after sync start succeeds, outside the scroll event
path. It should compare scrollable heights:

```text
scrollableHeight = scrollHeight - clientHeight
```

Show the hint only when both conditions are true:

- the largest scrollable height is at least 1.4x the smallest non-zero scrollable height
- the absolute difference between those two heights is at least 600px

Ignore tabs whose scrollable height is 0. If fewer than two connected tabs have non-zero scrollable
height, skip the hint.

If the height comparison fails, skip the hint and keep sync running.

The same sync session should show `manual-scroll-adjustment` at most once. A later sync session can
show it again if the condition is still true, unless the user has hidden that hint.

### Settings CTA

Hints that mention a setting should include a direct action.

For URL Sync hints, `설정 바꾸기` should open the relevant control directly:

- In the popup, expand the URL Sync row.
- On a synced webpage, open the floating panel and reveal the URL Sync control.

If direct opening fails, do not block sync. Close the hint and leave the normal panel or popup state
available.

## Interaction Rules

| User Action | Stored? | Future Behavior |
| --- | --- | --- |
| Auto-dismiss | No | The hint may appear again in a later matching situation. |
| `다음에 보기` | No | The hint closes for now. |
| `설정 바꾸기` | No | The relevant setting opens and the hint closes. |
| `이 안내 숨기기` | Yes | The same hint id does not appear again. |

The webpage overlay should stay lighter than the existing suggestion toast. It is a situational
hint, not a feature card. It should use at most two visible action buttons unless a setting CTA is
needed.

## Privacy And Logging

New contextual hints must not include raw URLs, tab titles, page titles, canonical URLs, alternate
links, or message payloads in copy or logs.

Allowed hint metadata:

- hint id
- surface
- trigger reason
- tab count
- booleans such as dismissed or hidden
- non-sensitive dimensions such as scrollable height buckets or counts

Avoid storing:

- URLs
- domains
- tab titles
- page titles
- per-site hint history
- raw payloads

Existing same-page suggestion toasts are functional UI, but they should not be used as a pattern for
new contextual hints. This project should not add any new URL or title lines to those toasts. Any
logging touched by this work must pass the privacy logging validator.

## Failure Behavior

| Failure | Behavior |
| --- | --- |
| Dismissed hint read fails | Skip the hint. Do not risk noisy repeated guidance. |
| Dismissed hint write fails | Close the hint for the current surface. It may appear again later. Log only non-sensitive metadata. |
| Height comparison fails | Skip `manual-scroll-adjustment`. Sync continues. |
| Setting CTA cannot open the target control | Close the hint and keep the normal UI usable. |
| i18n key is missing | Treat as a build/test failure. Do not ship fallback English-only copy. |

## Testing

Add focused tests for:

- hint registry definitions
- dismissed hint storage behavior
- `이 안내 숨기기` persisting a hint id
- auto-dismiss and `다음에 보기` not persisting a hint id
- OS-specific manual adjustment key labels
- manual adjustment trigger threshold
- per-sync-session cooldown
- URL Sync setting CTA opening the popup row or floating panel control
- i18n parity across both locale trees
- privacy logging rules for touched files

Regression checks:

- normal tab selection and sync start remain fast
- scroll handlers still do no async hint work
- URL Sync mode truthfulness is unchanged
- existing same-page and add-tab suggestion acceptance still works

## Acceptance Criteria

- No first-run onboarding screen appears after install.
- The popup remains focused on selecting tabs and starting sync.
- Every major feature is introduced only after a relevant situation occurs.
- Users can hide each hint independently.
- Auto-dismiss and `다음에 보기` do not permanently hide a hint.
- Manual scroll adjustment is introduced only when synced pages cross the page-length threshold.
- Manual scroll adjustment copy shows `⌥ Option`, `Alt`, or `Alt 또는 Option` based on platform.
- Settings hints include direct actions instead of telling users to find settings manually.
- Copy uses concise `해요체`, active voice, and concrete action labels.
- New contextual hints do not expose raw URLs, tab titles, page titles, or page metadata.
- The implementation keeps scroll sync timing and privacy invariants intact.
