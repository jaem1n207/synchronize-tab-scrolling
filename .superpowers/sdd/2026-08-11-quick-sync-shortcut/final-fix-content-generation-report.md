# Final fix: content lifecycle generations

## Status

DONE

## Finding

The content script's asynchronous Start, Stop, and URL Sync continuations read mutable module state
after `await`. An operation from runtime generation E could therefore resume after a newer Start had
committed generation E+1 and mutate E+1's state, cached manual offset, panel, or navigation.

Browser storage writes introduced a second edge: a stale `clearManualScrollOffset()` call cannot be
cancelled after dispatch. Even when the continuation detected that it was stale, the completed
delete could leave E+1's cached offset and persisted offset inconsistent.

## Fix

- Added a content-local monotonic runtime operation generation and exact runtime identities covering
  tab ID, manual/automatic mode, and session epoch.
- Tracks pending and active Start identities separately. Stop captures and targets the exact
  identity it began against, while a newer Stop can invalidate a still-pending Start.
- Revalidates generation/identity after every lifecycle await and before state, cache, panel, or
  navigation mutations. Stale handlers return an explicit `stale-operation` acknowledgement.
- Added a separate URL operation generation and validates inbound URL messages against the exact
  active runtime/session before resolving or navigating.
- Publishes a clear/reconciliation transaction before dispatching a non-cancellable offset clear.
  Replacement Starts wait on that stable barrier before reading storage, including reverse-order
  Stop and URL races where the clear applies before the replacement read.
- Added strict manual-offset load/save/clear APIs whose storage failures remain observable. A stale
  clear uses the exact removed offset for compensation instead of a soft helper that swallows write
  failures.
- Bounds compensation to three backoff attempts. An exhausted repair resolves as a typed failure,
  retains its exact tab/offset snapshot, keeps the waiting runtime inactive, and is retried only by a
  later explicit lifecycle operation.
- Saves the pending URL contextual hint before starting the receiver clear. After that await and a
  generation revalidation, the clear commit resets the cache and navigates synchronously in one
  transaction callback.
- Extended `StartSyncContentResponse` with `stale-operation` and
  `offset-reconciliation-failed`. `shim.d.ts`, the session orchestrator, Quick Sync failure union,
  popup error mapping, and recent-outcome mapping consume the shared reason without collapsing it to
  an invalid acknowledgement.
- On Stop clear failure, hides the panel only when that exact Stop generation is still current. An
  older failed Stop cannot hide a replacement runtime's panel.
- Kept `handleScrollCore()` and the `scroll:sync` receiver free of new async I/O and storage reads.

## Strict TDD evidence

Initial lifecycle RED:

```text
./node_modules/.bin/vitest run \
  src/__tests__/scenarios.test.ts \
  -t "content runtime operation generations"
```

Observed four expected failures:

- two stale Starts returned failure without the explicit stale reason;
- a stale Stop's deferred clear deleted E+1's persisted offset;
- a stale URL handler's deferred clear deleted E+1's persisted offset.

The first independent review identified a pending-replacement gap in the first compensation design.
A three-operation regression was added and failed before the barrier fix:

```text
expected 500 to be 700
```

That proved the third Start's cache had read the deleted offset while storage was later repaired to
E+1's value.

The focused review round then requested three additional schedules. Tests were written before the
second implementation and produced four expected failures:

- a replacement Start read while an older clear was still pending;
- a URL receiver could clear before pending-hint persistence completed;
- a permanently rejected compensation never settled because it retried forever;
- a current Stop clear failure left its inactive runtime panel visible, while a stale failure
  returned the wrong acknowledgement.

The strict storage API tests also failed first for observable read/set rejection and exact removed
offset recovery.

Final focused result:

- content runtime operation generations: 10 tests passed;
- strict manual-offset writes: 3 tests passed;
- related lifecycle/storage/orchestrator/Quick Sync suites: 273 tests passed.

The tests defer real mocked storage writes and prove that stale operations leave the newer runtime's
epoch, cache mapping, persistent offset, panel visibility, and navigation unchanged.

## Verification

- Full Vitest suite: 97 files, 1,722 tests passed.
- Full repository health hook: i18n, privacy logging, privacy rule tests, typecheck, format, and lint
  all passed.
- Privacy logging validation: passed for 265 files.
- Privacy rule suite: 27 tests passed.
- Chromium production build: passed.
- Firefox production build: passed.
- `git diff --check`: passed.
- Independent lifecycle re-review round 1: REQUEST CHANGES for an unbounded repair loop and
  generation-unsafe Stop panel cleanup.
- Independent lifecycle re-review round 2: APPROVE after bounded retained repair, truthful failure
  propagation, and the Stop clear-failure schedules passed.

## Residual boundary

Browser storage writes remain non-cancellable. The barrier therefore serializes only lifecycle
offset reconciliation and Start reads, not the active scroll hot path. If all three compensation
attempts fail, the extension does not claim a runtime is active: it retains the repair snapshot,
returns `offset-reconciliation-failed`, and waits for a later explicit lifecycle operation to retry.
