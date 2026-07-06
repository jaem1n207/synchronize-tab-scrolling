# URL Sync Safe Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `keep-each-tabs-website` URL Sync skip unsafe cross-site navigation while preserving scroll sync and existing safe URL Sync behavior.

**Architecture:** Keep the policy decision inside the shared URL resolver so popup, panel, content script, and E2E paths all use one rule. Add a pure host-boundary compatibility guard before target-site URL construction, return a typed blocked result for incompatible sites, and reuse the existing content-script blocked-navigation path so target URLs and manual scroll offsets remain unchanged.

**Tech Stack:** TypeScript, Vitest, Playwright, webext-bridge message tests, webextension-polyfill mocks, pnpm, Chrome extension E2E fixtures.

---

## File Structure

- Modify: `src/shared/lib/translated-page-url-utils.ts`
  - Responsibility: parse URL Sync source/target URLs, decide host-boundary compatibility, and build or block resolved target URLs.
- Modify: `src/shared/lib/translated-page-url-utils.test.ts`
  - Responsibility: cover pure URL resolver behavior for compatible and incompatible `keep-each-tabs-website` cases plus unchanged `follow-changed-tab` behavior.
- Modify: `src/shared/types/url-sync.ts`
  - Responsibility: add the new blocked reason and notice key to the public URL Sync result and notice types.
- Modify: `src/__tests__/scenarios.test.ts`
  - Responsibility: cover the actual content-script `url:sync` receiver path, including notices and manual offset preservation.
- Modify: `extension/_locales/{en,ko,ja,fr,es,de,zh_CN,zh_TW,hi}/messages.json`
  - Responsibility: add store-extension locale copy for the new incompatible-site notice.
- Modify: `src/shared/i18n/_locales/{en,ko,ja,fr,es,de,zh_CN,zh_TW,hi}/messages.json`
  - Responsibility: add runtime UI locale copy for the new incompatible-site notice.
- Modify: `e2e/extension/fixtures.ts`
  - Responsibility: provide a third deterministic local fixture site with a distinct hostname for unrelated-site URL Sync E2E coverage.
- Modify: `e2e/extension/url-sync-modes.spec.ts`
  - Responsibility: verify compatible target navigation, incompatible target no-navigation, scroll sync continuity after blocked URL navigation, and unchanged `follow-changed-tab` contract.
- No changes: `src/shared/types/messages.ts`, `shim.d.ts`, background relay handlers, popup setting layout, scroll timing constants, auto-sync grouping, landing, release, deploy, or store-stats workflows.

## Preflight

- [ ] **Step 1: Start from a feature branch**

The current workspace has a design-doc commit on `main`. Keep it, but do implementation work on a feature branch:

```bash
git switch -c codex/url-sync-safe-navigation
```

Expected:

```text
Switched to a new branch 'codex/url-sync-safe-navigation'
```

- [ ] **Step 2: Confirm unrelated untracked files are not staged**

Run:

```bash
git status --short
```

Expected: `.playwright-mcp/` may appear as untracked, but it must remain unstaged during this feature.

## Task 1: Add Failing Resolver Tests

**Files:**

- Modify: `src/shared/lib/translated-page-url-utils.test.ts`
- Test: `src/shared/lib/translated-page-url-utils.test.ts`

- [ ] **Step 1: Add pure resolver coverage**

In `src/shared/lib/translated-page-url-utils.test.ts`, inside `describe('resolveUrlSyncTarget')`, add these tests after the existing test named `keeps target website for keep-each-tabs-website mode`:

```typescript
it('keeps target website for same-host query locale pages', () => {
  expect(
    resolveUrlSyncTarget(
      'https://developer.chrome.com/blog/inside-browser-part3?hl=en&utm_source=mail',
      'https://developer.chrome.com/blog/inside-browser-part4?hl=ko#reading',
      'keep-each-tabs-website',
    ),
  ).toEqual({
    status: 'navigate',
    url: 'https://developer.chrome.com/blog/inside-browser-part3?hl=ko#reading',
  });
});

it('keeps target website for locale subdomain variants', () => {
  expect(
    resolveUrlSyncTarget(
      'https://en.example.com/docs/config?page=setup',
      'https://ko.example.com/docs/install#current',
      'keep-each-tabs-website',
    ),
  ).toEqual({
    status: 'navigate',
    url: 'https://ko.example.com/docs/config?page=setup#current',
  });
});

it('keeps target website for environment host variants', () => {
  expect(
    resolveUrlSyncTarget(
      'https://example.com/en/pricing?tab=teams',
      'https://staging.example.com/ko/home#current',
      'keep-each-tabs-website',
    ),
  ).toEqual({
    status: 'navigate',
    url: 'https://staging.example.com/ko/pricing?tab=teams#current',
  });
});

it('keeps target website for nested environment host variants', () => {
  expect(
    resolveUrlSyncTarget(
      'https://docs.example.com/en/pricing?tab=teams',
      'https://preview.docs.example.com/ko/home#current',
      'keep-each-tabs-website',
    ),
  ).toEqual({
    status: 'navigate',
    url: 'https://preview.docs.example.com/ko/pricing?tab=teams#current',
  });
});

it('blocks keep-each-tabs-website for unrelated translated article hosts', () => {
  expect(
    resolveUrlSyncTarget(
      'https://developer.chrome.com/blog/inside-browser-part3?hl=en',
      'https://d2.naver.com/helloworld/6204533',
      'keep-each-tabs-website',
    ),
  ).toEqual({
    status: 'blocked',
    reason: 'incompatible-site-boundary',
    notice: { key: 'urlSyncIncompatibleSiteNotice', severity: 'warning' },
  });
});

it('blocks keep-each-tabs-website for sibling product hosts', () => {
  expect(
    resolveUrlSyncTarget(
      'https://docs.example.com/en/install',
      'https://app.example.com/ko/home',
      'keep-each-tabs-website',
    ),
  ).toEqual({
    status: 'blocked',
    reason: 'incompatible-site-boundary',
    notice: { key: 'urlSyncIncompatibleSiteNotice', severity: 'warning' },
  });
});

it('blocks keep-each-tabs-website for shared-suffix hosted sites', () => {
  expect(
    resolveUrlSyncTarget(
      'https://one.github.io/en/docs',
      'https://two.github.io/ko/docs',
      'keep-each-tabs-website',
    ),
  ).toEqual({
    status: 'blocked',
    reason: 'incompatible-site-boundary',
    notice: { key: 'urlSyncIncompatibleSiteNotice', severity: 'warning' },
  });
});

it('keeps follow-changed-tab behavior for unrelated hosts', () => {
  expect(
    resolveUrlSyncTarget(
      'https://developer.chrome.com/blog/inside-browser-part3?hl=en',
      'https://d2.naver.com/helloworld/6204533#target',
      'follow-changed-tab',
    ),
  ).toEqual({
    status: 'navigate',
    url: 'https://developer.chrome.com/blog/inside-browser-part3#target',
  });
});
```

- [ ] **Step 2: Run focused resolver tests and verify the expected failure**

Run:

```bash
pnpm vitest run src/shared/lib/translated-page-url-utils.test.ts -t "resolveUrlSyncTarget"
```

Expected before implementation: FAIL. The incompatible host tests fail because `keep-each-tabs-website` still returns `status: 'navigate'`.

Expected failure shape:

```text
expected { status: 'navigate', ... } to deeply equal { status: 'blocked', reason: 'incompatible-site-boundary', ... }
```

- [ ] **Step 3: Commit the failing resolver tests**

Run:

```bash
git add src/shared/lib/translated-page-url-utils.test.ts
git commit -m "test: cover url sync safe navigation resolver"
```

## Task 2: Implement Safe Navigation Resolver

**Files:**

- Modify: `src/shared/types/url-sync.ts`
- Modify: `src/shared/lib/translated-page-url-utils.ts`
- Modify: `extension/_locales/{en,ko,ja,fr,es,de,zh_CN,zh_TW,hi}/messages.json`
- Modify: `src/shared/i18n/_locales/{en,ko,ja,fr,es,de,zh_CN,zh_TW,hi}/messages.json`
- Test: `src/shared/lib/translated-page-url-utils.test.ts`

- [ ] **Step 1: Extend URL Sync notice and blocked reason types**

In `src/shared/types/url-sync.ts`, replace the `UrlSyncNoticeKey` union with:

```typescript
export type UrlSyncNoticeKey =
  | 'urlSyncModeResetNotice'
  | 'urlSyncKeepWebsiteBlockedNotice'
  | 'urlSyncIncompatibleSiteNotice'
  | 'urlSyncLanguagePreservationNotice'
  | 'urlSyncSettingSaveFailedNotice'
  | 'urlSyncSettingReadFailedNotice';
```

In the same file, replace `UrlSyncBlockedResult.reason` with:

```typescript
reason: 'invalid-source-url' | 'invalid-target-url' | 'incompatible-site-boundary';
```

In the same file, update `isUrlSyncNoticeKey()` to include the new key:

```typescript
function isUrlSyncNoticeKey(value: unknown): value is UrlSyncNoticeKey {
  return (
    value === 'urlSyncModeResetNotice' ||
    value === 'urlSyncKeepWebsiteBlockedNotice' ||
    value === 'urlSyncIncompatibleSiteNotice' ||
    value === 'urlSyncLanguagePreservationNotice' ||
    value === 'urlSyncSettingSaveFailedNotice' ||
    value === 'urlSyncSettingReadFailedNotice'
  );
}
```

- [ ] **Step 2: Add locale copy to both locale trees**

In each of these files, add a `urlSyncIncompatibleSiteNotice` entry immediately after `urlSyncKeepWebsiteBlockedNotice`:

```text
extension/_locales/en/messages.json
extension/_locales/ko/messages.json
extension/_locales/ja/messages.json
extension/_locales/fr/messages.json
extension/_locales/es/messages.json
extension/_locales/de/messages.json
extension/_locales/zh_CN/messages.json
extension/_locales/zh_TW/messages.json
extension/_locales/hi/messages.json
src/shared/i18n/_locales/en/messages.json
src/shared/i18n/_locales/ko/messages.json
src/shared/i18n/_locales/ja/messages.json
src/shared/i18n/_locales/fr/messages.json
src/shared/i18n/_locales/es/messages.json
src/shared/i18n/_locales/de/messages.json
src/shared/i18n/_locales/zh_CN/messages.json
src/shared/i18n/_locales/zh_TW/messages.json
src/shared/i18n/_locales/hi/messages.json
```

Use these messages:

```text
en: Page changes were not synced for this site combination. Scroll sync is still active.
ko: 이 사이트 조합에서는 페이지 이동을 동기화하지 않았어요. 스크롤 동기화는 계속 유지돼요.
ja: このサイトの組み合わせではページ移動を同期しませんでした。スクロール同期は引き続き有効です。
fr: Les changements de page n'ont pas été synchronisés pour cette combinaison de sites. La synchronisation du défilement reste active.
es: Los cambios de página no se sincronizaron para esta combinación de sitios. La sincronización de desplazamiento sigue activa.
de: Seitenwechsel wurden für diese Website-Kombination nicht synchronisiert. Die Scroll-Synchronisierung bleibt aktiv.
zh_CN: 此网站组合未同步页面跳转。滚动同步仍保持开启。
zh_TW: 此網站組合未同步頁面跳轉。捲動同步仍保持開啟。
hi: इस साइट संयोजन के लिए पेज बदलाव सिंक नहीं किए गए। स्क्रॉल सिंक अभी भी चालू है।
```

The JSON shape is:

```json
"urlSyncIncompatibleSiteNotice": {
  "message": "Page changes were not synced for this site combination. Scroll sync is still active."
}
```

- [ ] **Step 3: Add host-boundary helpers**

In `src/shared/lib/translated-page-url-utils.ts`, add this constant after `TRACKING_QUERY_KEYS`:

```typescript
const ENVIRONMENT_HOST_LABELS = new Set([
  'dev',
  'development',
  'staging',
  'stage',
  'preview',
  'test',
  'testing',
  'qa',
  'beta',
  'canary',
  'sandbox',
]);
```

In the same file, add these helpers after `getHostWithPort()`:

```typescript
function removeLeadingWwwLabel(hostname: string): string {
  return hostname.startsWith('www.') ? hostname.slice(4) : hostname;
}

function removeLeadingEnvironmentLabel(hostname: string): string {
  const labels = hostname.split('.');
  const firstLabel = labels[0];

  if (!firstLabel || !ENVIRONMENT_HOST_LABELS.has(firstLabel) || labels.length < 3) {
    return hostname;
  }

  return labels.slice(1).join('.');
}

function normalizeHostForUrlSyncBoundary(url: URL): string {
  const locale = getLocaleDescriptor(url);
  const hostname = getHostnameWithoutLocale(url.hostname, locale);

  return removeLeadingWwwLabel(hostname);
}

function areUrlSyncSiteBoundariesCompatible(source: URL, target: URL): boolean {
  const sourceHost = normalizeHostForUrlSyncBoundary(source);
  const targetHost = normalizeHostForUrlSyncBoundary(target);

  if (sourceHost === targetHost) {
    return true;
  }

  const sourceWithoutEnvironment = removeLeadingEnvironmentLabel(sourceHost);
  const targetWithoutEnvironment = removeLeadingEnvironmentLabel(targetHost);

  return (
    sourceWithoutEnvironment === targetHost ||
    sourceHost === targetWithoutEnvironment ||
    sourceWithoutEnvironment === targetWithoutEnvironment
  );
}
```

These helpers do not log, store, or expose raw hostnames.

- [ ] **Step 4: Block incompatible target-site URL resolution**

In `src/shared/lib/translated-page-url-utils.ts`, inside `resolveUrlSyncTarget()`, add the compatibility check after both source and target URLs have parsed and before locale descriptors are read:

```typescript
if (!areUrlSyncSiteBoundariesCompatible(source, target)) {
  return {
    status: 'blocked',
    reason: 'incompatible-site-boundary',
    notice: { key: 'urlSyncIncompatibleSiteNotice', severity: 'warning' },
  };
}

const sourceLocale = getLocaleDescriptor(source);
const targetLocale = getLocaleDescriptor(target);
```

The final `keep-each-tabs-website` branch should parse source, parse target, run compatibility, then build the target-site URL only when compatibility passes.

- [ ] **Step 5: Run resolver tests**

Run:

```bash
pnpm vitest run src/shared/lib/translated-page-url-utils.test.ts -t "resolveUrlSyncTarget"
```

Expected: PASS.

- [ ] **Step 6: Run i18n validation**

Run:

```bash
pnpm i18n:validate
```

Expected: PASS with no missing key reports.

- [ ] **Step 7: Commit the resolver implementation**

Run:

```bash
git add src/shared/types/url-sync.ts src/shared/lib/translated-page-url-utils.ts extension/_locales src/shared/i18n/_locales
git commit -m "fix: block unsafe url sync target navigation"
```

## Task 3: Add Content-Script Scenario Tests

**Files:**

- Modify: `src/__tests__/scenarios.test.ts`
- Test: `src/__tests__/scenarios.test.ts`

- [ ] **Step 1: Add incompatible-site scenario tests**

In `src/__tests__/scenarios.test.ts`, inside `describe('Scenario: manual scroll offset adjustment and scroll correctness')`, add these tests after the existing test named `blocked keep-each-tabs-website navigation does not clear target offset`:

```typescript
it('blocked incompatible keep-each-tabs-website navigation does not clear target offset', async () => {
  await startContentSync(206);
  await saveUrlSyncEnabled(true);
  await saveUrlSyncMode('keep-each-tabs-website');
  await saveManualScrollOffset(206, 0.25, 75);
  setWindowUrl('https://d2.naver.com/helloworld/6204533');
  const { notices, cleanup } = collectUrlSyncNotices();

  try {
    await invokeContentMessage('url:sync', {
      url: 'https://developer.chrome.com/blog/inside-browser-part3?hl=en',
      sourceTabId: 999,
    });

    expect(notices).toContainEqual({
      notice: {
        key: 'urlSyncIncompatibleSiteNotice',
        severity: 'warning',
      },
    });
    expect(window.location.href).toBe('https://d2.naver.com/helloworld/6204533');
    await expect(getManualScrollOffset(206)).resolves.toEqual({ ratio: 0.25, pixels: 75 });
  } finally {
    cleanup();
  }
});

it('compatible keep-each-tabs-website navigation still clears target offset', async () => {
  await startContentSync(207);
  await saveUrlSyncEnabled(true);
  await saveUrlSyncMode('keep-each-tabs-website');
  await saveManualScrollOffset(207, -0.2, -70);
  setWindowUrl('https://staging.example.com/ko/home#intro');

  await invokeContentMessage('url:sync', {
    url: 'https://example.com/en/about?tab=pricing',
    sourceTabId: 999,
  });

  expect(window.location.href).toBe('https://staging.example.com/ko/about?tab=pricing#intro');
  await expect(getManualScrollOffset(207)).resolves.toEqual({ ratio: 0, pixels: 0 });
});
```

- [ ] **Step 2: Add a URL Sync behavior scenario for unrelated hosts**

In the same file, inside `describe('Scenario: URL sync toggle behavior')`, add this test after the existing test named `keep-each-tabs-website keeps target website when receiving url:sync`:

```typescript
it('keep-each-tabs-website blocks unrelated site page movement while keeping the current page', async () => {
  await startContentSync(28);
  await saveUrlSyncEnabled(true);
  await saveUrlSyncMode('keep-each-tabs-website');
  setWindowUrl('https://d2.naver.com/helloworld/6204533');
  const { notices, cleanup } = collectUrlSyncNotices();

  try {
    await invokeContentMessage('url:sync', {
      url: 'https://developer.chrome.com/blog/inside-browser-part3?hl=en',
      sourceTabId: 99,
    });

    expect(window.location.href).toBe('https://d2.naver.com/helloworld/6204533');
    expect(notices).toContainEqual({
      notice: {
        key: 'urlSyncIncompatibleSiteNotice',
        severity: 'warning',
      },
    });
  } finally {
    cleanup();
  }
});
```

- [ ] **Step 3: Run focused scenario tests**

Run:

```bash
pnpm vitest run src/__tests__/scenarios.test.ts -t "incompatible|compatible keep-each-tabs-website"
```

Expected: PASS. The first new test proves blocked navigation preserves URL and manual offset. The second new test proves compatible navigation still clears the offset.

- [ ] **Step 4: Commit content-script scenario coverage**

Run:

```bash
git add src/__tests__/scenarios.test.ts
git commit -m "test: cover blocked url sync navigation"
```

## Task 4: Add Extension E2E Coverage

**Files:**

- Modify: `e2e/extension/fixtures.ts`
- Modify: `e2e/extension/url-sync-modes.spec.ts`
- Test: `e2e/extension/url-sync-modes.spec.ts`

- [ ] **Step 1: Extend E2E fixtures with an unrelated host**

In `e2e/extension/fixtures.ts`, update the `ExtensionFixtures.fixtureSites` interface:

```typescript
fixtureSites: {
  primary: FixtureSite;
  comparison: FixtureSite;
  unrelated: FixtureSite;
}
```

Add this interface after `ExtensionFixtures`:

```typescript
interface FixtureSiteOptions {
  listenHost?: string;
  publicHost?: string;
}
```

Replace the `startFixtureSite()` signature and listen/origin code with:

```typescript
async function startFixtureSite(
  name: string,
  options: FixtureSiteOptions = {},
): Promise<FixtureSite> {
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
    const title = titleFor(name, requestUrl.pathname);

    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>${title}</title>
  </head>
  <body>
    <main>
      <h1>${title}</h1>
      <p data-site="${name}" data-path="${requestUrl.pathname}">URL Sync fixture</p>
      <div style="height: 2400px"></div>
    </main>
  </body>
</html>`);
  });

  const listenHost = options.listenHost ?? '127.0.0.1';

  await new Promise<void>((resolveListen) => {
    server.listen(0, listenHost, resolveListen);
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error(`Fixture site ${name} did not expose a TCP address`);
  }

  const publicHost = options.publicHost ?? listenHost;
  const origin = `http://${publicHost}:${address.port}`;

  return {
    name,
    origin,
    url: (path) => `${origin}${path}`,
    close: () => closeServer(server),
  };
}
```

Then replace the `fixtureSites` fixture body with:

```typescript
  fixtureSites: async ({}, run) => {
    const primary = await startFixtureSite('Primary');
    const comparison = await startFixtureSite('Comparison');
    const unrelated = await startFixtureSite('Unrelated', {
      listenHost: '0.0.0.0',
      publicHost: '127.0.0.2',
    });

    await run({ primary, comparison, unrelated });

    await Promise.all([primary.close(), comparison.close(), unrelated.close()]);
  },
```

This gives E2E tests two compatible sites with the same hostname and different ports, plus one unrelated site with a different loopback hostname.

- [ ] **Step 2: Add an E2E helper for no-navigation assertions**

In `e2e/extension/url-sync-modes.spec.ts`, add this helper after `turnUrlSyncOff()`:

```typescript
async function expectNoNavigation(page: Page, initialUrl: string): Promise<void> {
  const didNavigate = await page
    .waitForURL((url) => url.href !== initialUrl, { timeout: 1_000 })
    .then(() => true)
    .catch(() => false);

  expect(didNavigate).toBe(false);
  await expect(page).toHaveURL(initialUrl);
}
```

Then update the existing `URL Sync off prevents target navigation` test to use the helper:

```typescript
await expectNoNavigation(target, targetInitialUrl);
```

- [ ] **Step 3: Add E2E coverage for blocked keep-website navigation and scroll continuity**

In `e2e/extension/url-sync-modes.spec.ts`, inside `test.describe('URL Sync modes')`, add this test after the existing `Keep each tab's website keeps target origin while applying changed page` test:

```typescript
test("Keep each tab's website skips unrelated target navigation and keeps scroll sync active", async ({
  extensionContext,
  fixtureSites,
  openPopup,
}) => {
  const source = await extensionContext.newPage();
  const target = await extensionContext.newPage();
  const targetInitialUrl = fixtureSites.unrelated.url('/ko/home#unrelated-home');

  await source.goto(fixtureSites.primary.url('/en/home?view=compact#primary-home'));
  await target.goto(targetInitialUrl);

  const popup = await openPopup();
  await chooseKeepEachTabsWebsiteMode(popup);
  await selectTabsAndStartSync(popup, 'Primary Home', 'Unrelated Home');

  await source.goto(fixtureSites.primary.url('/en/about?tab=pricing#plans'));

  await expectNoNavigation(target, targetInitialUrl);

  await source.evaluate(() => {
    window.scrollTo(0, 900);
  });

  await expect
    .poll(async () => target.evaluate(() => window.scrollY), { timeout: 3_000 })
    .toBeGreaterThan(100);
  await expect(target).toHaveURL(targetInitialUrl);
});
```

This test first proves no URL navigation happened, then proves scroll sync remains active by checking the target scroll position moves.

- [ ] **Step 4: Add E2E coverage for unchanged follow mode**

In `e2e/extension/url-sync-modes.spec.ts`, add this test after the blocked keep-website E2E test:

```typescript
test('Follow changed tab still moves unrelated target to source website', async ({
  extensionContext,
  fixtureSites,
  openPopup,
}) => {
  const source = await extensionContext.newPage();
  const target = await extensionContext.newPage();

  await source.goto(fixtureSites.primary.url('/en/home?view=compact#primary-home'));
  await target.goto(fixtureSites.unrelated.url('/ko/home?view=compact#unrelated-home'));

  const popup = await openPopup();
  await expectFollowChangedTabMode(popup);
  await selectTabsAndStartSync(popup, 'Primary Home', 'Unrelated Home');

  await source.goto(fixtureSites.primary.url('/en/about?tab=pricing#plans'));

  await expect(target).toHaveURL(fixtureSites.primary.url('/ko/about?tab=pricing#unrelated-home'));
});
```

- [ ] **Step 5: Build the extension for E2E**

Run:

```bash
pnpm build
```

Expected: PASS and `extension/dist` is rebuilt.

- [ ] **Step 6: Run URL Sync E2E tests**

Run:

```bash
pnpm test:e2e:extension
```

Expected: PASS. The blocked keep-website test should leave the unrelated target on its original URL and still observe target scrolling.

- [ ] **Step 7: Commit E2E coverage**

Run:

```bash
git add e2e/extension/fixtures.ts e2e/extension/url-sync-modes.spec.ts
git commit -m "test: cover safe url sync e2e"
```

## Task 5: Privacy, Type, And Full Regression Validation

**Files:**

- Verify: `src/shared/lib/translated-page-url-utils.ts`
- Verify: `src/contentScripts/scroll-sync.ts`
- Verify: `src/shared/types/url-sync.ts`
- Verify: locale JSON files
- Verify: E2E extension tests

- [ ] **Step 1: Search for URL/logging privacy regressions**

Run:

```bash
rg -n "logger|url|Url|URL|tab\\.url|window\\.location\\.href|payload|normalizedUrl|sourceUrl|targetUrl" src/contentScripts src/background src/shared e2e scripts
```

Expected: Review the matches touched by this work. No new logger call may include raw URL, hostname, path, query, hash, title, full payload, or tab object metadata. New helper code may manipulate URLs in memory, but logs and notices must stay generic.

- [ ] **Step 2: Run the privacy logging validator**

Run:

```bash
pnpm privacy:logging
```

Expected: PASS.

- [ ] **Step 3: Run unit and scenario tests**

Run:

```bash
pnpm test -- --run
```

Expected: PASS.

- [ ] **Step 4: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Run i18n validation**

Run:

```bash
pnpm i18n:validate
```

Expected: PASS.

- [ ] **Step 6: Run extension E2E**

Run:

```bash
pnpm build
pnpm test:e2e:extension
```

Expected: PASS.

- [ ] **Step 7: Review final diff**

Run:

```bash
git diff --stat
git diff -- src/shared/lib/translated-page-url-utils.ts src/shared/types/url-sync.ts src/__tests__/scenarios.test.ts e2e/extension/fixtures.ts e2e/extension/url-sync-modes.spec.ts
```

Expected: Diff only implements the safe-navigation guard, notice typing/copy, and tests. It must not change scroll timing constants, background relay contracts, popup layout, auto-sync grouping, or landing files.

- [ ] **Step 8: Commit validation-only adjustments if needed**

If validation required small fixes, commit them with the most specific semantic message:

```bash
git add <changed-files>
git commit -m "fix: stabilize url sync safe navigation"
```

Skip this step if Task 5 made no file changes.

## Self-Review

- Spec coverage: The plan covers the conservative `keep-each-tabs-website` guard, unchanged `follow-changed-tab`, typed blocked reason, dedicated notice copy, privacy constraints, unit tests, content-script scenario tests, E2E tests, and validation commands.
- Placeholder scan: No steps rely on unspecified implementation details; each code-editing step includes concrete TypeScript, JSON message content, or command output expectations.
- Type consistency: The plan uses `urlSyncIncompatibleSiteNotice`, `incompatible-site-boundary`, and `keep-each-tabs-website` consistently across tests, implementation, and locale copy.
