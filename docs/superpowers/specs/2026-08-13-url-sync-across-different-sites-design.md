# URL Sync Across Different Sites Design

## Context

GitHub issue #410 asks URL Sync to support comparing the same application across local
development, staging, production, and market-specific sites whose origins are not related by the
existing site-family heuristic.

The reporter confirmed these sanitized URL shapes:

```text
localhost:3000/product1
test1.company.cloudprovider.cz/product1
test1.ua.company.cloudprovider.cz/product1
company.cz/product1
company.com.ua/product1
```

They withdrew the fragment requirement. Source fragments do not need to synchronize.

The released `keep-each-tabs-website` mode intentionally fails closed when source and target site
boundaries are incompatible. That protection prevents the extension from guessing paths on
unrelated websites and must remain unchanged. The requested workflow therefore needs a separate,
explicit opt-in mode rather than a broader compatibility heuristic.

This design is based on `origin/main` at
`1b71ecafae31311b792f4b16025951a609531cc8`, which includes Quick Sync session revision, epoch, and
relay-authorization protections.

## Product Decision

Add a third persisted URL Sync mode:

```text
sync-page-path-across-sites
```

User-facing English label:

```text
Sync page path across different sites
```

User-facing Korean label:

```text
서로 다른 사이트 간 페이지 경로 동기화
```

This mode is a global URL Sync preference stored in `browser.storage.local`, matching the existing
URL Sync settings model. It applies equally to popup-started manual synchronization, Quick Sync,
an already-active manual session, and existing auto-sync sessions that consume the same global URL
Sync preference. When selected during an active session, it affects the next page change without
requiring synchronization to restart.

The default remains `follow-changed-tab`. No existing user is migrated into the new mode.

## Goals

- Let each synchronized tab keep its existing protocol, hostname, and port.
- Apply source page movement across unrelated HTTP(S) origins after explicit user selection.
- Reuse the current page-identifying query and locale-preservation behavior.
- Preserve the target tab's existing hash.
- Keep the conservative `keep-each-tabs-website` boundary guard unchanged.
- Keep URL Sync settings truthful when reads, writes, or repairs fail.
- Preserve manual offsets and Scroll Sync when URL navigation is invalid or skipped.
- Preserve the current Quick Sync revision, epoch, and relay-authorization boundaries.
- Explain the cross-site path and query disclosure risk wherever the mode is shown.

## Non-Goals

- Do not weaken or remove `areUrlSyncSiteBoundariesCompatible()`.
- Do not add hostnames, country suffixes, cloud providers, or environment names to the compatibility
  heuristic to approximate the reporter's topology.
- Do not copy arbitrary source queries verbatim.
- Do not introduce a query-key allowlist editor or per-site mapping rules.
- Do not synchronize source fragments or add `hashchange` handling.
- Do not probe the predicted target URL over the network.
- Do not add a session-only URL Sync override or Quick Sync-specific URL policy.
- Do not change scroll position math, manual-anchor semantics, or the scroll hot path.
- Do not change GitHub issue labels, comments, title, or state as part of implementation.

## Existing Modes Remain Stable

| Mode                          | Origin policy                                   | Boundary policy                                          |
| ----------------------------- | ----------------------------------------------- | -------------------------------------------------------- |
| `follow-changed-tab`          | Follow the changed tab's site                   | Unrelated sites remain allowed                           |
| `keep-each-tabs-website`      | Keep each target tab's protocol, host, and port | Require the existing compatible site-family guard        |
| `sync-page-path-across-sites` | Keep each target tab's protocol, host, and port | Skip the guard only because the user explicitly opted in |

`keep-each-tabs-website` must continue to block combinations such as `localhost` and production,
sibling product hosts, and unrelated hosted-platform tenants. A future change to that conservative
contract requires a separate product and security decision.

## Persisted State And Truthfulness

Extend `UrlSyncMode` and `isUrlSyncMode()` with `sync-page-path-across-sites`. The existing
`urlSyncMode` storage key, save function, load function, repair function, storage-change listener,
and `sync:url-mode-changed` broadcast remain the single source of truth.

No field is added to `SyncState`, `StartSyncMessage`, the Quick Sync candidate, or the session
orchestrator. URL policy remains independent of how a manual session started.

State rules:

- A missing stored mode still resolves to `follow-changed-tab` without an error.
- The new value is valid and persists across browser and synchronization sessions.
- An unknown stored value is repaired to `follow-changed-tab` through the existing repair flow.
- A storage read or repair failure skips URL navigation and shows the existing actionable notice.
- A mode write failure leaves the previous mode selected and visible.
- A successful mode change is immediately reflected in the popup, in-page panel, and active content
  runtimes through the current storage and broadcast paths.

## URL Resolution

`resolveUrlSyncTarget(sourceUrl, targetUrl, mode)` remains the policy boundary.

### Follow Changed Tab

Keep the existing behavior without modification.

### Keep Each Tab's Website

Keep the existing behavior without modification:

1. Parse source and target as HTTP(S).
2. Block invalid or unsupported URLs.
3. Require `areUrlSyncSiteBoundariesCompatible(source, target)`.
4. Build a target-origin URL only after compatibility succeeds.

### Sync Page Path Across Different Sites

1. Parse source and target as HTTP(S).
2. Block invalid URLs and non-HTTP(S) schemes through the same blocked-result contract used by the
   conservative target-origin mode.
3. Do not call or weaken the site-boundary compatibility guard for this explicit mode.
4. Reuse the existing target-origin builder, including locale and query handling.
5. Return a navigation result that preserves:
   - target protocol;
   - target hostname;
   - target port;
   - target locale carrier when detectable;
   - target hash.
6. Apply:
   - source pathname after the existing locale normalization;
   - source page-identifying query data after the existing filtering rules.

Example:

```text
source after:
http://localhost:3000/products/42?view=details&utm_source=mail#source-section

target before:
https://preview.example.net/home?locale=ko#target-section

target after:
https://preview.example.net/products/42?view=details&locale=ko#target-section
```

The target stays on its original HTTPS origin, receives the source page movement and relevant query,
keeps its Korean locale carrier, drops the tracking parameter, and preserves its own hash.

## Query And Fragment Policy

The new mode reuses the current query policy; it does not claim that all copied values are safe.

Current behavior:

- remove keys beginning with `utm_`;
- remove known tracking keys such as `ref`, `source`, `fbclid`, and `gclid`;
- remove recognized source locale query carriers before preserving the target locale;
- copy other source query keys and values as page-identifying data;
- retain duplicate non-noise keys while allowing the existing stable key/value sorting and URL
  serialization to normalize query order and encoding;
- when the source contributes no retained identity query, preserve the current target query in the
  existing path/subdomain/no-locale branches;
- preserve the target query locale when applicable.

This is a denylist-based compatibility policy, not a security allowlist. Unrecognized query values
can contain tokens, identifiers, search terms, or private application state and can be sent to the
target server. The persistent warning is therefore part of the feature's required contract.

Source hashes are never copied. The current target hash is preserved. No `hashchange` listener is
added.

## UI And Copy

Add the new option after the two existing modes in every `UrlSyncSettings` variant.

Canonical English copy:

```text
○ Sync page path across different sites
  Each tab keeps its own site while the page path and relevant query data
  are applied to the other tabs.

  ⚠ Path and query data may be sent to another site.
```

Canonical Korean copy:

```text
○ 서로 다른 사이트 간 페이지 경로 동기화
  각 탭의 사이트는 유지하면서 페이지 경로와 관련 쿼리 데이터를
  다른 탭에 적용합니다.

  ⚠ 경로와 쿼리 데이터가 다른 사이트로 전달될 수 있습니다.
```

Display rules:

- Show the warning only when `sync-page-path-across-sites` is the actual selected mode.
- In card and expanded inline variants, show it directly below the selected option.
- In the collapsed inline variant, show one copy below the mode summary so users do not need to
  reopen settings; do not render a duplicate hidden copy.
- Keep it visible when URL Sync is off because it describes the persisted behavior that will apply
  when URL Sync is enabled again.
- Do not add a confirmation dialog or a persisted acknowledgement flag.
- Do not show the warning for an attempted selection until storage has succeeded and the actual mode
  has changed.
- Keep transient save/read/repair notices separate from this persistent advisory.
- Associate the advisory with the selected control and summary for assistive technology. Treat it as
  descriptive guidance rather than a recurring live-region alert.

Add label, description, example, and warning keys to both locale trees for all nine supported
locales. English and Korean use the canonical copy above; the other translations must preserve the
same disclosure strength.

Correct the existing conservative-mode example so it uses a pair that passes the real guard, such
as `example.com` and `staging.example.com`. An unrelated-origin example belongs only to the new
explicit mode. Product copy and tests use reserved or local sanitized examples rather than the
reporter's domain shapes.

## Contextual Hint

Successful target-origin navigation currently queues the `keep-website-path-synced` contextual
hint. Map the new mode to that same post-navigation hint because the user-visible outcome remains
"this tab stayed on its website and followed the page path."

Do not add another hint identifier or dismissal state. The persistent settings warning, rather than
the transient post-navigation hint, owns the disclosure about applying query data to another site.

## Runtime Data Flow

```text
User selects the new mode
  -> saveUrlSyncMode() persists successfully
  -> popup/panel render the actual new mode and persistent warning
  -> sync:url-mode-changed broadcasts the mode to active UI surfaces

Source tab changes page
  -> existing URL monitor emits url:sync with current runtime identity
  -> background authorizes sender, membership, and session epoch or auto-sync generation
  -> background relays only to authorized linked targets
  -> target verifies current runtime and operation generation
  -> target loads and repairs the persisted URL Sync mode
  -> resolver parses HTTP(S) source and target
  -> explicit mode builds a target-origin URL without the compatibility check
  -> same-URL result exits without clearing the manual offset
  -> changed URL queues the existing target-origin contextual hint
  -> manual-offset clear transaction commits
  -> navigation applies
```

The feature must not change URL Sync message payloads, `revision`, `sessionEpoch`, sender matching,
membership authorization, auto-sync activation identity, or operation-generation checks.

## Failure And Offset Ordering

Preserve the existing receiver ordering:

1. Validate runtime identity.
2. Ignore the source tab.
3. Check URL Sync enabled state.
4. Read and repair the stored mode.
5. Resolve the target URL.
6. Return on blocked or same-URL results.
7. Revalidate the current operation.
8. Queue the contextual hint.
9. Clear the manual offset transactionally.
10. Navigate only from the committed clear callback.

Required outcomes:

| Condition                                 | Result                                                              |
| ----------------------------------------- | ------------------------------------------------------------------- |
| Invalid source or target URL              | No navigation; no offset clear; Scroll Sync remains active          |
| Non-HTTP(S) source or target              | No navigation; no offset clear; Scroll Sync remains active          |
| Stored mode read or repair failure        | No navigation; actionable notice; actual mode is not misrepresented |
| Resolution equals current target URL      | No navigation; no offset clear                                      |
| Manual-offset clear fails before commit   | No navigation; existing degradation/recovery contract applies       |
| Successful different-URL resolution       | Clear target offset, update cache, then navigate                    |
| Conservative mode sees incompatible sites | Existing warning and fail-closed behavior remain unchanged          |

One target's skipped navigation must not stop the synchronization session or prevent other valid
targets from navigating.

## Privacy And Security

This mode crosses an origin boundary by explicit user choice and therefore changes where path and
query data can be sent. The implementation must:

- show the persistent disclosure in every settings surface;
- never log source or target URLs, hostnames, paths, query strings, hashes, titles, metadata, or
  whole payloads;
- limit URL Sync logs to non-sensitive fields such as mode, reason, source tab ID, booleans, and
  counts;
- never include the current site, path, or query in notices;
- retain the current query filtering rather than widening it;
- retain target-hash preservation;
- retain all current relay authorization and stale-operation checks.

Before completion, search changed URL Sync, storage, notice, and relay files for:

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
```

Any newly introduced raw URL, title, path, query, hash, or payload logging is a blocking defect.

## Test Strategy

Follow focused RED -> GREEN -> REFACTOR loops. Do not launch a browser during unit and component
development.

### Resolver Tests

- Existing `keep-each-tabs-website` continues to block `localhost` and an unrelated production
  origin.
- The new mode preserves the target origin for `localhost:3000` to production and the reverse.
- It preserves the target origin for structurally different staging and production hosts in both
  directions.
- It supports market-specific staging and production shapes without hostname heuristics.
- It preserves target protocol and port.
- It blocks invalid and non-HTTP(S) source and target URLs.
- It retains the target hash and ignores the source hash.
- It removes known tracking query data, preserves target locale carriers, and applies other source
  identity query data according to the existing policy.
- Existing tests for both released modes remain unchanged and green.

### Storage And Type Tests

- `sync-page-path-across-sites` is accepted, saved, loaded, and not repaired away.
- Missing storage still defaults to `follow-changed-tab`.
- Unknown values still repair to the default.
- Read and repair-write failures remain explicit.

### Settings And Hook Tests

- The third label, description, example, and advisory render.
- The advisory is present when expanded and collapsed.
- The advisory remains visible while URL Sync is off.
- It is absent for the two existing modes.
- A successful selection persists and immediately displays the new mode.
- A failed save keeps the previous mode and shows the existing failure notice.
- External storage/broadcast updates keep popup and panel state truthful.

### Contextual Hint Test

- The new mode maps to `keep-website-path-synced` without adding a new hint identifier.

### Content-Script Scenario Tests

- A successful cross-site resolution clears the target manual offset and navigates.
- Invalid resolution does not clear the offset or navigate.
- A same-URL result does not clear the offset.
- The existing incompatible-boundary case remains blocked and continues Scroll Sync.
- Current session epoch, sender authorization, auto-sync identity, and stale-operation regressions
  remain green.

### Targeted Browser Test

After lower layers are green, extend and run only the targeted headless
`e2e/extension/url-sync-modes.spec.ts`:

- use the existing `127.0.0.1` and `localhost` unrelated fixture pair;
- prove `keep-each-tabs-website` still blocks the pair;
- prove `sync-page-path-across-sites` keeps the target origin and follows the changed page;
- prove target hash preservation and relevant query behavior;
- prove Scroll Sync still works after the navigation.

Do not run the full Playwright suite or cross-browser matrix unless a targeted failure, explicit
request, or release gate justifies it.

## Proportional Verification

Expected final evidence:

```bash
pnpm exec vitest run src/shared/lib/translated-page-url-utils.test.ts
pnpm exec vitest run src/shared/lib/storage.test.ts
pnpm exec vitest run src/shared/components/url-sync-settings.test.tsx
pnpm exec vitest run src/popup/hooks/use-url-sync.test.ts
pnpm exec vitest run src/contentScripts/lib/contextual-hint-navigation-queue.test.ts
pnpm exec vitest run src/__tests__/scenarios.test.ts
pnpm i18n:validate
pnpm privacy:logging
pnpm typecheck
pnpm exec playwright test e2e/extension/url-sync-modes.spec.ts --config playwright.config.extension.ts
```

If a fresh worktree lacks generated declarations and typecheck fails for that known reason, run
`pnpm build:web` once and retry `pnpm typecheck`. Broader checks are driven by concrete failures or
mandatory release gates, not run by default.

## Documentation Impact

Implementation updates:

- `docs/guides/url-sync-safe-navigation.md` to document three modes and the explicit opt-in
  exception;
- relevant URL Sync README or architecture text that currently says there are only two modes;
- the inaccurate conservative-mode UI example in both locale trees;
- no fragment-sync documentation because fragment copying remains out of scope.

## Implementation Boundary

Use a clean worktree and `feat/url-sync-unrelated-origins` based on the latest `origin/main`. Do not
touch user-owned untracked directories in the root checkout.

The expected implementation surface is:

- URL Sync mode type guard and storage tests;
- target resolver and tests;
- shared settings component, popup hook coverage, and contextual-hint mode mapping;
- both nine-locale trees;
- focused content-script scenario and URL Sync E2E coverage;
- URL Sync guide and directly stale architecture/readme statements.

No new message payload, background session field, dependency, permission, or manifest capability is
expected.

## Acceptance Criteria

- Users can explicitly select `Sync page path across different sites`.
- The selection persists across synchronization and browser sessions.
- Manual Sync, Quick Sync, and existing auto-sync URL navigation use the same selected policy.
- Changing the mode during an active session affects the next page change.
- Each target keeps its own protocol, hostname, and port.
- Relevant source query data follows the existing filtering and locale rules.
- The target hash is preserved and the source hash is not synchronized.
- The persistent risk warning is visible when the mode is selected, including collapsed and
  URL-Sync-off states.
- Existing modes retain their current defaults and navigation boundaries.
- Invalid or skipped navigation preserves the target URL, manual offset, and active Scroll Sync.
- Successful navigation clears the target manual offset before navigation.
- Relay revision, epoch, membership, and source-identity protections remain intact.
- Both locale trees contain complete copy for all nine supported locales.
- Focused unit, component, scenario, privacy, type, i18n, and targeted E2E evidence passes.
