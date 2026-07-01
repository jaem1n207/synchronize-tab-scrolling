# Auto-Sync Default Off Design

## Context

The extension currently suggests syncing same-page tabs automatically when `autoSyncEnabled` is not
stored in `browser.storage.local`. The storage loader treats a missing key as enabled, so new
installations and users without an explicit stored choice see suggestion toasts by default.

This creates too much noise. The opt-out control exists in the popup Actions menu, but users who are
annoyed by repeated suggestions are more likely to remove the extension than discover and disable a
hidden advanced option.

## Goals

- Disable same-page tab suggestions by default.
- Preserve explicit user choices already stored as `autoSyncEnabled: true` or
  `autoSyncEnabled: false`.
- Treat a missing `autoSyncEnabled` key as disabled for both new installations and existing
  installations that never stored a choice.
- Keep the existing manual opt-in path in the popup Actions menu.
- Keep the change scoped to extension behavior, not landing, release, deploy, or store-stats
  workflows.

## Non-Goals

- Do not remove the same-page suggestion feature.
- Do not remove the popup Actions menu item.
- Do not add a new migration key or first-run prompt.
- Do not change auto-sync grouping, translated-page matching, domain exclusions, snooze behavior, or
  suggestion toast UI copy.
- Do not change manual scroll sync, URL Sync, or scroll timing behavior.

## Chosen Approach

Change the stored preference default at the storage boundary.

`loadAutoSyncEnabled()` should return:

| Stored Value                       | Returned Value |
| ---------------------------------- | -------------- |
| `autoSyncEnabled: true`            | `true`         |
| `autoSyncEnabled: false`           | `false`        |
| key missing                        | `false`        |
| storage read fails                 | `false`        |

This makes the behavior opt-in without writing a new value during startup. If the user turns the
feature on from the popup, the existing `saveAutoSyncEnabled(true)` path persists the choice and the
background lifecycle enables suggestions normally.

## Product Behavior

### New Installation

On first startup, no `autoSyncEnabled` key exists. Background initialization loads `false`, skips tab
scanning and suggestion scheduling, and does not show same-page or translated-page suggestion
toasts.

In the popup, the Actions menu item remains visible as `Suggest same-page tabs`, but it starts
unchecked. Selecting it stores `autoSyncEnabled: true` and enables the current suggestion flow.

### Existing Installation With No Stored Choice

If an existing user has no `autoSyncEnabled` key, the update treats that user the same as a new
installation. The feature becomes disabled until they explicitly enable it.

### Existing Installation With Stored Choice

If storage already contains `autoSyncEnabled: true`, the feature stays enabled after update. If
storage contains `autoSyncEnabled: false`, it stays disabled. The update must not overwrite either
explicit state.

### Storage Read Failure

If reading `autoSyncEnabled` fails, the loader returns `false`. This avoids surprising users with
noisy suggestions when the extension cannot confirm that the feature was enabled.

## Architecture

Only the preference boundary should change.

| Unit                               | Change                                                                 |
| ---------------------------------- | ---------------------------------------------------------------------- |
| `src/shared/lib/storage.ts`        | Make missing-key and read-failure fallback return `false`.             |
| `src/shared/lib/storage.test.ts`   | Update default and read-failure tests to expect `false`.               |
| Background lifecycle               | No logic change. It already skips initialization when enabled is false. |
| Popup `useAutoSync` and menu item  | No logic change. It already initializes local state to false.          |

No migration function is needed because the absence of the key now represents the new default. This
keeps the change reversible and avoids a second source of truth.

## Error Handling

- Save failures keep the existing behavior: log the failure and leave the optimistic popup state as
  currently implemented.
- Read failures bias toward disabled suggestions.
- Background initialization should continue to load excluded URLs, snoozes, and excluded domains
  before returning disabled, matching current startup behavior.

## Testing

Update unit coverage for `loadAutoSyncEnabled()`:

- missing key returns `false`
- stored `false` returns `false`
- stored `true` returns `true`
- read failure returns `false` and logs the error

Run the focused storage test after implementation. If the implementation touches background
initialization tests, also run the focused auto-sync lifecycle tests. Before completion, search for
privacy-sensitive logging terms required by the repository guidance because this change touches
auto-sync and suggestion behavior.

## Privacy And Logging

The change must not add new logging. Existing logs should not be expanded with raw URLs, tab titles,
normalized URL keys, or full payload objects.

Allowed verification metadata remains limited to booleans, counts, enum states, and test results.
