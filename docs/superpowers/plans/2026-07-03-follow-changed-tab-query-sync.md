# Follow Changed Tab Query Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `follow-changed-tab` URL Sync copy source page-identifying query parameters while preserving target language carriers.

**Architecture:** Keep the behavior change inside `src/shared/lib/translated-page-url-utils.ts`, where URL Sync target URLs are already resolved. Add focused Vitest coverage for the pure resolver and one content-script scenario so the actual `url:sync` receiver path cannot regress.

**Tech Stack:** TypeScript, Vitest, webext-bridge message tests, webextension-polyfill mocks, pnpm.

---

## File Structure

- Modify: `src/shared/lib/translated-page-url-utils.test.ts`
  - Responsibility: prove `follow-changed-tab` applies source identity query and does not treat locale-valued query params as ordinary page identity.
- Modify: `src/__tests__/scenarios.test.ts`
  - Responsibility: prove the content-script `url:sync` handler navigates with source query parameters when URL Sync is enabled.
- Modify: `src/shared/lib/translated-page-url-utils.ts`
  - Responsibility: build the final URL for translated-page and URL Sync navigation.
- No changes: `src/shared/types/messages.ts`, `shim.d.ts`, popup UI, background relay, locale JSON files, scroll timing, auto-sync grouping, landing, release, deploy, or store-stats workflows.

## Task 1: Add Regression Tests For Follow-Changed Query Sync

**Files:**

- Modify: `src/shared/lib/translated-page-url-utils.test.ts`
- Modify: `src/__tests__/scenarios.test.ts`

- [ ] **Step 1: Add pure URL utility tests**

In `src/shared/lib/translated-page-url-utils.test.ts`, inside the `describe('applyTranslatedPageLocaleSync')` block, add these tests after the existing test named `uses target carrier when source and target carriers differ` and before the test named `falls back to source URL when parsing fails`:

```typescript
it('uses source identity query when target has no locale marker', () => {
  expect(
    applyTranslatedPageLocaleSync(
      'https://search.example.com/results?query=hello&page=2&utm_source=mail',
      'https://search.example.com/',
    ),
  ).toBe('https://search.example.com/results?page=2&query=hello');
});

it('does not copy locale-valued query carriers as identity query without target locale', () => {
  expect(
    applyTranslatedPageLocaleSync(
      'https://example.com/docs/search?lang=en&query=hello&hl=ko',
      'https://example.com/docs',
    ),
  ).toBe('https://example.com/docs/search?query=hello');
});
```

In the same file, inside the `describe('resolveUrlSyncTarget')` block, add this test after the test named `keeps existing behavior for follow-changed-tab mode`:

```typescript
it('syncs Naver-shaped source query parameters in follow-changed-tab mode', () => {
  expect(
    resolveUrlSyncTarget(
      'https://search.naver.com/search.naver?where=nexearch&sm=top_hty&fbm=0&ie=utf8&query=hello&ackey=0eid74s6',
      'https://www.naver.com/#home',
      'follow-changed-tab',
    ),
  ).toEqual({
    status: 'navigate',
    url: 'https://search.naver.com/search.naver?ackey=0eid74s6&fbm=0&ie=utf8&query=hello&sm=top_hty&where=nexearch#home',
  });
});
```

- [ ] **Step 2: Add a content-script scenario test**

In `src/__tests__/scenarios.test.ts`, inside the `describe('Scenario: URL sync behavior')` block, add this test after the test named `when URL sync is enabled, url:sync receiver navigates`:

```typescript
it('when follow-changed-tab is active, url:sync receiver keeps source query params', async () => {
  await startContentSync(27);
  await saveUrlSyncEnabled(true);
  await saveUrlSyncMode('follow-changed-tab');
  setWindowUrl('https://www.naver.com/#target');

  await invokeContentMessage('url:sync', {
    url: 'https://search.naver.com/search.naver?where=nexearch&sm=top_hty&fbm=0&ie=utf8&query=hello&ackey=0eid74s6',
    sourceTabId: 99,
  });

  expect(window.location.href).toBe(
    'https://search.naver.com/search.naver?ackey=0eid74s6&fbm=0&ie=utf8&query=hello&sm=top_hty&where=nexearch#target',
  );
});
```

- [ ] **Step 3: Run focused utility tests and verify the expected failure**

Run:

```bash
pnpm vitest run src/shared/lib/translated-page-url-utils.test.ts
```

Expected before implementation: FAIL. The new no-locale-marker tests fail because the resolver still uses `target.search`.

Expected failure shape:

```text
expected 'https://search.example.com/results' to be 'https://search.example.com/results?page=2&query=hello'
```

- [ ] **Step 4: Run the content-script scenario and verify the expected failure**

Run:

```bash
pnpm vitest run src/__tests__/scenarios.test.ts -t "when follow-changed-tab is active"
```

Expected before implementation: FAIL. The scenario fails because `window.location.href` is missing the source query string.

Expected failure shape:

```text
expected 'https://search.naver.com/search.naver#target' to be 'https://search.naver.com/search.naver?ackey=0eid74s6&fbm=0&ie=utf8&query=hello&sm=top_hty&where=nexearch#target'
```

The important failure is that the pre-fix URL has no source query string.

- [ ] **Step 5: Commit the failing tests**

Run:

```bash
git add src/shared/lib/translated-page-url-utils.test.ts src/__tests__/scenarios.test.ts
git commit -m "test: cover follow changed tab query sync"
```

## Task 2: Implement Source Identity Query Sync

**Files:**

- Modify: `src/shared/lib/translated-page-url-utils.ts`
- Test: `src/shared/lib/translated-page-url-utils.test.ts`
- Test: `src/__tests__/scenarios.test.ts`

- [ ] **Step 1: Add a source identity search helper**

In `src/shared/lib/translated-page-url-utils.ts`, replace the current `buildPathOrSubdomainLocaleSearch()` helper:

```typescript
function buildPathOrSubdomainLocaleSearch(source: URL, target: URL): string {
  const identityQuery = stringifyQueryParams(getIdentityQueryParams(source.searchParams));
  return identityQuery ? `?${identityQuery}` : target.search;
}
```

with:

```typescript
function buildSourceIdentitySearch(source: URL): string {
  const identityQuery = stringifyQueryParams(getIdentityQueryParams(source.searchParams));
  return identityQuery ? `?${identityQuery}` : '';
}

function buildPathOrSubdomainLocaleSearch(source: URL, target: URL): string {
  return buildSourceIdentitySearch(source) || target.search;
}
```

- [ ] **Step 2: Use source identity search for targets without locale markers**

In `src/shared/lib/translated-page-url-utils.ts`, update the no-target-locale flow inside
`applyTranslatedPageLocaleSync()` to handle query-sourced locales before the generic fallback.
Replace the old branch:

```typescript
if (!targetLocale) {
  return buildUrlFromParts(
    source.protocol,
    source.hostname,
    source.port,
    source.pathname,
    target.search,
    target.hash,
  );
}
```

with:

```typescript
if (sourceLocale?.source === 'query' && !targetLocale) {
  return buildUrlFromParts(
    source.protocol,
    source.hostname,
    source.port,
    source.pathname,
    buildSourceIdentitySearch(source),
    target.hash,
  );
}

if (!targetLocale) {
  if (sourceLocale) {
    return sourceUrl;
  }

  return buildUrlFromParts(
    source.protocol,
    source.hostname,
    source.port,
    source.pathname,
    buildSourceIdentitySearch(source),
    target.hash,
  );
}
```

The early query-source branch strips locale-valued query carriers such as `lang` and `hl` via
`buildSourceIdentitySearch(source)`. The generic fallback still returns `sourceUrl` for path or
subdomain source locales when the target has no locale marker, and otherwise rebuilds the URL with
the source identity query and target hash.

- [ ] **Step 3: Run the focused utility tests**

Run:

```bash
pnpm vitest run src/shared/lib/translated-page-url-utils.test.ts
```

Expected: PASS. The new no-locale-marker tests pass, and existing path/query/subdomain locale preservation tests still pass.

- [ ] **Step 4: Run the content-script scenario test**

Run:

```bash
pnpm vitest run src/__tests__/scenarios.test.ts -t "when follow-changed-tab is active"
```

Expected: PASS. The receiver navigates to the source website/path with sorted source identity query parameters and the target hash.

- [ ] **Step 5: Commit the implementation**

Run:

```bash
git add src/shared/lib/translated-page-url-utils.ts
git commit -m "fix: sync follow changed tab query params"
```

## Task 3: Verify Privacy, Types, And URL Sync Boundaries

**Files:**

- Inspect: `src/shared/lib/translated-page-url-utils.ts`
- Inspect: `src/shared/lib/translated-page-url-utils.test.ts`
- Inspect: `src/__tests__/scenarios.test.ts`
- Inspect: `src/contentScripts/scroll-sync.ts`
- Inspect: `src/background/handlers/scroll-sync-handlers.ts`

- [ ] **Step 1: Run all relevant regression tests**

Run:

```bash
pnpm vitest run src/shared/lib/translated-page-url-utils.test.ts src/__tests__/scenarios.test.ts
```

Expected: PASS. URL utility tests and content-script scenarios pass together.

- [ ] **Step 2: Run the AGENTS.md privacy search**

Run:

```bash
rg -n "logger|url|Url|URL|tab\\.url|window\\.location\\.href|payload|normalizedUrl|sourceUrl|targetUrl" src/shared/lib/translated-page-url-utils.ts src/shared/lib/translated-page-url-utils.test.ts src/__tests__/scenarios.test.ts src/contentScripts/scroll-sync.ts src/background/handlers/scroll-sync-handlers.ts
```

Expected: Matches are reviewed manually. Accept URL manipulation in resolver code and test fixtures. Reject any new `logger` call that includes source URLs, target URLs, resolved URLs, tab titles, document titles, whole `payload`, or page metadata.

- [ ] **Step 3: Run the repository privacy validator**

Run:

```bash
pnpm privacy:logging
```

Expected: PASS. No raw URL, tab title, page metadata, storage payload, or message payload logging violations are reported.

- [ ] **Step 4: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS. No public type or message payload shape changed.

- [ ] **Step 5: Review final tracked diff**

Run:

```bash
git status --short
git log --oneline -3
```

Expected: The branch contains the docs spec commit plus two implementation commits:

```text
fix: sync follow changed tab query params
test: cover follow changed tab query sync
docs: add follow changed tab query sync design
```

The pre-existing untracked `.playwright-mcp/` directory may still appear. Leave it untracked unless the user explicitly asks to handle it.
