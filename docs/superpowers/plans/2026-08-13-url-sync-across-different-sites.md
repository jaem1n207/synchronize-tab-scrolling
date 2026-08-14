# URL Sync Across Different Sites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explicit persisted URL Sync mode that keeps every target tab on its own HTTP(S)
origin while applying the source page path and existing filtered query policy across unrelated
sites.

**Architecture:** Extend the existing `UrlSyncMode` discriminator and keep
`resolveUrlSyncTarget()` as the only URL-policy boundary. The new mode shares the current
target-origin builder with `keep-each-tabs-website` but bypasses the site-family check only in its
own explicit branch; storage, relay identity, offset-clear ordering, and message payloads remain
unchanged. The shared settings component exposes the mode and a persistent advisory in both popup
and in-page surfaces.

**Tech Stack:** TypeScript, React 19, webextension-polyfill, webext-bridge, Vitest, Testing Library,
Playwright, browser i18n JSON, pnpm, Prettier.

**Design:** `docs/superpowers/specs/2026-08-13-url-sync-across-different-sites-design.md`

## Global Constraints

- Work only in the clean `feat/url-sync-unrelated-origins` worktree based on
  `1b71ecafae31311b792f4b16025951a609531cc8`; do not modify the stale root checkout or its
  `.playwright-mcp/`, `.pnpm-store/`, `.superpowers/`, or `.worktrees/` directories.
- The internal mode value is exactly `sync-page-path-across-sites`.
- The default remains exactly `follow-changed-tab`; no existing stored user is migrated.
- `keep-each-tabs-website` keeps its existing fail-closed site-boundary check.
- The new mode persists in `browser.storage.local` and applies to manual Sync, Quick Sync, active
  manual sessions, and existing auto-sync URL navigation.
- A successful active-session mode change applies on the next page movement.
- Preserve target protocol, hostname, port, locale carrier when detectable, and target hash.
- Never copy the source hash or add `hashchange` handling.
- Reuse the current denylist-based page-identifying query policy. Do not copy a query verbatim or
  add an allowlist editor.
- Canonical English label: `Sync page path across different sites`.
- Canonical English description:
  `Each tab keeps its own site while the page path and relevant query data are applied to the other tabs.`
- Canonical English warning: `⚠ Path and query data may be sent to another site.`
- Canonical Korean label: `서로 다른 사이트 간 페이지 경로 동기화`.
- Canonical Korean description:
  `각 탭의 사이트는 유지하면서 페이지 경로와 관련 쿼리 데이터를 다른 탭에 적용합니다.`
- Canonical Korean warning: `⚠ 경로와 쿼리 데이터가 다른 사이트로 전달될 수 있습니다.`
- Show the persistent warning only for the actual selected cross-site mode, including collapsed and
  URL-Sync-off states. Do not add a confirmation dialog or acknowledgement state.
- Runtime logs and notices must not expose URLs, hostnames, paths, queries, hashes, titles, page
  metadata, or whole payloads.
- Do not change `UrlSyncMessage`, `ProtocolMap`, `revision`, `sessionEpoch`, membership checks,
  sender matching, auto-sync activation identity, or operation-generation guards.
- Do not add dependencies, permissions, manifest entries, or new contextual-hint identifiers.
- Use no TypeScript assertions, `as any`, `@ts-ignore`, or silent fallback to another mode.
- Tasks 4-8 split locale work by key. Each key must land atomically in all nine supported locales
  and both locale trees because the pre-commit hook runs full `pnpm i18n:validate` parity.
- Each locale commit necessarily contains 18 files: they are inseparable mirrors of one runtime
  i18n key, and splitting a key by locale or tree would fail the repository parity gate.
- `extension/_locales/zh` is a legacy directory outside
  `SUPPORTED_EXTENSION_LOCALES`; do not broaden this feature beyond the required nine mirrored
  locale pairs.
- Do not launch Playwright during unit/component RED-GREEN loops. Run one targeted headless URL Sync
  spec only after lower layers are green.
- Do not comment, relabel, rename, close, push, or open a pull request for issue #410 without a
  separate explicit authorization.

---

## File Map

### URL policy and persisted truth

- Modify `src/shared/types/url-sync.ts`
  - add the third `UrlSyncMode`;
  - runtime-validate the new stored value.
- Modify `src/shared/lib/storage.test.ts`
  - prove save, load, and repair accept the new persisted value.
- Modify `src/popup/hooks/use-url-sync.test.ts`
  - prove successful persistence, immediate UI state, broadcast, and external storage updates.
- Modify `src/shared/lib/translated-page-url-utils.ts`
  - bypass the boundary guard only for the explicit new mode;
  - reuse the existing target-origin builder.
- Modify `src/shared/lib/translated-page-url-utils.test.ts`
  - cover unrelated origin shapes, both directions, query filtering, target locale/hash, and invalid
    schemes.
- Modify `src/__tests__/scenarios.test.ts`
  - prove successful navigation clears the offset;
  - prove invalid navigation preserves offset and the active runtime.

### Post-navigation behavior

- Modify `src/contentScripts/lib/contextual-hint-navigation-queue.ts`
  - map both target-origin modes to `keep-website-path-synced`.
- Modify `src/contentScripts/lib/contextual-hint-navigation-queue.test.ts`
  - lock the new mapping without adding a new hint ID.

### Settings UI and browser proof

- Modify `src/shared/components/url-sync-settings.tsx`
  - render the third radio option;
  - render one persistent advisory in expanded/card and collapsed states;
  - associate the advisory with the active control and collapsed summary.
- Modify `src/shared/components/url-sync-settings.test.tsx`
  - cover label, description, example, advisory, accessibility, off state, and failed selection.
- Modify `src/contentScripts/components/sync-control-panel.test.tsx`
  - prove the shared advisory is visible in the actual in-page settings surface.
- Modify `src/contentScripts/panel.test.tsx`
  - prove persisted load, failed local save, and incoming mode-change truthfulness on the panel's
    independent state path.
- Modify `e2e/extension/url-sync-modes.spec.ts`
  - select the explicit mode against `127.0.0.1` and `localhost`;
  - prove target-origin, filtered query, target hash, and continued scroll behavior.

### Localized copy

- Modify paired `messages.json` files under:
  - `extension/_locales/{en,ko,ja,fr,es,de,zh_CN,zh_TW,hi}/messages.json`
  - `src/shared/i18n/_locales/{en,ko,ja,fr,es,de,zh_CN,zh_TW,hi}/messages.json`
- In every pair:
  - correct the conservative-mode example to an actually compatible site family;
  - add `urlSyncModeAcrossDifferentSites`;
  - add `urlSyncModeAcrossDifferentSitesDescription`;
  - add `urlSyncModeAcrossDifferentSitesExample`;
  - add `urlSyncModeAcrossDifferentSitesWarning`.

### Documentation

- Modify `docs/guides/url-sync-safe-navigation.md`
  - document three modes, query disclosure, explicit bypass, and validation cases.
- Modify `README.md` and `README-ko_kr.md`
  - document the user-visible third option and warning.
- Modify `AGENTS.md`
  - update the repository architecture contract from two URL Sync modes to three.
- Modify `src/contentScripts/README.md`
  - document resolver behavior and unchanged receiver ordering.
- Modify `src/shared/lib/README.md`
  - document the shared builder and guard exception.
- Modify `src/shared/types/README.md`
  - update the exact `UrlSyncMode` union.

No new production source file is required.

---

### Task 0: Record The Approved Implementation Plan

**Files:**

- Create: `docs/superpowers/plans/2026-08-13-url-sync-across-different-sites.md`

**Interfaces:**

- Consumes: approved design commit `5579ef0`.
- Produces: the task-by-task execution contract for the remaining work.

- [ ] **Step 1: Verify the plan is the only untracked change**

Run:

```bash
git status --short
```

Expected:

```text
?? docs/superpowers/plans/2026-08-13-url-sync-across-different-sites.md
```

- [ ] **Step 2: Install worktree dependencies without changing the lockfile**

Run:

```bash
pnpm install --offline --frozen-lockfile
```

Expected: PASS and create only worktree-local dependency links. If the offline store is incomplete,
stop and request approval before running the networked equivalent; do not edit `pnpm-lock.yaml`.

- [ ] **Step 3: Validate the plan artifact**

Run:

```bash
pnpm exec prettier --check docs/superpowers/plans/2026-08-13-url-sync-across-different-sites.md
git diff --no-index --stat /dev/null docs/superpowers/plans/2026-08-13-url-sync-across-different-sites.md || test $? -eq 1
```

Expected: Prettier PASS and an intentionally handled exit status `1` from a one-file new-document
diff containing no implementation change.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-08-13-url-sync-across-different-sites.md
git commit -m "docs: plan cross-site URL sync implementation"
```

---

### Task 1: Persist And Propagate The New Mode Discriminator

**Files:**

- Modify: `src/shared/types/url-sync.ts:1-41`
- Test: `src/shared/lib/storage.test.ts:807-905`
- Test: `src/popup/hooks/use-url-sync.test.ts:181-305`

**Interfaces:**

- Consumes:
  - `saveUrlSyncMode(mode: UrlSyncMode): Promise<boolean>`
  - `loadUrlSyncMode(): Promise<UrlSyncMode>`
  - `repairUrlSyncMode(): Promise<UrlSyncModeRepairResult>`
  - `useUrlSync().handleUrlSyncModeChange(mode: UrlSyncMode): Promise<boolean>`
- Produces:
  - `UrlSyncMode = 'follow-changed-tab' | 'keep-each-tabs-website' | 'sync-page-path-across-sites'`
  - `isUrlSyncMode('sync-page-path-across-sites') === true`

- [ ] **Step 1: Add failing persistence tests**

Add these cases to `src/shared/lib/storage.test.ts`:

```typescript
it('saves sync-page-path-across-sites mode', async () => {
  storageSetMock.mockResolvedValue(undefined);

  await expect(saveUrlSyncMode('sync-page-path-across-sites')).resolves.toBe(true);
  expect(storageSetMock).toHaveBeenCalledWith({
    urlSyncMode: 'sync-page-path-across-sites',
  });
});

it('returns stored sync-page-path-across-sites mode', async () => {
  storageGetMock.mockResolvedValue({
    urlSyncMode: 'sync-page-path-across-sites',
  });

  await expect(loadUrlSyncMode()).resolves.toBe('sync-page-path-across-sites');
});

it('accepts sync-page-path-across-sites without repair', async () => {
  storageGetMock.mockResolvedValue({
    urlSyncMode: 'sync-page-path-across-sites',
  });

  await expect(repairUrlSyncMode()).resolves.toEqual({
    status: 'success',
    mode: 'sync-page-path-across-sites',
    repaired: false,
  });
  expect(storageSetMock).not.toHaveBeenCalled();
});
```

Add these cases to `src/popup/hooks/use-url-sync.test.ts`:

```typescript
it('commits cross-site mode only after persistence succeeds', async () => {
  const { result, unmount } = renderHook(() => useUrlSync());
  await waitFor(() => expect(result.current.urlSyncMode).toBe('follow-changed-tab'));

  let saved: boolean | undefined;
  await act(async () => {
    saved = await result.current.handleUrlSyncModeChange('sync-page-path-across-sites');
  });

  expect(saved).toBe(true);
  expect(saveUrlSyncMode).toHaveBeenCalledWith('sync-page-path-across-sites');
  expect(result.current.urlSyncMode).toBe('sync-page-path-across-sites');
  expect(sendMessage).toHaveBeenCalledWith(
    'sync:url-mode-changed',
    { mode: 'sync-page-path-across-sites' },
    'background',
  );

  unmount();
});

it('accepts cross-site mode from external local storage changes', async () => {
  const { result, unmount } = renderHook(() => useUrlSync());
  await waitFor(() => expect(result.current.urlSyncMode).toBe('follow-changed-tab'));

  act(() => {
    triggerStorageChange({
      urlSyncMode: {
        oldValue: 'follow-changed-tab',
        newValue: 'sync-page-path-across-sites',
      },
    });
  });

  expect(result.current.urlSyncMode).toBe('sync-page-path-across-sites');
  expect(result.current.urlSyncNotice).toBeNull();
  expect(sendMessage).not.toHaveBeenCalled();

  unmount();
});
```

Keep the existing failed-save test unchanged; it already proves that the prior mode remains visible
and no broadcast occurs.

- [ ] **Step 2: Run the focused tests to verify RED**

Run:

```bash
pnpm exec vitest run src/shared/lib/storage.test.ts src/popup/hooks/use-url-sync.test.ts
```

Expected: FAIL because load/repair and the hook's storage-change guard reject
`sync-page-path-across-sites` and retain `follow-changed-tab`. A separate `pnpm typecheck` would also
report that the new literal is not assignable to the current two-value `UrlSyncMode`.

- [ ] **Step 3: Extend the union and runtime guard**

Change `src/shared/types/url-sync.ts` to:

```typescript
export type UrlSyncMode =
  | 'follow-changed-tab'
  | 'keep-each-tabs-website'
  | 'sync-page-path-across-sites';

export function isUrlSyncMode(value: unknown): value is UrlSyncMode {
  return (
    value === 'follow-changed-tab' ||
    value === 'keep-each-tabs-website' ||
    value === 'sync-page-path-across-sites'
  );
}
```

Do not change `DEFAULT_URL_SYNC_MODE`, storage keys, repair notices, or message payload types.

- [ ] **Step 4: Run the focused tests to verify GREEN**

Run:

```bash
pnpm exec vitest run src/shared/lib/storage.test.ts src/popup/hooks/use-url-sync.test.ts
```

Expected: PASS. Existing missing/invalid/read-failure/save-failure cases remain green.

- [ ] **Step 5: Commit the persisted storage contract**

```bash
git add src/shared/types/url-sync.ts src/shared/lib/storage.test.ts
git commit -m "feat: persist cross-site URL sync mode"
```

The type/guard change travels with its direct untrusted-storage tests.

- [ ] **Step 6: Commit the hook propagation regression separately**

```bash
git add src/popup/hooks/use-url-sync.test.ts
git commit -m "test: cover cross-site URL sync state"
```

The hook already implements the generic `UrlSyncMode` persistence and broadcast path; this focused
test commit proves the widened discriminator propagates without mixing another production concern.

---

### Task 2: Resolve Unrelated Origins Without Weakening Conservative Mode

**Files:**

- Modify: `src/shared/lib/translated-page-url-utils.ts:616-660`
- Test: `src/shared/lib/translated-page-url-utils.test.ts:305-578`
- Test: `src/__tests__/scenarios.test.ts:1873-1935,2714-2839`

**Interfaces:**

- Consumes:
  - `UrlSyncMode` from Task 1
  - `buildTargetWebsiteUrl(source, sourceLocale, target, targetLocale): string`
  - `areUrlSyncSiteBoundariesCompatible(source, target): boolean`
- Produces:
  - `resolveUrlSyncTarget(sourceUrl, targetUrl, 'sync-page-path-across-sites')`
  - unchanged blocked results for invalid HTTP(S) parsing

- [ ] **Step 1: Add failing resolver cases**

Add the following cases inside `describe('resolveUrlSyncTarget')`:

```typescript
it('keeps conservative mode blocked between localhost and production', () => {
  expect(
    resolveUrlSyncTarget(
      'http://localhost:3000/product2',
      'https://company.cz/product1',
      'keep-each-tabs-website',
    ),
  ).toEqual({
    status: 'blocked',
    reason: 'incompatible-site-boundary',
    notice: { key: 'urlSyncIncompatibleSiteNotice', severity: 'warning' },
  });
});

it.each([
  {
    name: 'localhost to production',
    source: 'http://localhost:3000/product2?view=details&utm_source=mail#source-section',
    target: 'https://company.cz/product1?view=summary#target-section',
    expected: 'https://company.cz/product2?view=details#target-section',
  },
  {
    name: 'production to localhost',
    source: 'https://company.cz/product2?view=details#source-section',
    target: 'http://localhost:3000/product1#target-section',
    expected: 'http://localhost:3000/product2?view=details#target-section',
  },
  {
    name: 'cloud-provider staging to production',
    source: 'https://test1.company.cloudprovider.cz/product2?tab=specs',
    target: 'https://company.cz/product1#production',
    expected: 'https://company.cz/product2?tab=specs#production',
  },
  {
    name: 'market staging to market production',
    source: 'https://test1.ua.company.cloudprovider.cz/product2?tab=specs',
    target: 'https://company.com.ua/product1#market',
    expected: 'https://company.com.ua/product2?tab=specs#market',
  },
  {
    name: 'production to cloud-provider staging',
    source: 'https://company.cz/product2?tab=specs',
    target: 'https://test1.company.cloudprovider.cz/product1#staging',
    expected: 'https://test1.company.cloudprovider.cz/product2?tab=specs#staging',
  },
  {
    name: 'market production to market staging',
    source: 'https://company.com.ua/product2?tab=specs',
    target: 'https://test1.ua.company.cloudprovider.cz/product1#market-staging',
    expected: 'https://test1.ua.company.cloudprovider.cz/product2?tab=specs#market-staging',
  },
])('syncs page movement across unrelated sites: $name', ({ source, target, expected }) => {
  expect(resolveUrlSyncTarget(source, target, 'sync-page-path-across-sites')).toEqual({
    status: 'navigate',
    url: expected,
  });
});

it('preserves target query locale while filtering source noise across sites', () => {
  expect(
    resolveUrlSyncTarget(
      'https://company.cz/product2?lang=en&page=2&utm_campaign=mail#source',
      'https://company.com.ua/product1?lang=uk#target',
      'sync-page-path-across-sites',
    ),
  ).toEqual({
    status: 'navigate',
    url: 'https://company.com.ua/product2?page=2&lang=uk#target',
  });
});

it.each([
  {
    source: 'file:///tmp/product2',
    target: 'https://company.cz/product1',
    reason: 'invalid-source-url',
  },
  {
    source: 'https://company.cz/product2',
    target: 'chrome://extensions',
    reason: 'invalid-target-url',
  },
])('blocks non-HTTP(S) cross-site input', ({ source, target, reason }) => {
  expect(resolveUrlSyncTarget(source, target, 'sync-page-path-across-sites')).toEqual({
    status: 'blocked',
    reason,
    notice: { key: 'urlSyncKeepWebsiteBlockedNotice', severity: 'warning' },
  });
});
```

- [ ] **Step 2: Add failing content-runtime cases**

Add a successful offset-clear case:

```typescript
it('cross-site URL sync clears the target offset only before successful navigation', async () => {
  await saveManualScrollOffset(208, 0.2, 70);
  await startContentSync(208);
  await saveUrlSyncEnabled(true);
  await saveUrlSyncMode('sync-page-path-across-sites');
  setDocumentScrollMetrics(2000, 1000);
  document.documentElement.scrollTop = 0;
  setWindowUrl('https://company.cz/product1#target');

  await invokeContentMessage('url:sync', {
    url: 'http://localhost:3000/product2?view=details&utm_source=mail#source',
    sourceTabId: 999,
    isAutoSync: false,
    sessionEpoch: 1,
  });

  expect(window.location.href).toBe('https://company.cz/product2?view=details#target');

  await invokeContentMessage('scroll:sync', {
    isAutoSync: false,
    scrollTop: 500,
    scrollHeight: 2000,
    clientHeight: 1000,
    sourceTabId: 999,
    sessionEpoch: 1,
    mode: 'ratio',
  });
  await flushAnimationFrame();

  expect(document.documentElement.scrollTop).toBe(500);
  await expect(getManualScrollOffset(208)).resolves.toEqual({ ratio: 0, pixels: 0 });
});
```

Add an invalid-resolution preservation case:

```typescript
it('invalid cross-site URL sync keeps the target offset and runtime active', async () => {
  await saveManualScrollOffset(209, 0.25, 75);
  await startContentSync(209);
  await saveUrlSyncEnabled(true);
  await saveUrlSyncMode('sync-page-path-across-sites');
  setDocumentScrollMetrics(2000, 1000);
  document.documentElement.scrollTop = 0;
  setWindowUrl('https://company.cz/product1#target');

  await invokeContentMessage('url:sync', {
    url: 'file:///tmp/product2',
    sourceTabId: 999,
    isAutoSync: false,
    sessionEpoch: 1,
  });

  expect(window.location.href).toBe('https://company.cz/product1#target');
  await expect(getManualScrollOffset(209)).resolves.toEqual({ ratio: 0.25, pixels: 75 });

  await invokeContentMessage('scroll:sync', {
    isAutoSync: false,
    scrollTop: 500,
    scrollHeight: 2000,
    clientHeight: 1000,
    sourceTabId: 999,
    sessionEpoch: 1,
    mode: 'ratio',
  });
  await flushAnimationFrame();

  expect(document.documentElement.scrollTop).toBe(750);
});

it('applies a successful mode change on the next page movement without restarting', async () => {
  await startContentSync(210);
  await saveUrlSyncEnabled(true);
  await saveUrlSyncMode('keep-each-tabs-website');
  setWindowUrl('https://company.cz/product1#target');

  const firstResponse = await invokeContentMessage('url:sync', {
    url: 'http://localhost:3000/product2?view=details#source',
    sourceTabId: 999,
    isAutoSync: false,
    sessionEpoch: 1,
  });

  expect(firstResponse).toEqual({ success: true });
  expect(window.location.href).toBe('https://company.cz/product1#target');

  await saveUrlSyncMode('sync-page-path-across-sites');

  const secondResponse = await invokeContentMessage('url:sync', {
    url: 'http://localhost:3000/product2?view=details#source',
    sourceTabId: 999,
    isAutoSync: false,
    sessionEpoch: 1,
  });

  expect(secondResponse).toEqual({ success: true });
  expect(window.location.href).toBe('https://company.cz/product2?view=details#target');
  expect(getScrollSyncState()).toEqual(
    expect.objectContaining({
      isActive: true,
      tabId: 210,
      sessionEpoch: 1,
    }),
  );
});
```

Do not change the existing incompatible conservative-mode and stale-identity tests.

- [ ] **Step 3: Run only the new tests to verify RED**

Run:

```bash
pnpm exec vitest run src/shared/lib/translated-page-url-utils.test.ts -t "localhost and production|unrelated sites|target query locale|non-HTTP"
pnpm exec vitest run src/__tests__/scenarios.test.ts -t "cross-site URL sync|mode change on the next page movement"
```

Expected: FAIL because the current target-origin branch applies the compatibility check to both
non-follow modes.

- [ ] **Step 4: Narrow the compatibility condition**

In `resolveUrlSyncTarget()`, keep both parse checks unchanged and replace the unconditional boundary
guard with:

```typescript
if (mode === 'keep-each-tabs-website' && !areUrlSyncSiteBoundariesCompatible(source, target)) {
  return {
    status: 'blocked',
    reason: 'incompatible-site-boundary',
    notice: { key: 'urlSyncIncompatibleSiteNotice', severity: 'warning' },
  };
}
```

Leave the final `getLocaleDescriptor()` and `buildTargetWebsiteUrl()` calls shared by both
target-origin modes. Do not export or weaken `areUrlSyncSiteBoundariesCompatible()`.

- [ ] **Step 5: Verify GREEN and existing resolver/runtime regressions**

Run:

```bash
pnpm exec vitest run src/shared/lib/translated-page-url-utils.test.ts
pnpm exec vitest run src/__tests__/scenarios.test.ts
```

Expected: PASS. Existing conservative blocks, target hash behavior, offset ordering, continued
scroll, sender identity, and session-epoch scenarios remain green.

- [ ] **Step 6: Commit the resolver and pure unit contract**

```bash
git add src/shared/lib/translated-page-url-utils.ts src/shared/lib/translated-page-url-utils.test.ts
git commit -m "feat: sync URL paths across unrelated sites"
```

The policy implementation travels with its direct pure-unit contract.

- [ ] **Step 7: Commit the content-runtime regression separately**

```bash
git add src/__tests__/scenarios.test.ts
git commit -m "test: cover cross-site URL sync runtime"
```

This scenario-only commit independently proves offset transactions, active-session mode changes,
and continued runtime behavior without combining a third file into the resolver commit.

---

### Task 3: Reuse The Existing Target-Origin Contextual Hint

**Files:**

- Modify: `src/contentScripts/lib/contextual-hint-navigation-queue.ts:1-9`
- Test: `src/contentScripts/lib/contextual-hint-navigation-queue.test.ts:1-19`

**Interfaces:**

- Consumes: `UrlSyncMode`
- Produces:
  - `getPendingUrlSyncHintIdForMode('follow-changed-tab') === 'page-change-synced'`
  - both target-origin modes map to `'keep-website-path-synced'`

- [ ] **Step 1: Add the failing mapping assertion**

Extend the existing mapping test:

```typescript
expect(getPendingUrlSyncHintIdForMode('sync-page-path-across-sites')).toBe(
  'keep-website-path-synced',
);
```

- [ ] **Step 2: Run the test to verify RED**

Run:

```bash
pnpm exec vitest run src/contentScripts/lib/contextual-hint-navigation-queue.test.ts
```

Expected: FAIL because the current fallback returns `page-change-synced`.

- [ ] **Step 3: Make follow mode the only source-site mapping**

Change the function to:

```typescript
export function getPendingUrlSyncHintIdForMode(mode: UrlSyncMode): PendingUrlSyncContextualHintId {
  return mode === 'follow-changed-tab' ? 'page-change-synced' : 'keep-website-path-synced';
}
```

Do not add a contextual-hint ID, copy key, registry entry, or dismissal state.

- [ ] **Step 4: Run the test to verify GREEN**

Run:

```bash
pnpm exec vitest run src/contentScripts/lib/contextual-hint-navigation-queue.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/contentScripts/lib/contextual-hint-navigation-queue.ts src/contentScripts/lib/contextual-hint-navigation-queue.test.ts
git commit -m "feat: reuse target-site URL sync hint"
```

---

### Task 4: Correct The Conservative-Mode Example Across All Locales

**Files:**

- Modify:
  - `extension/_locales/{en,ko,ja,fr,es,de,zh_CN,zh_TW,hi}/messages.json`
  - `src/shared/i18n/_locales/{en,ko,ja,fr,es,de,zh_CN,zh_TW,hi}/messages.json`

**Interfaces:**

- Produces truthful `urlSyncModeKeepEachTabsWebsiteExample` copy.
- Keeps every locale's extension/shared pair identical.

- [ ] **Step 1: Replace the exact example in both trees**

Set `urlSyncModeKeepEachTabsWebsiteExample.message` to:

| Locale  | Exact message                                                                                        |
| ------- | ---------------------------------------------------------------------------------------------------- |
| `en`    | `Example: if tab A moves to example.com/pricing, tab B opens staging.example.com/pricing.`           |
| `ko`    | `예: A탭이 example.com/pricing으로 이동하면 B탭은 staging.example.com/pricing을 엽니다.`             |
| `ja`    | `例: タブ A が example.com/pricing に移動すると、タブ B は staging.example.com/pricing を開きます。` |
| `fr`    | `Exemple : si l'onglet A ouvre example.com/pricing, l'onglet B ouvre staging.example.com/pricing.`   |
| `es`    | `Ejemplo: si la pestaña A va a example.com/pricing, la pestaña B abre staging.example.com/pricing.`  |
| `de`    | `Beispiel: Wenn Tab A example.com/pricing öffnet, öffnet Tab B staging.example.com/pricing.`         |
| `zh_CN` | `示例：如果标签页 A 打开 example.com/pricing，标签页 B 会打开 staging.example.com/pricing。`         |
| `zh_TW` | `範例：如果分頁 A 開啟 example.com/pricing，分頁 B 會開啟 staging.example.com/pricing。`             |
| `hi`    | `उदाहरण: अगर टैब A example.com/pricing पर जाता है, तो टैब B staging.example.com/pricing खोलता है।`   |

- [ ] **Step 2: Validate all 18 files**

Run:

```bash
pnpm exec prettier --check \
  extension/_locales/{en,ko,ja,fr,es,de,zh_CN,zh_TW,hi}/messages.json \
  src/shared/i18n/_locales/{en,ko,ja,fr,es,de,zh_CN,zh_TW,hi}/messages.json
pnpm i18n:validate
```

Expected: PASS.

- [ ] **Step 3: Commit the one-key correction**

```bash
git add \
  extension/_locales/{en,ko,ja,fr,es,de,zh_CN,zh_TW,hi}/messages.json \
  src/shared/i18n/_locales/{en,ko,ja,fr,es,de,zh_CN,zh_TW,hi}/messages.json
git commit -m "fix: correct conservative URL sync examples"
```

Justification: all 18 files encode one user-facing example key; splitting the key across languages
or locale trees would violate the required parity contract.

---

### Task 5: Add The Cross-Site Mode Label Across All Locales

**Files:**

- Modify:
  - `extension/_locales/{en,ko,ja,fr,es,de,zh_CN,zh_TW,hi}/messages.json`
  - `src/shared/i18n/_locales/{en,ko,ja,fr,es,de,zh_CN,zh_TW,hi}/messages.json`

**Interfaces:**

- Produces `urlSyncModeAcrossDifferentSites`, consumed by the settings component.

- [ ] **Step 1: Add the exact label to both trees**

Add `urlSyncModeAcrossDifferentSites.message`:

| Locale  | Exact message                                                |
| ------- | ------------------------------------------------------------ |
| `en`    | `Sync page path across different sites`                      |
| `ko`    | `서로 다른 사이트 간 페이지 경로 동기화`                     |
| `ja`    | `異なるサイト間でページパスを同期`                           |
| `fr`    | `Synchroniser le chemin de page entre différents sites`      |
| `es`    | `Sincronizar la ruta de la página entre sitios diferentes`   |
| `de`    | `Seitenpfad zwischen verschiedenen Websites synchronisieren` |
| `zh_CN` | `在不同网站之间同步页面路径`                                 |
| `zh_TW` | `在不同網站之間同步頁面路徑`                                 |
| `hi`    | `अलग-अलग साइटों के बीच पेज पाथ सिंक करें`                    |

- [ ] **Step 2: Validate all 18 files**

```bash
pnpm exec prettier --check \
  extension/_locales/{en,ko,ja,fr,es,de,zh_CN,zh_TW,hi}/messages.json \
  src/shared/i18n/_locales/{en,ko,ja,fr,es,de,zh_CN,zh_TW,hi}/messages.json
pnpm i18n:validate
```

Expected: PASS.

- [ ] **Step 3: Commit the one-key addition**

```bash
git add \
  extension/_locales/{en,ko,ja,fr,es,de,zh_CN,zh_TW,hi}/messages.json \
  src/shared/i18n/_locales/{en,ko,ja,fr,es,de,zh_CN,zh_TW,hi}/messages.json
git commit -m "feat: add cross-site URL sync labels"
```

Justification: the new English source key and all mirrored translations are one parity-atomic
artifact.

---

### Task 6: Add The Cross-Site Mode Description Across All Locales

**Files:**

- Modify:
  - `extension/_locales/{en,ko,ja,fr,es,de,zh_CN,zh_TW,hi}/messages.json`
  - `src/shared/i18n/_locales/{en,ko,ja,fr,es,de,zh_CN,zh_TW,hi}/messages.json`

**Interfaces:**

- Produces `urlSyncModeAcrossDifferentSitesDescription`.

- [ ] **Step 1: Add the exact description to both trees**

Add `urlSyncModeAcrossDifferentSitesDescription.message`:

| Locale  | Exact message                                                                                                                                  |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `en`    | `Each tab keeps its own site while the page path and relevant query data are applied to the other tabs.`                                       |
| `ko`    | `각 탭의 사이트는 유지하면서 페이지 경로와 관련 쿼리 데이터를 다른 탭에 적용합니다.`                                                           |
| `ja`    | `各タブはそれぞれのサイトを維持したまま、ページパスと関連するクエリデータを他のタブに適用します。`                                             |
| `fr`    | `Chaque onglet conserve son propre site tandis que le chemin de page et les données de requête pertinentes sont appliqués aux autres onglets.` |
| `es`    | `Cada pestaña mantiene su propio sitio mientras la ruta de la página y los datos de consulta relevantes se aplican a las demás pestañas.`      |
| `de`    | `Jeder Tab behält seine eigene Website, während der Seitenpfad und relevante Abfragedaten auf die anderen Tabs angewendet werden.`             |
| `zh_CN` | `每个标签页保留各自的网站，同时将页面路径和相关查询数据应用到其他标签页。`                                                                     |
| `zh_TW` | `每個分頁保留各自的網站，同時將頁面路徑和相關查詢資料套用到其他分頁。`                                                                         |
| `hi`    | `हर टैब अपनी साइट पर रहता है, जबकि पेज पाथ और संबंधित क्वेरी डेटा दूसरे टैब पर लागू होते हैं।`                                                 |

- [ ] **Step 2: Validate all 18 files**

```bash
pnpm exec prettier --check \
  extension/_locales/{en,ko,ja,fr,es,de,zh_CN,zh_TW,hi}/messages.json \
  src/shared/i18n/_locales/{en,ko,ja,fr,es,de,zh_CN,zh_TW,hi}/messages.json
pnpm i18n:validate
```

Expected: PASS.

- [ ] **Step 3: Commit the one-key addition**

```bash
git add \
  extension/_locales/{en,ko,ja,fr,es,de,zh_CN,zh_TW,hi}/messages.json \
  src/shared/i18n/_locales/{en,ko,ja,fr,es,de,zh_CN,zh_TW,hi}/messages.json
git commit -m "feat: explain cross-site URL sync behavior"
```

Justification: this one description key must remain complete across all supported languages and both
runtime locale trees.

---

### Task 7: Add The Cross-Site Mode Example Across All Locales

**Files:**

- Modify:
  - `extension/_locales/{en,ko,ja,fr,es,de,zh_CN,zh_TW,hi}/messages.json`
  - `src/shared/i18n/_locales/{en,ko,ja,fr,es,de,zh_CN,zh_TW,hi}/messages.json`

**Interfaces:**

- Produces `urlSyncModeAcrossDifferentSitesExample`.

- [ ] **Step 1: Add the exact example to both trees**

Add `urlSyncModeAcrossDifferentSitesExample.message`:

| Locale  | Exact message                                                                                                         |
| ------- | --------------------------------------------------------------------------------------------------------------------- |
| `en`    | `Example: if localhost:3000 opens /pricing, example.com also opens /pricing without changing sites.`                  |
| `ko`    | `예: localhost:3000에서 /pricing을 열면 example.com도 사이트를 바꾸지 않고 /pricing을 엽니다.`                        |
| `ja`    | `例: localhost:3000 で /pricing を開くと、example.com もサイトを変更せずに /pricing を開きます。`                     |
| `fr`    | `Exemple : si localhost:3000 ouvre /pricing, example.com ouvre aussi /pricing sans changer de site.`                  |
| `es`    | `Ejemplo: si localhost:3000 abre /pricing, example.com también abre /pricing sin cambiar de sitio.`                   |
| `de`    | `Beispiel: Wenn localhost:3000 /pricing öffnet, öffnet example.com ebenfalls /pricing, ohne die Website zu wechseln.` |
| `zh_CN` | `示例：如果 localhost:3000 打开 /pricing，example.com 也会在不更换网站的情况下打开 /pricing。`                        |
| `zh_TW` | `範例：如果 localhost:3000 開啟 /pricing，example.com 也會在不更換網站的情況下開啟 /pricing。`                        |
| `hi`    | `उदाहरण: अगर localhost:3000 /pricing खोलता है, तो example.com भी साइट बदले बिना /pricing खोलता है।`                   |

- [ ] **Step 2: Validate all 18 files**

```bash
pnpm exec prettier --check \
  extension/_locales/{en,ko,ja,fr,es,de,zh_CN,zh_TW,hi}/messages.json \
  src/shared/i18n/_locales/{en,ko,ja,fr,es,de,zh_CN,zh_TW,hi}/messages.json
pnpm i18n:validate
```

Expected: PASS.

- [ ] **Step 3: Commit the one-key addition**

```bash
git add \
  extension/_locales/{en,ko,ja,fr,es,de,zh_CN,zh_TW,hi}/messages.json \
  src/shared/i18n/_locales/{en,ko,ja,fr,es,de,zh_CN,zh_TW,hi}/messages.json
git commit -m "feat: add cross-site URL sync examples"
```

Justification: this one example key is a single product-copy unit whose locale parity cannot be
split safely.

---

### Task 8: Add The Persistent Disclosure Across All Locales

**Files:**

- Modify:
  - `extension/_locales/{en,ko,ja,fr,es,de,zh_CN,zh_TW,hi}/messages.json`
  - `src/shared/i18n/_locales/{en,ko,ja,fr,es,de,zh_CN,zh_TW,hi}/messages.json`

**Interfaces:**

- Produces `urlSyncModeAcrossDifferentSitesWarning`.
- Completes the four new keys and corrected example in all nine mirrored locale pairs.

- [ ] **Step 1: Add the exact warning to both trees**

Add `urlSyncModeAcrossDifferentSitesWarning.message`:

| Locale  | Exact message                                                                 |
| ------- | ----------------------------------------------------------------------------- |
| `en`    | `⚠ Path and query data may be sent to another site.`                          |
| `ko`    | `⚠ 경로와 쿼리 데이터가 다른 사이트로 전달될 수 있습니다.`                    |
| `ja`    | `⚠ パスとクエリデータが別のサイトに送信される場合があります。`                |
| `fr`    | `⚠ Le chemin et les données de requête peuvent être envoyés à un autre site.` |
| `es`    | `⚠ La ruta y los datos de consulta pueden enviarse a otro sitio.`             |
| `de`    | `⚠ Pfad- und Abfragedaten können an eine andere Website gesendet werden.`     |
| `zh_CN` | `⚠ 路径和查询数据可能会发送到其他网站。`                                      |
| `zh_TW` | `⚠ 路徑和查詢資料可能會傳送到其他網站。`                                      |
| `hi`    | `⚠ पाथ और क्वेरी डेटा किसी दूसरी साइट पर भेजे जा सकते हैं।`                   |

- [ ] **Step 2: Validate all locale files and full parity**

Run:

```bash
pnpm exec prettier --check \
  extension/_locales/{en,ko,ja,fr,es,de,zh_CN,zh_TW,hi}/messages.json \
  src/shared/i18n/_locales/{en,ko,ja,fr,es,de,zh_CN,zh_TW,hi}/messages.json
pnpm i18n:validate
```

Expected: PASS for all nine supported locales and both locale trees.

- [ ] **Step 3: Commit the one-key disclosure**

```bash
git add \
  extension/_locales/{en,ko,ja,fr,es,de,zh_CN,zh_TW,hi}/messages.json \
  src/shared/i18n/_locales/{en,ko,ja,fr,es,de,zh_CN,zh_TW,hi}/messages.json
git commit -m "feat: warn about cross-site URL data"
```

Justification: the disclosure is a security-relevant single key that must land atomically across
all supported languages and both runtime locale trees.

---

### Task 9: Render The Explicit Mode, Persistent Advisory, And Browser Behavior

**Files:**

- Modify: `src/shared/components/url-sync-settings.tsx:11-320`
- Test: `src/shared/components/url-sync-settings.test.tsx:8-490`
- Test: `src/contentScripts/components/sync-control-panel.test.tsx:1-170`
- Test: `src/contentScripts/panel.test.tsx:1-240`
- Test: `e2e/extension/url-sync-modes.spec.ts:1-235`

**Interfaces:**

- Consumes:
  - the four new locale keys from Tasks 5-8 and corrected example from Task 4;
  - `UrlSyncMode` from Task 1;
  - resolver behavior from Task 2.
- Produces:
  - third radio option;
  - persistent advisory with ID-based accessible descriptions;
  - truthful persisted and relayed mode state in the in-page settings surface;
  - `chooseCrossSiteMode(popup: Page): Promise<void>` E2E helper.

- [ ] **Step 1: Extend the component-test translation mock**

Add:

```typescript
urlSyncModeAcrossDifferentSites: 'Sync page path across different sites',
urlSyncModeAcrossDifferentSitesDescription:
  'Each tab keeps its own site while the page path and relevant query data are applied to the other tabs.',
urlSyncModeAcrossDifferentSitesExample:
  'Example: if localhost:3000 opens /pricing, example.com also opens /pricing without changing sites.',
urlSyncModeAcrossDifferentSitesWarning:
  '⚠ Path and query data may be sent to another site.',
```

Replace the mocked conservative example with:

```typescript
urlSyncModeKeepEachTabsWebsiteExample:
  'Example: if tab A moves to example.com/pricing, tab B opens staging.example.com/pricing.',
```

Update the existing collapsed assertion from:

```typescript
expect(settings).not.toHaveTextContent('docs.example.com/pricing');
```

to:

```typescript
expect(settings).not.toHaveTextContent('staging.example.com/pricing');
```

Update the existing expanded assertion to expect:

```typescript
'Example: if tab A moves to example.com/pricing, tab B opens staging.example.com/pricing.';
```

- [ ] **Step 2: Add failing component tests**

Add:

```typescript
it('renders the cross-site option and persistent advisory in card layout', () => {
  render(
    <UrlSyncSettings
      enabled={true}
      mode="sync-page-path-across-sites"
      onEnabledChange={vi.fn()}
      onModeChange={vi.fn()}
    />,
  );

  const option = screen.getByRole('radio', {
    name: /Sync page path across different sites/i,
  });
  const warning = screen.getByText(
    '⚠ Path and query data may be sent to another site.',
  );

  expect(option).toBeChecked();
  expect(screen.getByText(/Each tab keeps its own site/)).toBeInTheDocument();
  expect(option).toHaveAccessibleDescription(
    '⚠ Path and query data may be sent to another site.',
  );
  expect(warning).not.toHaveAttribute('aria-live');
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

it('keeps one cross-site advisory visible while collapsed and URL Sync is off', async () => {
  const user = userEvent.setup();

  render(
    <UrlSyncSettings
      enabled={false}
      mode="sync-page-path-across-sites"
      variant="inline-collapsible"
      onEnabledChange={vi.fn()}
      onModeChange={vi.fn()}
    />,
  );

  const disclosure = screen.getByRole('button', {
    name: 'Change page sync mode',
  });

  expect(screen.getAllByText(
    '⚠ Path and query data may be sent to another site.',
  )).toHaveLength(1);
  expect(disclosure).toHaveAccessibleDescription(
    /Off.*Sync page path across different sites.*Path and query data may be sent/i,
  );

  await user.click(disclosure);

  expect(screen.getAllByText(
    '⚠ Path and query data may be sent to another site.',
  )).toHaveLength(1);
  expect(screen.getByRole('radio', {
    name: /Sync page path across different sites/i,
  })).toBeDisabled();
  expect(screen.getByText(/localhost:3000 opens \/pricing/)).toBeInTheDocument();
});

it('does not show the advisory when a cross-site selection fails', async () => {
  const onModeChange = vi.fn().mockResolvedValue(false);
  const user = userEvent.setup();

  render(
    <UrlSyncSettings
      enabled={true}
      mode="follow-changed-tab"
      variant="inline-collapsible"
      onEnabledChange={vi.fn()}
      onModeChange={onModeChange}
    />,
  );

  await user.click(screen.getByRole('button', { name: 'Change page sync mode' }));
  await user.click(screen.getByRole('radio', {
    name: /Sync page path across different sites/i,
  }));

  expect(onModeChange).toHaveBeenCalledWith('sync-page-path-across-sites');
  await waitFor(() => {
    expect(screen.getByRole('button', {
      name: 'Hide page sync modes',
    })).toHaveAttribute('aria-expanded', 'true');
  });
  expect(screen.queryByText(
    '⚠ Path and query data may be sent to another site.',
  )).not.toBeInTheDocument();
});
```

- [ ] **Step 3: Run component tests to verify RED**

Run:

```bash
pnpm exec vitest run src/shared/components/url-sync-settings.test.tsx
```

Expected: FAIL because the third option and advisory do not exist.

- [ ] **Step 4: Extend the mode option contract**

Change the `URL_SYNC_MODE_OPTIONS` declaration key unions to:

```typescript
const URL_SYNC_MODE_OPTIONS: Array<{
  mode: UrlSyncMode;
  labelKey:
    | 'urlSyncModeFollowChangedTab'
    | 'urlSyncModeKeepEachTabsWebsite'
    | 'urlSyncModeAcrossDifferentSites';
  descriptionKey:
    | 'urlSyncModeFollowChangedTabDescription'
    | 'urlSyncModeKeepEachTabsWebsiteDescription'
    | 'urlSyncModeAcrossDifferentSitesDescription';
  exampleKey:
    | 'urlSyncModeFollowChangedTabExample'
    | 'urlSyncModeKeepEachTabsWebsiteExample'
    | 'urlSyncModeAcrossDifferentSitesExample';
}> = [
```

Keep the two existing entries and append:

```typescript
{
  mode: 'sync-page-path-across-sites',
  labelKey: 'urlSyncModeAcrossDifferentSites',
  descriptionKey: 'urlSyncModeAcrossDifferentSitesDescription',
  exampleKey: 'urlSyncModeAcrossDifferentSitesExample',
},
```

Add:

```typescript
const CROSS_SITE_URL_SYNC_MODE: UrlSyncMode = 'sync-page-path-across-sites';
```

Inside `UrlSyncSettings()`, add:

```typescript
const crossSiteWarningId = React.useId();
const showCrossSiteWarning = mode === CROSS_SITE_URL_SYNC_MODE;

const renderCrossSiteWarning = (className?: string) => (
  <p
    className={cn(
      'rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5',
      'text-xs leading-snug text-amber-900',
      className,
    )}
    id={crossSiteWarningId}
  >
    {t('urlSyncModeAcrossDifferentSitesWarning')}
  </p>
);
```

- [ ] **Step 5: Associate and position one advisory**

For each radio input, set:

```typescript
aria-describedby={
  selected && option.mode === CROSS_SITE_URL_SYNC_MODE
    ? crossSiteWarningId
    : undefined
}
```

Immediately after the option label, render:

```typescript
{
  selected && option.mode === CROSS_SITE_URL_SYNC_MODE && renderCrossSiteWarning('mt-1');
}
```

For the inline disclosure button, replace the static `aria-describedby={summaryId}` with:

```typescript
aria-describedby={
  !inlineEditorExpanded && showCrossSiteWarning
    ? `${summaryId} ${crossSiteWarningId}`
    : summaryId
}
```

After the conditional expanded fieldset, render exactly one collapsed advisory:

```typescript
{
  !inlineEditorExpanded && showCrossSiteWarning && renderCrossSiteWarning('mt-2');
}
```

Do not add `role="alert"`, `role="status"`, or `aria-live` to the persistent advisory. Existing
transient notices retain their live-region semantics.

- [ ] **Step 6: Run component tests to verify GREEN**

Run:

```bash
pnpm exec vitest run src/shared/components/url-sync-settings.test.tsx
```

Expected: PASS, including existing pending-operation, disabled, collapse, and notice tests.

- [ ] **Step 7: Commit the shared settings UI and direct component tests**

```bash
git add src/shared/components/url-sync-settings.tsx src/shared/components/url-sync-settings.test.tsx
git commit -m "feat: expose cross-site URL sync mode"
```

The shared component travels with its direct interaction and accessibility contract.

- [ ] **Step 8: Add in-page panel integration coverage**

In `src/contentScripts/components/sync-control-panel.test.tsx`, add:

```typescript
it('shows the persisted cross-site warning in the open in-page settings surface', () => {
  usePanelStateMock.mockReturnValue({
    isOpen: true,
    syncedTabs: [],
    syncStatusError: null,
    autoSyncEnabled: false,
    isAutoSyncActive: false,
    autoSyncGroupCount: 0,
    handleOpenChange: handleOpenChangeMock,
    handleAutoSyncToggle: vi.fn(),
  });

  render(
    <SyncControlPanel
      urlSyncEnabled={false}
      urlSyncMode="sync-page-path-across-sites"
      urlSyncNotice={null}
      onUrlSyncEnabledChange={vi.fn()}
      onUrlSyncModeChange={vi.fn()}
    />,
  );

  expect(screen.getByText('urlSyncModeAcrossDifferentSites')).toBeInTheDocument();
  expect(screen.getAllByText('urlSyncModeAcrossDifferentSitesWarning')).toHaveLength(1);
});
```

In `src/contentScripts/panel.test.tsx`, hoist and reuse typed storage mocks:

```typescript
const {
  messageHandlers,
  onMessageMock,
  sendMessageMock,
  repairUrlSyncModeMock,
  saveUrlSyncModeMock,
} = vi.hoisted(() => ({
  messageHandlers: new Map<string, RegisteredMessageHandler>(),
  onMessageMock: vi.fn(),
  sendMessageMock: vi.fn(),
  repairUrlSyncModeMock: vi.fn(),
  saveUrlSyncModeMock: vi.fn(),
}));
```

Update the storage mock:

```typescript
vi.mock('~/shared/lib/storage', () => ({
  loadUrlSyncEnabled: vi.fn().mockResolvedValue(true),
  repairUrlSyncMode: repairUrlSyncModeMock,
  saveUrlSyncEnabled: vi.fn().mockResolvedValue(true),
  saveUrlSyncMode: saveUrlSyncModeMock,
}));
```

Replace the `SyncControlPanel` stub with one that exposes the URL Sync props and callback:

```typescript
vi.mock('./components', () => ({
  SyncControlPanel: ({
    urlSyncMode,
    urlSyncNotice,
    onUrlSyncModeChange,
  }: {
    urlSyncMode: UrlSyncMode;
    urlSyncNotice: UrlSyncNotice | null;
    onUrlSyncModeChange: (mode: UrlSyncMode) => Promise<boolean>;
  }) => (
    <div>
      <span>Private synchronized title</span>
      <span data-testid="panel-url-sync-mode">{urlSyncMode}</span>
      <span data-testid="panel-url-sync-notice">{urlSyncNotice?.key ?? 'none'}</span>
      <button
        type="button"
        onClick={() => {
          void onUrlSyncModeChange('sync-page-path-across-sites');
        }}
      >
        choose-cross-site
      </button>
    </div>
  ),
}));
```

Import `UrlSyncMode` and `UrlSyncNotice` as types, reset the mocks in `beforeEach`, and add:

```typescript
it('loads the persisted cross-site mode into the in-page panel', async () => {
  repairUrlSyncModeMock.mockResolvedValue({
    status: 'success',
    mode: 'sync-page-path-across-sites',
    repaired: false,
  });
  const ui = await mountPanel();

  expect(await ui.findByTestId('panel-url-sync-mode')).toHaveTextContent(
    'sync-page-path-across-sites',
  );
  expect(ui.getByTestId('panel-url-sync-notice')).toHaveTextContent('none');
});

it('keeps the previous panel mode and exposes a notice when local persistence fails', async () => {
  repairUrlSyncModeMock.mockResolvedValue({
    status: 'success',
    mode: 'follow-changed-tab',
    repaired: false,
  });
  saveUrlSyncModeMock.mockResolvedValue(false);
  const user = userEvent.setup();
  const ui = await mountPanel();

  await user.click(ui.getByRole('button', { name: 'choose-cross-site' }));

  expect(ui.getByTestId('panel-url-sync-mode')).toHaveTextContent('follow-changed-tab');
  expect(await ui.findByTestId('panel-url-sync-notice')).toHaveTextContent(
    'urlSyncSettingSaveFailedNotice',
  );
  expect(sendMessageMock).not.toHaveBeenCalledWith(
    'sync:url-mode-changed',
    expect.anything(),
    'background',
  );
});

it('applies an incoming persisted cross-site mode change to the panel', async () => {
  repairUrlSyncModeMock.mockResolvedValue({
    status: 'success',
    mode: 'follow-changed-tab',
    repaired: false,
  });
  saveUrlSyncModeMock.mockResolvedValue(true);
  const ui = await mountPanel();

  await act(async () => {
    await getRequiredHandler('sync:url-mode-changed')({
      data: { mode: 'sync-page-path-across-sites' },
    });
  });

  expect(saveUrlSyncModeMock).toHaveBeenCalledWith('sync-page-path-across-sites');
  expect(ui.getByTestId('panel-url-sync-mode')).toHaveTextContent('sync-page-path-across-sites');
  expect(ui.getByTestId('panel-url-sync-notice')).toHaveTextContent('none');
});
```

Set default mock behavior in `beforeEach`:

```typescript
repairUrlSyncModeMock.mockResolvedValue({
  status: 'success',
  mode: 'follow-changed-tab',
  repaired: false,
});
saveUrlSyncModeMock.mockResolvedValue(true);
```

- [ ] **Step 9: Run the in-page integration tests**

Run:

```bash
pnpm exec vitest run \
  src/contentScripts/components/sync-control-panel.test.tsx \
  src/contentScripts/panel.test.tsx
```

Expected: PASS without production changes beyond the shared settings component and widened
discriminator. The tests prove the panel's independent persistence/message state path and the real
in-page settings composition.

- [ ] **Step 10: Commit the in-page panel contract**

```bash
git add \
  src/contentScripts/components/sync-control-panel.test.tsx \
  src/contentScripts/panel.test.tsx
git commit -m "test: cover cross-site URL sync panel state"
```

- [ ] **Step 11: Add the targeted E2E selector and acceptance case**

Add constants:

```typescript
const SYNC_PAGE_PATH_ACROSS_SITES_NAME =
  /Sync page path across different sites|서로 다른 사이트 간 페이지 경로 동기화/i;
const CROSS_SITE_WARNING =
  /Path and query data may be sent to another site|경로와 쿼리 데이터가 다른 사이트로 전달될 수 있습니다/i;
```

Add helper:

```typescript
async function chooseCrossSiteMode(popup: Page): Promise<void> {
  await popup.getByRole('button', { name: URL_SYNC_EXPAND_SETTINGS_NAME }).click();
  await popup.locator('label').filter({ hasText: SYNC_PAGE_PATH_ACROSS_SITES_NAME }).click();
  await expect(popup.getByText(SYNC_PAGE_PATH_ACROSS_SITES_NAME).first()).toBeVisible();
  await expect(popup.getByText(CROSS_SITE_WARNING)).toBeVisible();
}
```

Add test:

```typescript
test('explicit cross-site mode keeps unrelated target origin, filtered query, hash, and scroll sync', async ({
  extensionContext,
  fixtureSites,
  openPopup,
}) => {
  const source = await extensionContext.newPage();
  const target = await extensionContext.newPage();

  await source.goto(fixtureSites.primary.url('/en/home#source-home'));
  await target.goto(fixtureSites.unrelated.url('/ko/home?view=compact#target-home'));

  const popup = await openPopup();
  await chooseCrossSiteMode(popup);
  await selectTabsAndStartSync(popup, 'Primary Home', 'Unrelated Home');

  await source.goto(
    fixtureSites.primary.url('/en/about?tab=pricing&utm_source=mail#source-section'),
  );

  const expectedTargetUrl = fixtureSites.unrelated.url('/ko/about?tab=pricing#target-home');
  await expect(target).toHaveURL(expectedTargetUrl);

  await source.evaluate(() => {
    window.scrollTo(0, 900);
  });

  await expect
    .poll(async () => target.evaluate(() => window.scrollY), { timeout: 3_000 })
    .toBeGreaterThan(100);
  await expect(target).toHaveURL(expectedTargetUrl);
});
```

Keep the existing conservative unrelated-origin test unchanged.

- [ ] **Step 12: Build the Chromium artifact**

Run:

```bash
pnpm build
```

Expected: PASS. This is required to produce `build/chromium` for the browser test and also generates
the declarations a fresh worktree may need.

- [ ] **Step 13: Run only the URL Sync E2E spec**

Run:

```bash
EXTENSION_E2E_DIR=build/chromium pnpm exec playwright test e2e/extension/url-sync-modes.spec.ts --config playwright.config.extension.ts
```

Expected: PASS in headless Chromium. Do not run the full Playwright suite or another browser unless
this targeted spec exposes an engine-specific ambiguity.

- [ ] **Step 14: Commit the browser-only acceptance proof**

```bash
git add e2e/extension/url-sync-modes.spec.ts
git commit -m "test: cover cross-site URL sync navigation"
```

The E2E spec is an independently reviewable browser-only proof after the component behavior is
already committed.

---

### Task 10: Update The Safe-Navigation Domain Guide

**Files:**

- Modify: `docs/guides/url-sync-safe-navigation.md:1-90`

**Interfaces:**

- Documents the policy boundary implemented by Tasks 1-3.

- [ ] **Step 1: Change the guide from two modes to three**

Replace the opening mode table with:

```markdown
모드는 세 가지입니다.

| 모드                          | 의미                                                                                                                                           |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `follow-changed-tab`          | 대상 탭이 변경한 탭의 웹사이트로 이동합니다. 대상 URL의 언어 marker와 hash는 가능한 한 보존합니다.                                             |
| `keep-each-tabs-website`      | 대상 탭이 자기 웹사이트에 남은 채 source의 path/query를 적용합니다. 기존 site boundary가 호환될 때만 이동합니다.                               |
| `sync-page-path-across-sites` | 대상 탭의 origin을 유지한 채 source의 path와 필터링된 query를 적용합니다. 사용자가 명시적으로 선택한 경우에만 site boundary 검사를 건너뜁니다. |
```

After the compatibility section, add:

```markdown
## 서로 다른 사이트 간 명시적 동기화

`sync-page-path-across-sites`는 기존 호환성 heuristic을 넓히지 않습니다. 경로와 관련 query
data가 다른 사이트로 전달될 수 있음을 지속적으로 알리는 별도 옵션을 사용자가 명시적으로
선택한 경우에만 `areUrlSyncSiteBoundariesCompatible()` 검사를 생략합니다.

이 모드도 source/target을 HTTP(S)로 파싱하고, target의 protocol/hostname/port/hash와 가능한
locale carrier를 유지합니다. source hash는 복사하지 않습니다. query는 raw 복사가 아니라 기존
identity-query 정책을 재사용하지만, 이 정책은 allowlist가 아니므로 알 수 없는 query 값이 다른
사이트로 전달될 수 있습니다.
```

Extend the checklist with:

```markdown
- [ ] `sync-page-path-across-sites`가 `localhost` ↔ production과 구조가 다른 staging/market origin에서 target origin을 유지한다.
- [ ] 새 모드가 기존 query filtering, target locale, target hash 계약을 유지한다.
- [ ] 새 모드가 invalid/non-HTTP(S) URL에서 offset을 지우거나 navigation하지 않는다.
- [ ] `keep-each-tabs-website`의 기존 incompatible-boundary 차단은 그대로 유지된다.
```

- [ ] **Step 2: Format and inspect**

```bash
pnpm exec prettier --check docs/guides/url-sync-safe-navigation.md
git diff -- docs/guides/url-sync-safe-navigation.md
```

Expected: PASS and no claim that query filtering is a security allowlist.

- [ ] **Step 3: Commit**

```bash
git add docs/guides/url-sync-safe-navigation.md
git commit -m "docs: explain explicit cross-site URL sync"
```

---

### Task 11: Update Public English And Korean Documentation

**Files:**

- Modify: `README.md:182-198`
- Modify: `README-ko_kr.md:176-190`

**Interfaces:**

- Documents the exact user-facing feature and warning in the two public repository READMEs.

- [ ] **Step 1: Add the English third-mode bullet**

After `Keep each tab's website`, add:

```markdown
- **Sync page path across different sites**: each tab keeps its own site while the changed page path
  and relevant filtered query data are applied across unrelated sites, including local development,
  staging, production, and market-specific origins. This is an explicit opt-in mode because path and
  query data may be sent to another site. Each target keeps its own fragment.
```

- [ ] **Step 2: Add the Korean third-mode bullet**

Change `페이지 이동 방식은 두 가지 중에서` to `페이지 이동 방식은 세 가지 중에서`, then add:

```markdown
- **서로 다른 사이트 간 페이지 경로 동기화**: 로컬 개발, staging, production, market별 origin처럼
  서로 관련 없는 사이트에서도 각 탭의 사이트는 유지하면서 변경된 페이지 경로와 기존 정책으로
  필터링된 관련 query data를 적용합니다. 경로와 query data가 다른 사이트로 전달될 수 있으므로
  명시적으로 선택해야 하며, 각 대상 탭의 fragment는 그대로 유지합니다.
```

- [ ] **Step 3: Format and inspect**

```bash
pnpm exec prettier --check README.md README-ko_kr.md
git diff -- README.md README-ko_kr.md
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add README.md README-ko_kr.md
git commit -m "docs: describe cross-site page path sync"
```

---

### Task 12: Update Repository And Content-Runtime Contracts

**Files:**

- Modify: `AGENTS.md:138-145`
- Modify: `src/contentScripts/README.md:82-91`

**Interfaces:**

- Keeps repository guidance and receiver documentation aligned with the implemented third mode.

- [ ] **Step 1: Update the root architecture contract**

Replace the URL Sync settings paragraph with:

```markdown
- **URL Sync settings**: persisted enabled state plus mode in `browser.storage.local`. UI must show
  the actual active mode: `follow-changed-tab`, `keep-each-tabs-website`, or
  `sync-page-path-across-sites`. `follow-changed-tab` follows the source website.
  `keep-each-tabs-website` keeps the target website only after the shared resolver confirms a
  compatible site boundary. `sync-page-path-across-sites` keeps the target origin and bypasses that
  boundary check only after explicit selection with a persistent path/query disclosure.
```

Do not change the P0 rule that specifically protects `keep-each-tabs-website`.

- [ ] **Step 2: Update the content receiver section**

Use:

```markdown
The `url:sync` handler uses `resolveUrlSyncTarget()` from `translated-page-url-utils.ts`.
`follow-changed-tab` may move a target to the source website. `keep-each-tabs-website` navigates
only after the resolver confirms compatible site boundaries. The explicit
`sync-page-path-across-sites` mode reuses the same target-origin builder but skips only that
compatibility check; it still requires valid HTTP(S), preserves the target hash, and uses the
existing filtered query policy.

All modes keep the current runtime/operation identity checks. Blocked or same-URL resolution happens
before the transactional manual-offset clear, and only a committed clear callback navigates.
```

- [ ] **Step 3: Format and inspect**

```bash
pnpm exec prettier --check AGENTS.md src/contentScripts/README.md
git diff -- AGENTS.md src/contentScripts/README.md
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md src/contentScripts/README.md
git commit -m "docs: record cross-site URL sync contract"
```

---

### Task 13: Update Shared Resolver And Type Documentation

**Files:**

- Modify: `src/shared/lib/README.md:33-45`
- Modify: `src/shared/types/README.md:27-38`

**Interfaces:**

- Documents the exact shared policy and type union.

- [ ] **Step 1: Update the shared-library paragraph**

Use:

```markdown
`locale-utils.ts` keeps the legacy locale API, but URL sync locale preservation delegates to
`translated-page-url-utils.ts` so path, query, subdomain locale carriers, and page-identifying query
parameters use one implementation. `keep-each-tabs-website` must fail closed when its site-boundary
check rejects a pair. The explicit `sync-page-path-across-sites` mode reuses only the target-origin
builder after valid HTTP(S) parsing and does not weaken that conservative guard. Neither path may log
or expose raw URLs, hostnames, paths, queries, or hashes.
```

- [ ] **Step 2: Update the exact type entry**

Use:

```markdown
- **`UrlSyncMode`**:
  `'follow-changed-tab' | 'keep-each-tabs-website' | 'sync-page-path-across-sites'` — persisted
  page-change policy for synced tabs
```

Extend `UrlSyncBlockedResult` text to state that invalid URL reasons apply to both target-origin
modes, while `incompatible-site-boundary` remains specific to conservative mode.

- [ ] **Step 3: Format and inspect**

```bash
pnpm exec prettier --check src/shared/lib/README.md src/shared/types/README.md
git diff -- src/shared/lib/README.md src/shared/types/README.md
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/shared/lib/README.md src/shared/types/README.md
git commit -m "docs: update shared URL sync references"
```

---

### Task 14: Final Verification, Privacy Audit, And Diff Review

**Files:**

- Verify only; do not create a catch-all cleanup commit.

**Interfaces:**

- Consumes all previous task outputs.
- Produces the evidence required to claim implementation complete.

- [ ] **Step 1: Verify branch scope and commit count**

Run:

```bash
git status --short --branch
git diff --stat origin/main...HEAD
git diff --name-status origin/main...HEAD
git log --oneline origin/main..HEAD
```

Expected:

- clean worktree;
- no root-checkout untracked directory in the diff;
- no manifest, dependency, message payload, background session-state, or permission change;
- exactly 19 focused commits including the approved design and implementation-plan documentation
  commits.

- [ ] **Step 2: Reuse fresh task-level tests and run the consolidated affected Vitest gate once**

Run:

```bash
pnpm exec vitest run \
  src/shared/lib/translated-page-url-utils.test.ts \
  src/shared/lib/storage.test.ts \
  src/shared/components/url-sync-settings.test.tsx \
  src/popup/hooks/use-url-sync.test.ts \
  src/contentScripts/lib/contextual-hint-navigation-queue.test.ts \
  src/contentScripts/components/sync-control-panel.test.tsx \
  src/contentScripts/panel.test.tsx \
  src/__tests__/scenarios.test.ts
```

Expected: PASS. This is the one broader affected-test gate; do not run the full Vitest repository
suite unless a targeted failure identifies wider blast radius.

- [ ] **Step 3: Validate locale parity and privacy rules**

Run:

```bash
pnpm i18n:validate
pnpm privacy:logging
```

Expected: PASS.

- [ ] **Step 4: Perform the mandated privacy search**

Run:

```bash
rg -n \
  "logger|url|Url|URL|tab\\.url|window\\.location\\.href|payload|normalizedUrl|sourceUrl|targetUrl" \
  src/shared/types/url-sync.ts \
  src/shared/lib/translated-page-url-utils.ts \
  src/shared/lib/storage.test.ts \
  src/popup/hooks/use-url-sync.test.ts \
  src/shared/components/url-sync-settings.tsx \
  src/contentScripts/lib/contextual-hint-navigation-queue.ts \
  src/contentScripts/components/sync-control-panel.test.tsx \
  src/contentScripts/panel.test.tsx \
  src/__tests__/scenarios.test.ts \
  e2e/extension/url-sync-modes.spec.ts
```

Inspect every changed production-code match. Sanitized fixed test fixtures are allowed. Any new
runtime log or notice containing a URL, hostname, path, query, hash, title, metadata object, or whole
payload is a blocking defect.

- [ ] **Step 5: Run type and formatting checks**

Run:

```bash
pnpm typecheck
pnpm exec prettier --check \
  AGENTS.md \
  README.md \
  README-ko_kr.md \
  docs/guides/url-sync-safe-navigation.md \
  docs/superpowers/specs/2026-08-13-url-sync-across-different-sites-design.md \
  docs/superpowers/plans/2026-08-13-url-sync-across-different-sites.md \
  src/shared/types/url-sync.ts \
  src/shared/lib/translated-page-url-utils.ts \
  src/shared/lib/translated-page-url-utils.test.ts \
  src/shared/lib/storage.test.ts \
  src/popup/hooks/use-url-sync.test.ts \
  src/contentScripts/lib/contextual-hint-navigation-queue.ts \
  src/contentScripts/lib/contextual-hint-navigation-queue.test.ts \
  src/contentScripts/components/sync-control-panel.test.tsx \
  src/contentScripts/panel.test.tsx \
  src/shared/components/url-sync-settings.tsx \
  src/shared/components/url-sync-settings.test.tsx \
  src/__tests__/scenarios.test.ts \
  e2e/extension/url-sync-modes.spec.ts \
  src/contentScripts/README.md \
  src/shared/lib/README.md \
  src/shared/types/README.md \
  extension/_locales/{en,ko,ja,fr,es,de,zh_CN,zh_TW,hi}/messages.json \
  src/shared/i18n/_locales/{en,ko,ja,fr,es,de,zh_CN,zh_TW,hi}/messages.json
```

Expected: PASS. Task 9's successful `pnpm build` should already provide generated declarations. If
typecheck reports only known missing generated declarations because the build artifact was removed,
run `pnpm build:web` once and retry `pnpm typecheck`; do not mask another error as that known case.

- [ ] **Step 6: Reuse or refresh the targeted browser evidence**

If no production, locale, or E2E file changed after Task 9, reuse that fresh targeted Playwright
result. Otherwise rebuild and rerun exactly:

```bash
pnpm build
EXTENSION_E2E_DIR=build/chromium pnpm exec playwright test e2e/extension/url-sync-modes.spec.ts --config playwright.config.extension.ts
```

Expected: PASS. Do not run the full Playwright suite or cross-browser matrix without a targeted
failure, explicit request, or release gate.

- [ ] **Step 7: Review the final diff against the exact base**

Run:

```bash
git diff --check origin/main...HEAD
git diff origin/main...HEAD -- \
  src/shared/types/url-sync.ts \
  src/shared/lib/translated-page-url-utils.ts \
  src/shared/components/url-sync-settings.tsx \
  src/contentScripts/lib/contextual-hint-navigation-queue.ts
```

Confirm:

- the boundary condition is scoped only to `keep-each-tabs-website`;
- both target-origin modes use the same builder;
- target hash remains passed to `buildUrlFromParts()`;
- the persistent advisory is selected-mode-driven, not request-driven;
- collapsed and expanded markup never renders two advisory copies;
- no identity, relay, offset transaction, or hot-scroll code changed.

- [ ] **Step 8: Stop before external writes**

Report:

- implementation summary;
- exact test/check commands and outcomes;
- commit list;
- security/privacy evidence;
- docs updated;
- residual risk that unknown query keys remain denylist-filtered rather than allowlisted.

Do not push, open a PR, or change issue #410. Ask for separate authorization for those external
writes.
