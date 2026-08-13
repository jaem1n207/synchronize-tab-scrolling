# Final fix: in-flight relay identity

## Status

DONE

## Finding

The background admitted `scroll:sync` and `scroll:manual` messages against the active session before
awaiting delivery to content scripts. Content receivers then applied the delivered payload without
checking the exact runtime that was still active. A message authorized for manual epoch E could
therefore arrive after epoch E+1 started, and an automatic message from activation UUID A could
arrive after the same tab membership restarted under UUID B.

The stale packet could move the replacement runtime, refresh its connection health, cancel its
lazy-load catch-up, or toggle manual mode. Automatic scroll and manual messages previously carried
only the source tab ID, so identical membership did not distinguish two activations.

## Fix

- Added `RuntimeRelayMessageIdentity`, discriminated as:
  - manual: exact `sourceTabId` and `sessionEpoch`;
  - automatic: exact `sourceTabId` and opaque activation UUID.
- Added one runtime validator that fails closed for missing, malformed, or mixed identity shapes.
- Updated `ScrollSyncMessage`, `ManualScrollMessage`, and `shim.d.ts` to share the exact identity
  and a typed relay acknowledgement.
- Background admission now validates the sender and exact committed manual epoch or active automatic
  UUID before dispatch. A stale content acknowledgement propagates to the source as
  `stale-operation`.
- Content source messages read identity from the exact active runtime. If no current runtime exists,
  scroll broadcast and keyboard manual-mode activation fail closed.
- Content receivers synchronously compare the payload with the exact active runtime before
  cancelling catch-up, refreshing health, changing cached state, toggling manual mode, scheduling a
  scroll, or touching the DOM.
- Kept the scroll hot path synchronous: no new `await`, storage read, DOM scan, or background query.
- URL Sync behavior and contracts were not changed.

## Strict TDD evidence

RED tests were written before production changes and reproduced:

- delayed manual epoch-E scroll and manual-toggle packets mutating epoch E+1;
- delayed automatic UUID-A packets mutating the same-members UUID-B runtime;
- stale packets refreshing E+1 health and cancelling E+1 lazy-load catch-up;
- missing manual epochs and malformed/missing automatic UUIDs being accepted;
- background admission authorizing a previous automatic activation;
- background returning success after a content receiver reported a stale delivery.

GREEN schedules now prove:

- manual E -> E+1 delayed scroll is rejected without scroll, health, catch-up, state, cache, panel,
  or DOM mutation;
- identical-members automatic UUID A -> B delayed scroll/manual packets are rejected;
- current manual and automatic identities still apply normally;
- malformed or missing identities fail closed at both background and content boundaries;
- keyboard messages preserve the exact automatic UUID and do not enter manual mode when the runtime
  identity is unavailable;
- background forwards the admitted identity unchanged and returns the typed stale acknowledgement
  after deferred delivery.

## Verification

Fresh verification after the final fixture and ACK typing corrections:

- Focused suites: 4 files, 186 tests passed.
- Direct TypeScript: `./node_modules/.bin/tsc --noEmit -p tsconfig.json` passed.
- Full Vitest suite: 99 files, 1,823 tests passed.
- `pnpm health`: passed.
- `pnpm privacy:logging`: passed.
- Chromium production build: `pnpm build` passed.
- Firefox production build: `pnpm build-firefox` passed.
- `git diff --check`: passed.
- Physical browser QA: explicitly waived by the user and not run.

The Vitest run emitted only existing jsdom canvas warnings from landing accessibility tests and the
expected conservative file-scheme warning test; all tests passed.

## Review

The first focused read-only review caught:

- a fabricated manual epoch fallback when the keyboard identity callback returned no current
  runtime;
- two outdated automatic test fixtures without UUIDs;
- widened ACK literals that failed the direct `ProtocolWithReturn` TypeScript contract.

All three were corrected and reverified. The final read-only review returned **APPROVED** with no
remaining P0/P1 finding after checking:

- receiver identity checks precede every mutation;
- manual epoch and automatic UUID propagation are exact;
- typed acknowledgements are consistent end to end;
- no async I/O, storage read, or DOM scan was added to the scroll hot path;
- URL Sync remained unchanged.

## Residual boundary

Admission and delivery are intentionally separate phases. The background cannot prevent a queued
message from reaching content after runtime replacement, so the content receiver remains the final
authority. The typed stale acknowledgement exposes that no-op truthfully to the source without
mutating either the old or replacement runtime.
