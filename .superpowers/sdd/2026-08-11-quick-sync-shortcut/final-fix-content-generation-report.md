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
- Compensates an already-dispatched stale offset clear from the exact active runtime. Replacement
  Starts wait on a stable content-local reconciliation barrier before reading storage, including the
  three-operation race where another Start begins while the compensation write is pending.
- Extended `StartSyncContentResponse` with the optional `stale-operation` reason. `shim.d.ts`
  already returns the shared `StartSyncResponse` alias, so no duplicate shim change was required.
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

The independent review then identified a pending-replacement gap in the first compensation design.
A three-operation regression was added and failed before the barrier fix:

```text
expected 500 to be 700
```

That proved the third Start's cache had read the deleted offset while storage was later repaired to
E+1's value.

Final focused result:

- content runtime operation generations: 5 tests passed;
- complete scenario suite: 63 tests passed.

The tests defer real mocked storage writes and prove that stale operations leave the newer runtime's
epoch, cache mapping, persistent offset, panel visibility, and navigation unchanged.

## Verification

- Full Vitest suite: 97 files, 1,713 tests passed.
- Full repository health hook: i18n, privacy logging, privacy rule tests, typecheck, format, and lint
  all passed.
- Privacy logging validation: passed for 265 files.
- Privacy rule suite: 27 tests passed.
- Chromium production build: passed.
- Firefox production build: passed.
- `git diff --check`: passed.
- Independent lifecycle re-review: APPROVE after the three-operation barrier regression passed.
- The health formatter touched seven unrelated documentation/landing files; those mechanical
  out-of-scope edits were restored exactly before commit.

## Residual boundary

The storage helpers' existing write-error behavior was not changed; this fix is limited to operation
ordering and stale lifecycle continuations. Browser storage writes remain non-cancellable, so the
repair barrier intentionally serializes only lifecycle offset reconciliation and Start reads, not
the active scroll hot path.
