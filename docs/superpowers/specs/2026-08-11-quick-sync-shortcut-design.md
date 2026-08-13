# Quick Sync Shortcut Design

## Context

Starting scroll synchronization currently requires opening the extension popup, finding and
selecting at least two tabs, and pressing the start button. That flow remains useful when the user
wants to review or edit a larger selection, but it is too slow for the common case where the user is
already looking at the two tabs they want to connect.

The existing same-page suggestion toast does not solve this problem. It infers intent from page
similarity, appears at times the user did not request, and is opt-in because unsolicited suggestions
created too much noise. Quick Sync must instead begin only from an explicit user command.

This design adds one browser-wide WebExtension command. The first press marks the current tab as a
candidate, the second press in another tab starts synchronization, and later presses add the current
tab to the active manual session.

The feature is additive:

- The existing popup search, tab selection, and start button remain available.
- The existing popup-local `Cmd/Ctrl+S` shortcut remains a popup control. It is not the new
  browser-wide command.
- The existing automatic suggestion feature remains opt-in and is not removed in this project.

## Goals

- Let a user start a two-tab scroll sync without opening the popup.
- Keep the browser-wide shortcut semantically consistent: it only starts or adds.
- Support tabs in different windows within the same browser profile.
- Give immediate, quiet, user-triggered feedback without reviving automatic suggestion noise.
- Preserve the popup as the detailed selection and session-management surface.
- Make the active popup truthful about the complete cross-window session.
- Keep an existing active session and its manual offsets intact when an add attempt fails.
- Handle shortcut conflicts through the browser's normal remapping UI instead of adding a second
  default shortcut.
- Keep scroll mapping, timing, and manual-anchor behavior unchanged while adding only cached numeric
  session identity and synchronous membership checks to relay authorization.

## Non-Goals

- Do not remove or replace the popup tab picker or start button.
- Do not remove the existing automatic suggestion feature in this project.
- Do not use browser tab multiselect, a context menu, or an OS notification.
- Do not remove a tab or stop a session with the Quick Sync shortcut.
- Do not add a second default shortcut as a fallback.
- Do not make the pending candidate durable across a background service-worker restart.
- Do not add analytics or external telemetry.
- Do not change scroll mapping, URL Sync navigation, manual offset semantics, or timing constants.
- Do not add async work, storage access, DOM scanning, or semantic matching to `handleScrollCore()`
  or the `scroll:sync` relay.
- Do not make Arc or Dia officially supported browsers as part of this work.

## Delivery Boundary

The transition gate, runtime-validated session state, and cross-window snapshot are in scope because a
browser-wide add command would otherwise race with existing popup and suggestion handlers or display
an incorrect active session. They are foundational changes, not separate user-facing features.

The implementation plan should deliver this design in ordered slices:

1. authoritative session state, relay authorization, transition gate, and regression tests;
2. Quick Sync command coordinator and feedback HUD;
3. popup active-session view and shortcut management;
4. browser-specific validation evidence.

Automatic-suggestion discovery, grouping, snooze behavior, and toast UI must remain behaviorally
equivalent. Only accepted responses are adapted to the shared gate and expected-revision contract.
Removing the feature remains a separate project.

## Terminology

| Term               | Meaning                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------- |
| Quick Sync command | The new browser-wide command that starts or adds to manual scroll synchronization.                   |
| Candidate          | The one tab temporarily remembered after the first command press.                                    |
| Candidate window   | The fixed 10-second interval in which a second tab can start synchronization.                        |
| Active session     | The persisted manual `syncState` session containing at least two linked tabs.                        |
| Session revision   | A persisted generation changed by every committed transition that can invalidate shared sync intent. |
| Transition gate    | The single serialization boundary for candidate decisions and session-topology changes.              |
| HUD                | The non-interactive top-center feedback pill rendered in a page Shadow DOM.                          |

## Chosen User Model

Quick Sync uses one global candidate per browser profile, not one candidate per window.

| Current State                   | Command Target                 | Result                                                                           |
| ------------------------------- | ------------------------------ | -------------------------------------------------------------------------------- |
| No candidate, no active session | Eligible current tab           | Remember it as the candidate for exactly 10 seconds.                             |
| Candidate exists                | The same candidate tab         | No state change and no deadline extension.                                       |
| Candidate exists                | Another eligible tab           | Try to start a two-tab manual session immediately.                               |
| Active manual session           | A tab not in the session       | Try to add only that tab to the existing session.                                |
| Active manual session           | A tab already in the session   | No state change.                                                                 |
| Any state                       | Ineligible or inaccessible tab | Keep the existing candidate or active session unchanged and show error feedback. |

The command never toggles. Repeated presses cannot remove a tab or stop the session.

### Shortcut Defaults

Use exactly one manifest command named `quick-sync-start-or-add`.

| Platform      | Suggested key          | User-facing form |
| ------------- | ---------------------- | ---------------- |
| macOS         | `Command+Shift+Period` | `⌘ ⇧ .`          |
| Windows/Linux | `Ctrl+Shift+Period`    | `Ctrl ⇧ .`       |

The manifest command description should communicate the start-or-add meaning. Canonical copy:

- Korean: `스크롤 동기화 시작 또는 탭 추가`
- English: `Start scroll sync or add this tab`

No additional permission is required solely for `commands`.

### Existing Popup Shortcut

The popup-local `Cmd/Ctrl+S` behavior remains unchanged. It is active only while the popup owns
keyboard focus and continues to mirror the popup's start/stop control. It must not be presented as
the browser-wide Quick Sync shortcut, and tests must distinguish the two.

## Candidate Lifecycle

The candidate is an in-memory background value:

```text
{ tabId, expiresAt, generation }
```

- `expiresAt` is set once to `Date.now() + 10_000`.
- `generation` prevents an older timeout or feedback clear from affecting a newer candidate.
- The state is not written to `browser.storage.local`.
- A service-worker restart clears the candidate by design. This fails closed instead of reviving an
  old user intent.

While the candidate HUD is visible, the candidate tab holds a dedicated runtime Port keyed by the
generation. The port lasts no longer than the original deadline and stores no browsing data.

- The content script clears the candidate HUD immediately when the port disconnects.
- The background clears the matching pending candidate when the port disconnects while it is alive.
  An already accepted second-tab attempt retains its reserved generation and finishes normally.
- A service-worker or extension restart disconnects the port, so the page cannot keep
  candidate instructions backed by missing background state.
- Port creation does not extend the deadline. If the initial HUD/port handshake fails, do not arm the
  candidate; use the badge and recent popup outcome.
- Both sides close the port at the absolute deadline unless the generation is reserved by an accepted
  second-tab attempt.

The coordinator creates a provisional generation while holding the transition gate. Other commands
cannot observe it. A successful HUD/port acknowledgement promotes it to the candidate; failure
discards it.

Candidate reads and writes occur only while holding the same transition gate used for session
topology. Candidate timeout, tab-close cleanup, popup start, automatic-suggestion acceptance, and
Quick Sync commands therefore cannot independently race to consume or clear the value.

The candidate clears when:

- its absolute deadline passes;
- its tab closes;
- its tab navigates to an ineligible page;
- a Quick Sync start succeeds;
- a popup start succeeds;
- an accepted automatic suggestion creates or replaces a synchronization session.

The candidate does not clear when:

- the user presses the command again in the same candidate tab;
- the second tab cannot connect;
- a popup start attempt fails.

If a second-tab start attempt fails, the original candidate remains usable until the original
deadline. The deadline is never extended.

A best-effort background timeout may clear the value promptly, but it is not the source of truth.
Every command first compares `Date.now()` with `expiresAt`. A suspended or throttled timer therefore
cannot make a stale candidate valid.

The command listener captures `commandReceivedAt` when the browser event arrives. A second-tab press
is accepted when `commandReceivedAt < expiresAt`, even if it waits behind another transition or its
acknowledgement arrives after the deadline. Once accepted, the attempt completes normally:

- success commits the two-tab session;
- failure before the original deadline restores the candidate;
- failure at or after the original deadline clears it.

A press received at or after `expiresAt` cannot consume the old candidate. It becomes a new first
press after the expired candidate is cleared.

### Active Tab Resolution

The command listener must capture the invocation tab before it waits for asynchronous background
initialization. It should prefer the tab supplied by the browser command event when that browser
provides one. Otherwise it should start an active-tab query against the last-focused window
immediately when the event arrives, then await both that query and the initialization barrier.

Before changing state it must verify that:

- the tab still exists and has a numeric id;
- the resolved tab id still refers to the captured invocation tab;
- it meets the same manual-sync eligibility policy used by the popup;
- its content script can receive the feedback or start handshake.

The resolution path must not scan for similar pages or read persisted popup selections. A Quick Sync
candidate is independent from the popup's saved selection.

## State Transitions

### First Press

```text
browser command
  -> capture the invocation tab
  -> wait for background initialization barrier
  -> validate the captured tab
  -> transition gate confirms no active manual session
  -> show candidate HUD and establish generation-bound Port
  -> store candidate with the original absolute deadline
```

No synchronization starts on the first press.

### Second Press

```text
browser command in another tab
  -> validate candidate deadline and both tabs
  -> show "connecting" HUD in the current tab
  -> orchestrator starts a manual session with exactly the two tabs
  -> require valid acknowledgements from both tabs
  -> persist and broadcast the committed active snapshot
  -> clear candidate HUD
  -> show success HUD in the current tab
```

For this two-tab flow, both tabs must connect. If only one tab acknowledges, the orchestrator cleans
up the partially initialized tab, leaves no active session, and retains the original candidate until
its deadline.

The accepted attempt owns the candidate generation until it finishes. A timeout callback cannot
clear or replace that generation while the handshake is in flight.

### Add While Active

```text
browser command in an unlinked tab
  -> capture current session and revision
  -> validate the new tab
  -> send scroll:start only to the new tab, with the complete linked-tab id list
  -> require a valid acknowledgement from the new tab
  -> append the tab, persist, and broadcast one new revision
```

Existing linked tabs must not receive a new `scroll:start`. They continue scrolling throughout the
attempt, and their manual offsets remain unchanged.

If the new tab fails, times out, closes, or returns an invalid acknowledgement:

- do not change `linkedTabs`;
- do not change the session revision;
- do not clear or rewrite existing manual offsets;
- do not stop or reinitialize existing tabs;
- report that the existing `N` tabs continue synchronizing.

### Already Included

Pressing the command in an already linked tab is a no-op. It shows explicit feedback so the user
understands why nothing changed.

### Popup Start During a Candidate Window

The popup continues to use its own selected tabs. It does not merge the candidate into the popup
selection. A successful popup start clears the candidate and its HUD. A failed popup start leaves the
candidate valid until its original deadline.

All competing operations are ordered by transition-gate acquisition:

- if the second Quick Sync press enters first, it finishes before a popup or suggestion transition;
- if popup start enters first and succeeds, it clears the candidate; the later Quick Sync command
  sees the new active session and becomes an add or already-included operation;
- a losing operation never overwrites the winner's HUD or authoritative snapshot because feedback
  clear/update messages carry the matching generation.

### Interaction With Auto-Sync

Quick Sync always creates or extends the persisted manual session. It does not create an auto-sync
group and does not use page-similarity, snooze, pending-suggestion, or dismissed-suggestion state.

Quick Sync never enables or emits either automatic suggestion toast. Both the initial suggestion and
the active-session add-tab suggestion remain gated by an explicit stored
`autoSyncEnabled: true`. When that preference is false, neither toast may appear during a Quick Sync
session.

An active auto-sync group alone does not count as an active Quick Sync session. The policy for tabs
that already belong to auto-sync groups is:

- the first candidate press changes no auto-sync state;
- a successful Quick Sync start or add removes only the tabs joining the manual session from every
  auto-sync group and records the existing manual override;
- the remaining auto-sync members keep their group only when that group remains valid;
- a failed manual transition restores or preserves all previous auto-sync memberships;
- after commit, no tab may be both a manual-session member and an auto-sync-group member.

The transition gate is the outer lock. The legacy auto-sync adapter acquires the existing auto-sync
lock only from inside that gate; no auto-sync path may acquire the locks in the reverse order.

### Handshake Contract

Control-plane timeouts are separate from the 200ms programmatic-scroll grace period and do not
change any scroll timing constant.

| Operation    | Timeout per target | Valid acknowledgement                                  |
| ------------ | ------------------ | ------------------------------------------------------ |
| Start or add | 1,000ms            | `success: true` and `tabId` equal to the target tab id |
| Stop         | 1,000ms            | `success: true` and `tabId` equal to the target tab id |
| Reconnect    | 3,000ms            | `success: true` and `tabId` equal to the target tab id |

Start acknowledgements may include scroll metrics. Metrics are accepted only after the existing
numeric runtime validation; invalid optional metrics do not make an otherwise valid start
acknowledgement fail.

Every gated transition has an in-memory operation generation. A response applies only when both the
captured session revision and operation generation are still current. Stop and cleanup handlers are
idempotent, so a timeout can schedule cleanup without allowing a late acknowledgement to commit an
older result.

After Start commits a subset for the existing popup flow, send idempotent Stop cleanup to every
requested tab outside the committed subset, including invalid-acknowledgement and timed-out tabs. A
failed Quick Sync Start cleans both requested tabs. A failed Add always cleans the one staged tab.
When an affected tab previously belonged to active auto-sync, the manual-override adapter completes
its rollback only after that cleanup.

Reconnect also has a per-tab attempt generation. Two reconnect attempts within the same session
revision cannot apply out of order: only the latest attempt generation for that tab may update its
connection status.

## Feedback HUD

Quick Sync uses a dedicated, non-interactive HUD rather than `SyncSuggestionToast`.

Visual behavior:

- fixed at the top center of the current page;
- rendered in its own Shadow DOM root;
- maximum extension overlay z-index;
- no buttons and `pointer-events: none`;
- concise icon, title, and optional supporting line;
- reduced-motion mode uses discrete appearance and disappearance;
- text and icon communicate state without relying on color.

The HUD appears only after an explicit Quick Sync command. It must never appear from passive page
matching or automatic suggestion discovery.

### Approved Korean Copy

| Situation            | Title                                                      | Supporting copy                                                                         | Lifetime                |
| -------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------- |
| Candidate selected   | `동기화할 탭 1개 선택됨`                                   | `{remaining}초 안에 다른 탭에서 같은 단축키를 누르면 이 탭과 함께 스크롤 동기화됩니다.` | Until original deadline |
| Same candidate again | `이 탭은 이미 선택되어 있어요`                             | Same remaining-time instruction                                                         | Until original deadline |
| Connecting           | `탭을 연결하고 있어요…`                                    | None                                                                                    | Until result            |
| Start succeeded      | `스크롤 동기화를 시작했어요 · 현재 2개 탭`                 | None                                                                                    | 2.5 seconds             |
| Add succeeded        | `이 탭을 동기화에 추가했어요 · 현재 N개 탭`                | None                                                                                    | 2.5 seconds             |
| Already active       | `이 탭은 이미 현재 동기화에 포함되어 있어요 · 현재 N개 탭` | None                                                                                    | 2.5 seconds             |
| Second tab failed    | `이 탭을 연결하지 못했어요`                                | `{remaining}초 안에 다른 탭에서 같은 단축키를 누르면 다시 시도할 수 있어요.`            | Until original deadline |
| Add failed           | `이 탭을 추가하지 못했어요`                                | `기존 N개 탭은 계속 동기화되고 있어요.`                                                 | 4 seconds               |

### Countdown Rules

The visible number is derived from the absolute deadline:

```text
if Date.now() >= expiresAt:
  hide the countdown
else:
  remaining = max(1, ceil((expiresAt - Date.now()) / 1000))
```

- It starts at 10 and updates while visible.
- `0초` is never rendered.
- The HUD disappears at the deadline.
- Throttling may skip an intermediate number, but the UI must never decrement a stored counter and
  display a stale duration.
- Use tabular numerals so the line does not shift every second.

Accessibility behavior:

- state and outcome changes use a polite status announcement;
- the changing number uses timer semantics with live announcements disabled;
- screen readers hear candidate creation once and expiration once, not every second;
- the HUD never takes focus.

## Unsupported-Page And Fallback Feedback

If the current tab cannot host the HUD or scroll-sync content script, the command does not mutate the
candidate or session.

Use a tab-scoped action badge:

- badge text: `!`;
- tooltip: `이 탭에서는 스크롤 동기화를 사용할 수 없어요`;
- visible for 4 seconds;
- a generation token prevents an old clear timer from removing a newer badge.

Do not request notification permission and do not show an OS notification.

The background must keep one in-memory recent Quick Sync outcome for 30 seconds. The record contains
only:

- tab id;
- reason enum;
- result kind;
- tab count when relevant;
- expiry timestamp.

If the popup opens on the matching tab before that record expires, it shows the same actionable
reason until the user dismisses it or the 30-second deadline passes. The record is not persisted and
contains no URL or title. The toolbar badge is best-effort because an extension action can be hidden;
the required delayed-recovery surface is this recent popup outcome.

## Popup Design

The popup has an authoritative four-state session model:

```text
loading | inactive | active | error
```

A status read failure is `error`, not `inactive`. Opening the popup must never stop or modify a
session merely because some linked tabs are in another window or metadata lookup failed.

`error` means the background could not return authoritative topology at all. A session with known
topology but missing display metadata remains `active`; the affected row is marked unavailable while
Stop and valid Reconnect controls remain usable.

### Inactive View

The existing inactive workflow remains:

- tab search and filters;
- selectable tab list;
- selected-tab chips;
- existing start button;
- existing Actions menu;
- URL Sync controls.

The Quick Sync shortcut is shown as an additional convenience, not as a replacement start action.
The popup reads the current assignment from `commands.getAll()` rather than hardcoding the suggested
key.

If the command is assigned, show the formatted current key. If it is unassigned, show an honest
warning and the action:

```text
단축키 다시 지정
```

Do not add a duplicate Quick Sync start button.

### Active View

When the authoritative manual session is active, replace the picker with a dedicated session view.
Do not render disabled search, checkboxes, selected chips, sorting, select-all, or clear-all controls.

Approved structure and copy:

```text
스크롤 동기화 중
현재 N개 탭의 스크롤이 함께 움직이고 있어요.

다른 탭에서도 [actual shortcut]을 누르면 그 탭도 함께 스크롤돼요.

함께 스크롤하는 탭                                      N
[linked tab rows]

이 팝업에서 탭을 추가하거나 해제하려면 먼저 동기화를 중지해야 해요.

[재연결, when needed]                         [동기화 중지]
```

Each linked tab row is part of a semantic list and shows:

- tab title and favicon for local UI only;
- connection status;
- one location label: `현재 탭`, `현재 창`, or `다른 창`.

Do not use the user-facing terms “read-only,” “locked,” “configuration,” or “active session.”

URL Sync controls remain available because they configure the behavior of the current session.
Reconnect must perform a real background reconnection. Stop and reconnect must refetch the
authoritative snapshot after completion or timeout; they must not manufacture a successful local
state.

When the shortcut is unassigned, replace the active-view shortcut instruction with a short
unassigned warning and `단축키 다시 지정`.

### Shortcut Management

`단축키 다시 지정` uses this browser mapping:

| Browser            | First action                                                             | Failure fallback                                                           |
| ------------------ | ------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Chrome             | Open `chrome://extensions/shortcuts` in an active tab.                   | Show instructions to open that address manually.                           |
| Edge               | Open `edge://extensions/shortcuts` in an active tab.                     | Show instructions to open that address manually.                           |
| Brave              | Open `brave://extensions/shortcuts` in an active tab.                    | Show instructions to open that address manually.                           |
| Firefox            | Feature-detect and call `commands.openShortcutSettings()`.               | Open `about:addons`, then explain: gear menu → Manage Extension Shortcuts. |
| Arc/other Chromium | Try `chrome://extensions/shortcuts` as a best-effort compatibility path. | Show instructions to use the browser's extension shortcut settings.        |

For Firefox, await `openShortcutSettings()` and use the fallback only when the API is unavailable or
rejects. For Chromium, if `tabs.create()` resolves, the new settings tab becomes active and the popup
may close normally. If the API rejects, keep the popup usable, show localized fallback instructions,
and retain focus in the popup. Tests cover both branches; the UI must not claim that settings opened
before the API resolves.

The popup can prove only the assignment returned by `commands.getAll()`. It must not claim that an
assigned key is conflict-free, because actual OS/browser delivery cannot be determined from that
API.

### Arc Compatibility Decision

Arc remains an advisory, unsupported target for this delivery. Manual investigation confirmed a
browser boundary where a configured browser-scoped command and registered background
`commands.onCommand` listener do not receive the physical keypress, while the same keypress reaches
an ordinary webpage and the same extension build works in supported Chromium browsers.

This delivery does not work around that boundary by setting `global: true`, defining a second
default command, or automatically installing a page-level `keydown` fallback. Those options either
broaden command scope outside the focused browser, conflict with the single start/add command model,
or intercept shortcuts across every eligible site.

The existing popup picker and Start action are the supported Arc fallback. If Arc shortcut support
is prioritized later, it must be a separate, explicitly enabled page-compatibility feature with its
own shortcut-assignment distribution, sender validation, duplicate suppression, website-conflict
policy, restricted-page limitations, privacy review, and UI copy. That follow-up must not depend on
a future Arc fix to `commands.onCommand`.

## Authoritative Session Snapshot

`sync:get-status` becomes a typed `ProtocolMap` request and returns a discriminated result. The active
snapshot is assembled from the persisted manual state across all windows, not from
`tabs.query({ currentWindow: true })`.

The popup snapshot includes:

- active/inactive status;
- session revision;
- sync mode;
- linked tab ids;
- per-tab connection status;
- non-persisted display metadata such as title, favicon, window id, availability, current-tab, and
  current-window flags.

Raw URLs are not needed by the active session view and should not be added to this response solely
for display.

The page-side control panel uses a separate content snapshot derived only after validating the
content sender. It may include each linked tab's current title, current-tab flag, signed manual
pixel offset, and connection status so the existing synchronized-tab display remains useful. It
must omit URLs, favicons, tab ids, and window ids. The panel renders this ephemeral display data
inside a closed Shadow root so the host page cannot traverse the synchronized-tab DOM.

Metadata lookup failure for one tab must not make the whole session appear inactive. Return an
unavailable row while preserving the authoritative topology. The row uses localized unavailable
copy and its known connection status; it does not expose stale title or URL data. Tab-close event
handling, not popup rendering, is responsible for removing closed tabs.

Cross-window correctness also applies to:

- service-worker state restoration;
- status broadcasts;
- reconnection;
- keep-alive targeting;
- tab-close reconciliation.

None of those paths may discard a linked tab merely because it is outside the last-focused window.

### Viewer Context

The popup cannot rely on the bridge sender to provide its active tab. Before calling
`sync:get-status`, it queries its own active tab and window and sends numeric `viewerTabId` and
`viewerWindowId` values in the typed request. The background runtime-validates those values and uses
them only to derive `현재 탭`, `현재 창`, and `다른 창` labels.

### Durable State Validation

Extend the persisted manual state with:

- `revision`: incremented by every committed gated transition that can invalidate a pending command
  or suggestion;
- `sessionEpoch`: a numeric identity incremented only when a new manual session starts or replaces
  another session.

Add a storage-boundary parser for the complete persisted manual state. It accepts only:

- a boolean `isActive`;
- unique positive safe-integer linked tab ids;
- known connection-status values;
- a known sync mode when active;
- non-negative safe-integer `revision` and `sessionEpoch`;
- an active state with at least two linked tabs, or an inactive state with no linked tabs.

A missing storage key is a valid first-run inactive state. Older valid state may omit `revision` and
`sessionEpoch`; both migrate to `0`. An older active state with no stored mode migrates to the
established legacy `ratio` mode; an explicitly unknown mode is invalid. A storage read failure and a
structurally invalid stored value are not inactive states.

Normalize repairable advisory fields without rejecting otherwise valid topology:

- set `lastActiveSyncedTabId` to `null` when inactive or when the stored id is not linked;
- drop connection-status entries for unlinked tabs;
- initialize a linked tab with a missing status as `error` so real reconnect can repair it.

This migration covers legitimate state written by older Stop paths that left a historical
`lastActiveSyncedTabId`.

Manual restore returns a discriminated readiness result:

```text
ready | storage-error | invalid-state
```

Only `ready` permits topology mutation. `storage-error` and `invalid-state` make the popup status
`error` and make Quick Sync fail closed with a typed `session-state-unavailable` outcome. Auto-sync
initialization failure is tracked separately as degraded; it must not convert a manual restore error
to inactive or begin suggestion scanning when manual state is unknown.

## Architecture

### 1. Quick Sync Command Adapter

Responsibilities:

- synchronously register the browser command listener so an MV3 wake-up event is not missed;
- capture the invocation tab and event timestamp immediately;
- wait for the shared background initialization barrier before reading or mutating session state;
- reject the command when manual restore is not `ready`;
- delegate the state decision to the Quick Sync Coordinator;
- never implement session mutation directly.

The initialization barrier preserves the required startup order:

```text
restoreSyncState()
  -> if manual state is ready: initializeAutoSync()
  -> publish manual and auto readiness separately
```

The listener is registered before that promise resolves, but its handler must await the readiness
result. A rejected or invalid manual restore never falls through to the default inactive object.

### 2. Quick Sync Coordinator

Responsibilities:

- own the one ephemeral candidate;
- own its generation-bound control Port;
- enforce the absolute 10-second deadline;
- under the transition gate, expire stale state and re-read the candidate and committed session;
- classify a command as candidate, start, add, or no-op from that fresh state;
- clear candidate feedback on lifecycle events;
- translate orchestrator results into typed HUD or badge outcomes.

It does not own persisted session state, auto-sync groups, or scroll relay logic.

### 3. Sync Transition Gate

All candidate decisions and session-topology changes pass through one serialized boundary:

- candidate create, consume, expiration, and tab-close clearing;
- popup start and stop;
- Quick Sync start and add;
- accepted auto-suggestion replacement;
- accepted auto-suggestion add-tab;
- linked-tab removal and automatic stop after a tab closes;
- missing-tab eviction during reconnect;
- restoration repair when persisted linked tabs no longer exist.

Start and add use a prepare-then-commit protocol:

```text
validate
  -> capture previous snapshot and revision
  -> prepare manual override without permanent auto-sync mutation
  -> content-script start handshake
  -> validate acknowledgements
  -> revalidate tab existence, expected revision, and operation generation
  -> commit prepared manual override
  -> persist the next state
  -> commit the matching in-memory state
  -> broadcast status
  -> update keep-alive
  -> return typed result
```

All fallible manual-override preparation and revalidation occurs before manual persistence.
`ManualOverrideAdapter.commit()` finalizes only the already prepared in-memory membership change. If
it cannot revalidate and finalize, the transition cleans the new content runtime and rolls back
without persisting manual topology. If manual persistence fails after override finalization, the
adapter rolls back its captured auto-sync snapshot while manual topology remains at the prior durable
state. No adapter operation runs for the first time after the new manual topology becomes durable.

Stop uses durable-first semantics:

```text
capture linked tabs
  -> persist inactive state with the next revision
  -> commit inactive in-memory state
  -> stop relay and keep-alive
  -> send idempotent scroll:stop cleanup to captured tabs
  -> return inactive snapshot plus any cleanup warning
```

If the inactive state cannot be persisted, no stop message is sent and the existing active session
remains authoritative. If a content cleanup later times out, the durable session is still inactive;
the background retries cleanup, and stale content messages fail relay authorization.

Accepted automatic replacement is two transitions held under the same gate:

1. commit and clean up the old session as a Stop;
2. let the legacy auto-sync adapter start the explicitly accepted auto group.

If the replacement start fails, the final manual state is inactive and the user receives an explicit
replacement failure. The old manual offsets were cleared by the accepted Stop and are not falsely
described as restored.

The gate must not be awaited by `handleScrollCore()` or the `scroll:sync` relay. Those paths use the
last committed in-memory topology and synchronous authorization only.

Persistence success is the topology commit point. `persistSyncState()` must expose failures to the
orchestrator instead of swallowing them. A broadcast failure after commit is a repairable delivery
failure, not permission to report the old topology; the next status read remains authoritative.

### 4. Sync Session Orchestrator

The orchestrator exposes explicit operations rather than overloading one toggle:

| Operation | Contract                                                                                                                                                                                 |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Start     | Create a new manual session only when none is active. Quick Sync requires every requested tab; popup start preserves the existing rule that at least two selected tabs must acknowledge. |
| Add       | Initialize only the new tab, then append it after acknowledgement.                                                                                                                       |
| Stop      | Durably commit inactive before clearing content runtime and manual offsets.                                                                                                              |
| Replace   | Durably stop the old manual session, then delegate the accepted replacement to the manual or legacy auto-sync start path.                                                                |
| Reconnect | Reinitialize only tabs currently marked disconnected or error and ignore late results from an older revision.                                                                            |

The existing `scroll:start`, `scroll:stop`, Quick Sync, and auto-suggestion handlers become adapters
to these operations instead of independently mutating `syncState`.

### 5. Session Revision And Epoch

Use two runtime-validated non-negative safe integers:

- Increment `revision` whenever a gated manual topology or accepted auto-sync transition commits.
- Increment `sessionEpoch` for a new manual Start or manual Replace, but keep it unchanged for manual
  Add and Reconnect. An auto-sync replacement does not create a manual epoch.
- Include the expected revision in automatic suggestion messages.
- Reject and dismiss a suggestion response whose expected revision no longer matches.
- Include `sessionEpoch` in manual `scroll:start` state and every manual content-to-background
  session message.
- Treat missing values from older valid stored state as `0`.
- Reject the complete stored state when an explicitly present value is not a non-negative safe
  integer.
- Do not use type assertions for untrusted storage.

Revision prevents stale topology operations from committing. Epoch prevents content messages from
an older manual session from affecting a newer session that happens to reuse the same tab id.

### 6. Legacy Auto-Sync Adapter

The adapter keeps auto-sync-specific concerns outside the generic orchestrator:

- manual override membership;
- URL-derived groups;
- pending and dismissed suggestions;
- suggestion snooze state;
- replacement warning semantics.

The orchestrator depends on a narrow `ManualOverrideAdapter` contract:

```text
prepare(joiningTabIds) -> captured auto-sync snapshot
commit(snapshot)       -> revalidate and finalize the prepared in-memory override before manual persist
rollback(snapshot)     -> restore previous groups and active auto-sync runtime
```

Quick Sync depends on the orchestrator, not on URL-derived group internals. A later project can
remove automatic suggestions by replacing this adapter without rewriting Quick Sync.

Suggestion detection may snapshot auto-sync state under its own lock, but it must release that lock
before entering the transition gate. Inside the gate, the adapter revalidates the snapshot and
expected session revision before mutation. Startup auto-sync scanning likewise rechecks committed
manual membership immediately before applying a group update.

### 7. Session Relay Authorization

Every manual content-to-background message that can affect another tab or persisted manual state
includes the cached numeric `sessionEpoch`. Before relaying or mutating, the background synchronously
checks:

1. the bridge sender has a numeric tab id;
2. the sender tab id equals the payload source tab id;
3. the sender is in the last committed `linkedTabs`;
4. the payload epoch equals the committed manual `sessionEpoch`.

Apply the guard to scroll relay, URL Sync relay, manual-baseline updates, and related session-origin
messages. A new tab may acknowledge `scroll:start` before Add commits, but its outgoing messages are
rejected until membership commit. A stale tab from a replaced session is rejected by epoch.

The guard adds only cached numeric fields and synchronous comparisons. It adds no storage read, DOM
scan, URL processing, or awaited work to the hot path. Auto-sync sources continue through their
separately validated active-group membership path.

### 8. Quick Sync Feedback Surface

Add a dedicated typed background-to-content feedback message, a generation-bound candidate Port, and
a separate HUD mount. The feedback payload contains only:

- outcome enum;
- tab count;
- `expiresAt` for candidate and retry feedback, omitted for fixed-duration outcomes;
- non-sensitive reason enum;
- generation.

Do not reuse the suggestion toast protocol or include a URL, title, page metadata, or whole command
payload. If new bridge messages are added, update both `src/shared/types/messages.ts` and
`shim.d.ts`.

## Failure And Rollback Rules

| Failure                                        | Required result                                                                          |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------- |
| First tab is ineligible or inaccessible        | No candidate; show tab badge and recent popup reason.                                    |
| Candidate expires                              | Clear it; hide HUD; one screen-reader expiration announcement.                           |
| Candidate tab closes or becomes ineligible     | Clear candidate without starting a session.                                              |
| Second tab fails before commit                 | Clean partial initialization; retain candidate only if its deadline remains.             |
| Add tab fails before commit                    | Preserve existing topology, revision, offsets, epoch, and keep-alive.                    |
| Persist fails during Start/Add                 | Do not report success; stop new runtime and roll back prepared auto-sync override.       |
| Manual-override rollback fails                 | Keep manual topology at its prior state and report auto-sync degraded explicitly.        |
| Inactive persist fails during Stop             | Send no stop; keep the prior active snapshot and offsets.                                |
| Content cleanup times out after durable Stop   | Remain inactive, show a cleanup warning, and retry idempotent cleanup.                   |
| New Start fails after accepted Replace         | Remain durably inactive and show replacement failure; do not claim old offsets returned. |
| Reconnect result has stale revision/attempt id | Ignore it; do not resurrect or overwrite a newer attempt.                                |
| Auto-suggestion response has stale revision    | Dismiss/reject it with no session change.                                                |
| HUD injection fails                            | Use the best-effort tab-scoped `!` badge and required recent popup outcome.              |
| `commands.getAll()` fails                      | Show shortcut status as unavailable, not as the suggested default.                       |
| Manual state restore fails                     | Block topology mutation and show `session-state-unavailable`.                            |
| Background restarts during candidate window    | Port disconnect clears HUD immediately; the new worker has no candidate.                 |

Storage failures are explicit transition failures. UI state follows the durable/in-memory commit
rules above, not the requested outcome. The deliberately ephemeral candidate is lost on restart, and
its Port disconnect removes the corresponding HUD instead of presenting stale instructions.

## Privacy And Logging

Quick Sync handles the user's current tab and therefore falls under the repository's strict browsing
data rules.

Allowed logs and ephemeral records:

- command id;
- tab id;
- source/target tab ids;
- candidate generation;
- session revision;
- session epoch and operation generation;
- absolute expiry;
- result or reason enum;
- tab counts;
- booleans and connection states.

Never log or externally transmit:

- raw URLs;
- normalized URLs;
- tab or page titles;
- favicons;
- canonical or alternate links;
- whole browser tab objects;
- whole message or storage payloads.

Titles and favicons may be rendered inside the local popup. The page-side control panel may render
the allowlisted current title and signed manual offset inside its closed Shadow root. This display
data must not be logged, persisted by this feature, exposed in an open host-page DOM, or sent outside
the extension.

Before completion, search touched areas for:

```text
logger
url
Url
URL
tab.url
window.location.href
payload
normalizedUrl
sourceUrl
targetUrl
title
```

Any new raw URL/title logging is a blocking defect.

## Internationalization And Accessibility

- Add every new user-facing key to both `extension/_locales/` and
  `src/shared/i18n/_locales/`.
- Keep all nine locales complete: `en`, `ko`, `ja`, `fr`, `es`, `de`, `zh_CN`, `zh_TW`, and `hi`.
- Localize the manifest command description.
- Keep Korean copy concise, factual, and in friendly `해요체`.
- Use the assigned shortcut returned by the browser in popup guidance.
- Use semantic list markup for linked tabs.
- Keep keyboard focus in the popup; the content HUD never receives focus.
- Use polite announcements for state/outcome changes and suppress per-second countdown
  announcements.
- Respect `prefers-reduced-motion`.
- Do not communicate success, warning, or error through color alone.

Use complete localized messages rather than concatenating translated fragments. The interpolation
contract is:

| Message family                        | Required variables                                           |
| ------------------------------------- | ------------------------------------------------------------ |
| Candidate and same-tab instruction    | `remainingSeconds`, an integer from 1 through 10             |
| Second-tab retry instruction          | `remainingSeconds`, an integer from 1 through 10             |
| Start/add/already-included outcomes   | `tabCount`, a positive integer                               |
| Active popup summary and list count   | `tabCount`, a positive integer                               |
| Active popup add instruction          | `shortcutLabel`, a non-empty browser-reported display string |
| Unassigned/error/unsupported copy     | No shortcut fallback value; use a separate complete message  |
| Screen-reader expiration announcement | No variables; announce exactly once                          |

Do not render an unknown tab count as zero. Keep the popup in loading or error until the
authoritative count is known. Tests verify every placeholder is supplied in both locale trees and
that visible countdown updates do not retrigger the polite status region.

## Browser Compatibility And Test Strategy

Testing follows distinct failure axes instead of repeating the full matrix in every Chromium-based
browser.

### What `commands.getAll()` Proves

- the command exists in the current manifest;
- the current profile reports an assigned shortcut string;
- the shortcut is unassigned when the string is empty;
- a user remapping is reflected in the returned assignment.

It does not prove that a physical OS keypress reaches `commands.onCommand`. That requires a selected
real-browser smoke test.

### Automated Blocking Checks On Every Relevant PR

- manifest command shape for Chromium and Firefox;
- candidate state machine with a fake clock;
- exact deadline, pre-deadline receipt with post-deadline acknowledgement, and same-tab no-op;
- candidate versus popup start, suggestion acceptance, timeout, and tab-close ordering;
- candidate Port handshake, expiration, and worker-disconnect cleanup;
- command tab resolution and eligibility;
- complete stored-state validation and fail-closed manual restore;
- transition serialization, revision, epoch, and operation-generation checks;
- start/add acknowledgement, manual-override rollback, and durable-first stop cleanup;
- rejection of staged-tab relay before Add commit and stale-epoch relay after Replace;
- stale callback, late acknowledgement, and stale auto-suggestion rejection;
- same-revision reconnect attempts completing in reverse order;
- cross-window authoritative snapshot;
- popup viewer context and unavailable metadata rows;
- HUD countdown, live-region behavior, and reduced motion;
- badge set/clear generation behavior;
- popup inactive/active/error rendering;
- assigned, unassigned, and `commands.getAll()` failure states;
- Firefox shortcut-settings API and Chromium internal-page fallback branches;
- existing popup-local `Cmd/Ctrl+S` regression;
- existing popup start/stop and automatic-suggestion behavior equivalence;
- explicit opt-in gating for both initial and add-tab automatic suggestion toasts;
- privacy logging, locale parity, and interpolation completeness;
- existing scroll timing and manual-offset regressions;
- Chromium and Firefox production builds.

Chrome extension E2E should focus on three session-level outcomes:

1. two tabs start, exchange real scroll updates, and stop cleanly;
2. tabs in different windows produce one truthful active popup snapshot;
3. a third tab is added without reinitializing the existing two tabs or losing their offsets.

Browser automation must not claim that `page.keyboard` proves a browser-global shortcut. If the
native event cannot be synthesized reliably, exercise the command handler and orchestrator through
deterministic integration seams and reserve physical delivery proof for manual smoke testing.

### Physical Shortcut Matrix For This Feature Release

| Browser                | Depth                                                                                    | Gate         |
| ---------------------- | ---------------------------------------------------------------------------------------- | ------------ |
| Chrome stable, macOS   | Full flow: assignment, first/second/add, cross-window, popup, conflict/remap.            | Blocking     |
| Chrome stable, Windows | Full flow with `Ctrl+Shift+Period` and the same essential outcomes.                      | Blocking     |
| Firefox stable, one OS | Build plus start/add/stop, background wake-up, shortcut-settings remap, restricted page. | Blocking     |
| Edge stable, Windows   | Assignment, physical delivery, two-tab start, and remap smoke.                           | Blocking     |
| Brave stable, one OS   | Assignment, HUD, physical delivery, and two-tab start smoke.                             | Blocking     |
| Arc stable, macOS      | Space/Split focus and native shortcut interception exploration.                          | Advisory     |
| Dia and Linux          | No physical-key completion gate for this release.                                        | Non-blocking |

Record the exact browser and OS versions at execution time. Do not freeze those versions in this
design document.

Linux remains supported by the manifest and automated Chromium/Firefox build contracts, but physical
desktop-environment shortcut delivery is best-effort for this release. Add a periodic or
issue-triggered Linux smoke rather than duplicating the initial release matrix.

The planned manual blocking cost for the feature release is approximately:

- Chrome macOS and Windows: 20-30 minutes total;
- Firefox: 8-12 minutes;
- Edge and Brave: 8-14 minutes total.

These are planning estimates, not measured durations. Arc adds an optional 5-10 minutes.

The person preparing the feature release owns the manual matrix after automated checks pass. Attach a
redacted Markdown QA artifact to the implementation pull request containing:

- test date and OS build;
- exact browser version;
- whether the default assignment appeared;
- pass/fail for the required scenario;
- whether clearing and remapping recovered delivery;
- a short non-sensitive failure reason.

Do not attach screenshots or logs containing page URLs or tab titles. Any failure in a Blocking row
prevents the feature release. An Arc failure is recorded as advisory evidence and does not block a
supported-browser release.

Conflict coverage means verifying the installed default assignment, clearing it, assigning a known
non-conflicting alternative, and confirming physical delivery with that new key. It does not require
installing another extension solely to manufacture a collision.

For later releases:

- skip the physical matrix when Quick Sync, manifest commands, browser targets, sync-state restore,
  transition orchestration, and tab lifecycle code did not change;
- rerun Chrome full coverage plus Firefox/Edge/Brave smoke for relevant changes;
- temporarily elevate one browser after a major engine change, native shortcut-policy change, or
  user-reported regression;
- keep Arc advisory in this delivery; any page-level Arc compatibility mode requires a separate
  opt-in design and does not make browser-native command delivery supported.

### Standard Verification

Run the relevant focused tests plus:

```text
pnpm privacy:logging:test
pnpm privacy:logging
pnpm i18n:validate
pnpm lint:check
pnpm typecheck
pnpm test -- --run
pnpm build
pnpm build-firefox
pnpm test:e2e:extension
```

## Acceptance Criteria

- The manifest defines exactly one Quick Sync command with the approved macOS and Windows/Linux
  suggested keys.
- The first press selects only the current eligible tab for a fixed 10-second window.
- The visible countdown is derived from the absolute deadline, updates while shown, and never renders
  `0초`.
- A second press in another eligible tab starts synchronization only when both tabs acknowledge.
- A second press received before the deadline remains valid when its acknowledgement arrives after
  the deadline; a press received at or after the deadline becomes a new first press.
- A same-candidate press is a no-op and does not extend the deadline.
- Candidate HUD disconnection clears both visible feedback and the matching ephemeral candidate.
- An unlinked-tab press during an active manual session adds only that tab.
- An already-linked-tab press shows the approved “already included” copy and changes no state.
- The Quick Sync shortcut never removes a tab or stops a session.
- Failed starts and adds preserve the approved candidate/session behavior and never damage existing
  manual offsets.
- Candidate classification and every topology mutation are serialized and revalidated before commit.
- A staged add tab cannot relay scroll or URL changes before membership commit.
- Content messages from an older session epoch cannot affect a newer session on the same tab.
- Stop persistence failure leaves the existing session and offsets active; post-commit content
  cleanup failure leaves the durable session inactive and visible as a warning.
- Manual-state storage read or validation failure is an explicit error that blocks Quick Sync.
- Manual override of existing auto-sync membership commits or rolls back with the manual transition.
- Tabs can be selected, started, displayed, restored, and reconnected across browser windows.
- The popup picker and start button remain intact when inactive.
- The active popup hides selection controls and uses the approved dedicated session view and copy.
- Missing display metadata produces an unavailable active row, not a false inactive session.
- Popup stop and reconnect results are authoritative, including after timeout or failure.
- Two reconnect attempts in the same revision cannot apply in reverse completion order.
- The popup shows the actual assigned shortcut or an honest unassigned/error state.
- Shortcut conflicts are recoverable through user remapping; no second default is added.
- The existing popup-local `Cmd/Ctrl+S` behavior remains available and distinct from Quick Sync.
- Quick Sync uses a dedicated HUD and never triggers the automatic suggestion toast.
- Automatic suggestions remain opt-in, preserve existing discovery/toast behavior, and cannot apply a
  stale response to a newer session revision.
- With `autoSyncEnabled` false, neither the initial nor add-tab suggestion toast appears during a
  Quick Sync session.
- The background command listener catches MV3 wake-up events while preserving state-restore ordering.
- The content scroll hot path adds at most a cached numeric epoch and has no new async work, storage
  reads, DOM scans, or semantic matching.
- New messages are typed in both the shared message definitions and `ProtocolMap`.
- All new copy and required interpolation variables exist in both locale trees for all nine locales.
- Privacy logging validation passes with no raw URL, title, page metadata, or payload logging.
- Automated checks and the blocking real-browser matrix pass at the exact versions recorded for the
  feature release, with a redacted QA artifact attached to the implementation pull request.
