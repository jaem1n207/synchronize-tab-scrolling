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

## Review round 3: truthful degraded runtime propagation

### Finding

The round-2 receiver exposed `offset-reconciliation-failed`, but the exact content runtime remained
active after a same-runtime URL operation invalidated an already-dispatched clear and all three
compensation writes failed. The content panel could therefore remain visible and the scroll
receiver could continue operating with deleted persisted state. The source URL-monitor path only
logged the failure, while the background URL relay ignored target responses and returned success
without updating authoritative connection state.

### Strict RED

Tests were added before the implementation and failed in the expected places:

- the real U1-clear/U2-invalidation schedule left epoch E active instead of transitioning to
  inactive epoch 0;
- the source failure emitted no `sync:runtime-degraded` report;
- a current-epoch target failure returned `{ success: true }` and left all connection statuses
  connected;
- a delayed epoch-E failure returned success instead of `stale-operation` after authoritative E+1
  replaced it;
- an automatic target failure did not stop the exact active auto-sync group.

### Fix

- On exhausted compensation, an exact-runtime identity guard invalidates both content operation
  generations, cancels pending programmatic scrolling, detaches active listeners/monitors, marks the
  local runtime inactive, and hides its panel. A late failure whose identity is no longer current
  cannot mutate a replacement runtime.
- The URL receiver now returns a typed success/failure acknowledgement. It stops navigation and
  later scroll handling after reconciliation failure.
- The source URL-monitor path emits a narrow, session-bound `sync:runtime-degraded` message after
  exact-runtime deactivation. A late background acknowledgement has no local mutation path.
- The background relay consumes typed content responses. For a current manual epoch it persists and
  commits only the failed member's `error` connection status, increments the revision, broadcasts
  the authoritative snapshot, and returns the typed failure instead of success.
- The source degradation handler applies the same epoch/sender authorization and transition gate.
- Automatic failures stop and broadcast only the matching active auto-sync group.
- The shared message declarations and `webext-bridge` ProtocolMap now expose the same URL/degradation
  request-response contract.
- Failure logs contain only IDs and fixed non-sensitive reasons; no URL or response object is logged.

### Interleaving proof

The content test starts epoch 20 with a retained `0.2` manual offset, defers U1's real storage clear,
starts U2 in the same runtime, applies U1's clear, rejects exactly three repair writes, and proves:

- neither URL navigates;
- the runtime becomes inactive at epoch 0 and its panel is hidden exactly once;
- an epoch-20 `scroll:sync` message cannot move the document;
- storage writes are bounded to one clear plus three repairs;
- only a later explicit epoch-21 Start repairs the retained offset, reactivates the panel/runtime,
  and restores the expected 700px mapped scroll position.

A separate source schedule defers the degradation acknowledgement, completes an explicit epoch-31
Start repair, then resolves the old acknowledgement and proves epoch 31 state and the restored
offset remain unchanged. Background schedules independently prove current-epoch persistence and
that a delayed epoch-E target response cannot mutate the replacement epoch-E+1 topology or status.

### Round-3 verification

- Focused round-3 and activation-migration suites: 7 files, 248 tests passed.
- Full Vitest suite: 97 files, 1,732 tests passed.
- Full repository health hook: i18n, privacy logging, privacy rule tests, typecheck, format, and lint
  passed.
- Privacy logging validation: 265 files passed.
- Privacy rule suite: 27 tests passed.
- Chromium production build: passed.
- Firefox production build: passed.
- `git diff --check`: passed.

### Focused re-review closure

The first round-3 re-review found two additional races, and each received a failing interleaving
test before its implementation:

1. Failed-runtime keyboard cleanup was fire-and-forget. The RED test observed a fifth repair write
   and E+1 initialization before deferred E cleanup completed. Cleanup is now awaited inside the
   clear/reconciliation transaction after the retained repair snapshot is recorded. The resulting
   order is `E cleanup -> transaction resolve -> retained strict repair -> offset read -> E+1
keyboard/panel initialization`.
2. Automatic URL failures originally had no exact activation identity. The RED test deferred an
   epoch-E target failure, restarted the same group with identical membership, and observed the old
   failure stop E+1. Auto activations now reserve a monotonic generation under the auto lock. The
   generation is carried through content Start, URL/degradation messages, reconnect, reinjection,
   and manual-override restoration; background admission and failure commit both validate it.

Supporting tests prove that the same accepted group receives a newer generation on restart,
reinjection forwards the frozen generation, and manual-override snapshots preserve it. A final
independent read-only re-review returned **APPROVED** with no P0/P1 findings after checking both
interleavings and all generation propagation paths.
