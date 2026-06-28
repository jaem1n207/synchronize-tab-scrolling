# Extension PR Checks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a required `extension-pr-checks` pull request gate that statically blocks privacy-sensitive logging, runs extension health checks, and smoke-tests URL Sync modes in a real Chromium extension context.

**Architecture:** Build the gate in three layers: a TypeScript AST privacy logging validator, a focused Playwright extension smoke suite, and a read-only GitHub Actions workflow that always reports the required `extension-pr-checks` check. The workflow computes extension-impacting file changes inside the job, so landing-only PRs pass quickly without leaving required checks pending.

**Tech Stack:** GitHub Actions, pnpm, TypeScript compiler API, Vitest, Playwright Chromium persistent context, Chrome MV3 service worker extension testing.

---

## References

- Design spec: `docs/superpowers/specs/2026-06-28-extension-pr-checks-design.md`
- Playwright Chrome extension guide: https://playwright.dev/docs/chrome-extensions
- Existing landing Playwright config: `playwright.config.landing.ts`
- Existing extension popup URL Sync UI: `src/shared/components/url-sync-settings.tsx`
- Existing URL Sync runtime behavior: `src/contentScripts/scroll-sync.ts`

## File Map

### Create

- `.github/workflows/extension-pr-checks.yml`
  - Required pull request workflow. Job id and display name must stay `extension-pr-checks`.
- `scripts/privacy-logging-rules.ts`
  - Pure TypeScript AST analysis for unsafe `logger.info/debug/warn/error` calls.
- `scripts/privacy-logging-rules.test.ts`
  - Vitest tests for the AST rules.
- `scripts/validate-privacy-logging.ts`
  - CLI wrapper that scans `src/**` and exits non-zero on unsafe logging.
- `playwright.config.extension.ts`
  - Isolated Playwright config for extension smoke tests.
- `e2e/extension/fixtures.ts`
  - Playwright fixtures for loading the built extension and running local fixture servers.
- `e2e/extension/url-sync-modes.spec.ts`
  - Required smoke tests for URL Sync mode behavior and visible mode state.

### Modify

- `package.json`
  - Add `lint:check`, `privacy:logging`, `privacy:logging:test`, and `test:e2e:extension`.
- Current source files reported by `pnpm privacy:logging`
  - Remove raw `url`, `payload`, `data`, `response`, `tab`, `syncState`, `normalizedUrl`, title, and full browser object logging.
  - Keep safe metadata such as ids, counts, booleans, modes, reasons, and sanitized domains.

### Do Not Modify

- `.github/workflows/release.yml`
- `.github/workflows/deploy-landing.yml`
- `.github/workflows/update-store-stats.yml`
- GitHub repository ruleset or branch protection settings

## Task 1: Privacy Logging Rule Tests And Package Scripts

**Files:**

- Create: `scripts/privacy-logging-rules.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Add package scripts for the privacy guard**

Add these scripts to `package.json` under the existing tools or test section:

```json
{
  "privacy:logging": "esno scripts/validate-privacy-logging.ts",
  "privacy:logging:test": "vitest run --root . scripts/privacy-logging-rules.test.ts"
}
```

- [ ] **Step 2: Write failing tests for unsafe logger metadata**

Create `scripts/privacy-logging-rules.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import { analyzePrivacyLoggingSource } from './privacy-logging-rules';

function messagesFor(sourceText: string): Array<string> {
  return analyzePrivacyLoggingSource('src/example.ts', sourceText).map(
    (violation) => violation.message,
  );
}

describe('privacy logging rules', () => {
  it('allows ids, modes, reasons, booleans, counts, and sanitized domains', () => {
    expect(
      messagesFor(`
        logger.info('Relaying URL sync mode change', {
          sourceTabId,
          targetTabId,
          mode,
          reason: 'user-change',
          enabled: true,
          tabCount: 2,
          domain: 'example.com',
        });
      `),
    ).toEqual([]);
  });

  it('rejects raw URL metadata keys', () => {
    expect(
      messagesFor(`
        logger.info('URL changed', { url: window.location.href });
        logger.debug('Relaying URL sync message', { sourceUrl, targetUrl, normalizedUrl });
      `),
    ).toEqual([
      'Do not log "url". Log tabId, mode, reason, counts, booleans, or sanitized domain instead.',
      'Do not log "sourceUrl". Log tabId, mode, reason, counts, booleans, or sanitized domain instead.',
      'Do not log "targetUrl". Log tabId, mode, reason, counts, booleans, or sanitized domain instead.',
      'Do not log "normalizedUrl". Log tabId, mode, reason, counts, booleans, or sanitized domain instead.',
    ]);
  });

  it('rejects shorthand payload-like metadata', () => {
    expect(
      messagesFor(`
        logger.debug('Received message', { payload });
        logger.debug('Relaying scroll sync message', { data, sender });
        logger.error('Invalid acknowledgment', { response });
      `),
    ).toEqual([
      'Do not log "payload". Log tabId, mode, reason, counts, booleans, or sanitized domain instead.',
      'Do not log "data". Log tabId, mode, reason, counts, booleans, or sanitized domain instead.',
      'Do not log "sender". Log tabId, mode, reason, counts, booleans, or sanitized domain instead.',
      'Do not log "response". Log tabId, mode, reason, counts, booleans, or sanitized domain instead.',
    ]);
  });

  it('rejects direct browser URL and title expressions', () => {
    expect(
      messagesFor(`
        logger.info('Processing tab', { tabId: tab.id, currentUrl: tab.url });
        logger.info('Page metadata', { pageTitle: document.title });
      `),
    ).toEqual([
      'Do not log "currentUrl". Log tabId, mode, reason, counts, booleans, or sanitized domain instead.',
      'Do not log "pageTitle". Log tabId, mode, reason, counts, booleans, or sanitized domain instead.',
    ]);
  });
});
```

- [ ] **Step 3: Run the failing privacy rule tests**

Run:

```bash
pnpm privacy:logging:test
```

Expected: FAIL because `scripts/privacy-logging-rules.ts` does not exist.

## Task 2: Privacy Logging Rule Implementation

**Files:**

- Create: `scripts/privacy-logging-rules.ts`
- Test: `scripts/privacy-logging-rules.test.ts`

- [ ] **Step 1: Implement the AST rule module**

Create `scripts/privacy-logging-rules.ts`:

```typescript
import * as ts from 'typescript';

export interface PrivacyLoggingViolation {
  filePath: string;
  line: number;
  column: number;
  message: string;
}

const LOGGER_METHODS = new Set(['debug', 'error', 'info', 'warn']);

const BANNED_METADATA_NAMES = new Set([
  'alternateUrl',
  'alternateUrls',
  'canonicalUrl',
  'currentUrl',
  'data',
  'documentTitle',
  'href',
  'metadata',
  'normalizedUrl',
  'pageTitle',
  'payload',
  'response',
  'sender',
  'sourceUrl',
  'syncState',
  'tab',
  'tabTitle',
  'targetUrl',
  'title',
  'url',
]);

const BANNED_PROPERTY_ACCESS = new Set([
  'document.title',
  'location.href',
  'payload.url',
  'tab.title',
  'tab.url',
  'window.location.href',
]);

function isLoggerCall(node: ts.CallExpression): boolean {
  if (!ts.isPropertyAccessExpression(node.expression)) {
    return false;
  }

  const methodName = node.expression.name.text;
  if (!LOGGER_METHODS.has(methodName)) {
    return false;
  }

  const receiver = node.expression.expression;
  return ts.isIdentifier(receiver) && receiver.text === 'logger';
}

function getPropertyNameText(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }

  return null;
}

function isBannedMetadataName(name: string): boolean {
  return BANNED_METADATA_NAMES.has(name);
}

function getExpressionText(sourceFile: ts.SourceFile, node: ts.Node): string {
  return node.getText(sourceFile).replace(/\s+/g, '');
}

function expressionContainsUnsafeBrowserData(sourceFile: ts.SourceFile, node: ts.Node): boolean {
  const text = getExpressionText(sourceFile, node);
  if (BANNED_PROPERTY_ACCESS.has(text)) {
    return true;
  }

  let unsafe = false;

  function visit(current: ts.Node) {
    if (unsafe) {
      return;
    }

    if (ts.isPropertyAccessExpression(current)) {
      const propertyText = getExpressionText(sourceFile, current);
      const propertyName = current.name.text;
      if (BANNED_PROPERTY_ACCESS.has(propertyText) || isBannedMetadataName(propertyName)) {
        unsafe = true;
        return;
      }
    }

    ts.forEachChild(current, visit);
  }

  visit(node);
  return unsafe;
}

function createViolation(
  sourceFile: ts.SourceFile,
  filePath: string,
  node: ts.Node,
  metadataName: string,
): PrivacyLoggingViolation {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));

  return {
    filePath,
    line: position.line + 1,
    column: position.character + 1,
    message: `Do not log "${metadataName}". Log tabId, mode, reason, counts, booleans, or sanitized domain instead.`,
  };
}

function analyzeObjectLiteralArgument(
  sourceFile: ts.SourceFile,
  filePath: string,
  argument: ts.ObjectLiteralExpression,
): Array<PrivacyLoggingViolation> {
  const violations: Array<PrivacyLoggingViolation> = [];

  for (const property of argument.properties) {
    if (ts.isShorthandPropertyAssignment(property)) {
      const name = property.name.text;
      if (isBannedMetadataName(name)) {
        violations.push(createViolation(sourceFile, filePath, property.name, name));
      }
      continue;
    }

    if (!ts.isPropertyAssignment(property)) {
      continue;
    }

    const name = getPropertyNameText(property.name);
    if (!name) {
      continue;
    }

    if (
      isBannedMetadataName(name) ||
      expressionContainsUnsafeBrowserData(sourceFile, property.initializer)
    ) {
      violations.push(createViolation(sourceFile, filePath, property.name, name));
    }
  }

  return violations;
}

function analyzeLoggerArgument(
  sourceFile: ts.SourceFile,
  filePath: string,
  argument: ts.Expression,
): Array<PrivacyLoggingViolation> {
  if (ts.isObjectLiteralExpression(argument)) {
    return analyzeObjectLiteralArgument(sourceFile, filePath, argument);
  }

  if (ts.isIdentifier(argument) && isBannedMetadataName(argument.text)) {
    return [createViolation(sourceFile, filePath, argument, argument.text)];
  }

  if (expressionContainsUnsafeBrowserData(sourceFile, argument)) {
    return [createViolation(sourceFile, filePath, argument, argument.getText(sourceFile))];
  }

  return [];
}

export function analyzePrivacyLoggingSource(
  filePath: string,
  sourceText: string,
): Array<PrivacyLoggingViolation> {
  const scriptKind = filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
  const violations: Array<PrivacyLoggingViolation> = [];

  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && isLoggerCall(node)) {
      for (const argument of node.arguments.slice(1)) {
        violations.push(...analyzeLoggerArgument(sourceFile, filePath, argument));
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

export function formatPrivacyLoggingViolation(violation: PrivacyLoggingViolation): string {
  return `${violation.filePath}:${violation.line}:${violation.column} - ${violation.message}`;
}
```

- [ ] **Step 2: Run the privacy rule tests**

Run:

```bash
pnpm privacy:logging:test
```

Expected: PASS.

- [ ] **Step 3: Commit the rule module and tests**

Run:

```bash
git add package.json scripts/privacy-logging-rules.ts scripts/privacy-logging-rules.test.ts
git commit -m "test: add privacy logging guard"
```

## Task 3: Privacy Logging CLI And Existing Log Sanitization

**Files:**

- Create: `scripts/validate-privacy-logging.ts`
- Modify: source files reported by `pnpm privacy:logging`

- [ ] **Step 1: Add the privacy logging CLI**

Create `scripts/validate-privacy-logging.ts`:

```typescript
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

import {
  analyzePrivacyLoggingSource,
  formatPrivacyLoggingViolation,
  type PrivacyLoggingViolation,
} from './privacy-logging-rules';

const DEFAULT_ROOT = 'src';
const VALID_EXTENSIONS = new Set(['.ts', '.tsx']);

function getScanRoot(): string {
  const rootIndex = process.argv.indexOf('--root');
  if (rootIndex === -1) {
    return DEFAULT_ROOT;
  }

  const root = process.argv[rootIndex + 1];
  if (!root) {
    throw new Error('--root requires a directory path');
  }

  return root;
}

function hasSupportedExtension(filePath: string): boolean {
  return [...VALID_EXTENSIONS].some((extension) => filePath.endsWith(extension));
}

async function collectSourceFiles(directory: string): Promise<Array<string>> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: Array<string> = [];

  for (const entry of entries) {
    const fullPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') {
        continue;
      }
      files.push(...(await collectSourceFiles(fullPath)));
      continue;
    }

    if (entry.isFile() && hasSupportedExtension(fullPath)) {
      files.push(fullPath);
    }
  }

  return files;
}

async function main() {
  const root = getScanRoot();
  const files = await collectSourceFiles(root);
  const violations: Array<PrivacyLoggingViolation> = [];

  for (const filePath of files) {
    const sourceText = await readFile(filePath, 'utf8');
    const relativePath = relative(process.cwd(), filePath);
    violations.push(...analyzePrivacyLoggingSource(relativePath, sourceText));
  }

  if (violations.length === 0) {
    console.log(`Privacy logging validation passed for ${files.length} files.`);
    return;
  }

  console.error(`Privacy logging validation failed with ${violations.length} issue(s):`);
  for (const violation of violations) {
    console.error(formatPrivacyLoggingViolation(violation));
  }

  process.exitCode = 1;
}

main().catch((error) => {
  console.error('Privacy logging validation failed unexpectedly:');
  console.error(error);
  process.exitCode = 1;
});
```

- [ ] **Step 2: Run the validator against current source**

Run:

```bash
pnpm privacy:logging
```

Expected: FAIL. Current known unsafe patterns include these files:

```text
src/background/handlers/connection-handlers.ts
src/background/handlers/scroll-sync-handlers.ts
src/background/handlers/tab-event-handlers.ts
src/background/lib/auto-sync-groups.ts
src/background/lib/auto-sync-lifecycle.ts
src/background/lib/auto-sync-suggestions.ts
src/background/lib/sync-state.ts
src/contentScripts/scroll-sync.ts
```

- [ ] **Step 3: Replace raw URL and payload logs with safe metadata**

Use these replacements as the required pattern:

```typescript
// Unsafe
logger.info('URL changed, broadcasting to other tabs', { url });

// Safe
logger.info('URL changed, broadcasting to other tabs', { tabId: syncState.tabId });
```

```typescript
// Unsafe
logger.info('Relaying URL sync message', { payload });

// Safe
logger.info('Relaying URL sync message', { sourceTabId: payload.sourceTabId });
```

```typescript
// Unsafe
logger.debug(`Verified tab ${tabId} exists:`, { title: tab.title, url: tab.url });

// Safe
logger.debug(`Verified tab ${tabId} exists`);
```

```typescript
// Unsafe
logger.debug('Relaying scroll sync message', { payload, sender });

// Safe
logger.debug('Relaying scroll sync message', {
  sourceTabId: payload.sourceTabId,
  mode: payload.mode,
  hasSenderTab: sender.tabId !== undefined,
});
```

```typescript
// Unsafe
logger.debug('Sync state persisted to storage', { syncState });

// Safe
logger.debug('Sync state persisted to storage', {
  isActive: syncState.isActive,
  linkedTabCount: syncState.linkedTabs.length,
  mode: syncState.mode,
});
```

```typescript
// Unsafe
logger.debug(`[AUTO-SYNC] URL is forbidden, skipping auto-sync`, { url, tabId });

// Safe
logger.debug('[AUTO-SYNC] URL is forbidden, skipping auto-sync', { tabId });
```

For normalized URL group logs, do not log the normalized URL itself. Use count and boolean metadata:

```typescript
// Unsafe
logger.info('[AUTO-SYNC] Created new group', { normalizedUrl: groupKey });

// Safe
logger.info('[AUTO-SYNC] Created new group', {
  tabId,
  groupCount: autoSyncState.groups.size,
});
```

- [ ] **Step 4: Re-run the validator**

Run:

```bash
pnpm privacy:logging
```

Expected: PASS with a message like:

```text
Privacy logging validation passed for N files.
```

- [ ] **Step 5: Run focused regression tests for URL Sync and storage**

Run:

```bash
pnpm test -- --run src/shared/lib/translated-page-url-utils.test.ts src/shared/lib/storage.test.ts src/__tests__/scenarios.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit sanitized logging**

Run:

```bash
git add scripts/validate-privacy-logging.ts src/background src/contentScripts
git commit -m "fix: sanitize privacy-sensitive logs"
```

## Task 4: Extension E2E Fixtures

**Files:**

- Create: `playwright.config.extension.ts`
- Create: `e2e/extension/fixtures.ts`
- Modify: `package.json`

- [ ] **Step 1: Add the extension E2E script**

Add this script to `package.json`:

```json
{
  "test:e2e:extension": "playwright test --config playwright.config.extension.ts"
}
```

- [ ] **Step 2: Create the extension Playwright config**

Create `playwright.config.extension.ts`:

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/extension',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['html', { open: 'never', outputFolder: 'playwright-report-extension' }]],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
});
```

- [ ] **Step 3: Create extension and local server fixtures**

Create `e2e/extension/fixtures.ts`:

```typescript
import { test as base, chromium, expect, type BrowserContext, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

interface FixtureSite {
  name: string;
  origin: string;
  url: (path: string) => string;
  close: () => Promise<void>;
}

interface ExtensionFixtures {
  extensionContext: BrowserContext;
  extensionId: string;
  fixtureSites: {
    primary: FixtureSite;
    comparison: FixtureSite;
  };
  openPopup: () => Promise<Page>;
}

function titleFor(siteName: string, pathname: string): string {
  const pageName = pathname.includes('/about') ? 'About' : 'Home';
  return `${siteName} ${pageName}`;
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function startFixtureSite(name: string): Promise<FixtureSite> {
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

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error(`Fixture site ${name} did not expose a TCP address`);
  }

  const origin = `http://127.0.0.1:${address.port}`;

  return {
    name,
    origin,
    url: (path) => `${origin}${path}`,
    close: () => closeServer(server),
  };
}

async function getExtensionId(context: BrowserContext): Promise<string> {
  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker', { timeout: 10_000 });
  }

  const extensionId = new URL(serviceWorker.url()).host;
  if (!extensionId) {
    throw new Error(
      `Could not discover extension id from service worker URL: ${serviceWorker.url()}`,
    );
  }

  return extensionId;
}

export const test = base.extend<ExtensionFixtures>({
  fixtureSites: async ({}, use) => {
    const primary = await startFixtureSite('Primary');
    const comparison = await startFixtureSite('Comparison');

    await use({ primary, comparison });

    await Promise.all([primary.close(), comparison.close()]);
  },

  extensionContext: async ({}, use) => {
    const extensionPath = resolve(process.env.EXTENSION_E2E_DIR ?? 'extension');
    const userDataDir = await mkdtemp(join(tmpdir(), 'synchronize-tab-scrolling-e2e-'));

    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chromium',
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });

    await use(context);

    await context.close();
    await rm(userDataDir, { force: true, recursive: true });
  },

  extensionId: async ({ extensionContext }, use) => {
    await use(await getExtensionId(extensionContext));
  },

  openPopup: async ({ extensionContext, extensionId }, use) => {
    await use(async () => {
      const popup = await extensionContext.newPage();
      await popup.goto(`chrome-extension://${extensionId}/dist/popup/index.html`);
      await expect(popup.getByRole('heading', { name: 'URL Sync' })).toBeVisible();
      return popup;
    });
  },
});

export { expect };
```

- [ ] **Step 4: Run the fixture compile check**

Run:

```bash
pnpm typecheck
```

Expected: PASS or fail only on issues inside the new fixture file. Fix fixture type issues before moving on.

## Task 5: URL Sync Extension Smoke Tests

**Files:**

- Create: `e2e/extension/url-sync-modes.spec.ts`
- Test: `playwright.config.extension.ts`

- [ ] **Step 1: Write the URL Sync smoke spec**

Create `e2e/extension/url-sync-modes.spec.ts`:

```typescript
import { test, expect } from './fixtures';

import type { Page } from '@playwright/test';

async function selectTabsAndStartSync(
  popup: Page,
  sourceTitle: string,
  targetTitle: string,
): Promise<void> {
  await popup.getByRole('checkbox', { name: `Select ${sourceTitle}` }).click();
  await popup.getByRole('checkbox', { name: `Select ${targetTitle}` }).click();
  await popup.getByRole('button', { name: 'Start synchronization' }).click();
  await expect(popup.getByRole('button', { name: 'Stop synchronization' })).toBeVisible();
}

async function chooseKeepEachTabsWebsiteMode(popup: Page): Promise<void> {
  await popup.getByRole('radio', { name: /Keep each tab's website/ }).check();
  await expect(popup.getByRole('radio', { name: /Keep each tab's website/ })).toBeChecked();
}

async function turnUrlSyncOff(popup: Page): Promise<void> {
  await popup.getByRole('switch', { name: 'URL Sync' }).click();
  await expect(popup.getByRole('switch', { name: 'URL Sync' })).not.toBeChecked();
}

test.describe('URL Sync modes', () => {
  test('follow changed tab moves the target to the changed website while preserving language', async ({
    extensionContext,
    fixtureSites,
    openPopup,
  }) => {
    const source = await extensionContext.newPage();
    const target = await extensionContext.newPage();
    const targetInitialUrl = fixtureSites.comparison.url('/ko/home?view=compact#comparison-home');

    await source.goto(fixtureSites.primary.url('/en/home?view=compact#primary-home'));
    await target.goto(targetInitialUrl);

    const popup = await openPopup();
    await expect(popup.getByRole('radio', { name: /Follow changed tab/ })).toBeChecked();
    await selectTabsAndStartSync(popup, 'Primary Home', 'Comparison Home');

    await source.goto(fixtureSites.primary.url('/en/about?tab=pricing#plans'));

    await expect(target).toHaveURL(
      fixtureSites.primary.url('/ko/about?tab=pricing#comparison-home'),
    );
  });

  test('keep each tabs website keeps the target origin while applying the changed page', async ({
    extensionContext,
    fixtureSites,
    openPopup,
  }) => {
    const source = await extensionContext.newPage();
    const target = await extensionContext.newPage();
    const targetInitialUrl = fixtureSites.comparison.url('/ko/home?view=compact#comparison-home');

    await source.goto(fixtureSites.primary.url('/en/home?view=compact#primary-home'));
    await target.goto(targetInitialUrl);

    const popup = await openPopup();
    await chooseKeepEachTabsWebsiteMode(popup);
    await selectTabsAndStartSync(popup, 'Primary Home', 'Comparison Home');

    await source.goto(fixtureSites.primary.url('/en/about?tab=pricing#plans'));

    await expect(target).toHaveURL(
      fixtureSites.comparison.url('/ko/about?tab=pricing#comparison-home'),
    );
  });

  test('url sync off keeps the target on its current URL', async ({
    extensionContext,
    fixtureSites,
    openPopup,
  }) => {
    const source = await extensionContext.newPage();
    const target = await extensionContext.newPage();
    const targetInitialUrl = fixtureSites.comparison.url('/ko/home?view=compact#comparison-home');

    await source.goto(fixtureSites.primary.url('/en/home?view=compact#primary-home'));
    await target.goto(targetInitialUrl);

    const popup = await openPopup();
    await turnUrlSyncOff(popup);
    await selectTabsAndStartSync(popup, 'Primary Home', 'Comparison Home');

    await source.goto(fixtureSites.primary.url('/en/about?tab=pricing#plans'));

    const didNavigate = await target
      .waitForURL((url) => url.href !== targetInitialUrl, { timeout: 1_000 })
      .then(() => true)
      .catch(() => false);

    expect(didNavigate).toBe(false);
    await expect(target).toHaveURL(targetInitialUrl);
  });

  test('selected mode remains visible when the popup is reopened', async ({
    extensionContext,
    fixtureSites,
    openPopup,
  }) => {
    const source = await extensionContext.newPage();
    const target = await extensionContext.newPage();

    await source.goto(fixtureSites.primary.url('/en/home'));
    await target.goto(fixtureSites.comparison.url('/ko/home'));

    const firstPopup = await openPopup();
    await chooseKeepEachTabsWebsiteMode(firstPopup);
    await firstPopup.close();

    const secondPopup = await openPopup();
    await expect(secondPopup.getByRole('radio', { name: /Keep each tab's website/ })).toBeChecked();
    await expect(secondPopup.getByText('Languages are kept when possible.')).toBeVisible();
  });
});
```

- [ ] **Step 2: Build the Chromium extension and run the smoke tests**

Run:

```bash
pnpm build
pnpm test:e2e:extension
```

Expected: PASS. If Chromium is not installed locally, either run:

```bash
pnpm exec playwright install chromium
pnpm test:e2e:extension
```

- [ ] **Step 3: Commit the extension E2E test suite**

Run:

```bash
git add package.json playwright.config.extension.ts e2e/extension
git commit -m "test: add URL sync extension smoke tests"
```

## Task 6: Required GitHub Actions Gate

**Files:**

- Create: `.github/workflows/extension-pr-checks.yml`
- Modify: `package.json`

- [ ] **Step 1: Add the non-mutating lint script**

Add this script to `package.json`:

```json
{
  "lint:check": "NODE_OPTIONS='--experimental-strip-types' eslint . --flag unstable_native_nodejs_ts_config --max-warnings=0"
}
```

- [ ] **Step 2: Create the required workflow**

Create `.github/workflows/extension-pr-checks.yml`:

```yaml
name: Extension PR Checks

on:
  pull_request:
    branches:
      - main

permissions:
  contents: read

jobs:
  extension-pr-checks:
    name: extension-pr-checks
    runs-on: ubuntu-latest
    timeout-minutes: 35
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0

      - name: Detect extension-impacting changes
        id: changes
        shell: bash
        run: |
          set -euo pipefail

          changed_files="$(git diff --name-only "${{ github.event.pull_request.base.sha }}" "${{ github.event.pull_request.head.sha }}")"

          echo "Changed files:"
          if [ -n "$changed_files" ]; then
            echo "$changed_files" | sed 's/^/- /'
          else
            echo "- none"
          fi

          extension_changed=false

          while IFS= read -r file; do
            case "$file" in
              .github/workflows/extension-pr-checks.yml)
                extension_changed=true
                ;;
              e2e/*)
                extension_changed=true
                ;;
              extension/_locales/*)
                extension_changed=true
                ;;
              package.json)
                extension_changed=true
                ;;
              pnpm-lock.yaml)
                extension_changed=true
                ;;
              playwright.config*.ts)
                extension_changed=true
                ;;
              scripts/*)
                extension_changed=true
                ;;
              src/background/*)
                extension_changed=true
                ;;
              src/contentScripts/*)
                extension_changed=true
                ;;
              src/manifest.ts)
                extension_changed=true
                ;;
              src/popup/*)
                extension_changed=true
                ;;
              src/shared/*)
                extension_changed=true
                ;;
              tsconfig*.json)
                extension_changed=true
                ;;
              uno.config.ts)
                extension_changed=true
                ;;
              vite.config*)
                extension_changed=true
                ;;
            esac
          done <<< "$changed_files"

          echo "extension_changed=$extension_changed" >> "$GITHUB_OUTPUT"

      - name: No extension-impacting changes
        if: steps.changes.outputs.extension_changed != 'true'
        run: echo "No extension-impacting changes detected."

      - uses: pnpm/action-setup@v5
        if: steps.changes.outputs.extension_changed == 'true'

      - uses: actions/setup-node@v6
        if: steps.changes.outputs.extension_changed == 'true'
        with:
          node-version: 'lts/*'
          cache: 'pnpm'

      - name: Install dependencies
        if: steps.changes.outputs.extension_changed == 'true'
        run: pnpm install --frozen-lockfile

      - name: Test privacy-safe logging validator
        if: steps.changes.outputs.extension_changed == 'true'
        run: pnpm privacy:logging:test

      - name: Validate privacy-safe logging
        if: steps.changes.outputs.extension_changed == 'true'
        run: pnpm privacy:logging

      - name: Validate i18n
        if: steps.changes.outputs.extension_changed == 'true'
        run: pnpm i18n:validate

      - name: Typecheck
        if: steps.changes.outputs.extension_changed == 'true'
        run: pnpm typecheck

      - name: Lint
        if: steps.changes.outputs.extension_changed == 'true'
        run: pnpm lint:check

      - name: Unit tests
        if: steps.changes.outputs.extension_changed == 'true'
        run: pnpm test -- --run

      - name: Build Chromium extension
        if: steps.changes.outputs.extension_changed == 'true'
        run: pnpm build

      - name: Preserve Chromium extension build for E2E
        if: steps.changes.outputs.extension_changed == 'true'
        run: |
          rm -rf .extension-e2e/chromium-extension
          mkdir -p .extension-e2e/chromium-extension
          cp -R extension/. .extension-e2e/chromium-extension/

      - name: Build Firefox extension
        if: steps.changes.outputs.extension_changed == 'true'
        run: pnpm build-firefox

      - name: Cache Playwright browsers
        if: steps.changes.outputs.extension_changed == 'true'
        uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: ${{ runner.os }}-playwright-${{ hashFiles('pnpm-lock.yaml') }}
          restore-keys: |
            ${{ runner.os }}-playwright-

      - name: Install Playwright Chromium
        if: steps.changes.outputs.extension_changed == 'true'
        timeout-minutes: 10
        run: pnpm exec playwright install chromium

      - name: URL Sync extension smoke tests
        if: steps.changes.outputs.extension_changed == 'true'
        run: pnpm test:e2e:extension
        env:
          EXTENSION_E2E_DIR: .extension-e2e/chromium-extension

      - name: Upload extension Playwright report
        if: failure() && steps.changes.outputs.extension_changed == 'true'
        uses: actions/upload-artifact@v4
        with:
          name: extension-playwright-report
          path: playwright-report-extension/
          retention-days: 7
```

- [ ] **Step 3: Verify the workflow has no privileged trigger**

Run:

```bash
rg -n "pull_request_target|permissions:.*write|GITHUB_TOKEN|secrets\\." .github/workflows/extension-pr-checks.yml
```

Expected: no output.

- [ ] **Step 4: Commit the CI workflow**

Run:

```bash
git add package.json .github/workflows/extension-pr-checks.yml
git commit -m "ci: add extension PR checks gate"
```

## Task 7: Full Verification

**Files:**

- Verify all files changed by Tasks 1 through 6.

- [ ] **Step 1: Run the static privacy checks**

Run:

```bash
pnpm privacy:logging:test
pnpm privacy:logging
```

Expected: both PASS.

- [ ] **Step 2: Run repository health checks used by the new gate**

Run:

```bash
pnpm i18n:validate
pnpm typecheck
pnpm lint:check
pnpm test -- --run
```

Expected: all PASS.

- [ ] **Step 3: Verify both production builds and preserve the Chromium build**

Run:

```bash
pnpm build
rm -rf .extension-e2e/chromium-extension
mkdir -p .extension-e2e/chromium-extension
cp -R extension/. .extension-e2e/chromium-extension/
pnpm build-firefox
```

Expected: both builds PASS.

- [ ] **Step 4: Run extension smoke E2E against the preserved Chromium build**

Run:

```bash
EXTENSION_E2E_DIR=.extension-e2e/chromium-extension pnpm test:e2e:extension
```

Expected: PASS.

- [ ] **Step 5: Verify workflow security and check naming**

Run:

```bash
rg -n "name: extension-pr-checks|pull_request_target|contents: read|secrets\\." .github/workflows/extension-pr-checks.yml
```

Expected output includes:

```text
name: extension-pr-checks
contents: read
```

Expected output does not include:

```text
pull_request_target
secrets.
```

- [ ] **Step 6: Verify the working tree and branch history**

Run:

```bash
git status --short
git log --oneline main..HEAD
```

Expected:

```text
git status --short
```

prints no output after all intended files are committed.

## Commit Order

1. `test: add privacy logging guard`
2. `fix: sanitize privacy-sensitive logs`
3. `test: add URL sync extension smoke tests`
4. `ci: add extension PR checks gate`

## Acceptance Checklist

- [ ] Every pull request gets a required status check named `extension-pr-checks`.
- [ ] Landing-only PRs finish `extension-pr-checks` successfully without running the full gate.
- [ ] Extension-impacting PRs run privacy logging validation, i18n validation, typecheck, lint, unit tests, Chromium build, Firefox build, and URL Sync smoke E2E.
- [ ] CI uses `pull_request`, not `pull_request_target`.
- [ ] CI permissions remain `contents: read`.
- [ ] CI does not use repository admin tokens or modify rulesets.
- [ ] Raw URL, title, payload, full tab, and full sync state logging fails the static validator.
- [ ] Existing source logs pass the privacy validator.
- [ ] `Follow changed tab` and `Keep each tab's website` behavior is covered in a real extension context.
- [ ] URL Sync off prevents navigation in the smoke test.
- [ ] Popup mode visibility and persistence are covered.
