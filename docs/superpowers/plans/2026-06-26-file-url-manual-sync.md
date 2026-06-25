# File URL Manual Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable manual scroll sync for browser-readable local files opened with `file://`, with actionable Chrome/Edge settings guidance when file URL access is off.

**Architecture:** Keep the scroll engine unchanged. Add local-file support at the manifest, URL eligibility, popup discovery, and popup error layers, while leaving auto-sync grouping unchanged for privacy and scope control.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, webextension-polyfill, webext-bridge, UnoCSS, shadcn/ui.

---

## File Map

- Modify: `src/manifest.ts`
  - Add `file:///*` to generated host permissions, content script matches, and web accessible resource matches.
- Modify: `src/shared/lib/url-utils.ts`
  - Stop blanket-blocking `file://`.
  - Add pure helpers for file URLs, PDFs, and unsupported special schemes.
  - Keep PDF, browser internal pages, extension stores, Google services, search/auth pages, and unstable schemes blocked.
- Modify: `src/shared/lib/url-utils.test.ts`
  - Replace the old "file is forbidden" expectation with browser-readable local file allowances.
  - Add regression coverage for local PDF and unsupported schemes.
- Create: `src/shared/lib/file-scheme-access.ts`
  - Provide a focused helper for file URL access state and browser settings URLs.
  - Use type-safe optional interfaces for `globalThis.chrome` access. Do not use `as` assertions.
- Create: `src/shared/lib/file-scheme-access.test.ts`
  - Cover Chrome, Edge, fallback Chromium URL generation, API success, API absence, and API rejection.
- Modify: `src/popup/types.ts`
  - Add optional unavailable action and local file note fields to `TabInfo`.
- Modify: `src/popup/hooks/use-tab-discovery.ts`
  - Query file scheme access once per tab refresh.
  - Mark `file://` tabs eligible only when the browser check passes or cannot be checked.
  - Mark Chrome/Edge blocked local files unavailable with an action URL.
- Create: `src/popup/hooks/use-tab-discovery.test.ts`
  - Cover file access allowed, file access disabled, unknown API fallback, and direct PDF blocking.
- Modify: `src/popup/components/tab-command-palette.tsx`
  - Show a visible inline action button for actionable unavailable tabs.
  - Show the local file privacy note for local file rows.
- Create: `src/popup/components/__tests__/tab-command-palette.test.tsx`
  - Cover the settings action and local file privacy note rendering.
- Modify: `src/popup/hooks/use-sync-control.ts`
  - Prefer a file-access-specific error with settings action when sync start fails for selected `file://` tabs.
- Create: `src/popup/hooks/use-sync-control.test.ts`
  - Cover file tab connection failure action and normal failure fallback.
- Modify: locale files:
  - `src/shared/i18n/_locales/{en,ko,ja,fr,es,de,zh_CN,zh_TW,hi}/messages.json`
  - `extension/_locales/{en,ko,ja,fr,es,de,zh,zh_CN,zh_TW,hi}/messages.json`
- Create: `src/manifest.test.ts`
  - Verify generated match patterns include `file:///*`.

## Commit Plan

- Commit 1: `feat: allow manual sync on local file URLs`
  - URL helpers, manifest changes, and tests.
- Commit 2: `feat: detect local file access state`
  - File scheme access helper and tests.
- Commit 3: `feat: guide users to enable local file access`
  - Popup discovery, inline settings action, and tests.
- Commit 4: `feat: explain local file access failures`
  - Sync-start failure guidance, i18n, and tests.
- Commit 5 if verification finds follow-up fixes: use the smallest semantic commit matching the fix.

If implementation reveals fewer changed files than expected, keep tests paired with their implementation and still split by concern.

---

### Task 1: URL Eligibility And Manifest Foundation

**Files:**
- Modify: `src/shared/lib/url-utils.ts`
- Modify: `src/shared/lib/url-utils.test.ts`
- Modify: `src/manifest.ts`
- Create: `src/manifest.test.ts`

- [ ] **Step 1: Write failing URL eligibility tests**

In `src/shared/lib/url-utils.test.ts`, replace the current file protocol test in `describe('restricted protocols')`:

```typescript
it('should allow browser-readable file:// URLs', () => {
  expect(isForbiddenUrl('file:///Users/test/document.html')).toBe(false);
  expect(isForbiddenUrl('file:///Users/test/notes.md')).toBe(false);
  expect(isForbiddenUrl('file:///Users/test/export.json')).toBe(false);
  expect(isForbiddenUrl('file:///Users/test/log.txt')).toBe(false);
  expect(isForbiddenUrl('file:///Users/test/table.csv')).toBe(false);
});

it('should still forbid local PDF files', () => {
  expect(isForbiddenUrl('file:///Users/test/document.pdf')).toBe(true);
  expect(isForbiddenUrl('file:///Users/test/DOCUMENT.PDF')).toBe(true);
});

it('should still forbid unstable special protocols', () => {
  expect(isForbiddenUrl('data:text/html,<h1>Test</h1>')).toBe(true);
  expect(isForbiddenUrl('blob:https://example.com/abc123')).toBe(true);
  expect(isForbiddenUrl('view-source:https://example.com')).toBe(true);
  expect(isForbiddenUrl('javascript:alert("test")')).toBe(true);
});
```

Add helper tests near the top-level URL util imports by updating the import:

```typescript
import {
  detectBrowserType,
  isFileUrl,
  isForbiddenUrl,
  isPdfUrl,
  isUnsupportedSpecialScheme,
} from './url-utils';
```

Add this describe block before `describe('isForbiddenUrl')`:

```typescript
describe('file and special scheme helpers', () => {
  it('detects file URLs', () => {
    expect(isFileUrl('file:///Users/test/report.html')).toBe(true);
    expect(isFileUrl('https://example.com/report.html')).toBe(false);
    expect(isFileUrl(null)).toBe(false);
  });

  it('detects PDF URLs case-insensitively', () => {
    expect(isPdfUrl('file:///Users/test/report.pdf')).toBe(true);
    expect(isPdfUrl('https://example.com/report.PDF')).toBe(true);
    expect(isPdfUrl('file:///Users/test/report.html')).toBe(false);
  });

  it('detects unsupported special schemes', () => {
    expect(isUnsupportedSpecialScheme('data:text/plain,hello')).toBe(true);
    expect(isUnsupportedSpecialScheme('blob:https://example.com/id')).toBe(true);
    expect(isUnsupportedSpecialScheme('view-source:https://example.com')).toBe(true);
    expect(isUnsupportedSpecialScheme('file:///Users/test/report.html')).toBe(false);
  });
});
```

- [ ] **Step 2: Run URL tests and verify they fail**

Run:

```bash
pnpm exec vitest run src/shared/lib/url-utils.test.ts
```

Expected: FAIL because `isFileUrl`, `isPdfUrl`, and `isUnsupportedSpecialScheme` are not exported, and `file://` still returns forbidden.

- [ ] **Step 3: Implement URL helpers and local file allowance**

In `src/shared/lib/url-utils.ts`, replace the `COMMON_RESTRICTED_PATTERNS` constant with protocol-based constants:

```typescript
const FILE_PROTOCOL = 'file:';

const UNSUPPORTED_SPECIAL_PROTOCOLS = [
  'ftp:',
  'javascript:',
  'vbscript:',
  'ws:',
  'wss:',
  'data:',
  'blob:',
  'filesystem:',
  'view-source:',
];
```

Add these helpers before `detectBrowserType()`:

```typescript
function parseUrl(url: string | null | undefined): URL | null {
  if (!url) return null;

  try {
    return new URL(url);
  } catch {
    return null;
  }
}

export function isFileUrl(url: string | null | undefined): boolean {
  return parseUrl(url)?.protocol === FILE_PROTOCOL;
}

export function isPdfUrl(url: string | null | undefined): boolean {
  const parsedUrl = parseUrl(url);
  return parsedUrl ? parsedUrl.pathname.toLowerCase().endsWith('.pdf') : false;
}

export function isUnsupportedSpecialScheme(url: string | null | undefined): boolean {
  const parsedUrl = parseUrl(url);
  return parsedUrl ? UNSUPPORTED_SPECIAL_PROTOCOLS.includes(parsedUrl.protocol) : false;
}
```

Inside `isForbiddenUrl()`, replace the common restricted pattern check:

```typescript
  // 공통 제한 패턴 확인
  if (COMMON_RESTRICTED_PATTERNS.some((pattern) => normalizedUrl.startsWith(pattern))) {
    return true;
  }
```

with:

```typescript
  // 공통 제한 프로토콜 확인
  if (isUnsupportedSpecialScheme(normalizedUrl)) {
    return true;
  }
```

Inside the `try` block, immediately after `const urlObj = new URL(normalizedUrl);`, add:

```typescript
    if (isPdfUrl(normalizedUrl)) {
      return true;
    }

    if (urlObj.protocol === FILE_PROTOCOL) {
      return false;
    }
```

Then remove the later direct PDF check block:

```typescript
    // PDF 파일 직접 접근 확인
    if (urlObj.pathname.endsWith('.pdf')) {
      return true;
    }
```

- [ ] **Step 4: Update generated manifest source**

In `src/manifest.ts`, add a local constant near the imports:

```typescript
const FILE_URL_MATCH_PATTERN = 'file:///*';
const WEB_URL_MATCH_PATTERN = '<all_urls>';
```

Update manifest permissions and matches:

```typescript
    host_permissions: ['*://*/*', FILE_URL_MATCH_PATTERN],
    content_scripts: [
      {
        matches: [WEB_URL_MATCH_PATTERN, FILE_URL_MATCH_PATTERN],
        js: ['dist/contentScripts/index.global.js'],
      },
    ],
    web_accessible_resources: [
      {
        resources: ['dist/contentScripts/synchronize-tab-scrolling.css'],
        matches: [WEB_URL_MATCH_PATTERN, FILE_URL_MATCH_PATTERN],
      },
    ],
```

- [ ] **Step 5: Write the manifest unit test**

Create `src/manifest.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import { getManifest } from './manifest';

describe('getManifest', () => {
  it('includes local file URL match patterns for manual sync injection', async () => {
    const manifest = await getManifest();

    expect(manifest.host_permissions).toContain('file:///*');
    expect(manifest.content_scripts?.[0]?.matches).toContain('file:///*');
    expect(manifest.web_accessible_resources?.[0]?.matches).toContain('file:///*');
  });
});
```

Run:

```bash
pnpm exec vitest run src/manifest.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run foundation tests**

Run:

```bash
pnpm exec vitest run src/shared/lib/url-utils.test.ts
```

Expected: PASS.

Run:

```bash
pnpm exec vitest run src/manifest.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit foundation**

Run:

```bash
git add src/shared/lib/url-utils.ts src/shared/lib/url-utils.test.ts src/manifest.ts src/manifest.test.ts
git commit -m "feat: allow manual sync on local file URLs"
```

---

### Task 2: File Scheme Access Helper

**Files:**
- Create: `src/shared/lib/file-scheme-access.ts`
- Create: `src/shared/lib/file-scheme-access.test.ts`

- [ ] **Step 1: Write failing file scheme helper tests**

Create `src/shared/lib/file-scheme-access.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getFileSchemeAccessInfo,
  getFileSchemeSettingsUrl,
  type FileSchemeAccessRoot,
} from './file-scheme-access';

const { runtimeIdMock } = vi.hoisted(() => ({
  runtimeIdMock: 'extension-id-123',
}));

vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: {
      id: runtimeIdMock,
    },
  },
}));

describe('getFileSchemeSettingsUrl', () => {
  it('builds Chrome extension settings URLs', () => {
    expect(getFileSchemeSettingsUrl('chrome', 'abc123')).toBe('chrome://extensions/?id=abc123');
  });

  it('builds Edge extension settings URLs', () => {
    expect(getFileSchemeSettingsUrl('edge', 'abc123')).toBe('edge://extensions/?id=abc123');
  });

  it('falls back to Chrome settings URLs for unknown Chromium-like browsers', () => {
    expect(getFileSchemeSettingsUrl('unknown', 'abc123')).toBe('chrome://extensions/?id=abc123');
  });
});

describe('getFileSchemeAccessInfo', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'userAgent', {
      value:
        'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      configurable: true,
    });
  });

  it('returns allowed=true when Chrome reports file scheme access enabled', async () => {
    const root: FileSchemeAccessRoot = {
      chrome: {
        extension: {
          isAllowedFileSchemeAccess: vi.fn().mockResolvedValue(true),
        },
      },
    };

    await expect(getFileSchemeAccessInfo(root)).resolves.toEqual({
      canCheck: true,
      allowed: true,
      settingsUrl: 'chrome://extensions/?id=extension-id-123',
    });
  });

  it('returns allowed=false when Chrome reports file scheme access disabled', async () => {
    const root: FileSchemeAccessRoot = {
      chrome: {
        extension: {
          isAllowedFileSchemeAccess: vi.fn().mockResolvedValue(false),
        },
      },
    };

    await expect(getFileSchemeAccessInfo(root)).resolves.toEqual({
      canCheck: true,
      allowed: false,
      settingsUrl: 'chrome://extensions/?id=extension-id-123',
    });
  });

  it('falls back conservatively when the API is unavailable', async () => {
    const root: FileSchemeAccessRoot = {};

    await expect(getFileSchemeAccessInfo(root)).resolves.toEqual({
      canCheck: false,
      allowed: false,
      settingsUrl: 'chrome://extensions/?id=extension-id-123',
    });
  });

  it('falls back conservatively when the API rejects', async () => {
    const root: FileSchemeAccessRoot = {
      chrome: {
        extension: {
          isAllowedFileSchemeAccess: vi.fn().mockRejectedValue(new Error('blocked')),
        },
      },
    };

    await expect(getFileSchemeAccessInfo(root)).resolves.toEqual({
      canCheck: false,
      allowed: false,
      settingsUrl: 'chrome://extensions/?id=extension-id-123',
    });
  });
});
```

- [ ] **Step 2: Run helper tests and verify they fail**

Run:

```bash
pnpm exec vitest run src/shared/lib/file-scheme-access.test.ts
```

Expected: FAIL because `src/shared/lib/file-scheme-access.ts` does not exist.

- [ ] **Step 3: Implement the helper**

Create `src/shared/lib/file-scheme-access.ts`:

```typescript
import browser from 'webextension-polyfill';

import { detectBrowserType } from './url-utils';

type BrowserType = ReturnType<typeof detectBrowserType>;

export interface FileSchemeAccessInfo {
  canCheck: boolean;
  allowed: boolean;
  settingsUrl: string;
}

export interface FileSchemeAccessRoot {
  chrome?: {
    extension?: {
      isAllowedFileSchemeAccess?: () => Promise<boolean> | boolean;
    };
  };
}

export function getFileSchemeSettingsUrl(
  browserType: BrowserType,
  extensionId = browser.runtime.id,
): string {
  if (browserType === 'edge') {
    return `edge://extensions/?id=${extensionId}`;
  }

  return `chrome://extensions/?id=${extensionId}`;
}

export async function getFileSchemeAccessInfo(
  root: FileSchemeAccessRoot = globalThis,
): Promise<FileSchemeAccessInfo> {
  const settingsUrl = getFileSchemeSettingsUrl(detectBrowserType());
  const isAllowedFileSchemeAccess = root.chrome?.extension?.isAllowedFileSchemeAccess;

  if (!isAllowedFileSchemeAccess) {
    return {
      canCheck: false,
      allowed: false,
      settingsUrl,
    };
  }

  try {
    return {
      canCheck: true,
      allowed: await isAllowedFileSchemeAccess(),
      settingsUrl,
    };
  } catch {
    return {
      canCheck: false,
      allowed: false,
      settingsUrl,
    };
  }
}
```

- [ ] **Step 4: Run helper tests**

Run:

```bash
pnpm exec vitest run src/shared/lib/file-scheme-access.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit helper**

Run:

```bash
git add src/shared/lib/file-scheme-access.ts src/shared/lib/file-scheme-access.test.ts
git commit -m "feat: detect local file access state"
```

---

### Task 3: Popup Discovery And Actionable Unavailable Rows

**Files:**
- Modify: `src/popup/types.ts`
- Modify: `src/popup/hooks/use-tab-discovery.ts`
- Create: `src/popup/hooks/use-tab-discovery.test.ts`
- Modify: `src/popup/components/tab-command-palette.tsx`
- Create: `src/popup/components/__tests__/tab-command-palette.test.tsx`

- [ ] **Step 1: Extend popup tab types**

In `src/popup/types.ts`, add an action interface above `TabInfo`:

```typescript
export interface UnavailableTabAction {
  label: string;
  url: string;
}
```

Extend `TabInfo`:

```typescript
export interface TabInfo {
  id: number;
  title: string;
  url: string;
  favIconUrl?: string;
  eligible: boolean;
  ineligibleReason?: string;
  unavailableAction?: UnavailableTabAction;
  localFilePrivacyNote?: string;
  lastAccessed?: number; // Timestamp when tab was last accessed
}
```

- [ ] **Step 2: Write failing hook tests**

Create `src/popup/hooks/use-tab-discovery.test.ts`:

```typescript
import { act, createElement } from 'react';

import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import browser from 'webextension-polyfill';

import { getFileSchemeAccessInfo } from '~/shared/lib/file-scheme-access';

import { useTabDiscovery } from './use-tab-discovery';

const { tabsQueryMock, getFileSchemeAccessInfoMock } = vi.hoisted(() => ({
  tabsQueryMock: vi.fn(),
  getFileSchemeAccessInfoMock: vi.fn(),
}));

vi.mock('webextension-polyfill', () => ({
  default: {
    tabs: {
      query: tabsQueryMock,
    },
  },
}));

vi.mock('~/shared/lib/file-scheme-access', () => ({
  getFileSchemeAccessInfo: getFileSchemeAccessInfoMock,
}));

vi.mock('~/shared/i18n', () => ({
  t: (key: string): string => key,
}));

vi.mock('~/shared/lib/logger', () => ({
  ExtensionLogger: vi.fn().mockImplementation(() => ({
    error: vi.fn(),
  })),
}));

interface HookResult<T> {
  current: T;
}

interface RenderHookResult<T> {
  result: HookResult<T>;
  unmount: () => void;
}

interface ReactActEnvironmentGlobal {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
}

function enableReactActEnvironment(root: ReactActEnvironmentGlobal): void {
  root.IS_REACT_ACT_ENVIRONMENT = true;
}

function renderHook<T>(hook: () => T): RenderHookResult<T> {
  const container = document.createElement('div');
  const root = createRoot(container);
  let value: T;

  function HookHost(): null {
    value = hook();
    return null;
  }

  act(() => {
    root.render(createElement(HookHost));
  });

  return {
    result: {
      get current() {
        return value;
      },
    },
    unmount: () => {
      act(() => {
        root.unmount();
      });
    },
  };
}

async function waitFor(assertion: () => void): Promise<void> {
  const timeoutAt = Date.now() + 1_000;
  while (Date.now() < timeoutAt) {
    try {
      assertion();
      return;
    } catch {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
    }
  }
  assertion();
}

describe('useTabDiscovery file URLs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enableReactActEnvironment(globalThis);
    vi.mocked(getFileSchemeAccessInfo).mockResolvedValue({
      canCheck: true,
      allowed: true,
      settingsUrl: 'chrome://extensions/?id=test-id',
    });
    vi.mocked(browser.tabs.query)
      .mockResolvedValueOnce([
        {
          id: 1,
          title: 'report.md',
          url: 'file:///Users/me/report.md',
          index: 0,
          highlighted: false,
          active: true,
          pinned: false,
          incognito: false,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 1,
          title: 'report.md',
          url: 'file:///Users/me/report.md',
          index: 0,
          highlighted: false,
          active: true,
          pinned: false,
          incognito: false,
        },
      ]);
  });

  it('marks file tabs eligible when file access is allowed', async () => {
    const { result, unmount } = renderHook(() =>
      useTabDiscovery({ selectedTabIds: [], sortBy: 'similarity', sameDomainFilter: false }),
    );

    await waitFor(() => expect(result.current.tabs).toHaveLength(1));

    expect(result.current.tabs[0]).toEqual(
      expect.objectContaining({
        eligible: true,
        localFilePrivacyNote: 'localFilePrivacyNote',
      }),
    );

    unmount();
  });

  it('marks file tabs unavailable with a settings action when file access is disabled', async () => {
    vi.mocked(getFileSchemeAccessInfo).mockResolvedValue({
      canCheck: true,
      allowed: false,
      settingsUrl: 'chrome://extensions/?id=test-id',
    });

    const { result, unmount } = renderHook(() =>
      useTabDiscovery({ selectedTabIds: [], sortBy: 'similarity', sameDomainFilter: false }),
    );

    await waitFor(() => expect(result.current.tabs).toHaveLength(1));

    expect(result.current.tabs[0]).toEqual(
      expect.objectContaining({
        eligible: false,
        ineligibleReason: 'ineligibleFileAccessDisabled',
        unavailableAction: {
          label: 'openExtensionSettings',
          url: 'chrome://extensions/?id=test-id',
        },
      }),
    );

    unmount();
  });

  it('keeps local PDFs unavailable', async () => {
    vi.mocked(browser.tabs.query)
      .mockResolvedValueOnce([
        {
          id: 2,
          title: 'report.pdf',
          url: 'file:///Users/me/report.pdf',
          index: 0,
          highlighted: false,
          active: true,
          pinned: false,
          incognito: false,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 2,
          title: 'report.pdf',
          url: 'file:///Users/me/report.pdf',
          index: 0,
          highlighted: false,
          active: true,
          pinned: false,
          incognito: false,
        },
      ]);

    const { result, unmount } = renderHook(() =>
      useTabDiscovery({ selectedTabIds: [], sortBy: 'similarity', sameDomainFilter: false }),
    );

    await waitFor(() => expect(result.current.tabs).toHaveLength(1));

    expect(result.current.tabs[0]).toEqual(
      expect.objectContaining({
        eligible: false,
        ineligibleReason: 'ineligibleSpecialProtocol',
      }),
    );

    unmount();
  });
});
```

This test keeps React's act environment assignment behind `enableReactActEnvironment()` so the implementation does not need unsafe assertions.

- [ ] **Step 3: Run hook tests and verify they fail**

Run:

```bash
pnpm exec vitest run src/popup/hooks/use-tab-discovery.test.ts
```

Expected: FAIL because `use-tab-discovery.ts` does not read file scheme access info or set action fields.

- [ ] **Step 4: Implement popup discovery classification**

In `src/popup/hooks/use-tab-discovery.ts`, add imports:

```typescript
import { getFileSchemeAccessInfo, type FileSchemeAccessInfo } from '~/shared/lib/file-scheme-access';
import { isFileUrl, isForbiddenUrl } from '~/shared/lib/url-utils';
```

Replace the current `isForbiddenUrl` import line with the combined import above.

Update `getIneligibleReason`:

```typescript
function getIneligibleReason(url: string, isFileAccessBlocked = false): string | undefined {
  if (isFileAccessBlocked) {
    return t('ineligibleFileAccessDisabled');
  }

  if (
    url.includes('chrome.google.com/webstore') ||
    url.includes('microsoftedge.microsoft.com/addons') ||
    url.includes('addons.mozilla.org')
  ) {
    return t('ineligibleWebStore');
  }
  if (url.match(/^https?:\/\/(drive|docs|sheets|mail)\.google\.com/)) {
    return t('ineligibleGoogleServices');
  }
  if (url.match(/^(chrome|edge|about|firefox|moz-extension|chrome-extension):/)) {
    return t('ineligibleBrowserInternal');
  }
  if (url.match(/^(view-source|data|javascript|blob):/) || url.toLowerCase().endsWith('.pdf')) {
    return t('ineligibleSpecialProtocol');
  }
  return t('ineligibleSecurityRestriction');
}
```

Replace `toBrowserTab` with:

```typescript
function toBrowserTab(
  tab: browser.Tabs.Tab,
  fileSchemeAccessInfo: FileSchemeAccessInfo,
): TabInfo | null {
  if (tab.id === undefined) return null;

  const url = tab.url || '';
  const fileUrl = isFileUrl(url);
  const fileAccessBlocked =
    fileUrl && fileSchemeAccessInfo.canCheck && !fileSchemeAccessInfo.allowed;
  const isForbidden = isForbiddenUrl(url) || fileAccessBlocked;

  return {
    id: tab.id,
    title: tab.title || t('untitled'),
    url,
    favIconUrl: tab.favIconUrl,
    eligible: !isForbidden,
    ineligibleReason: isForbidden ? getIneligibleReason(url, fileAccessBlocked) : undefined,
    unavailableAction: fileAccessBlocked
      ? {
          label: t('openExtensionSettings'),
          url: fileSchemeAccessInfo.settingsUrl,
        }
      : undefined,
    localFilePrivacyNote: fileUrl ? t('localFilePrivacyNote') : undefined,
    lastAccessed: tab.lastAccessed,
  };
}
```

In `queryBrowserTabs`, before mapping tabs, load file scheme access:

```typescript
    const fileSchemeAccessInfo = await getFileSchemeAccessInfo();
    const tabInfos = browserTabs
      .map((tab) => toBrowserTab(tab, fileSchemeAccessInfo))
      .filter((tab): tab is TabInfo => tab !== null);
```

- [ ] **Step 5: Run hook tests**

Run:

```bash
pnpm exec vitest run src/popup/hooks/use-tab-discovery.test.ts
```

Expected: PASS.

- [ ] **Step 6: Write failing UI action test**

Create `src/popup/components/__tests__/tab-command-palette.test.tsx`:

```typescript
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import browser from 'webextension-polyfill';

import { TabCommandPalette } from '../tab-command-palette';

const { tabsCreateMock } = vi.hoisted(() => ({
  tabsCreateMock: vi.fn(),
}));

vi.mock('webextension-polyfill', () => ({
  default: {
    tabs: {
      create: tabsCreateMock,
    },
  },
}));

vi.mock('~/shared/i18n', () => ({
  t: (key: string, substitutions?: string | string[]): string => {
    if (Array.isArray(substitutions)) {
      return `${key}:${substitutions.join(',')}`;
    }
    if (typeof substitutions === 'string') {
      return `${key}:${substitutions}`;
    }
    return key;
  },
}));

describe('TabCommandPalette local file actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(browser.tabs.create).mockResolvedValue({
      id: 99,
      index: 0,
      highlighted: false,
      active: true,
      pinned: false,
      incognito: false,
    });
  });

  it('renders an inline settings action for blocked local files', () => {
    render(
      <TabCommandPalette
        currentTabId={1}
        isSyncActive={false}
        selectedTabIds={[]}
        tabs={[
          {
            id: 1,
            title: 'report.md',
            url: 'file:///Users/me/report.md',
            eligible: false,
            ineligibleReason: 'Local file access is off',
            unavailableAction: {
              label: 'Open extension settings',
              url: 'chrome://extensions/?id=test-id',
            },
            localFilePrivacyNote: 'Synchronized using scroll position only.',
          },
        ]}
        onToggleTab={vi.fn()}
      />,
    );

    expect(screen.getByText('Open extension settings')).toBeInTheDocument();
    expect(screen.getByText('Synchronized using scroll position only.')).toBeInTheDocument();
  });

  it('opens the settings URL when the action is clicked', () => {
    render(
      <TabCommandPalette
        currentTabId={1}
        isSyncActive={false}
        selectedTabIds={[]}
        tabs={[
          {
            id: 1,
            title: 'report.md',
            url: 'file:///Users/me/report.md',
            eligible: false,
            ineligibleReason: 'Local file access is off',
            unavailableAction: {
              label: 'Open extension settings',
              url: 'chrome://extensions/?id=test-id',
            },
          },
        ]}
        onToggleTab={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open extension settings' }));

    expect(browser.tabs.create).toHaveBeenCalledWith({
      url: 'chrome://extensions/?id=test-id',
    });
  });
});
```

- [ ] **Step 7: Run UI test and verify it fails**

Run:

```bash
pnpm exec vitest run src/popup/components/__tests__/tab-command-palette.test.tsx
```

Expected: FAIL because the component does not render `unavailableAction` or open settings.

- [ ] **Step 8: Implement inline unavailable action UI**

In `src/popup/components/tab-command-palette.tsx`, add:

```typescript
import browser from 'webextension-polyfill';
```

Add a callback inside `TabCommandPalette`:

```typescript
  const handleUnavailableAction = useCallback((url: string) => {
    browser.tabs.create({ url }).catch(() => {});
  }, []);
```

In the eligible tab row, after the URL `<span>`, render the privacy note:

```tsx
                            {tab.localFilePrivacyNote && (
                              <span className="text-xs text-muted-foreground/80">
                                {tab.localFilePrivacyNote}
                              </span>
                            )}
```

In the unavailable tab row, remove `disabled` from `CommandItem` when there is an action:

```tsx
                            <CommandItem
                              aria-disabled="true"
                              aria-label={`${tab.title} - ${tab.ineligibleReason}`}
                              className="flex items-center gap-3 py-3 px-3 opacity-50 cursor-not-allowed"
                              role="option"
                              value={`${tab.title}-${tab.url}-${tab.id}`}
                              onSelect={() => {}}
                            >
```

Inside the unavailable row text block, after the URL `<span>`, render the privacy note:

```tsx
                                {tab.localFilePrivacyNote && (
                                  <span className="text-xs text-muted-foreground/80">
                                    {tab.localFilePrivacyNote}
                                  </span>
                                )}
```

Before the alert icon, render the action:

```tsx
                              {unavailableAction && (
                                <Button
                                  aria-label={unavailableAction.label}
                                  className="shrink-0 h-7 px-2 text-xs"
                                  size="sm"
                                  variant="outline"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    handleUnavailableAction(unavailableAction.url);
                                  }}
                                >
                                  {unavailableAction.label}
                                </Button>
                              )}
```

Before returning the unavailable row JSX, assign the action:

```typescript
const unavailableAction = tab.unavailableAction;
```

and call:

```typescript
handleUnavailableAction(unavailableAction.url);
```

- [ ] **Step 9: Run popup tests**

Run:

```bash
pnpm exec vitest run src/popup/hooks/use-tab-discovery.test.ts src/popup/components/__tests__/tab-command-palette.test.tsx
```

Expected: PASS.

- [ ] **Step 10: Commit popup discovery and UI**

Run:

```bash
git add src/popup/types.ts src/popup/hooks/use-tab-discovery.ts src/popup/hooks/use-tab-discovery.test.ts src/popup/components/tab-command-palette.tsx src/popup/components/__tests__/tab-command-palette.test.tsx
git commit -m "feat: guide users to enable local file access"
```

---

### Task 4: Sync Start Failure Copy And I18n

**Files:**
- Modify: `src/popup/hooks/use-sync-control.ts`
- Create: `src/popup/hooks/use-sync-control.test.ts`
- Modify locale files listed in the File Map

- [ ] **Step 1: Add i18n keys in source locale tree**

Add these keys to `src/shared/i18n/_locales/en/messages.json` near the existing ineligible and connection messages:

```json
  "ineligibleFileAccessDisabled": {
    "message": "Local file access is off"
  },
  "openExtensionSettings": {
    "message": "Open extension settings"
  },
  "localFilePrivacyNote": {
    "message": "Sync uses scroll position only. File contents are not uploaded."
  },
  "fileAccessConnectionFailed": {
    "message": "Could not connect to a local file tab. Turn on \"Allow access to file URLs\" for this extension, then reopen the popup."
  },
```

Add equivalent keys to every locale in `src/shared/i18n/_locales`:

```json
// ko
"ineligibleFileAccessDisabled": { "message": "로컬 파일 접근이 꺼져 있습니다" },
"openExtensionSettings": { "message": "확장 프로그램 설정 열기" },
"localFilePrivacyNote": { "message": "스크롤 위치만 동기화합니다. 파일 내용은 업로드되지 않습니다." },
"fileAccessConnectionFailed": { "message": "로컬 파일 탭에 연결할 수 없습니다. 이 확장 프로그램의 \"파일 URL에 대한 액세스 허용\"을 켠 다음 팝업을 다시 여세요." }

// ja
"ineligibleFileAccessDisabled": { "message": "ローカル ファイルへのアクセスがオフです" },
"openExtensionSettings": { "message": "拡張機能の設定を開く" },
"localFilePrivacyNote": { "message": "スクロール位置のみを同期します。ファイル内容はアップロードされません。" },
"fileAccessConnectionFailed": { "message": "ローカル ファイルのタブに接続できませんでした。この拡張機能の「ファイルの URL へのアクセスを許可する」をオンにしてから、ポップアップを開き直してください。" }

// fr
"ineligibleFileAccessDisabled": { "message": "L'accès aux fichiers locaux est désactivé" },
"openExtensionSettings": { "message": "Ouvrir les paramètres de l'extension" },
"localFilePrivacyNote": { "message": "La synchronisation utilise uniquement la position de défilement. Le contenu des fichiers n'est pas téléversé." },
"fileAccessConnectionFailed": { "message": "Impossible de se connecter à un onglet de fichier local. Activez \"Autoriser l'accès aux URL de fichier\" pour cette extension, puis rouvrez la fenêtre contextuelle." }

// es
"ineligibleFileAccessDisabled": { "message": "El acceso a archivos locales está desactivado" },
"openExtensionSettings": { "message": "Abrir la configuración de la extensión" },
"localFilePrivacyNote": { "message": "La sincronización solo usa la posición de desplazamiento. El contenido del archivo no se sube." },
"fileAccessConnectionFailed": { "message": "No se pudo conectar con una pestaña de archivo local. Activa \"Permitir acceso a URL de archivo\" para esta extensión y vuelve a abrir la ventana emergente." }

// de
"ineligibleFileAccessDisabled": { "message": "Der Zugriff auf lokale Dateien ist deaktiviert" },
"openExtensionSettings": { "message": "Erweiterungseinstellungen öffnen" },
"localFilePrivacyNote": { "message": "Die Synchronisierung verwendet nur die Scrollposition. Dateiinhalte werden nicht hochgeladen." },
"fileAccessConnectionFailed": { "message": "Es konnte keine Verbindung zu einem lokalen Datei-Tab hergestellt werden. Aktivieren Sie für diese Erweiterung \"Zugriff auf Datei-URLs zulassen\" und öffnen Sie das Popup erneut." }

// zh_CN
"ineligibleFileAccessDisabled": { "message": "本地文件访问已关闭" },
"openExtensionSettings": { "message": "打开扩展程序设置" },
"localFilePrivacyNote": { "message": "同步仅使用滚动位置。不会上传文件内容。" },
"fileAccessConnectionFailed": { "message": "无法连接到本地文件标签页。请为此扩展程序开启“允许访问文件网址”，然后重新打开弹出窗口。" }

// zh_TW
"ineligibleFileAccessDisabled": { "message": "本機檔案存取已關閉" },
"openExtensionSettings": { "message": "開啟擴充功能設定" },
"localFilePrivacyNote": { "message": "同步只使用捲動位置。不會上傳檔案內容。" },
"fileAccessConnectionFailed": { "message": "無法連線到本機檔案分頁。請為此擴充功能開啟「允許存取檔案網址」，然後重新開啟彈出視窗。" }

// hi
"ineligibleFileAccessDisabled": { "message": "लोकल फ़ाइल एक्सेस बंद है" },
"openExtensionSettings": { "message": "एक्सटेंशन सेटिंग खोलें" },
"localFilePrivacyNote": { "message": "सिंक केवल स्क्रोल स्थिति का उपयोग करता है। फ़ाइल सामग्री अपलोड नहीं की जाती।" },
"fileAccessConnectionFailed": { "message": "लोकल फ़ाइल टैब से कनेक्ट नहीं हो सका। इस एक्सटेंशन के लिए \"Allow access to file URLs\" चालू करें, फिर पॉपअप दोबारा खोलें।" }
```

Copy the same keys into matching `extension/_locales` files. For `extension/_locales/zh/messages.json`, use the `zh_CN` strings.

- [ ] **Step 2: Run i18n validation**

Run:

```bash
pnpm i18n:validate
```

Expected: PASS.

- [ ] **Step 3: Write failing sync-control tests**

Create `src/popup/hooks/use-sync-control.test.ts`:

```typescript
import { act, createElement } from 'react';

import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendMessage } from 'webext-bridge/popup';
import browser from 'webextension-polyfill';

import { getFileSchemeAccessInfo } from '~/shared/lib/file-scheme-access';

import type { TabInfo } from '../types';

import { useSyncControl } from './use-sync-control';

const { sendMessageMock, tabsCreateMock, tabsReloadMock, getFileSchemeAccessInfoMock } = vi.hoisted(
  () => ({
    sendMessageMock: vi.fn(),
    tabsCreateMock: vi.fn(),
    tabsReloadMock: vi.fn(),
    getFileSchemeAccessInfoMock: vi.fn(),
  }),
);

vi.mock('webext-bridge/popup', () => ({
  sendMessage: sendMessageMock,
}));

vi.mock('webextension-polyfill', () => ({
  default: {
    tabs: {
      create: tabsCreateMock,
      reload: tabsReloadMock,
    },
  },
}));

vi.mock('~/shared/lib/file-scheme-access', () => ({
  getFileSchemeAccessInfo: getFileSchemeAccessInfoMock,
}));

vi.mock('~/shared/lib/storage', () => ({
  loadSelectedTabIds: vi.fn().mockResolvedValue([]),
}));

vi.mock('~/shared/i18n', () => ({
  t: (key: string, substitutions?: string | string[]): string => {
    if (Array.isArray(substitutions)) {
      return `${key}:${substitutions.join(',')}`;
    }
    return key;
  },
}));

vi.mock('~/shared/lib/logger', () => ({
  ExtensionLogger: vi.fn().mockImplementation(() => ({
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

interface HookResult<T> {
  current: T;
}

interface RenderHookResult<T> {
  result: HookResult<T>;
  unmount: () => void;
}

interface SearchInputRef {
  current: { focus: () => void } | null;
}

interface ReactActEnvironmentGlobal {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
}

function enableReactActEnvironment(root: ReactActEnvironmentGlobal): void {
  root.IS_REACT_ACT_ENVIRONMENT = true;
}

function renderHook<T>(hook: () => T): RenderHookResult<T> {
  const container = document.createElement('div');
  const root = createRoot(container);
  let value: T;

  function HookHost(): null {
    value = hook();
    return null;
  }

  act(() => {
    root.render(createElement(HookHost));
  });

  return {
    result: {
      get current() {
        return value;
      },
    },
    unmount: () => {
      act(() => {
        root.unmount();
      });
    },
  };
}

async function waitFor(assertion: () => void): Promise<void> {
  const timeoutAt = Date.now() + 1_000;
  while (Date.now() < timeoutAt) {
    try {
      assertion();
      return;
    } catch {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
    }
  }
  assertion();
}

function renderUseSyncControl(tabs: Array<TabInfo>) {
  const searchInputRef: SearchInputRef = { current: { focus: vi.fn() } };
  return renderHook(() =>
    useSyncControl({
      selectedTabIds: tabs.map((tab) => tab.id),
      tabs,
      searchInputRef,
      onSelectedTabIdsChange: vi.fn(),
    }),
  );
}

describe('useSyncControl local file failures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enableReactActEnvironment(globalThis);
    vi.mocked(sendMessage).mockResolvedValue({
      success: false,
      connectedTabs: [],
      connectionResults: {
        1: { success: false, error: 'Could not establish connection' },
        2: { success: false, error: 'Could not establish connection' },
      },
      error: 'Failed to connect to at least 2 tabs',
    });
    vi.mocked(getFileSchemeAccessInfo).mockResolvedValue({
      canCheck: true,
      allowed: false,
      settingsUrl: 'chrome://extensions/?id=test-id',
    });
  });

  it('shows file access guidance when selected local file tabs fail to connect', async () => {
    const { result, unmount } = renderUseSyncControl([
      { id: 1, title: 'one.md', url: 'file:///Users/me/one.md', eligible: true },
      { id: 2, title: 'two.md', url: 'file:///Users/me/two.md', eligible: true },
    ]);

    await act(async () => {
      result.current.handleStart();
    });

    await waitFor(() => expect(result.current.error?.message).toBe('fileAccessConnectionFailed'));
    expect(result.current.error?.action?.label).toBe('openExtensionSettings');

    act(() => {
      result.current.error?.action?.handler();
    });

    expect(browser.tabs.create).toHaveBeenCalledWith({
      url: 'chrome://extensions/?id=test-id',
    });

    unmount();
  });

  it('keeps the generic retry action for non-file connection failures', async () => {
    const { result, unmount } = renderUseSyncControl([
      { id: 1, title: 'one', url: 'https://example.com/one', eligible: true },
      { id: 2, title: 'two', url: 'https://example.com/two', eligible: true },
    ]);

    await act(async () => {
      result.current.handleStart();
    });

    await waitFor(() =>
      expect(result.current.error?.message).toBe('Failed to connect to at least 2 tabs'),
    );
    expect(result.current.error?.action?.label).toBe('retry');

    unmount();
  });
});
```

- [ ] **Step 4: Run sync-control tests and verify they fail**

Run:

```bash
pnpm exec vitest run src/popup/hooks/use-sync-control.test.ts
```

Expected: FAIL because `useSyncControl` does not create file-access-specific errors.

- [ ] **Step 5: Implement file access sync failure guidance**

In `src/popup/hooks/use-sync-control.ts`, add imports:

```typescript
import { getFileSchemeAccessInfo } from '~/shared/lib/file-scheme-access';
import { isFileUrl } from '~/shared/lib/url-utils';
```

Add this helper near `INITIAL_SYNC_STATUS`:

```typescript
function hasSelectedFileTab(selectedTabIds: Array<number>, tabs: Array<TabInfo>): boolean {
  const selectedTabIdSet = new Set(selectedTabIds);
  return tabs.some((tab) => selectedTabIdSet.has(tab.id) && isFileUrl(tab.url));
}
```

Inside `handleStartWithRetry`, in the `if (!response.success)` block before generic `setError`, add:

```typescript
          if (hasSelectedFileTab(selectedTabIds, tabs)) {
            const fileSchemeAccessInfo = await getFileSchemeAccessInfo();
            setError({
              message: t('fileAccessConnectionFailed'),
              severity: 'error',
              timestamp: Date.now(),
              action: {
                label: t('openExtensionSettings'),
                handler: () => {
                  browser.tabs.create({ url: fileSchemeAccessInfo.settingsUrl }).catch((error) => {
                    logger.warn('Failed to open extension settings:', error);
                  });
                },
              },
            });

            return;
          }
```

Add `tabs` to the `useCallback` dependency list:

```typescript
    [selectedTabIds, tabs],
```

In the outer `catch (err)` block, before the generic `setError`, add the same file-tab branch:

```typescript
        if (hasSelectedFileTab(selectedTabIds, tabs)) {
          const fileSchemeAccessInfo = await getFileSchemeAccessInfo();
          setError({
            message: t('fileAccessConnectionFailed'),
            severity: 'error',
            timestamp: Date.now(),
            action: {
              label: t('openExtensionSettings'),
              handler: () => {
                browser.tabs.create({ url: fileSchemeAccessInfo.settingsUrl }).catch((error) => {
                  logger.warn('Failed to open extension settings:', error);
                });
              },
            },
          });
          return;
        }
```

- [ ] **Step 6: Run i18n and sync-control tests**

Run:

```bash
pnpm i18n:validate
pnpm exec vitest run src/popup/hooks/use-sync-control.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit sync failure guidance and i18n**

Run:

```bash
git add src/popup/hooks/use-sync-control.ts src/popup/hooks/use-sync-control.test.ts src/shared/i18n/_locales extension/_locales
git commit -m "feat: explain local file access failures"
```

---

### Task 5: Full Verification And Manual QA

**Files:**
- No planned source edits unless verification finds a bug.

- [ ] **Step 1: Run focused unit tests**

Run:

```bash
pnpm exec vitest run src/shared/lib/url-utils.test.ts src/shared/lib/file-scheme-access.test.ts src/popup/hooks/use-tab-discovery.test.ts src/popup/components/__tests__/tab-command-palette.test.tsx src/popup/hooks/use-sync-control.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run project verification**

Run:

```bash
pnpm i18n:validate
pnpm typecheck
pnpm test
```

Expected: PASS.

The `src/shared/lib/file-scheme-access.ts` helper must keep the explicit `FileSchemeAccessRoot` parameter and must pass typecheck without unsafe assertions or a global `chrome` declaration.

- [ ] **Step 3: Verify generated manifest**

Run:

```bash
pnpm build
```

Expected: PASS.

Then inspect generated manifest:

```bash
rg -n "file:///\\*" extension/manifest.json
```

Expected output includes `file:///*` in `host_permissions`, `content_scripts.matches`, and `web_accessible_resources.matches`.

- [ ] **Step 4: Manual Chrome QA with file access off**

Open Chrome with the extension loaded, keep "Allow access to file URLs" off, then open these tabs:

```text
file:///Users/jaemin/Downloads/ai-writing-prompt.md
file:///Users/jaemin/Downloads/google_oauth_client_secret_347730563177-22lu54lkqsv5gi2fvcs3r3i2tcspk2kb.apps.googleusercontent.com.json
```

Expected:

- Both local file tabs appear under unavailable tabs.
- The reason says local file access is off.
- The visible action opens `chrome://extensions/?id=<runtime.id>`.
- The row includes the privacy note.
- The JSON file content is not read, parsed, logged, or uploaded by this feature.

- [ ] **Step 5: Manual Chrome QA with file access on**

Enable "Allow access to file URLs" from the settings page, reopen the popup, and use the same tabs.

Expected:

- Both local file tabs are selectable.
- Starting manual sync succeeds if both tabs can receive the content script.
- Scrolling one local file relays ratio-based scroll sync to the other.
- A local `file:///.../report.pdf` remains unavailable.
- Normal HTTPS tabs still behave as before.

- [ ] **Step 6: Final diff review**

Run:

```bash
git status
git log --oneline -5
git diff origin/main...HEAD --stat
```

Expected:

- Working tree is clean after commits.
- Recent commits match the commit plan.
- Diff touches only manifest, URL helpers, popup discovery/UI, sync failure guidance, i18n, and tests.
