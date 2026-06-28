# Extension PR Checks Design

## Context

Issue #384 introduced a URL Sync mode that changes how synchronized tabs navigate between
websites. The feature passed manual testing, but repeating that matrix before every merge is not
realistic.

The repository currently has separate push-time workflows:

- `release.yml` for extension releases after changes land on `main`
- `deploy-landing.yml` for landing page deployment
- `update-store-stats.yml` for scheduled store statistics

None of those workflows is a required pull request gate for extension changes. The repository
ruleset now requires a status check named `extension-pr-checks`, so CI must provide that exact check
name and keep it stable.

The gate must protect the extension without weakening the existing release and landing pipeline
isolation. It must not use privileged pull request execution, mutate repository settings, or depend
on manual browser testing.

## Goal

Add a required pull request CI gate named `extension-pr-checks` for extension-impacting changes.

The gate should combine:

- fast static and unit checks
- both Chromium and Firefox production builds
- a focused extension E2E smoke test for URL Sync modes
- a static privacy logging check that rejects raw URL, title, and payload logging

The result should make regressions in URL Sync behavior expensive to merge while keeping ordinary PR
feedback fast enough to run on every pull request.

## Non-Goals

- Do not let CI configure branch protection, rulesets, required checks, labels, or other repository
  settings.
- Do not add a local script for configuring repository rulesets.
- Do not use `pull_request_target`.
- Do not run the full manual URL Sync matrix on every pull request.
- Do not depend on external public websites for E2E tests.
- Do not merge the extension release workflow and landing deployment workflow.
- Do not broaden CI permissions beyond what the check needs to read code and run tests.

## Required Check Shape

Create a new workflow:

```text
.github/workflows/extension-pr-checks.yml
```

Use a stable workflow/job shape:

```yaml
name: Extension PR Checks

on:
  pull_request:
    branches: [main]

permissions:
  contents: read

jobs:
  extension-pr-checks:
    name: extension-pr-checks
```

The job name must stay exactly `extension-pr-checks` because repository rulesets match that status
check.

Do not use workflow-level path filters. If a required workflow is path-filtered and does not run,
GitHub can leave the required check pending and block unrelated pull requests. Instead, always run
the job and decide inside the job whether extension checks are necessary.

## Change Detection

Inside `extension-pr-checks`, compute whether the pull request touches extension-impacting files.

Extension-impacting paths:

- `.github/workflows/extension-pr-checks.yml`
- `e2e/**`
- `extension/_locales/**`
- `package.json`
- `pnpm-lock.yaml`
- `playwright.config*.ts`
- `scripts/**`
- `src/background/**`
- `src/contentScripts/**`
- `src/manifest.ts`
- `src/popup/**`
- `src/shared/**`
- `tsconfig*.json`
- `uno.config.ts`
- `vite.config*`

Landing-only changes should still produce a successful `extension-pr-checks` status, but the job
should exit after a short message such as:

```text
No extension-impacting changes detected.
```

This keeps the required check truthful without making landing-only pull requests wait for extension
builds.

## CI Steps

When extension-impacting files changed, run the gate in this order:

1. Check out the pull request code.
2. Set up pnpm with the repository's package manager version.
3. Set up Node.js with pnpm caching.
4. Run `pnpm install --frozen-lockfile`.
5. Run `pnpm privacy:logging:test`.
6. Run the static privacy logging check.
7. Run `pnpm i18n:validate`.
8. Run `pnpm typecheck`.
9. Run a non-mutating lint check.
10. Run `pnpm test -- --run`.
11. Run `pnpm build`.
12. Run `pnpm build-firefox`.
13. Verify the GitHub-hosted runner's system Chrome with `google-chrome --version`.
14. Run the extension URL Sync smoke E2E test under `xvfb-run` with
    `EXTENSION_E2E_BROWSER_CHANNEL=chrome` and `EXTENSION_E2E_HEADLESS=false`.

Add missing package scripts instead of embedding long commands in the workflow. At minimum, add:

```json
{
  "build-firefox": "cross-env NODE_ENV=production EXTENSION=firefox run-s clear i18n:validate build:web build:prepare build:background build:js",
  "lint:check": "NODE_OPTIONS='--experimental-strip-types' eslint src/background src/contentScripts src/popup src/shared src/manifest.ts scripts e2e '*.ts' '*.mts' --flag unstable_native_nodejs_ts_config --max-warnings=0",
  "privacy:logging": "esno scripts/validate-privacy-logging.ts",
  "privacy:logging:test": "vitest run --root . scripts/privacy-logging-rules.test.ts",
  "test:e2e:extension": "playwright test --config playwright.config.extension.ts"
}
```

## Static Privacy Logging Check

Raw URLs and titles are user data. The CI gate should validate this statically rather than trying to
observe console output in E2E.

Add a small validator:

```text
scripts/validate-privacy-logging.ts
```

The validator should inspect TypeScript and TSX files under `src/**` and fail on unsafe logger
calls.

It should reject logger metadata that contains raw browser data, including:

- object keys such as `url`, `sourceUrl`, `targetUrl`, `normalizedUrl`, `payload`, `tab`, `title`,
  `tabTitle`, `documentTitle`, `canonicalUrl`, and `alternateUrls`
- shorthand metadata such as `{ payload }` or `{ tab }`
- direct expressions such as `window.location.href`, `tab.url`, `payload.url`, and `document.title`
- whole objects or identifiers that are likely to contain URLs, titles, page metadata, or storage
  payloads

It should allow non-sensitive metadata, including:

- `tabId`
- `sourceTabId`
- `targetTabId`
- `mode`
- `reason`
- counts
- booleans
- enum/status strings

If a domain is truly required, log a sanitized `domain` value only. Never log path, query, hash,
tab title, page title, canonical URL, alternate URL, or the full payload object.

The validator should report file, line, and a clear remediation hint. A failure should read like a
code review comment, not a generic grep failure.

## URL Sync Smoke E2E

Add an extension-specific Playwright config and spec:

```text
playwright.config.extension.ts
e2e/extension/url-sync-modes.spec.ts
```

The test should load the built Chromium extension in a persistent browser context with:

- `--disable-extensions-except=<extension-dir>`
- `--load-extension=<extension-dir>`

The test should use local deterministic fixture pages instead of public websites. The fixtures need
enough URL variety to exercise the product behavior:

- same website, different language
- different website boundary, same matching page
- path movement
- query-language carrier
- hash preservation when applicable

Different websites can be represented with local origins, such as different loopback hosts or ports,
as long as the test validates the same browser-visible behavior the extension uses.

### Smoke Cases

The required smoke suite should cover these cases:

1. `Follow changed tab`
   - Another tab follows the changed tab's website.
   - The target tab's language is preserved when possible.
2. `Keep each tab's website`
   - Another tab stays on its own website.
   - The changed page movement is applied within that website.
   - The target tab's language is preserved when possible.
3. URL Sync off
   - The other tab does not navigate when the source tab changes URL.
4. Mode visibility
   - The active mode is visible in the extension UI.
   - The persisted mode shown in UI matches the mode that actually drives behavior.

The E2E test should not validate privacy logging. That belongs in the static validator because it is
more complete, faster, and less dependent on runtime coverage.

## State Truthfulness

The CI tests should enforce the same state truthfulness rule as the product:

- If a mode cannot be stored, restored, or applied, UI must not pretend that mode is active.
- If the extension falls back to a different effective behavior, UI must show the effective state or
  present an actionable error.
- A test failure should point to the mismatch between requested mode, stored mode, displayed mode,
  and effective navigation behavior.

This is especially important for `Keep each tab's website`, because silently behaving like `Follow
changed tab` would be worse than disabling URL Sync with a clear message.

## Repository Settings

Repository settings stay manual.

The required manual setting is already configured:

- Ruleset or branch protection target: `main`
- Required status check: `extension-pr-checks`
- Pull request merge blocked while `extension-pr-checks` fails or is pending

CI should not receive a GitHub admin token and should not edit repository rules. This avoids a
privilege escalation path where a workflow could weaken the protection that it is supposed to
enforce.

## Failure Messages

Failures should be actionable for a non-maintainer reading the pull request.

Examples:

```text
Unsafe logger metadata in src/background/example.ts:42
Do not log "sourceUrl". Log tabId, mode, reason, or sanitized domain instead.
```

```text
URL Sync mode mismatch
Requested: keep-each-tabs-website
Displayed: keep-each-tabs-website
Effective navigation: follow-changed-tab
Expected the target tab to keep its own website.
```

```text
Extension smoke test setup failed
The Chromium extension ID could not be discovered after loading dist/.
Check that pnpm build completed and the manifest is present.
```

## Acceptance Criteria

- Every pull request receives a status check named `extension-pr-checks`.
- A landing-only pull request gets a successful `extension-pr-checks` result without running the full
  extension gate.
- An extension-impacting pull request runs install, privacy logging validation, i18n validation,
  typecheck, lint check, unit tests, Chromium build, Firefox build, and URL Sync smoke E2E.
- Introducing `logger.info(..., { url: tab.url })` or equivalent raw URL metadata fails CI.
- Regressing `Keep each tab's website` into `Follow changed tab` behavior fails CI.
- Regressing mode UI visibility or persisted/effective mode truthfulness fails CI.
- The workflow uses `pull_request`, not `pull_request_target`.
- The workflow has read-only repository permissions.
- Repository ruleset configuration remains outside CI.

## Risks And Mitigations

### Required check name mismatch

If the job name changes, GitHub rulesets may wait for a check that never appears.

Mitigation: keep both the job id and display name as `extension-pr-checks`.

### Required path-filter deadlock

If the required workflow is skipped by path filters, unrelated PRs can be blocked.

Mitigation: do not path-filter the workflow trigger. Always run the required job and skip internally
with a successful result when extension files did not change.

### E2E flakiness

Browser extension tests can be slower and more brittle than unit tests.

Mitigation: keep the required E2E suite small, use local fixtures, avoid network dependencies, and
capture traces or screenshots on failure.

### Static validator false positives

Privacy checks can become noisy if implemented as broad text search.

Mitigation: inspect logger calls structurally with TypeScript syntax, keep the banned metadata list
focused, and allow clearly sanitized fields such as `domain`, `tabId`, `mode`, and `reason`.

### CI duration

Running two production builds plus E2E can slow PR feedback.

Mitigation: run the full gate only for extension-impacting changes and keep the E2E suite to smoke
coverage for URL Sync modes.
