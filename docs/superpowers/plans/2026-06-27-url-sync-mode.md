# URL Sync Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explicit URL Sync mode selector so users can choose whether linked tabs follow the changed tab's website or keep each tab on its own website.

**Architecture:** Introduce a small `UrlSyncMode` type and pure URL resolver, then thread the mode through storage, background relay, content script navigation, and shared UI controls. The existing behavior remains the default, while the new mode preserves the target tab's website and never silently falls back to a different mode.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, webext-bridge, webextension-polyfill, UnoCSS/shadcn-style local UI primitives, browser i18n JSON.

---

## File Map

- Create: `src/shared/types/url-sync.ts`
  - Owns `UrlSyncMode`, default mode, validation, notice keys, and URL Sync resolution result types.
- Modify: `src/shared/types/messages.ts`
  - Adds `UrlSyncModeChangedMessage` to the typed bridge protocol.
- Modify: `shim.d.ts`
  - Adds the new protocol entries for webext-bridge.
- Modify: `src/shared/types/index.ts`
  - Re-exports `url-sync.ts`.
- Modify: `src/shared/lib/translated-page-url-utils.ts`
  - Adds `resolveUrlSyncTarget()` and target-website URL builders.
- Modify: `src/shared/lib/translated-page-url-utils.test.ts`
  - Covers both URL Sync modes and blocked target-website failures.
- Modify: `src/shared/lib/storage.ts`
  - Persists and validates `urlSyncMode`.
- Modify: `src/shared/lib/storage.test.ts`
  - Covers mode save/load/default/invalid behavior.
- Modify: `src/shared/lib/index.ts`
  - Re-exports URL Sync mode storage helpers.
- Modify: `src/background/handlers/scroll-sync-handlers.ts`
  - Relays `sync:url-mode-changed`.
- Modify: `src/background/handlers/scroll-sync-handlers.test.ts`
  - Covers mode-change relay semantics.
- Modify: `src/contentScripts/scroll-sync.ts`
  - Resolves navigation with the selected mode, repairs invalid stored modes, emits notices, and clears manual offsets only when navigation changes the page.
- Modify: `src/__tests__/scenarios.test.ts`
  - Covers mode-specific navigation and manual offset behavior.
- Create: `src/shared/components/url-sync-settings.tsx`
  - Shared visible URL Sync settings component for popup and content panel.
- Create: `src/shared/components/url-sync-settings.test.tsx`
  - Covers mode visibility, disabled state, and mode selection.
- Modify: `src/popup/hooks/use-url-sync.ts`
  - Exposes `urlSyncMode`, mode handler, and notice state.
- Modify: `src/popup/components/scroll-sync-popup.tsx`
  - Renders visible URL Sync settings on the popup surface.
- Modify: `src/popup/components/actions-menu.tsx`
  - Removes the duplicate hidden URL Sync command to avoid split-brain UX.
- Modify: `src/contentScripts/panel.tsx`
  - Loads/saves mode, listens for mode/notice events, and passes state to the panel.
- Modify: `src/contentScripts/components/sync-control-panel.tsx`
  - Renders the shared URL Sync settings component in compact mode.
- Modify: locale JSON files under `extension/_locales/*/messages.json` and `src/shared/i18n/_locales/*/messages.json`
  - Adds user-facing labels, descriptions, helper text, and notice messages in every supported locale tree.

## Task 1: Add URL Sync Mode Types

**Files:**

- Create: `src/shared/types/url-sync.ts`
- Modify: `src/shared/types/messages.ts`
- Modify: `shim.d.ts`
- Modify: `src/shared/types/index.ts`

- [ ] **Step 1: Create the URL Sync type boundary**

Create `src/shared/types/url-sync.ts`:

```typescript
export const DEFAULT_URL_SYNC_MODE = 'follow-changed-tab';

export type UrlSyncMode = 'follow-changed-tab' | 'keep-each-tabs-website';

export type UrlSyncNoticeKey =
  | 'urlSyncModeResetNotice'
  | 'urlSyncKeepWebsiteBlockedNotice'
  | 'urlSyncLanguagePreservationNotice';

export type UrlSyncNoticeSeverity = 'info' | 'warning' | 'error';

export interface UrlSyncNotice {
  key: UrlSyncNoticeKey;
  severity: UrlSyncNoticeSeverity;
}

export interface UrlSyncNavigationResult {
  status: 'navigate';
  url: string;
  notice?: UrlSyncNotice;
}

export interface UrlSyncBlockedResult {
  status: 'blocked';
  reason: 'invalid-source-url' | 'invalid-target-url';
  notice: UrlSyncNotice;
}

export type UrlSyncResolutionResult = UrlSyncNavigationResult | UrlSyncBlockedResult;

export function isUrlSyncMode(value: unknown): value is UrlSyncMode {
  return value === 'follow-changed-tab' || value === 'keep-each-tabs-website';
}
```

- [ ] **Step 2: Export the type module**

Add this line to `src/shared/types/index.ts`:

```typescript
export * from './url-sync';
```

- [ ] **Step 3: Add bridge message interfaces**

In `src/shared/types/messages.ts`, add this import near the top:

```typescript
import type { UrlSyncMode, UrlSyncNotice } from './url-sync';
```

Add this interface after `UrlSyncEnabledChangedMessage`:

```typescript
/**
 * Message to synchronize URL sync mode across tabs
 */
export interface UrlSyncModeChangedMessage {
  mode: UrlSyncMode;
  notice?: UrlSyncNotice;
}
```

Add the protocol entry next to `sync:url-enabled-changed`:

```typescript
'sync:url-mode-changed': UrlSyncModeChangedMessage;
```

- [ ] **Step 4: Update `shim.d.ts` protocol augmentation**

Add imports:

```typescript
  UrlSyncModeChangedMessage,
```

Add the protocol entry next to `sync:url-enabled-changed`:

```typescript
    'sync:url-mode-changed': ProtocolWithReturn<UrlSyncModeChangedMessage, unknown>;
```

- [ ] **Step 5: Run typecheck for the new type surface**

Run:

```bash
pnpm typecheck
```

Expected: FAIL only if an import path or protocol type is incorrect. Fix the exact TypeScript error before continuing.

- [ ] **Step 6: Commit**

```bash
git add src/shared/types/url-sync.ts src/shared/types/messages.ts src/shared/types/index.ts shim.d.ts
git commit -m "feat: add URL sync mode types"
```

## Task 2: Add Pure URL Sync Resolution

**Files:**

- Modify: `src/shared/lib/translated-page-url-utils.test.ts`
- Modify: `src/shared/lib/translated-page-url-utils.ts`

- [ ] **Step 1: Write failing resolver tests**

Add this import to `src/shared/lib/translated-page-url-utils.test.ts`:

```typescript
  resolveUrlSyncTarget,
```

Add this `describe` block after the existing `applyTranslatedPageLocaleSync` tests:

```typescript
describe('resolveUrlSyncTarget', () => {
  it('keeps existing behavior for follow-changed-tab mode', () => {
    expect(
      resolveUrlSyncTarget(
        'https://example.com/en/about?tab=pricing#plans',
        'https://staging.example.com/ko/home?view=compact#intro',
        'follow-changed-tab',
      ),
    ).toEqual({
      status: 'navigate',
      url: 'https://example.com/ko/about?tab=pricing#intro',
    });
  });

  it('keeps target website for keep-each-tabs-website mode', () => {
    expect(
      resolveUrlSyncTarget(
        'https://example.com/en/about?tab=pricing#plans',
        'https://staging.example.com/ko/home?view=compact#intro',
        'keep-each-tabs-website',
      ),
    ).toEqual({
      status: 'navigate',
      url: 'https://staging.example.com/ko/about?tab=pricing#intro',
    });
  });

  it('preserves target port in keep-each-tabs-website mode', () => {
    expect(
      resolveUrlSyncTarget(
        'https://example.com/en/about',
        'http://localhost:5173/ko/home',
        'keep-each-tabs-website',
      ),
    ).toEqual({
      status: 'navigate',
      url: 'http://localhost:5173/ko/about',
    });
  });

  it('preserves target query locale in keep-each-tabs-website mode', () => {
    expect(
      resolveUrlSyncTarget(
        'https://example.com/docs/about?page=pricing&lang=en&utm_source=mail',
        'https://staging.example.com/docs/home?lang=ko#intro',
        'keep-each-tabs-website',
      ),
    ).toEqual({
      status: 'navigate',
      url: 'https://staging.example.com/docs/about?page=pricing&lang=ko#intro',
    });
  });

  it('preserves target subdomain locale in keep-each-tabs-website mode', () => {
    expect(
      resolveUrlSyncTarget(
        'https://en.example.com/docs/about?page=pricing',
        'https://ko.staging.example.com/docs/home#intro',
        'keep-each-tabs-website',
      ),
    ).toEqual({
      status: 'navigate',
      url: 'https://ko.staging.example.com/docs/about?page=pricing#intro',
    });
  });

  it('blocks keep-each-tabs-website when the source URL is invalid', () => {
    expect(
      resolveUrlSyncTarget(
        'not-a-url',
        'https://staging.example.com/ko/home',
        'keep-each-tabs-website',
      ),
    ).toEqual({
      status: 'blocked',
      reason: 'invalid-source-url',
      notice: { key: 'urlSyncKeepWebsiteBlockedNotice', severity: 'warning' },
    });
  });

  it('blocks keep-each-tabs-website when the target URL is invalid', () => {
    expect(
      resolveUrlSyncTarget(
        'https://example.com/en/about',
        'chrome://extensions',
        'keep-each-tabs-website',
      ),
    ).toEqual({
      status: 'blocked',
      reason: 'invalid-target-url',
      notice: { key: 'urlSyncKeepWebsiteBlockedNotice', severity: 'warning' },
    });
  });
});
```

- [ ] **Step 2: Run the focused tests to verify failure**

Run:

```bash
pnpm test src/shared/lib/translated-page-url-utils.test.ts -- --run
```

Expected: FAIL with `resolveUrlSyncTarget` missing.

- [ ] **Step 3: Implement the resolver**

Add this import to `src/shared/lib/translated-page-url-utils.ts`:

```typescript
import type { UrlSyncMode, UrlSyncResolutionResult } from '~/shared/types/url-sync';
```

Add these helpers above `buildTranslatedPageSignature()`:

```typescript
function buildPathLocaleUrlForTargetWebsite(
  source: URL,
  sourceLocale: LocaleDescriptor | undefined,
  target: URL,
  targetLocale: LocaleDescriptor,
): string {
  const sourcePathname = removePathLocale(source.pathname, sourceLocale);
  const pathname = insertPathLocale(sourcePathname, targetLocale);
  const search = buildPathOrSubdomainLocaleSearch(source, target);

  return buildUrlFromParts(
    target.protocol,
    target.hostname,
    target.port,
    pathname,
    search,
    target.hash,
  );
}

function buildQueryLocaleUrlForTargetWebsite(
  source: URL,
  sourceLocale: LocaleDescriptor | undefined,
  target: URL,
  targetLocale: LocaleDescriptor,
): string {
  const pathname = removePathLocale(source.pathname, sourceLocale);
  const search = buildTargetQuerySearch(source, targetLocale);

  return buildUrlFromParts(
    target.protocol,
    target.hostname,
    target.port,
    pathname,
    search,
    target.hash,
  );
}

function buildSubdomainLocaleUrlForTargetWebsite(
  source: URL,
  sourceLocale: LocaleDescriptor | undefined,
  target: URL,
  targetLocale: LocaleDescriptor,
): string {
  const pathname = removePathLocale(source.pathname, sourceLocale);
  const search = buildPathOrSubdomainLocaleSearch(source, target);

  return buildUrlFromParts(
    target.protocol,
    target.hostname,
    target.port,
    pathname,
    search,
    target.hash,
  );
}

function buildTargetWebsiteUrl(
  source: URL,
  sourceLocale: LocaleDescriptor | undefined,
  target: URL,
  targetLocale: LocaleDescriptor | undefined,
): string {
  if (!targetLocale) {
    const search = buildPathOrSubdomainLocaleSearch(source, target);
    return buildUrlFromParts(
      target.protocol,
      target.hostname,
      target.port,
      source.pathname,
      search,
      target.hash,
    );
  }

  if (targetLocale.source === 'path') {
    return buildPathLocaleUrlForTargetWebsite(source, sourceLocale, target, targetLocale);
  }

  if (targetLocale.source === 'query') {
    return buildQueryLocaleUrlForTargetWebsite(source, sourceLocale, target, targetLocale);
  }

  return buildSubdomainLocaleUrlForTargetWebsite(source, sourceLocale, target, targetLocale);
}
```

Add this exported function after `applyTranslatedPageLocaleSync()`:

```typescript
export function resolveUrlSyncTarget(
  sourceUrl: string,
  targetUrl: string,
  mode: UrlSyncMode,
): UrlSyncResolutionResult {
  if (mode === 'follow-changed-tab') {
    return {
      status: 'navigate',
      url: applyTranslatedPageLocaleSync(sourceUrl, targetUrl),
    };
  }

  const source = parseHttpUrl(sourceUrl);
  if (!source) {
    return {
      status: 'blocked',
      reason: 'invalid-source-url',
      notice: { key: 'urlSyncKeepWebsiteBlockedNotice', severity: 'warning' },
    };
  }

  const target = parseHttpUrl(targetUrl);
  if (!target) {
    return {
      status: 'blocked',
      reason: 'invalid-target-url',
      notice: { key: 'urlSyncKeepWebsiteBlockedNotice', severity: 'warning' },
    };
  }

  const sourceLocale = getLocaleDescriptor(source);
  const targetLocale = getLocaleDescriptor(target);

  return {
    status: 'navigate',
    url: buildTargetWebsiteUrl(source, sourceLocale, target, targetLocale),
  };
}
```

- [ ] **Step 4: Run the focused tests to verify pass**

Run:

```bash
pnpm test src/shared/lib/translated-page-url-utils.test.ts -- --run
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/translated-page-url-utils.ts src/shared/lib/translated-page-url-utils.test.ts
git commit -m "feat: resolve URL sync modes"
```

## Task 3: Persist URL Sync Mode

**Files:**

- Modify: `src/shared/lib/storage.test.ts`
- Modify: `src/shared/lib/storage.ts`
- Modify: `src/shared/lib/index.ts`

- [ ] **Step 1: Write failing storage tests**

Update the storage imports in `src/shared/lib/storage.test.ts`:

```typescript
  loadUrlSyncMode,
  repairUrlSyncMode,
  saveUrlSyncMode,
```

Add this block after `describe('loadUrlSyncEnabled', ...)`:

```typescript
describe('saveUrlSyncMode', () => {
  it('saves URL sync mode', async () => {
    storageSetMock.mockResolvedValue(undefined);

    await saveUrlSyncMode('keep-each-tabs-website');

    expect(storageSetMock).toHaveBeenCalledWith({ urlSyncMode: 'keep-each-tabs-website' });
  });

  it('logs an error when save fails', async () => {
    const error = new Error('set failed');
    storageSetMock.mockRejectedValue(error);

    await saveUrlSyncMode('follow-changed-tab');

    expect(loggerErrorMock).toHaveBeenCalledWith('Failed to save URL sync mode:', error);
  });
});

describe('loadUrlSyncMode', () => {
  it('returns follow-changed-tab by default when key is missing', async () => {
    storageGetMock.mockResolvedValue({});

    await expect(loadUrlSyncMode()).resolves.toBe('follow-changed-tab');
    expect(storageGetMock).toHaveBeenCalledWith('urlSyncMode');
  });

  it('returns stored keep-each-tabs-website mode', async () => {
    storageGetMock.mockResolvedValue({ urlSyncMode: 'keep-each-tabs-website' });

    await expect(loadUrlSyncMode()).resolves.toBe('keep-each-tabs-website');
  });

  it('returns follow-changed-tab for invalid stored values', async () => {
    storageGetMock.mockResolvedValue({ urlSyncMode: 'unexpected-mode' });

    await expect(loadUrlSyncMode()).resolves.toBe('follow-changed-tab');
    expect(storageSetMock).not.toHaveBeenCalled();
  });
});

describe('repairUrlSyncMode', () => {
  it('does not show a notice for missing mode', async () => {
    storageGetMock.mockResolvedValue({});

    await expect(repairUrlSyncMode()).resolves.toEqual({
      mode: 'follow-changed-tab',
      repaired: false,
    });
    expect(storageSetMock).not.toHaveBeenCalled();
  });

  it('repairs invalid mode and returns reset notice', async () => {
    storageGetMock.mockResolvedValue({ urlSyncMode: 'unexpected-mode' });
    storageSetMock.mockResolvedValue(undefined);

    await expect(repairUrlSyncMode()).resolves.toEqual({
      mode: 'follow-changed-tab',
      repaired: true,
      notice: { key: 'urlSyncModeResetNotice', severity: 'warning' },
    });
    expect(storageSetMock).toHaveBeenCalledWith({ urlSyncMode: 'follow-changed-tab' });
  });
});
```

- [ ] **Step 2: Run focused tests to verify failure**

Run:

```bash
pnpm test src/shared/lib/storage.test.ts -- --run
```

Expected: FAIL with missing exports.

- [ ] **Step 3: Implement storage helpers**

In `src/shared/lib/storage.ts`, add this import:

```typescript
import {
  DEFAULT_URL_SYNC_MODE,
  isUrlSyncMode,
  type UrlSyncMode,
  type UrlSyncNotice,
} from '~/shared/types/url-sync';
```

Add the key:

```typescript
  URL_SYNC_MODE: 'urlSyncMode',
```

Add this interface and functions after `loadUrlSyncEnabled()`:

```typescript
export interface UrlSyncModeRepairResult {
  mode: UrlSyncMode;
  repaired: boolean;
  notice?: UrlSyncNotice;
}

export async function saveUrlSyncMode(mode: UrlSyncMode): Promise<void> {
  try {
    await browser.storage.local.set({
      [STORAGE_KEYS.URL_SYNC_MODE]: mode,
    });
  } catch (error) {
    await logger.error('Failed to save URL sync mode:', error);
  }
}

export async function loadUrlSyncMode(): Promise<UrlSyncMode> {
  try {
    const result = await browser.storage.local.get(STORAGE_KEYS.URL_SYNC_MODE);
    const storedMode = result[STORAGE_KEYS.URL_SYNC_MODE];
    return isUrlSyncMode(storedMode) ? storedMode : DEFAULT_URL_SYNC_MODE;
  } catch (error) {
    await logger.error('Failed to load URL sync mode:', error);
    return DEFAULT_URL_SYNC_MODE;
  }
}

export async function repairUrlSyncMode(): Promise<UrlSyncModeRepairResult> {
  try {
    const result = await browser.storage.local.get(STORAGE_KEYS.URL_SYNC_MODE);
    const storedMode = result[STORAGE_KEYS.URL_SYNC_MODE];

    if (storedMode === undefined) {
      return { mode: DEFAULT_URL_SYNC_MODE, repaired: false };
    }

    if (isUrlSyncMode(storedMode)) {
      return { mode: storedMode, repaired: false };
    }

    await browser.storage.local.set({
      [STORAGE_KEYS.URL_SYNC_MODE]: DEFAULT_URL_SYNC_MODE,
    });

    return {
      mode: DEFAULT_URL_SYNC_MODE,
      repaired: true,
      notice: { key: 'urlSyncModeResetNotice', severity: 'warning' },
    };
  } catch (error) {
    await logger.error('Failed to repair URL sync mode:', error);
    return {
      mode: DEFAULT_URL_SYNC_MODE,
      repaired: true,
      notice: { key: 'urlSyncModeResetNotice', severity: 'warning' },
    };
  }
}
```

- [ ] **Step 4: Re-export storage helpers**

In `src/shared/lib/index.ts`, add:

```typescript
  loadUrlSyncMode,
  repairUrlSyncMode,
  saveUrlSyncMode,
```

- [ ] **Step 5: Run focused tests to verify pass**

Run:

```bash
pnpm test src/shared/lib/storage.test.ts -- --run
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/shared/lib/storage.ts src/shared/lib/storage.test.ts src/shared/lib/index.ts
git commit -m "feat: persist URL sync mode"
```

## Task 4: Relay URL Sync Mode Changes

**Files:**

- Modify: `src/background/handlers/scroll-sync-handlers.test.ts`
- Modify: `src/background/handlers/scroll-sync-handlers.ts`

- [ ] **Step 1: Write failing background relay test**

In `src/background/handlers/scroll-sync-handlers.test.ts`, add the type import:

```typescript
  UrlSyncModeChangedMessage,
```

Add this block after the `sync:url-enabled-changed` tests:

```typescript
describe('sync:url-mode-changed', () => {
  it('relays URL sync mode changes to linked tabs except sender.tabId', async () => {
    const handler = getHandler<UrlSyncModeChangedMessage>('sync:url-mode-changed');
    syncState.linkedTabs = [81, 82, 83];
    const payload: UrlSyncModeChangedMessage = {
      mode: 'keep-each-tabs-website',
    };

    const result = await handler({ data: payload, sender: { tabId: 81 } });

    expect(result).toEqual({ success: true });
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage).toHaveBeenCalledWith('sync:url-mode-changed', payload, {
      context: 'content-script',
      tabId: 82,
    });
    expect(sendMessage).toHaveBeenCalledWith('sync:url-mode-changed', payload, {
      context: 'content-script',
      tabId: 83,
    });
  });

  it('relays popup mode changes to all linked tabs when sender has no tabId', async () => {
    const handler = getHandler<UrlSyncModeChangedMessage>('sync:url-mode-changed');
    syncState.linkedTabs = [91, 92];
    const payload: UrlSyncModeChangedMessage = {
      mode: 'follow-changed-tab',
      notice: { key: 'urlSyncModeResetNotice', severity: 'warning' },
    };

    const result = await handler({ data: payload, sender: {} });

    expect(result).toEqual({ success: true });
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage).toHaveBeenCalledWith('sync:url-mode-changed', payload, {
      context: 'content-script',
      tabId: 91,
    });
    expect(sendMessage).toHaveBeenCalledWith('sync:url-mode-changed', payload, {
      context: 'content-script',
      tabId: 92,
    });
  });
});
```

- [ ] **Step 2: Run focused tests to verify failure**

Run:

```bash
pnpm test src/background/handlers/scroll-sync-handlers.test.ts -- --run
```

Expected: FAIL with no handler for `sync:url-mode-changed`.

- [ ] **Step 3: Implement relay handler**

In `src/background/handlers/scroll-sync-handlers.ts`, add after the `sync:url-enabled-changed` handler:

```typescript
onMessage('sync:url-mode-changed', async ({ data, sender }) => {
  const payload = data;
  const sourceTabId = sender.tabId;
  logger.info('Relaying URL sync mode change', { mode: payload.mode, sourceTabId });

  const targetTabIds =
    sourceTabId === undefined
      ? syncState.linkedTabs
      : syncState.linkedTabs.filter((tabId) => tabId !== sourceTabId);

  const promises = targetTabIds.map((tabId) =>
    sendMessage('sync:url-mode-changed', payload, {
      context: 'content-script',
      tabId,
    }).catch((error) => {
      logger.debug(`Failed to relay URL sync mode to tab ${tabId}`, { error });
    }),
  );

  await Promise.all(promises);
  return { success: true };
});
```

- [ ] **Step 4: Run focused tests to verify pass**

Run:

```bash
pnpm test src/background/handlers/scroll-sync-handlers.test.ts -- --run
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/background/handlers/scroll-sync-handlers.ts src/background/handlers/scroll-sync-handlers.test.ts
git commit -m "feat: relay URL sync mode changes"
```

## Task 5: Apply URL Sync Mode in Content Script Runtime

**Files:**

- Modify: `src/__tests__/scenarios.test.ts`
- Modify: `src/contentScripts/scroll-sync.ts`

- [ ] **Step 1: Update scenario test mocks and imports**

In `src/__tests__/scenarios.test.ts`, remove the mock for `~/shared/lib/locale-utils` after the resolver is imported directly, or replace it with a resolver mock if focused behavior needs isolation. Prefer the real resolver for scenario coverage.

Add imports:

```typescript
  loadUrlSyncMode,
  saveUrlSyncMode,
```

- [ ] **Step 2: Write failing content runtime tests**

Add tests to `describe('Scenario: URL sync toggle behavior', ...)`:

```typescript
it('default URL sync mode is follow-changed-tab', async () => {
  await expect(loadUrlSyncMode()).resolves.toBe('follow-changed-tab');
});

it('keep-each-tabs-website keeps target website when receiving url:sync', async () => {
  await startContentSync(25);
  await saveUrlSyncEnabled(true);
  await saveUrlSyncMode('keep-each-tabs-website');
  setWindowUrl('https://staging.example.com/ko/home#intro');

  await invokeContentMessage('url:sync', {
    url: 'https://example.com/en/about?tab=pricing',
    sourceTabId: 99,
  });

  expect(window.location.href).toBe('https://staging.example.com/ko/about?tab=pricing#intro');
});

it('invalid stored URL sync mode is repaired before navigation', async () => {
  await startContentSync(26);
  await saveUrlSyncEnabled(true);
  mocks.storageData.set('urlSyncMode', 'unexpected-mode');
  setWindowUrl('https://staging.example.com/ko/home#intro');

  await invokeContentMessage('url:sync', {
    url: 'https://example.com/en/about',
    sourceTabId: 99,
  });

  expect(await loadUrlSyncMode()).toBe('follow-changed-tab');
  expect(window.location.href).toBe('https://example.com/ko/about#intro');
});
```

Add tests to `describe('Scenario: manual offset reset when URL changes', ...)`:

```typescript
it('blocked keep-each-tabs-website navigation does not clear target offset', async () => {
  await startContentSync(204);
  await saveUrlSyncEnabled(true);
  await saveUrlSyncMode('keep-each-tabs-website');
  await saveManualScrollOffset(204, 0.3, 90);
  setWindowUrl('https://staging.example.com/ko/home');

  await invokeContentMessage('url:sync', {
    url: 'not-a-url',
    sourceTabId: 999,
  });

  expect(window.location.href).toBe('https://staging.example.com/ko/home');
  await expect(getManualScrollOffset(204)).resolves.toEqual({ ratio: 0.3, pixels: 90 });
});

it('same-url resolution does not clear target offset', async () => {
  await startContentSync(205);
  await saveUrlSyncEnabled(true);
  await saveUrlSyncMode('keep-each-tabs-website');
  await saveManualScrollOffset(205, -0.1, -30);
  setWindowUrl('https://staging.example.com/ko/about');

  await invokeContentMessage('url:sync', {
    url: 'https://example.com/en/about',
    sourceTabId: 999,
  });

  await expect(getManualScrollOffset(205)).resolves.toEqual({ ratio: -0.1, pixels: -30 });
});
```

- [ ] **Step 3: Run scenario tests to verify failure**

Run:

```bash
pnpm test src/__tests__/scenarios.test.ts -- --run
```

Expected: FAIL because `scroll-sync.ts` does not load mode or call the resolver yet.

- [ ] **Step 4: Implement content runtime mode resolution**

In `src/contentScripts/scroll-sync.ts`, change imports:

```typescript
import { resolveUrlSyncTarget } from '~/shared/lib/translated-page-url-utils';
import {
  clearManualScrollOffset,
  getManualScrollOffset,
  loadUrlSyncEnabled,
  repairUrlSyncMode,
} from '~/shared/lib/storage';
import type { UrlSyncNotice } from '~/shared/types/url-sync';
```

Add this helper near the URL monitoring helpers:

```typescript
function emitUrlSyncNotice(notice: UrlSyncNotice) {
  window.dispatchEvent(
    new CustomEvent('scroll-sync-url-sync-notice', {
      detail: notice,
    }),
  );
}
```

Replace the `url:sync` handler body after the enabled check with:

```typescript
const modeRepairResult = await repairUrlSyncMode();
if (modeRepairResult.notice) {
  emitUrlSyncNotice(modeRepairResult.notice);
  sendMessage(
    'sync:url-mode-changed',
    {
      mode: modeRepairResult.mode,
      notice: modeRepairResult.notice,
    },
    'background',
  ).catch((error) => {
    logger.warn('Failed to broadcast repaired URL sync mode', { error });
  });
}

const resolution = resolveUrlSyncTarget(payload.url, window.location.href, modeRepairResult.mode);

if (resolution.status === 'blocked') {
  emitUrlSyncNotice(resolution.notice);
  logger.warn('URL sync navigation blocked', {
    reason: resolution.reason,
    sourceUrl: payload.url,
    targetUrl: window.location.href,
  });
  return;
}

if (resolution.notice) {
  emitUrlSyncNotice(resolution.notice);
}

if (resolution.url === window.location.href) {
  logger.debug('URL sync resolved to current URL; skipping navigation', {
    url: resolution.url,
  });
  return;
}

logger.info('Navigating to synced URL', {
  url: resolution.url,
  sourceTabId: payload.sourceTabId,
  mode: modeRepairResult.mode,
});

await clearManualScrollOffset(syncState.tabId);
cachedManualOffset = { ratio: 0, pixels: 0 };
logger.debug('Cleared manual scroll offset before URL navigation', { tabId: syncState.tabId });

window.location.href = resolution.url;
```

Remove the old `try/catch` fallback to `payload.url` from this handler. The selected mode must not silently become another mode.

- [ ] **Step 5: Run scenario tests to verify pass**

Run:

```bash
pnpm test src/__tests__/scenarios.test.ts -- --run
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/contentScripts/scroll-sync.ts src/__tests__/scenarios.test.ts
git commit -m "feat: apply URL sync mode in content scripts"
```

## Task 6: Build Shared URL Sync Settings UI

**Files:**

- Create: `src/shared/components/url-sync-settings.tsx`
- Create: `src/shared/components/url-sync-settings.test.tsx`

- [ ] **Step 1: Write failing component tests**

Create `src/shared/components/url-sync-settings.test.tsx`:

```typescript
/// <reference types="vitest/globals" />

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { UrlSyncSettings } from './url-sync-settings';

vi.mock('~/shared/i18n', () => ({
  t: (key: string) => {
    const messages: Record<string, string> = {
      urlSyncNavigation: 'URL Sync',
      urlSyncModeDescription: 'Choose how linked tabs follow page changes.',
      urlSyncModeFollowChangedTab: 'Follow changed tab',
      urlSyncModeFollowChangedTabDescription: 'Other tabs move to the website you changed.',
      urlSyncModeKeepEachTabsWebsite: "Keep each tab's website",
      urlSyncModeKeepEachTabsWebsiteDescription:
        'Other tabs stay on their own website and open the matching page.',
      urlSyncModeLanguageHelper: 'Languages are kept when possible.',
      urlSyncModeResetNotice: 'URL Sync mode was reset because the saved setting was not valid.',
    };
    return messages[key] ?? key;
  },
}));

describe('UrlSyncSettings', () => {
  it('shows current mode and helper copy', () => {
    render(
      <UrlSyncSettings
        enabled={true}
        mode="keep-each-tabs-website"
        onEnabledChange={vi.fn()}
        onModeChange={vi.fn()}
      />,
    );

    expect(screen.getByText('URL Sync')).toBeInTheDocument();
    expect(screen.getByText("Keep each tab's website")).toBeInTheDocument();
    expect(screen.getByText('Languages are kept when possible.')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Keep each tab's website/i })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('disables mode buttons when URL Sync is off', () => {
    render(
      <UrlSyncSettings
        enabled={false}
        mode="follow-changed-tab"
        onEnabledChange={vi.fn()}
        onModeChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('radio', { name: /Follow changed tab/i })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /Keep each tab's website/i })).toBeDisabled();
  });

  it('calls onModeChange when selecting a different mode', async () => {
    const onModeChange = vi.fn();
    const user = userEvent.setup();

    render(
      <UrlSyncSettings
        enabled={true}
        mode="follow-changed-tab"
        onEnabledChange={vi.fn()}
        onModeChange={onModeChange}
      />,
    );

    await user.click(screen.getByRole('radio', { name: /Keep each tab's website/i }));

    expect(onModeChange).toHaveBeenCalledWith('keep-each-tabs-website');
  });

  it('renders a notice when provided', () => {
    render(
      <UrlSyncSettings
        enabled={true}
        mode="follow-changed-tab"
        notice={{ key: 'urlSyncModeResetNotice', severity: 'warning' }}
        onEnabledChange={vi.fn()}
        onModeChange={vi.fn()}
      />,
    );

    expect(
      screen.getByText('URL Sync mode was reset because the saved setting was not valid.'),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run component test to verify failure**

Run:

```bash
pnpm test src/shared/components/url-sync-settings.test.tsx -- --run
```

Expected: FAIL because `url-sync-settings.tsx` does not exist.

- [ ] **Step 3: Implement shared settings component**

Create `src/shared/components/url-sync-settings.tsx`:

```tsx
import { Button } from '~/shared/components/ui/button';
import { Switch } from '~/shared/components/ui/switch';
import { t } from '~/shared/i18n';
import { cn } from '~/shared/lib/utils';
import type { UrlSyncMode, UrlSyncNotice } from '~/shared/types/url-sync';

interface UrlSyncSettingsProps {
  enabled: boolean;
  mode: UrlSyncMode;
  notice?: UrlSyncNotice | null;
  compact?: boolean;
  onEnabledChange: (enabled: boolean) => void | Promise<void>;
  onModeChange: (mode: UrlSyncMode) => void | Promise<void>;
}

const URL_SYNC_MODE_OPTIONS: Array<{
  mode: UrlSyncMode;
  labelKey: 'urlSyncModeFollowChangedTab' | 'urlSyncModeKeepEachTabsWebsite';
  descriptionKey:
    | 'urlSyncModeFollowChangedTabDescription'
    | 'urlSyncModeKeepEachTabsWebsiteDescription';
}> = [
  {
    mode: 'follow-changed-tab',
    labelKey: 'urlSyncModeFollowChangedTab',
    descriptionKey: 'urlSyncModeFollowChangedTabDescription',
  },
  {
    mode: 'keep-each-tabs-website',
    labelKey: 'urlSyncModeKeepEachTabsWebsite',
    descriptionKey: 'urlSyncModeKeepEachTabsWebsiteDescription',
  },
];

export function UrlSyncSettings({
  enabled,
  mode,
  notice,
  compact = false,
  onEnabledChange,
  onModeChange,
}: UrlSyncSettingsProps) {
  return (
    <section
      aria-labelledby="url-sync-settings-heading"
      className={cn('space-y-2', compact ? 'text-sm' : 'rounded-lg border bg-card/60 p-3')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="url-sync-settings-heading" className="text-sm font-medium">
            {t('urlSyncNavigation')}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('urlSyncModeDescription')}</p>
        </div>
        <Switch checked={enabled} onCheckedChange={(checked) => void onEnabledChange(checked)} />
      </div>

      <div
        aria-label={t('urlSyncNavigation')}
        aria-disabled={!enabled}
        className="grid grid-cols-1 gap-1.5"
        role="radiogroup"
      >
        {URL_SYNC_MODE_OPTIONS.map((option) => {
          const selected = option.mode === mode;
          return (
            <Button
              key={option.mode}
              aria-checked={selected}
              className={cn(
                'h-auto justify-start rounded-md px-3 py-2 text-left',
                'whitespace-normal leading-snug',
                selected && 'border-primary bg-primary/10 text-primary',
              )}
              disabled={!enabled}
              role="radio"
              type="button"
              variant={selected ? 'outline' : 'ghost'}
              onClick={() => {
                if (option.mode !== mode) {
                  void onModeChange(option.mode);
                }
              }}
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-medium">{t(option.labelKey)}</span>
                <span className="text-xs text-muted-foreground">{t(option.descriptionKey)}</span>
              </span>
            </Button>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">{t('urlSyncModeLanguageHelper')}</p>

      {notice && (
        <p
          className={cn(
            'rounded-md border px-2 py-1.5 text-xs',
            notice.severity === 'error' && 'border-red-200 bg-red-50 text-red-800',
            notice.severity === 'warning' && 'border-yellow-200 bg-yellow-50 text-yellow-800',
            notice.severity === 'info' && 'border-blue-200 bg-blue-50 text-blue-800',
          )}
          role="status"
        >
          {t(notice.key)}
        </p>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run component test to verify pass**

Run:

```bash
pnpm test src/shared/components/url-sync-settings.test.tsx -- --run
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/components/url-sync-settings.tsx src/shared/components/url-sync-settings.test.tsx
git commit -m "feat: add URL sync settings control"
```

## Task 7: Wire Popup and Content Panel UI

**Files:**

- Modify: `src/popup/hooks/use-url-sync.ts`
- Modify: `src/popup/components/scroll-sync-popup.tsx`
- Modify: `src/popup/components/actions-menu.tsx`
- Modify: `src/contentScripts/panel.tsx`
- Modify: `src/contentScripts/components/sync-control-panel.tsx`

- [ ] **Step 1: Update popup URL Sync hook**

Replace `UseUrlSyncReturn` in `src/popup/hooks/use-url-sync.ts` with:

```typescript
interface UseUrlSyncReturn {
  urlSyncEnabled: boolean;
  urlSyncMode: UrlSyncMode;
  urlSyncNotice: UrlSyncNotice | null;
  handleUrlSyncChange: (enabled: boolean) => Promise<void>;
  handleUrlSyncModeChange: (mode: UrlSyncMode) => Promise<void>;
  dismissUrlSyncNotice: () => void;
}
```

Update imports:

```typescript
import {
  loadUrlSyncEnabled,
  repairUrlSyncMode,
  saveUrlSyncEnabled,
  saveUrlSyncMode,
} from '~/shared/lib/storage';
import {
  DEFAULT_URL_SYNC_MODE,
  type UrlSyncMode,
  type UrlSyncNotice,
} from '~/shared/types/url-sync';
```

Add state and loading effect:

```typescript
const [urlSyncMode, setUrlSyncMode] = useState<UrlSyncMode>(DEFAULT_URL_SYNC_MODE);
const [urlSyncNotice, setUrlSyncNotice] = useState<UrlSyncNotice | null>(null);

useEffect(() => {
  repairUrlSyncMode()
    .then((result) => {
      setUrlSyncMode(result.mode);
      if (result.notice) {
        setUrlSyncNotice(result.notice);
      }
    })
    .catch(() => {
      setUrlSyncMode(DEFAULT_URL_SYNC_MODE);
    });
}, []);
```

Add handler:

```typescript
const handleUrlSyncModeChange = useCallback(async (mode: UrlSyncMode) => {
  setUrlSyncMode(mode);
  setUrlSyncNotice(null);
  await saveUrlSyncMode(mode);
  sendMessage('sync:url-mode-changed', { mode }, 'background').catch((err) => {
    logger.warn('[useUrlSync] Failed to notify background of URL sync mode change:', err);
  });
}, []);

const dismissUrlSyncNotice = useCallback(() => {
  setUrlSyncNotice(null);
}, []);
```

Return the new values:

```typescript
    urlSyncMode,
    urlSyncNotice,
    handleUrlSyncModeChange,
    dismissUrlSyncNotice,
```

- [ ] **Step 2: Render URL Sync settings on the popup surface**

In `src/popup/components/scroll-sync-popup.tsx`, import:

```typescript
import { UrlSyncSettings } from '~/shared/components/url-sync-settings';
```

Update hook destructuring:

```typescript
const { urlSyncEnabled, urlSyncMode, urlSyncNotice, handleUrlSyncChange, handleUrlSyncModeChange } =
  useUrlSync();
```

Add this block above the footer control row:

```tsx
<UrlSyncSettings
  enabled={urlSyncEnabled}
  mode={urlSyncMode}
  notice={urlSyncNotice}
  onEnabledChange={handleUrlSyncChange}
  onModeChange={handleUrlSyncModeChange}
/>
```

Pass no URL Sync props into `ActionsMenu` after removing its duplicate command.

- [ ] **Step 3: Remove duplicate URL Sync command from ActionsMenu**

In `src/popup/components/actions-menu.tsx`, remove:

```typescript
import IconGlobe from '~icons/lucide/globe';
```

Remove props:

```typescript
  urlSyncEnabled: boolean;
  onUrlSyncChange: (enabled: boolean) => void;
```

Remove destructured values:

```typescript
  urlSyncEnabled,
  onUrlSyncChange,
```

Remove the `CommandItem` that renders `t('urlSyncNavigation')`.

- [ ] **Step 4: Wire content panel state and notices**

In `src/contentScripts/panel.tsx`, update imports:

```typescript
import {
  loadUrlSyncEnabled,
  repairUrlSyncMode,
  saveUrlSyncEnabled,
  saveUrlSyncMode,
} from '~/shared/lib/storage';
import {
  DEFAULT_URL_SYNC_MODE,
  type UrlSyncMode,
  type UrlSyncNotice,
} from '~/shared/types/url-sync';
```

Add state:

```typescript
const [urlSyncMode, setUrlSyncMode] = useState<UrlSyncMode>(DEFAULT_URL_SYNC_MODE);
const [urlSyncNotice, setUrlSyncNotice] = useState<UrlSyncNotice | null>(null);
```

Add mode loading in the existing URL Sync effect:

```typescript
repairUrlSyncMode()
  .then((result) => {
    setUrlSyncMode(result.mode);
    if (result.notice) {
      setUrlSyncNotice(result.notice);
    }
  })
  .catch(() => {
    setUrlSyncMode(DEFAULT_URL_SYNC_MODE);
  });
```

Add message listener:

```typescript
const unsubscribeMode = onMessage('sync:url-mode-changed', ({ data }) => {
  setUrlSyncMode(data.mode);
  saveUrlSyncMode(data.mode);
  setUrlSyncNotice(data.notice ?? null);
});
```

Add custom event listener:

```typescript
const handleUrlSyncNotice = (event: Event) => {
  const customEvent = event as CustomEvent<UrlSyncNotice>;
  setUrlSyncNotice(customEvent.detail);
};

window.addEventListener('scroll-sync-url-sync-notice', handleUrlSyncNotice);
```

Update cleanup:

```typescript
unsubscribeMode();
window.removeEventListener('scroll-sync-url-sync-notice', handleUrlSyncNotice);
```

Add handler:

```typescript
const handleUrlSyncModeChange = useCallback(async (mode: UrlSyncMode) => {
  setUrlSyncMode(mode);
  setUrlSyncNotice(null);
  await saveUrlSyncMode(mode);

  try {
    await sendMessage('sync:url-mode-changed', { mode }, 'background');
  } catch (error) {
    await logger.error('Failed to broadcast URL sync mode change', error);
  }
}, []);
```

Pass new props to `SyncControlPanel`:

```tsx
urlSyncMode = { urlSyncMode };
urlSyncNotice = { urlSyncNotice };
onModeChange = { handleUrlSyncModeChange };
```

- [ ] **Step 5: Render compact settings in content panel**

In `src/contentScripts/components/sync-control-panel.tsx`, import:

```typescript
import { UrlSyncSettings } from '~/shared/components/url-sync-settings';
import type { UrlSyncMode, UrlSyncNotice } from '~/shared/types/url-sync';
```

Update props:

```typescript
  urlSyncMode: UrlSyncMode;
  urlSyncNotice?: UrlSyncNotice | null;
  onModeChange: (mode: UrlSyncMode) => void | Promise<void>;
```

Replace the existing URL Sync toggle block with:

```tsx
<UrlSyncSettings
  compact
  enabled={urlSyncEnabled}
  mode={urlSyncMode}
  notice={urlSyncNotice}
  onEnabledChange={onToggle}
  onModeChange={onModeChange}
/>
```

- [ ] **Step 6: Run focused UI tests**

Run:

```bash
pnpm test src/shared/components/url-sync-settings.test.tsx -- --run
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/popup/hooks/use-url-sync.ts src/popup/components/scroll-sync-popup.tsx src/popup/components/actions-menu.tsx src/contentScripts/panel.tsx src/contentScripts/components/sync-control-panel.tsx
git commit -m "feat: show URL sync mode controls"
```

## Task 8: Add i18n Copy

**Files:**

- Modify: `src/shared/i18n/_locales/*/messages.json`
- Modify: `extension/_locales/*/messages.json`

- [ ] **Step 1: Add English source keys**

Add these keys after `urlSyncNavigation` in `src/shared/i18n/_locales/en/messages.json` and `extension/_locales/en/messages.json`:

```json
  "urlSyncModeDescription": {
    "message": "Choose how linked tabs follow page changes."
  },
  "urlSyncModeFollowChangedTab": {
    "message": "Follow changed tab"
  },
  "urlSyncModeFollowChangedTabDescription": {
    "message": "Other tabs move to the website you changed."
  },
  "urlSyncModeKeepEachTabsWebsite": {
    "message": "Keep each tab's website"
  },
  "urlSyncModeKeepEachTabsWebsiteDescription": {
    "message": "Other tabs stay on their own website and open the matching page."
  },
  "urlSyncModeLanguageHelper": {
    "message": "Languages are kept when possible."
  },
  "urlSyncModeResetNotice": {
    "message": "URL Sync mode was reset because the saved setting was not valid."
  },
  "urlSyncKeepWebsiteBlockedNotice": {
    "message": "Could not keep this tab on its current website for that page change. No navigation was synced."
  },
  "urlSyncLanguagePreservationNotice": {
    "message": "Language could not be preserved for this page change."
  },
```

- [ ] **Step 2: Add Korean keys**

Add these keys to `src/shared/i18n/_locales/ko/messages.json` and `extension/_locales/ko/messages.json`:

```json
  "urlSyncModeDescription": {
    "message": "연결된 탭이 페이지 변경을 따라가는 방식을 선택하세요."
  },
  "urlSyncModeFollowChangedTab": {
    "message": "변경한 탭 따라가기"
  },
  "urlSyncModeFollowChangedTabDescription": {
    "message": "다른 탭도 변경한 탭의 웹사이트로 이동합니다."
  },
  "urlSyncModeKeepEachTabsWebsite": {
    "message": "각 탭의 웹사이트 유지"
  },
  "urlSyncModeKeepEachTabsWebsiteDescription": {
    "message": "다른 탭은 자기 웹사이트에 남아 같은 페이지를 엽니다."
  },
  "urlSyncModeLanguageHelper": {
    "message": "가능한 경우 언어 설정은 유지됩니다."
  },
  "urlSyncModeResetNotice": {
    "message": "저장된 설정이 올바르지 않아 URL Sync 모드가 초기화되었습니다."
  },
  "urlSyncKeepWebsiteBlockedNotice": {
    "message": "이 페이지 변경에서는 현재 웹사이트를 유지할 수 없어 URL 이동을 동기화하지 않았습니다."
  },
  "urlSyncLanguagePreservationNotice": {
    "message": "이 페이지 변경에서는 언어 설정을 유지할 수 없었습니다."
  },
```

- [ ] **Step 3: Add complete translations for remaining locales**

Add these exact Japanese keys to `src/shared/i18n/_locales/ja/messages.json` and `extension/_locales/ja/messages.json`:

```json
  "urlSyncModeDescription": {
    "message": "リンクしたタブがページ変更にどう追従するかを選択します。"
  },
  "urlSyncModeFollowChangedTab": {
    "message": "変更したタブに従う"
  },
  "urlSyncModeFollowChangedTabDescription": {
    "message": "他のタブも変更したタブのウェブサイトへ移動します。"
  },
  "urlSyncModeKeepEachTabsWebsite": {
    "message": "各タブのウェブサイトを維持"
  },
  "urlSyncModeKeepEachTabsWebsiteDescription": {
    "message": "他のタブはそれぞれのウェブサイトに残り、対応するページを開きます。"
  },
  "urlSyncModeLanguageHelper": {
    "message": "可能な場合は言語設定を維持します。"
  },
  "urlSyncModeResetNotice": {
    "message": "保存された設定が有効ではなかったため、URL Sync モードをリセットしました。"
  },
  "urlSyncKeepWebsiteBlockedNotice": {
    "message": "このページ変更では現在のウェブサイトを維持できなかったため、URL 移動は同期されませんでした。"
  },
  "urlSyncLanguagePreservationNotice": {
    "message": "このページ変更では言語設定を維持できませんでした。"
  },
```

Add these exact French keys to `src/shared/i18n/_locales/fr/messages.json` and `extension/_locales/fr/messages.json`:

```json
  "urlSyncModeDescription": {
    "message": "Choisissez comment les onglets liés suivent les changements de page."
  },
  "urlSyncModeFollowChangedTab": {
    "message": "Suivre l'onglet modifié"
  },
  "urlSyncModeFollowChangedTabDescription": {
    "message": "Les autres onglets ouvrent le site web que vous avez modifié."
  },
  "urlSyncModeKeepEachTabsWebsite": {
    "message": "Garder le site de chaque onglet"
  },
  "urlSyncModeKeepEachTabsWebsiteDescription": {
    "message": "Les autres onglets restent sur leur propre site web et ouvrent la page correspondante."
  },
  "urlSyncModeLanguageHelper": {
    "message": "Les langues sont conservées lorsque c'est possible."
  },
  "urlSyncModeResetNotice": {
    "message": "Le mode URL Sync a été réinitialisé, car le réglage enregistré n'était pas valide."
  },
  "urlSyncKeepWebsiteBlockedNotice": {
    "message": "Impossible de garder cet onglet sur son site actuel pour ce changement de page. Aucune navigation n'a été synchronisée."
  },
  "urlSyncLanguagePreservationNotice": {
    "message": "La langue n'a pas pu être conservée pour ce changement de page."
  },
```

Add these exact Spanish keys to `src/shared/i18n/_locales/es/messages.json` and `extension/_locales/es/messages.json`:

```json
  "urlSyncModeDescription": {
    "message": "Elige cómo las pestañas vinculadas siguen los cambios de página."
  },
  "urlSyncModeFollowChangedTab": {
    "message": "Seguir la pestaña cambiada"
  },
  "urlSyncModeFollowChangedTabDescription": {
    "message": "Las demás pestañas se mueven al sitio web que cambiaste."
  },
  "urlSyncModeKeepEachTabsWebsite": {
    "message": "Mantener el sitio de cada pestaña"
  },
  "urlSyncModeKeepEachTabsWebsiteDescription": {
    "message": "Las demás pestañas permanecen en su propio sitio web y abren la página correspondiente."
  },
  "urlSyncModeLanguageHelper": {
    "message": "Los idiomas se mantienen cuando es posible."
  },
  "urlSyncModeResetNotice": {
    "message": "El modo URL Sync se restableció porque la configuración guardada no era válida."
  },
  "urlSyncKeepWebsiteBlockedNotice": {
    "message": "No se pudo mantener esta pestaña en su sitio web actual para este cambio de página. No se sincronizó ninguna navegación."
  },
  "urlSyncLanguagePreservationNotice": {
    "message": "No se pudo conservar el idioma para este cambio de página."
  },
```

Add these exact German keys to `src/shared/i18n/_locales/de/messages.json` and `extension/_locales/de/messages.json`:

```json
  "urlSyncModeDescription": {
    "message": "Wählen Sie, wie verknüpfte Tabs Seitenänderungen folgen."
  },
  "urlSyncModeFollowChangedTab": {
    "message": "Geändertem Tab folgen"
  },
  "urlSyncModeFollowChangedTabDescription": {
    "message": "Andere Tabs wechseln zu der Website, die Sie geändert haben."
  },
  "urlSyncModeKeepEachTabsWebsite": {
    "message": "Website jedes Tabs beibehalten"
  },
  "urlSyncModeKeepEachTabsWebsiteDescription": {
    "message": "Andere Tabs bleiben auf ihrer eigenen Website und öffnen die passende Seite."
  },
  "urlSyncModeLanguageHelper": {
    "message": "Sprachen werden nach Möglichkeit beibehalten."
  },
  "urlSyncModeResetNotice": {
    "message": "Der URL-Sync-Modus wurde zurückgesetzt, weil die gespeicherte Einstellung ungültig war."
  },
  "urlSyncKeepWebsiteBlockedNotice": {
    "message": "Dieser Tab konnte für diese Seitenänderung nicht auf seiner aktuellen Website bleiben. Es wurde keine Navigation synchronisiert."
  },
  "urlSyncLanguagePreservationNotice": {
    "message": "Die Sprache konnte für diese Seitenänderung nicht beibehalten werden."
  },
```

Add these exact Simplified Chinese keys to `src/shared/i18n/_locales/zh_CN/messages.json`, `extension/_locales/zh_CN/messages.json`, and `extension/_locales/zh/messages.json`:

```json
  "urlSyncModeDescription": {
    "message": "选择关联标签页如何跟随页面变化。"
  },
  "urlSyncModeFollowChangedTab": {
    "message": "跟随已更改的标签页"
  },
  "urlSyncModeFollowChangedTabDescription": {
    "message": "其他标签页会跳转到你更改的那个网站。"
  },
  "urlSyncModeKeepEachTabsWebsite": {
    "message": "保留每个标签页的网站"
  },
  "urlSyncModeKeepEachTabsWebsiteDescription": {
    "message": "其他标签页会留在各自的网站，并打开对应页面。"
  },
  "urlSyncModeLanguageHelper": {
    "message": "会尽可能保留语言设置。"
  },
  "urlSyncModeResetNotice": {
    "message": "由于保存的设置无效，URL Sync 模式已重置。"
  },
  "urlSyncKeepWebsiteBlockedNotice": {
    "message": "这次页面变化无法让该标签页保留在当前网站，因此未同步导航。"
  },
  "urlSyncLanguagePreservationNotice": {
    "message": "这次页面变化无法保留语言设置。"
  },
```

Add these exact Traditional Chinese keys to `src/shared/i18n/_locales/zh_TW/messages.json` and `extension/_locales/zh_TW/messages.json`:

```json
  "urlSyncModeDescription": {
    "message": "選擇連結的分頁如何跟隨頁面變更。"
  },
  "urlSyncModeFollowChangedTab": {
    "message": "跟隨已變更的分頁"
  },
  "urlSyncModeFollowChangedTabDescription": {
    "message": "其他分頁會前往你變更的那個網站。"
  },
  "urlSyncModeKeepEachTabsWebsite": {
    "message": "保留每個分頁的網站"
  },
  "urlSyncModeKeepEachTabsWebsiteDescription": {
    "message": "其他分頁會留在各自的網站，並開啟對應頁面。"
  },
  "urlSyncModeLanguageHelper": {
    "message": "會盡可能保留語言設定。"
  },
  "urlSyncModeResetNotice": {
    "message": "因為已儲存的設定無效，URL Sync 模式已重設。"
  },
  "urlSyncKeepWebsiteBlockedNotice": {
    "message": "這次頁面變更無法讓此分頁保留在目前網站，因此未同步導覽。"
  },
  "urlSyncLanguagePreservationNotice": {
    "message": "這次頁面變更無法保留語言設定。"
  },
```

Add these exact Hindi keys to `src/shared/i18n/_locales/hi/messages.json` and `extension/_locales/hi/messages.json`:

```json
  "urlSyncModeDescription": {
    "message": "चुनें कि जुड़े हुए टैब पेज बदलावों का पालन कैसे करें।"
  },
  "urlSyncModeFollowChangedTab": {
    "message": "बदले हुए टैब का पालन करें"
  },
  "urlSyncModeFollowChangedTabDescription": {
    "message": "दूसरे टैब उस वेबसाइट पर चले जाते हैं जिसे आपने बदला है।"
  },
  "urlSyncModeKeepEachTabsWebsite": {
    "message": "हर टैब की वेबसाइट बनाए रखें"
  },
  "urlSyncModeKeepEachTabsWebsiteDescription": {
    "message": "दूसरे टैब अपनी वेबसाइट पर रहते हैं और मिलती-जुलती पेज खोलते हैं।"
  },
  "urlSyncModeLanguageHelper": {
    "message": "जहां संभव हो, भाषा सेटिंग बनाए रखी जाती है।"
  },
  "urlSyncModeResetNotice": {
    "message": "सहेजी गई सेटिंग मान्य नहीं थी, इसलिए URL Sync मोड रीसेट किया गया।"
  },
  "urlSyncKeepWebsiteBlockedNotice": {
    "message": "इस पेज बदलाव के लिए यह टैब अपनी मौजूदा वेबसाइट पर नहीं रह सका। कोई नेविगेशन सिंक नहीं किया गया।"
  },
  "urlSyncLanguagePreservationNotice": {
    "message": "इस पेज बदलाव के लिए भाषा सेटिंग बनाए नहीं रखी जा सकी।"
  },
```

- [ ] **Step 3.5: Add failure notice keys for every locale**

Add these keys to both `src/shared/i18n/_locales/*/messages.json` and
`extension/_locales/*/messages.json` for every supported locale:

- `urlSyncSettingSaveFailedNotice`: shown when URL Sync mode or enabled-state persistence fails.
- `urlSyncSettingReadFailedNotice`: shown when the saved URL Sync mode cannot be read, so navigation is not synced instead of silently falling back to another mode.

- [ ] **Step 4: Run i18n validation**

Run:

```bash
pnpm i18n:validate
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/i18n/_locales extension/_locales
git commit -m "feat(i18n): add URL sync mode copy"
```

## Task 9: Final Verification

**Files:**

- No new files.

- [ ] **Step 1: Run focused tests**

Run:

```bash
pnpm test src/shared/lib/translated-page-url-utils.test.ts src/shared/lib/storage.test.ts src/background/handlers/scroll-sync-handlers.test.ts src/__tests__/scenarios.test.ts src/shared/components/url-sync-settings.test.tsx -- --run
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 3: Run i18n validation**

Run:

```bash
pnpm i18n:validate
```

Expected: PASS.

- [ ] **Step 4: Run full unit test suite**

Run:

```bash
pnpm test
```

Expected: PASS.

- [ ] **Step 5: Run health if time allows**

Run:

```bash
pnpm health
```

Expected: PASS. If this fails because the environment is missing package-manager bootstrap artifacts, run `pnpm install --frozen-lockfile` in an allowed environment and retry before blaming the code.

- [ ] **Step 6: Inspect final diff**

Run:

```bash
git diff --stat origin/main..HEAD
git log --oneline origin/main..HEAD
```

Expected: the history is a small sequence of focused commits in this order:

```text
feat: add URL sync mode types
feat: resolve URL sync modes
feat: persist URL sync mode
feat: relay URL sync mode changes
feat: apply URL sync mode in content scripts
feat: add URL sync settings control
feat: show URL sync mode controls
feat(i18n): add URL sync mode copy
```
