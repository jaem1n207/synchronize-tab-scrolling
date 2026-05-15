# Translated Page Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make translated versions of the same page syncable when locale appears in path segments, query parameters, or subdomains.

**Architecture:** Add a pure translated-page URL utility that derives canonical page keys and target-locale URL rewrites. Use that utility in background auto-sync grouping, suggestion payload copy, and existing content-script URL sync. Add deterministic metadata support for translated slugs through small content-script metadata extraction.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, webext-bridge, webextension-polyfill, UnoCSS/Tailwind, shared JSON i18n.

---

## Scope Check

This plan implements one subsystem: translated-page URL identity for auto-sync and URL navigation. It does not alter scroll ratio math, popup tab selection, PR #376 command-item behavior, release workflows, or store-stat automation.

## File Structure

- Create `src/shared/lib/translated-page-url-utils.ts`: pure URL parsing, canonical key creation, metadata matching, and locale-preserving URL rewrite.
- Create `src/shared/lib/translated-page-url-utils.test.ts`: URL utility and URL rewrite regression tests.
- Modify `src/shared/lib/locale-utils.ts`: keep the public `applyLocalePreservingSync()` API by delegating to the new utility.
- Modify `src/shared/lib/locale-utils.test.ts`: keep existing path tests and add query/subdomain cases through the existing public API.
- Modify `src/shared/lib/index.ts`: export the new utility module.
- Modify `src/shared/types/auto-sync-state.ts`: store match metadata on auto-sync groups.
- Modify `src/shared/types/messages.ts`: add suggestion match metadata and content metadata message types.
- Modify `shim.d.ts`: mirror new webext-bridge protocol entries.
- Modify `src/background/lib/auto-sync-groups.ts`: use translated canonical keys when grouping tabs.
- Modify `src/background/lib/auto-sync-groups.test.ts`: prove high-confidence translated pages form one group.
- Modify `src/background/lib/auto-sync-suggestions.ts`: pass match metadata to toast payloads and compare active synced tabs with translated keys.
- Modify `src/background/lib/auto-sync-suggestions.test.ts`: prove suggestion payloads carry translated/possible-translation metadata.
- Modify `src/background/handlers/tab-event-handlers.ts`: use translated keys for add-tab suggestions during active sync.
- Modify `src/background/handlers/tab-event-handlers.test.ts`: prove translated new tabs can be suggested for active sync.
- Create `src/contentScripts/lib/translated-page-metadata.ts`: read canonical and alternate hreflang links from the current document.
- Create `src/contentScripts/lib/translated-page-metadata.test.ts`: metadata extraction tests.
- Modify `src/contentScripts/scroll-sync.ts`: register metadata message handler; keep URL sync handler using `applyLocalePreservingSync()`.
- Modify `src/contentScripts/components/sync-suggestion-toast.tsx`: choose copy based on match metadata.
- Modify `src/contentScripts/suggestion-toast.tsx`: no behavior change expected except typed payload compatibility.
- Modify locale files under `src/shared/i18n/_locales/*/messages.json` and `extension/_locales/*/messages.json`: add translated-page suggestion copy.
- Modify `docs/guides/sync-suggestion-replacement.md`: document translated-page suggestion behavior.

## Locale Copy

Add these message keys to every shared locale file and every extension locale file. The extension tree has a legacy `zh` folder; add the keys there too so runtime locale parity is preserved.

| Key                               | English text                                                           |
| --------------------------------- | ---------------------------------------------------------------------- |
| `foundTabsWithSameTranslatedPage` | `Found $COUNT$ tabs for the same translated page. Start sync?`         |
| `foundTabsMayBeTranslations`      | `These $COUNT$ tabs may be translations of the same page. Start sync?` |

Use these localized strings:

| Locale  | `foundTabsWithSameTranslatedPage`                                                         | `foundTabsMayBeTranslations`                                                                      |
| ------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `en`    | `Found $COUNT$ tabs for the same translated page. Start sync?`                            | `These $COUNT$ tabs may be translations of the same page. Start sync?`                            |
| `ko`    | `같은 번역 페이지의 탭 $COUNT$개를 찾았습니다. 동기화를 시작할까요?`                      | `이 탭 $COUNT$개는 같은 페이지의 번역판일 수 있습니다. 동기화를 시작할까요?`                      |
| `ja`    | `同じ翻訳ページのタブが $COUNT$ 個見つかりました。同期を開始しますか？`                   | `これら $COUNT$ 個のタブは同じページの翻訳版かもしれません。同期を開始しますか？`                 |
| `fr`    | `$COUNT$ onglets de la même page traduite ont été trouvés. Démarrer la synchronisation ?` | `Ces $COUNT$ onglets peuvent être des traductions de la même page. Démarrer la synchronisation ?` |
| `es`    | `Se encontraron $COUNT$ pestañas de la misma página traducida. ¿Iniciar sincronización?`  | `Estas $COUNT$ pestañas pueden ser traducciones de la misma página. ¿Iniciar sincronización?`     |
| `de`    | `$COUNT$ Tabs derselben übersetzten Seite gefunden. Synchronisierung starten?`            | `Diese $COUNT$ Tabs könnten Übersetzungen derselben Seite sein. Synchronisierung starten?`        |
| `zh_CN` | `找到 $COUNT$ 个同一翻译页面的标签页。开始同步吗？`                                       | `这 $COUNT$ 个标签页可能是同一页面的译文。开始同步吗？`                                           |
| `zh_TW` | `找到 $COUNT$ 個同一翻譯頁面的分頁。要開始同步嗎？`                                       | `這 $COUNT$ 個分頁可能是同一頁面的翻譯版本。要開始同步嗎？`                                       |
| `hi`    | `एक ही अनुवादित पेज के $COUNT$ टैब मिले। सिंक शुरू करें?`                                 | `ये $COUNT$ टैब एक ही पेज के अनुवाद हो सकते हैं। सिंक शुरू करें?`                                 |
| `zh`    | `找到 $COUNT$ 个同一翻译页面的标签页。开始同步吗？`                                       | `这 $COUNT$ 个标签页可能是同一页面的译文。开始同步吗？`                                           |

## Task 1: Build Translated Page URL Utility

**Files:**

- Create: `src/shared/lib/translated-page-url-utils.ts`
- Create: `src/shared/lib/translated-page-url-utils.test.ts`
- Modify: `src/shared/lib/locale-utils.ts`
- Modify: `src/shared/lib/locale-utils.test.ts`
- Modify: `src/shared/lib/index.ts`

- [ ] **Step 1: Write failing utility tests**

Add `src/shared/lib/translated-page-url-utils.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import {
  applyTranslatedPageLocaleSync,
  buildTranslatedPageSignature,
  getAutoSyncPageKey,
  isTranslatedPageMetadataMatch,
} from './translated-page-url-utils';

describe('buildTranslatedPageSignature', () => {
  it('builds the same canonical key for path locale variants', () => {
    expect(getAutoSyncPageKey('https://example.com/en/docs/install')).toBe(
      'https://example.com/docs/install',
    );
    expect(getAutoSyncPageKey('https://example.com/tr/docs/install')).toBe(
      'https://example.com/docs/install',
    );
  });

  it('builds the same canonical key for query locale variants while preserving identity query', () => {
    expect(getAutoSyncPageKey('https://example.com/docs/install?lang=en&page=setup')).toBe(
      'https://example.com/docs/install?page=setup',
    );
    expect(getAutoSyncPageKey('https://example.com/docs/install?lang=tr&page=setup')).toBe(
      'https://example.com/docs/install?page=setup',
    );
  });

  it('keeps different identity query values separate', () => {
    expect(getAutoSyncPageKey('https://example.com/docs/install?lang=en&page=setup')).not.toBe(
      getAutoSyncPageKey('https://example.com/docs/install?lang=tr&page=config'),
    );
  });

  it('builds the same canonical key for subdomain locale variants', () => {
    expect(getAutoSyncPageKey('https://en.example.com/docs/install')).toBe(
      'https://example.com/docs/install',
    );
    expect(getAutoSyncPageKey('https://tr.example.com/docs/install')).toBe(
      'https://example.com/docs/install',
    );
  });

  it('removes tracking query from canonical keys', () => {
    expect(
      getAutoSyncPageKey('https://example.com/en/docs/install?utm_source=mail&gclid=abc'),
    ).toBe('https://example.com/docs/install');
  });

  it('falls back to same-url normalization when no locale carrier exists', () => {
    expect(getAutoSyncPageKey('https://example.com/docs/install?x=1#top')).toBe(
      'https://example.com/docs/install',
    );
  });

  it('returns null for unsupported protocols and invalid URLs', () => {
    expect(buildTranslatedPageSignature('chrome://extensions')).toBeNull();
    expect(getAutoSyncPageKey('not a url')).toBeNull();
  });
});

describe('isTranslatedPageMetadataMatch', () => {
  it('matches pages that point to each other through alternate hreflang links', () => {
    expect(
      isTranslatedPageMetadataMatch(
        {
          url: 'https://example.com/en/getting-started',
          canonicalUrl: 'https://example.com/en/getting-started',
          alternateUrls: [{ hreflang: 'tr', href: 'https://example.com/tr/baslangic' }],
        },
        {
          url: 'https://example.com/tr/baslangic',
          canonicalUrl: 'https://example.com/tr/baslangic',
          alternateUrls: [{ hreflang: 'en', href: 'https://example.com/en/getting-started' }],
        },
      ),
    ).toBe(true);
  });

  it('does not match pages with unrelated metadata', () => {
    expect(
      isTranslatedPageMetadataMatch(
        { url: 'https://example.com/en/pricing', alternateUrls: [] },
        { url: 'https://example.com/tr/blog', alternateUrls: [] },
      ),
    ).toBe(false);
  });
});

describe('applyTranslatedPageLocaleSync', () => {
  it('preserves target path locale', () => {
    expect(
      applyTranslatedPageLocaleSync(
        'https://example.com/en/docs/config',
        'https://example.com/tr/docs/install',
      ),
    ).toBe('https://example.com/tr/docs/config');
  });

  it('preserves target query locale', () => {
    expect(
      applyTranslatedPageLocaleSync(
        'https://example.com/docs/config?lang=en',
        'https://example.com/docs/install?lang=tr',
      ),
    ).toBe('https://example.com/docs/config?lang=tr');
  });

  it('uses source identity query and target locale query for query-identity pages', () => {
    expect(
      applyTranslatedPageLocaleSync(
        'https://example.com/docs?page=config&lang=en&utm_source=mail',
        'https://example.com/docs?page=install&lang=tr#current',
      ),
    ).toBe('https://example.com/docs?page=config&lang=tr#current');
  });

  it('preserves target subdomain locale', () => {
    expect(
      applyTranslatedPageLocaleSync(
        'https://en.example.com/docs/config',
        'https://tr.example.com/docs/install',
      ),
    ).toBe('https://tr.example.com/docs/config');
  });

  it('uses target carrier when source and target carriers differ', () => {
    expect(
      applyTranslatedPageLocaleSync(
        'https://example.com/en/docs/config',
        'https://example.com/docs/install?lang=tr',
      ),
    ).toBe('https://example.com/docs/config?lang=tr');
  });

  it('falls back to source URL when parsing fails', () => {
    expect(applyTranslatedPageLocaleSync('invalid-url', 'https://example.com/tr/docs')).toBe(
      'invalid-url',
    );
  });
});
```

- [ ] **Step 2: Run utility tests and verify they fail**

Run:

```bash
pnpm exec vitest run src/shared/lib/translated-page-url-utils.test.ts src/shared/lib/locale-utils.test.ts
```

Expected: FAIL because `translated-page-url-utils.ts` does not exist.

- [ ] **Step 3: Implement the utility module**

Create `src/shared/lib/translated-page-url-utils.ts`:

```typescript
export type LocaleSource = 'path' | 'query' | 'subdomain';
export type TranslatedPageConfidence = 'high' | 'medium' | 'low';
export type AutoSyncSuggestionMatchKind = 'same-url' | 'translated-page' | 'possible-translation';

export interface LocaleDescriptor {
  value: string;
  source: LocaleSource;
  key?: string;
  index?: number;
}

export interface TranslatedPageSignature {
  canonicalKey: string;
  locale?: LocaleDescriptor;
  confidence: TranslatedPageConfidence;
  matchKind: AutoSyncSuggestionMatchKind;
}

export interface TranslatedPageAlternateLink {
  hreflang: string;
  href: string;
}

export interface TranslatedPageMetadata {
  url: string;
  title?: string;
  canonicalUrl?: string;
  alternateUrls: Array<TranslatedPageAlternateLink>;
}

const BASE_LOCALE_CODES = new Set([
  'af',
  'ar',
  'az',
  'be',
  'bg',
  'bs',
  'ca',
  'cs',
  'cy',
  'da',
  'de',
  'dv',
  'el',
  'en',
  'eo',
  'es',
  'et',
  'eu',
  'fa',
  'fi',
  'fo',
  'fr',
  'gl',
  'gu',
  'he',
  'hi',
  'hr',
  'hu',
  'hy',
  'id',
  'is',
  'it',
  'ja',
  'ka',
  'kk',
  'kn',
  'ko',
  'kok',
  'ky',
  'lt',
  'lv',
  'mi',
  'mk',
  'mn',
  'mr',
  'ms',
  'mt',
  'nb',
  'nl',
  'nn',
  'ns',
  'pa',
  'pl',
  'ps',
  'pt',
  'qu',
  'ro',
  'ru',
  'sa',
  'se',
  'sk',
  'sl',
  'sq',
  'sr',
  'sv',
  'sw',
  'syr',
  'ta',
  'te',
  'th',
  'tl',
  'tn',
  'tr',
  'tt',
  'ts',
  'uk',
  'ur',
  'uz',
  'vi',
  'xh',
  'zh',
  'zu',
]);

const LOCALE_QUERY_KEYS = new Set(['lang', 'locale', 'hl', 'language', 'lng', 'ui', 'culture']);
const TRACKING_QUERY_KEYS = new Set(['ref', 'source', 'fbclid', 'gclid']);

function normalizeLocaleValue(value: string): string | null {
  const cleaned = value.trim().replace('_', '-');
  const [language, region] = cleaned.split('-');
  const languageLower = language?.toLowerCase() ?? '';

  if (!BASE_LOCALE_CODES.has(languageLower)) {
    return null;
  }

  if (!region) {
    return languageLower;
  }

  if (!/^[a-z]{2}$/i.test(region)) {
    return null;
  }

  return `${languageLower}-${region.toUpperCase()}`;
}

function isLocaleValue(value: string): boolean {
  return normalizeLocaleValue(value) !== null;
}

function normalizeHost(hostname: string): string {
  const lower = hostname.toLowerCase();
  return lower.startsWith('www.') ? lower.slice(4) : lower;
}

function getLocaleFromPath(pathname: string): LocaleDescriptor | undefined {
  const segments = pathname.split('/').filter(Boolean);
  for (const [index, segment] of segments.entries()) {
    const value = normalizeLocaleValue(segment);
    if (value) {
      return { value, source: 'path', index };
    }
  }
  return undefined;
}

function removePathLocale(pathname: string, locale: LocaleDescriptor): string {
  if (locale.source !== 'path' || locale.index === undefined) {
    return pathname;
  }

  const segments = pathname.split('/').filter(Boolean);
  segments.splice(locale.index, 1);
  return `/${segments.join('/')}`;
}

function getLocaleFromQuery(searchParams: URLSearchParams): LocaleDescriptor | undefined {
  for (const [key, value] of searchParams.entries()) {
    if (!LOCALE_QUERY_KEYS.has(key.toLowerCase())) {
      continue;
    }

    const localeValue = normalizeLocaleValue(value);
    if (localeValue) {
      return { value: localeValue, source: 'query', key };
    }
  }
  return undefined;
}

function getLocaleFromSubdomain(hostname: string): LocaleDescriptor | undefined {
  const [firstLabel] = normalizeHost(hostname).split('.');
  if (!firstLabel) {
    return undefined;
  }

  const value = normalizeLocaleValue(firstLabel);
  return value ? { value, source: 'subdomain', index: 0 } : undefined;
}

function removeSubdomainLocale(hostname: string, locale?: LocaleDescriptor): string {
  const normalized = normalizeHost(hostname);
  if (locale?.source !== 'subdomain') {
    return normalized;
  }

  const labels = normalized.split('.');
  return labels.slice(1).join('.');
}

function shouldDropQueryParam(key: string, value: string): boolean {
  const lowerKey = key.toLowerCase();
  return (
    lowerKey.startsWith('utm_') ||
    TRACKING_QUERY_KEYS.has(lowerKey) ||
    (LOCALE_QUERY_KEYS.has(lowerKey) && isLocaleValue(value))
  );
}

function buildCanonicalSearch(searchParams: URLSearchParams): string {
  const kept = Array.from(searchParams.entries())
    .filter(([key, value]) => !shouldDropQueryParam(key, value))
    .sort(([keyA, valueA], [keyB, valueB]) => {
      const keyCompare = keyA.localeCompare(keyB);
      return keyCompare === 0 ? valueA.localeCompare(valueB) : keyCompare;
    });

  if (kept.length === 0) {
    return '';
  }

  const canonical = new URLSearchParams();
  for (const [key, value] of kept) {
    canonical.append(key, value);
  }
  return `?${canonical.toString()}`;
}

function buildSourceIdentitySearchWithTargetLocale(
  sourceSearchParams: URLSearchParams,
  targetLocale: LocaleDescriptor,
): string {
  const nextSearchParams = new URLSearchParams();

  for (const [key, value] of sourceSearchParams.entries()) {
    if (!shouldDropQueryParam(key, value)) {
      nextSearchParams.append(key, value);
    }
  }

  if (targetLocale.key) {
    nextSearchParams.set(targetLocale.key, targetLocale.value);
  }

  const search = nextSearchParams.toString();
  return search ? `?${search}` : '';
}

function buildUrl(protocol: string, host: string, pathname: string, search: string): string {
  return `${protocol}//${host}${pathname || '/'}${search}`;
}

export function buildTranslatedPageSignature(url: string): TranslatedPageSignature | null {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return null;
    }

    const pathLocale = getLocaleFromPath(parsed.pathname);
    const queryLocale = getLocaleFromQuery(parsed.searchParams);
    const subdomainLocale = getLocaleFromSubdomain(parsed.hostname);
    const locale = pathLocale ?? queryLocale ?? subdomainLocale;

    if (!locale) {
      return {
        canonicalKey: buildUrl(
          parsed.protocol,
          normalizeHost(parsed.hostname),
          parsed.pathname,
          '',
        ),
        confidence: 'low',
        matchKind: 'same-url',
      };
    }

    const host = removeSubdomainLocale(parsed.hostname, locale);
    const pathname = removePathLocale(parsed.pathname, locale);
    const search = buildCanonicalSearch(parsed.searchParams);

    return {
      canonicalKey: buildUrl(parsed.protocol, host, pathname, search),
      locale,
      confidence: 'high',
      matchKind: 'translated-page',
    };
  } catch {
    return null;
  }
}

export function getAutoSyncPageKey(url: string): string | null {
  const signature = buildTranslatedPageSignature(url);
  if (!signature) {
    return null;
  }

  return signature.canonicalKey;
}

function normalizeMetadataUrl(url: string): string | null {
  return getAutoSyncPageKey(url);
}

export function isTranslatedPageMetadataMatch(
  first: TranslatedPageMetadata,
  second: TranslatedPageMetadata,
): boolean {
  const firstUrl = normalizeMetadataUrl(first.url);
  const secondUrl = normalizeMetadataUrl(second.url);
  if (!firstUrl || !secondUrl) {
    return false;
  }

  const firstAlternates = new Set(
    first.alternateUrls.map((item) => normalizeMetadataUrl(item.href)),
  );
  const secondAlternates = new Set(
    second.alternateUrls.map((item) => normalizeMetadataUrl(item.href)),
  );

  if (firstAlternates.has(secondUrl) || secondAlternates.has(firstUrl)) {
    return true;
  }

  if (first.canonicalUrl && second.canonicalUrl) {
    return normalizeMetadataUrl(first.canonicalUrl) === normalizeMetadataUrl(second.canonicalUrl);
  }

  return false;
}

export function applyTranslatedPageLocaleSync(sourceUrl: string, targetUrl: string): string {
  try {
    const source = new URL(sourceUrl);
    const target = new URL(targetUrl);
    const sourceSignature = buildTranslatedPageSignature(sourceUrl);
    const targetSignature = buildTranslatedPageSignature(targetUrl);

    if (!sourceSignature || !targetSignature?.locale) {
      return sourceUrl;
    }

    const sourcePathWithoutLocale = sourceSignature.locale
      ? removePathLocale(source.pathname, sourceSignature.locale)
      : source.pathname;

    if (targetSignature.locale.source === 'path') {
      const segments = sourcePathWithoutLocale.split('/').filter(Boolean);
      const insertIndex = targetSignature.locale.index ?? 0;
      segments.splice(insertIndex, 0, targetSignature.locale.value);
      source.pathname = `/${segments.join('/')}`;
      source.hostname = removeSubdomainLocale(source.hostname, sourceSignature.locale);
      source.search = target.search;
      source.hash = target.hash;
      return source.toString();
    }

    if (targetSignature.locale.source === 'query' && targetSignature.locale.key) {
      source.pathname = sourcePathWithoutLocale;
      source.hostname = removeSubdomainLocale(source.hostname, sourceSignature.locale);
      source.search = buildSourceIdentitySearchWithTargetLocale(
        source.searchParams,
        targetSignature.locale,
      );
      source.hash = target.hash;
      return source.toString();
    }

    if (targetSignature.locale.source === 'subdomain') {
      source.pathname = sourcePathWithoutLocale;
      source.hostname = `${targetSignature.locale.value}.${removeSubdomainLocale(source.hostname, sourceSignature.locale)}`;
      source.search = target.search;
      source.hash = target.hash;
      return source.toString();
    }

    return sourceUrl;
  } catch {
    return sourceUrl;
  }
}
```

- [ ] **Step 4: Preserve the existing public locale API**

Modify the top of `src/shared/lib/locale-utils.ts`:

```typescript
import { applyTranslatedPageLocaleSync } from './translated-page-url-utils';
```

Replace the body of `applyLocalePreservingSync()` with:

```typescript
export function applyLocalePreservingSync(sourceUrl: string, targetUrl: string): string {
  return applyTranslatedPageLocaleSync(sourceUrl, targetUrl);
}
```

Keep the exported function name because `src/contentScripts/scroll-sync.ts` already imports it.

- [ ] **Step 5: Export the new module**

Add to `src/shared/lib/index.ts`:

```typescript
export * from './translated-page-url-utils';
```

- [ ] **Step 6: Run utility tests and verify they pass**

Run:

```bash
pnpm exec vitest run src/shared/lib/translated-page-url-utils.test.ts src/shared/lib/locale-utils.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 1**

```bash
git add src/shared/lib/translated-page-url-utils.ts src/shared/lib/translated-page-url-utils.test.ts src/shared/lib/locale-utils.ts src/shared/lib/locale-utils.test.ts src/shared/lib/index.ts
git commit -m "feat: add translated page URL utilities"
```

## Task 2: Add Match Metadata Types

**Files:**

- Modify: `src/shared/types/auto-sync-state.ts`
- Modify: `src/shared/types/messages.ts`
- Modify: `shim.d.ts`

- [ ] **Step 1: Add message and state types**

Modify `src/shared/types/messages.ts` near the auto-sync interfaces:

```typescript
import type {
  AutoSyncSuggestionMatchKind,
  TranslatedPageConfidence,
  TranslatedPageMetadata,
} from '~/shared/lib/translated-page-url-utils';
```

Add:

```typescript
export interface TranslatedPageMetadataRequestMessage {
  tabId: number;
}

export interface TranslatedPageMetadataResponseMessage extends TranslatedPageMetadata {
  success: boolean;
}
```

Extend `AutoSyncGroupInfo`, `SyncSuggestionMessage`, and `AddTabToSyncMessage`:

```typescript
export interface AutoSyncGroupInfo {
  normalizedUrl: string;
  tabIds: Array<number>;
  isActive: boolean;
  matchKind?: AutoSyncSuggestionMatchKind;
  matchConfidence?: TranslatedPageConfidence;
}

export interface SyncSuggestionMessage {
  normalizedUrl: string;
  tabCount: number;
  tabIds: Array<number>;
  tabTitles: Array<string>;
  matchKind?: AutoSyncSuggestionMatchKind;
  matchConfidence?: TranslatedPageConfidence;
  hasExistingSync?: boolean;
  existingSyncTabCount?: number;
}

export interface AddTabToSyncMessage {
  tabId: number;
  tabTitle: string;
  hasManualOffsets: boolean;
  normalizedUrl: string;
  matchKind?: AutoSyncSuggestionMatchKind;
  matchConfidence?: TranslatedPageConfidence;
}
```

Add protocol entry:

```typescript
'translated-page:get-metadata': TranslatedPageMetadataRequestMessage;
```

- [ ] **Step 2: Extend auto-sync group state**

Modify `src/shared/types/auto-sync-state.ts`:

```typescript
import type {
  AutoSyncSuggestionMatchKind,
  TranslatedPageConfidence,
} from '~/shared/lib/translated-page-url-utils';

export interface AutoSyncGroup {
  tabIds: Set<number>;
  isActive: boolean;
  matchKind?: AutoSyncSuggestionMatchKind;
  matchConfidence?: TranslatedPageConfidence;
}
```

- [ ] **Step 3: Mirror protocol map in shim**

Modify `shim.d.ts` imports:

```typescript
import type {
  TranslatedPageMetadataRequestMessage,
  TranslatedPageMetadataResponseMessage,
} from '~/shared/types/messages';
```

Add to webext-bridge protocol map:

```typescript
'translated-page:get-metadata': ProtocolWithReturn<
  TranslatedPageMetadataRequestMessage,
  TranslatedPageMetadataResponseMessage
>;
```

- [ ] **Step 4: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/shared/types/auto-sync-state.ts src/shared/types/messages.ts shim.d.ts
git commit -m "feat: add translated page sync message metadata"
```

## Task 3: Use Translated Keys for High-Confidence Auto-Sync Groups

**Files:**

- Modify: `src/background/lib/auto-sync-groups.ts`
- Modify: `src/background/lib/auto-sync-groups.test.ts`
- Modify: `src/background/lib/auto-sync-lifecycle.ts`
- Modify: `src/background/handlers/tab-event-handlers.ts`

- [ ] **Step 1: Write failing high-confidence group tests**

Add tests under `describe('updateAutoSyncGroup')` in `src/background/lib/auto-sync-groups.test.ts`:

```typescript
it('groups path-locale translated pages by canonical page key', async () => {
  normalizeUrlForAutoSyncMock.mockImplementation((url: string) => url.split('?')[0]);

  await updateAutoSyncGroup(1, 'https://example.com/en/docs/install');
  await updateAutoSyncGroup(2, 'https://example.com/tr/docs/install');

  const group = autoSyncState.groups.get('https://example.com/docs/install');
  expect(group?.tabIds).toEqual(new Set([1, 2]));
  expect(group?.matchKind).toBe('translated-page');
  expect(group?.matchConfidence).toBe('high');
  expect(showSyncSuggestion).toHaveBeenCalledWith('https://example.com/docs/install');
});

it('keeps identity query values separate for query-locale pages', async () => {
  await updateAutoSyncGroup(1, 'https://example.com/docs?lang=en&page=setup');
  await updateAutoSyncGroup(2, 'https://example.com/docs?lang=tr&page=config');

  expect(autoSyncState.groups.get('https://example.com/docs?page=setup')?.tabIds).toEqual(
    new Set([1]),
  );
  expect(autoSyncState.groups.get('https://example.com/docs?page=config')?.tabIds).toEqual(
    new Set([2]),
  );
  expect(showSyncSuggestion).not.toHaveBeenCalled();
});

it('groups subdomain-locale translated pages by canonical page key', async () => {
  await updateAutoSyncGroup(1, 'https://en.example.com/docs/install');
  await updateAutoSyncGroup(2, 'https://tr.example.com/docs/install');

  expect(autoSyncState.groups.get('https://example.com/docs/install')?.tabIds).toEqual(
    new Set([1, 2]),
  );
  expect(showSyncSuggestion).toHaveBeenCalledWith('https://example.com/docs/install');
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
pnpm exec vitest run src/background/lib/auto-sync-groups.test.ts
```

Expected: FAIL because `updateAutoSyncGroup()` still uses `normalizeUrlForAutoSync()` only.

- [ ] **Step 3: Implement canonical group key selection**

Modify imports in `src/background/lib/auto-sync-groups.ts`:

```typescript
import {
  buildTranslatedPageSignature,
  getAutoSyncPageKey,
} from '~/shared/lib/translated-page-url-utils';
```

Replace normalized URL calculation with:

```typescript
const normalizedUrl = getAutoSyncPageKey(url);
if (!normalizedUrl) {
  logger.info('[AUTO-SYNC] URL normalization returned null, skipping');
  return null;
}

const translatedSignature = buildTranslatedPageSignature(url);
```

When creating a new group, initialize match metadata:

```typescript
if (!group) {
  group = {
    tabIds: new Set(),
    isActive: false,
    matchKind: translatedSignature?.matchKind,
    matchConfidence: translatedSignature?.confidence,
  };
  autoSyncState.groups.set(normalizedUrl, group);
  logger.info('[AUTO-SYNC] Created new group', { normalizedUrl });
}
```

When broadcasting groups, include metadata:

```typescript
groups.push({
  normalizedUrl,
  tabIds: Array.from(group.tabIds),
  isActive: group.isActive,
  matchKind: group.matchKind,
  matchConfidence: group.matchConfidence,
});
```

- [ ] **Step 4: Keep initialization logs compatible**

In `src/background/lib/auto-sync-lifecycle.ts`, include optional fields in log objects:

```typescript
matchKind: g.matchKind,
matchConfidence: g.matchConfidence,
```

- [ ] **Step 5: Keep tab event group lookups on the same key**

In `src/background/handlers/tab-event-handlers.ts`, replace local group-key calculations that call
`normalizeUrlForAutoSync(url)` with `getAutoSyncPageKey(url)`. Keep `updateAutoSyncGroup(tabId, url)`
unchanged because that function owns all guard checks and group mutation.

Use this import:

```typescript
import { getAutoSyncPageKey } from '~/shared/lib/translated-page-url-utils';
```

The `onCreated` delayed suggestion lookup should read:

```typescript
const normalizedUrl = getAutoSyncPageKey(tab.url);
```

The `onUpdated` lookup should read:

```typescript
const normalizedUrl = getAutoSyncPageKey(url);
```

- [ ] **Step 6: Run group tests and typecheck**

Run:

```bash
pnpm exec vitest run src/background/lib/auto-sync-groups.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add src/background/lib/auto-sync-groups.ts src/background/lib/auto-sync-groups.test.ts src/background/lib/auto-sync-lifecycle.ts src/background/handlers/tab-event-handlers.ts
git commit -m "feat: group translated pages for auto sync"
```

## Task 4: Render Translated Suggestion Copy

**Files:**

- Modify: `src/background/lib/auto-sync-suggestions.ts`
- Modify: `src/background/lib/auto-sync-suggestions.test.ts`
- Modify: `src/contentScripts/components/sync-suggestion-toast.tsx`
- Modify: all files under `src/shared/i18n/_locales/*/messages.json`
- Modify: all files under `extension/_locales/*/messages.json`

- [ ] **Step 1: Write failing suggestion payload test**

In `src/background/lib/auto-sync-suggestions.test.ts`, add:

```typescript
it('includes translated-page match metadata in sync suggestion payload', async () => {
  const normalizedUrl = 'https://example.com/docs/install';
  autoSyncState.groups.set(normalizedUrl, {
    tabIds: new Set([1, 2]),
    isActive: false,
    matchKind: 'translated-page',
    matchConfidence: 'high',
  });

  await showSyncSuggestion(normalizedUrl);

  const showCalls = mockedSendMessageWithTimeout.mock.calls.filter(
    (call) => call[0] === 'sync-suggestion:show',
  );
  expect(showCalls[0]?.[1]).toMatchObject({
    matchKind: 'translated-page',
    matchConfidence: 'high',
  });
});
```

- [ ] **Step 2: Run the suggestion test and verify it fails**

Run:

```bash
pnpm exec vitest run src/background/lib/auto-sync-suggestions.test.ts
```

Expected: FAIL because payloads do not include match metadata.

- [ ] **Step 3: Pass match metadata from background**

In `src/background/lib/auto-sync-suggestions.ts`, import:

```typescript
import { getAutoSyncPageKey } from '~/shared/lib/translated-page-url-utils';
```

Update `hasSyncedTabMatchingUrl()` so active-sync duplicate detection uses translated page keys:

```typescript
async function hasSyncedTabMatchingUrl(normalizedUrl: string): Promise<boolean> {
  const results = await Promise.allSettled(
    syncState.linkedTabs.map(async (tabId) => {
      const tab = await browser.tabs.get(tabId);
      return tab.url ? getAutoSyncPageKey(tab.url) === normalizedUrl : false;
    }),
  );
  return results.some((r) => r.status === 'fulfilled' && r.value);
}
```

In both `showSyncSuggestion()` and `sendSuggestionToSingleTab()` payloads, add:

```typescript
matchKind: group.matchKind,
matchConfidence: group.matchConfidence,
```

- [ ] **Step 4: Choose copy in the toast**

In `src/contentScripts/components/sync-suggestion-toast.tsx`, add helper near the props interfaces:

```typescript
function getSyncSuggestionTitleKey(suggestion: SyncSuggestionMessage) {
  if (suggestion.matchKind === 'possible-translation') {
    return 'foundTabsMayBeTranslations';
  }

  if (suggestion.matchKind === 'translated-page') {
    return 'foundTabsWithSameTranslatedPage';
  }

  return 'foundTabsWithSameUrl';
}
```

Replace:

```tsx
{
  t('foundTabsWithSameUrl', String(suggestion.tabCount));
}
```

with:

```tsx
{
  t(getSyncSuggestionTitleKey(suggestion), String(suggestion.tabCount));
}
```

- [ ] **Step 5: Add i18n keys**

For each locale file listed in the Locale Copy section, add JSON entries next to `foundTabsWithSameUrl`. The English shape is:

```json
"foundTabsWithSameTranslatedPage": {
  "message": "Found $COUNT$ tabs for the same translated page. Start sync?",
  "placeholders": {
    "count": {
      "content": "$1",
      "example": "3"
    }
  }
},
"foundTabsMayBeTranslations": {
  "message": "These $COUNT$ tabs may be translations of the same page. Start sync?",
  "placeholders": {
    "count": {
      "content": "$1",
      "example": "3"
    }
  }
},
```

- [ ] **Step 6: Run suggestion and i18n validation**

Run:

```bash
pnpm exec vitest run src/background/lib/auto-sync-suggestions.test.ts
pnpm i18n:validate
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

```bash
git add src/background/lib/auto-sync-suggestions.ts src/background/lib/auto-sync-suggestions.test.ts src/contentScripts/components/sync-suggestion-toast.tsx src/shared/i18n/_locales extension/_locales
git commit -m "feat: show translated page sync suggestions"
```

## Task 5: Preserve Target Locale During URL Sync

**Files:**

- Modify: `src/shared/lib/locale-utils.test.ts`
- Modify: `src/__tests__/scenarios.test.ts`

- [ ] **Step 1: Add public API regression tests**

Add to `src/shared/lib/locale-utils.test.ts` under `describe('applyLocalePreservingSync')`:

```typescript
it('preserves target query locale through the existing public API', () => {
  const result = applyLocalePreservingSync(
    'https://example.com/docs/config?lang=en',
    'https://example.com/docs/install?lang=tr',
  );
  expect(result).toBe('https://example.com/docs/config?lang=tr');
});

it('preserves target subdomain locale through the existing public API', () => {
  const result = applyLocalePreservingSync(
    'https://en.example.com/docs/config',
    'https://tr.example.com/docs/install',
  );
  expect(result).toBe('https://tr.example.com/docs/config');
});
```

- [ ] **Step 2: Add scenario coverage for URL sync handler**

In `src/__tests__/scenarios.test.ts`, update the locale mock to delegate for query/subdomain URL tests:

```typescript
vi.mock('~/shared/lib/locale-utils', async () => {
  const actual = await vi.importActual<typeof import('~/shared/lib/locale-utils')>(
    '~/shared/lib/locale-utils',
  );
  return {
    ...actual,
    applyLocalePreservingSync: mocks.applyLocalePreservingSyncMock,
  };
});
```

Add a URL-sync scenario near existing content-script URL sync tests:

```typescript
it('preserves target query locale when relaying URL sync', async () => {
  mocks.applyLocalePreservingSyncMock.mockReturnValue('https://example.com/docs/config?lang=tr');

  await initScrollSync();
  const handler = mocks.contentHandlers.get('url:sync');
  expect(handler).toBeDefined();

  Object.defineProperty(window, 'location', {
    value: { href: 'https://example.com/docs/install?lang=tr' },
    writable: true,
  });

  await handler?.({
    data: {
      url: 'https://example.com/docs/config?lang=en',
      sourceTabId: 99,
    },
  });

  expect(mocks.applyLocalePreservingSyncMock).toHaveBeenCalledWith(
    'https://example.com/docs/config?lang=en',
    'https://example.com/docs/install?lang=tr',
  );
});
```

- [ ] **Step 3: Run URL sync tests**

Run:

```bash
pnpm exec vitest run src/shared/lib/locale-utils.test.ts src/__tests__/scenarios.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit Task 5**

```bash
git add src/shared/lib/locale-utils.test.ts src/__tests__/scenarios.test.ts
git commit -m "test: cover translated page URL sync"
```

## Task 6: Add Content Metadata Extraction

**Files:**

- Create: `src/contentScripts/lib/translated-page-metadata.ts`
- Create: `src/contentScripts/lib/translated-page-metadata.test.ts`
- Modify: `src/contentScripts/scroll-sync.ts`

- [ ] **Step 1: Write metadata extraction tests**

Create `src/contentScripts/lib/translated-page-metadata.test.ts`:

```typescript
import { afterEach, describe, expect, it } from 'vitest';

import { collectTranslatedPageMetadata } from './translated-page-metadata';

describe('collectTranslatedPageMetadata', () => {
  afterEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  it('collects canonical and alternate hreflang links', () => {
    document.head.innerHTML = `
      <link rel="canonical" href="https://example.com/en/getting-started" />
      <link rel="alternate" hreflang="tr" href="https://example.com/tr/baslangic" />
      <link rel="alternate" hreflang="de" href="https://example.com/de/erste-schritte" />
    `;
    document.title = 'Getting Started';

    expect(collectTranslatedPageMetadata('https://example.com/en/getting-started')).toEqual({
      success: true,
      url: 'https://example.com/en/getting-started',
      title: 'Getting Started',
      canonicalUrl: 'https://example.com/en/getting-started',
      alternateUrls: [
        { hreflang: 'tr', href: 'https://example.com/tr/baslangic' },
        { hreflang: 'de', href: 'https://example.com/de/erste-schritte' },
      ],
    });
  });

  it('ignores alternate links without hreflang or href', () => {
    document.head.innerHTML = `
      <link rel="alternate" href="https://example.com/tr/baslangic" />
      <link rel="alternate" hreflang="tr" />
    `;

    expect(collectTranslatedPageMetadata('https://example.com/en/getting-started')).toMatchObject({
      alternateUrls: [],
    });
  });
});
```

- [ ] **Step 2: Run metadata tests and verify they fail**

Run:

```bash
pnpm exec vitest run src/contentScripts/lib/translated-page-metadata.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement metadata extraction**

Create `src/contentScripts/lib/translated-page-metadata.ts`:

```typescript
import type { TranslatedPageMetadataResponseMessage } from '~/shared/types/messages';

export function collectTranslatedPageMetadata(url: string): TranslatedPageMetadataResponseMessage {
  const canonical = document.querySelector<HTMLLinkElement>('link[rel~="canonical"][href]');
  const alternateLinks = Array.from(
    document.querySelectorAll<HTMLLinkElement>('link[rel~="alternate"][hreflang][href]'),
  );

  return {
    success: true,
    url,
    title: document.title,
    canonicalUrl: canonical?.href,
    alternateUrls: alternateLinks.map((link) => ({
      hreflang: link.hreflang,
      href: link.href,
    })),
  };
}
```

- [ ] **Step 4: Register content-script metadata handler**

In `src/contentScripts/scroll-sync.ts`, import:

```typescript
import { collectTranslatedPageMetadata } from './lib/translated-page-metadata';
```

Register near the other `onMessage()` handlers:

```typescript
onMessage('translated-page:get-metadata', () => {
  return collectTranslatedPageMetadata(window.location.href);
});
```

- [ ] **Step 5: Run metadata tests and typecheck**

Run:

```bash
pnpm exec vitest run src/contentScripts/lib/translated-page-metadata.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit Task 6**

```bash
git add src/contentScripts/lib/translated-page-metadata.ts src/contentScripts/lib/translated-page-metadata.test.ts src/contentScripts/scroll-sync.ts
git commit -m "feat: collect translated page metadata"
```

## Task 7: Add Medium-Confidence Translated Slug Suggestions

**Files:**

- Create: `src/background/lib/translated-page-candidates.ts`
- Create: `src/background/lib/translated-page-candidates.test.ts`
- Modify: `src/background/lib/auto-sync-groups.ts`
- Modify: `src/background/lib/auto-sync-suggestions.test.ts`

- [ ] **Step 1: Write candidate matching tests**

Create `src/background/lib/translated-page-candidates.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';

import type { AutoSyncGroup } from '~/shared/types/auto-sync-state';

import { findTranslatedPageCandidateGroup } from './translated-page-candidates';

describe('findTranslatedPageCandidateGroup', () => {
  it('returns an existing group when metadata alternates connect the pages', async () => {
    const groups = new Map<string, AutoSyncGroup>([
      ['https://example.com/en/getting-started', { tabIds: new Set([1]), isActive: false }],
    ]);

    const getTabUrl = vi.fn(async () => 'https://example.com/en/getting-started');
    const getMetadata = vi
      .fn()
      .mockResolvedValueOnce({
        success: true,
        url: 'https://example.com/tr/baslangic',
        alternateUrls: [{ hreflang: 'en', href: 'https://example.com/en/getting-started' }],
      })
      .mockResolvedValueOnce({
        success: true,
        url: 'https://example.com/en/getting-started',
        alternateUrls: [{ hreflang: 'tr', href: 'https://example.com/tr/baslangic' }],
      });

    await expect(
      findTranslatedPageCandidateGroup({
        tabId: 2,
        url: 'https://example.com/tr/baslangic',
        groups,
        getTabUrl,
        getMetadata,
      }),
    ).resolves.toEqual({
      normalizedUrl: 'https://example.com/en/getting-started',
      matchKind: 'possible-translation',
      matchConfidence: 'medium',
    });
  });

  it('returns null when metadata is missing', async () => {
    await expect(
      findTranslatedPageCandidateGroup({
        tabId: 2,
        url: 'https://example.com/tr/blog',
        groups: new Map([
          ['https://example.com/en/pricing', { tabIds: new Set([1]), isActive: false }],
        ]),
        getTabUrl: vi.fn(async () => 'https://example.com/en/pricing'),
        getMetadata: vi.fn(async () => ({
          success: true,
          url: 'https://example.com/tr/blog',
          alternateUrls: [],
        })),
      }),
    ).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Run candidate tests and verify they fail**

Run:

```bash
pnpm exec vitest run src/background/lib/translated-page-candidates.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement candidate matcher**

Create `src/background/lib/translated-page-candidates.ts`:

```typescript
import type {
  AutoSyncSuggestionMatchKind,
  TranslatedPageConfidence,
  TranslatedPageMetadata,
} from '~/shared/lib/translated-page-url-utils';
import { isTranslatedPageMetadataMatch } from '~/shared/lib/translated-page-url-utils';
import type { AutoSyncGroup } from '~/shared/types/auto-sync-state';

interface CandidateLookupArgs {
  tabId: number;
  url: string;
  groups: Map<string, AutoSyncGroup>;
  getTabUrl: (tabId: number) => Promise<string | null>;
  getMetadata: (tabId: number, url: string) => Promise<TranslatedPageMetadata | null>;
}

interface CandidateLookupResult {
  normalizedUrl: string;
  matchKind: AutoSyncSuggestionMatchKind;
  matchConfidence: TranslatedPageConfidence;
}

export async function findTranslatedPageCandidateGroup({
  tabId,
  url,
  groups,
  getTabUrl,
  getMetadata,
}: CandidateLookupArgs): Promise<CandidateLookupResult | null> {
  const sourceMetadata = await getMetadata(tabId, url);
  if (!sourceMetadata) {
    return null;
  }

  for (const [normalizedUrl, group] of groups.entries()) {
    if (group.tabIds.has(tabId) || group.isActive) {
      continue;
    }

    const [candidateTabId] = Array.from(group.tabIds);
    if (candidateTabId === undefined) {
      continue;
    }

    const candidateUrl = await getTabUrl(candidateTabId);
    if (!candidateUrl) {
      continue;
    }

    const candidateMetadata = await getMetadata(candidateTabId, candidateUrl);
    if (!candidateMetadata) {
      continue;
    }

    if (isTranslatedPageMetadataMatch(sourceMetadata, candidateMetadata)) {
      return {
        normalizedUrl,
        matchKind: 'possible-translation',
        matchConfidence: 'medium',
      };
    }
  }

  return null;
}
```

- [ ] **Step 4: Integrate candidate matcher into grouping**

In `src/background/lib/auto-sync-groups.ts`, import:

```typescript
import { sendMessageWithTimeout } from './messaging';
import type { TranslatedPageMetadataResponseMessage } from '~/shared/types/messages';
```

Add helpers using existing timeout messaging:

```typescript
async function getTabMetadata(tabId: number, url: string) {
  try {
    const response = await sendMessageWithTimeout<TranslatedPageMetadataResponseMessage>(
      'translated-page:get-metadata',
      { tabId },
      { context: 'content-script', tabId },
      500,
    );
    return response?.success ? { ...response, url } : null;
  } catch {
    return null;
  }
}
```

After calculating `normalizedUrl`, before creating a new group, attempt medium matching when no
existing group exists:

```typescript
let group = autoSyncState.groups.get(normalizedUrl);
let groupKey = normalizedUrl;
let matchKind = translatedSignature?.matchKind;
let matchConfidence = translatedSignature?.confidence;

if (!group) {
  const candidate = await findTranslatedPageCandidateGroup({
    tabId,
    url,
    groups: autoSyncState.groups,
    getTabUrl: async (candidateTabId) => {
      try {
        const tab = await browser.tabs.get(candidateTabId);
        return tab.url ?? null;
      } catch {
        return null;
      }
    },
    getMetadata: getTabMetadata,
  });

  if (candidate) {
    groupKey = candidate.normalizedUrl;
    group = autoSyncState.groups.get(groupKey);
    matchKind = candidate.matchKind;
    matchConfidence = candidate.matchConfidence;
  }
}
```

Use `groupKey` instead of `normalizedUrl` for group map updates, pending suggestion checks, and the return value.

- [ ] **Step 5: Add medium payload regression**

In `src/background/lib/auto-sync-suggestions.test.ts`, add:

```typescript
it('includes possible-translation metadata in medium-confidence suggestion payload', async () => {
  const normalizedUrl = 'https://example.com/en/getting-started';
  autoSyncState.groups.set(normalizedUrl, {
    tabIds: new Set([1, 2]),
    isActive: false,
    matchKind: 'possible-translation',
    matchConfidence: 'medium',
  });

  await showSyncSuggestion(normalizedUrl);

  const showCalls = mockedSendMessageWithTimeout.mock.calls.filter(
    (call) => call[0] === 'sync-suggestion:show',
  );
  expect(showCalls[0]?.[1]).toMatchObject({
    matchKind: 'possible-translation',
    matchConfidence: 'medium',
  });
});
```

- [ ] **Step 6: Run candidate and grouping tests**

Run:

```bash
pnpm exec vitest run src/background/lib/translated-page-candidates.test.ts src/background/lib/auto-sync-groups.test.ts src/background/lib/auto-sync-suggestions.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit Task 7**

```bash
git add src/background/lib/translated-page-candidates.ts src/background/lib/translated-page-candidates.test.ts src/background/lib/auto-sync-groups.ts src/background/lib/auto-sync-groups.test.ts src/background/lib/auto-sync-suggestions.test.ts
git commit -m "feat: suggest possible translated page matches"
```

## Task 8: Use Translated Keys for Add-Tab Suggestions During Active Sync

**Files:**

- Modify: `src/background/handlers/tab-event-handlers.ts`
- Modify: `src/background/handlers/tab-event-handlers.test.ts`
- Modify: `src/background/lib/auto-sync-suggestions.ts`
- Modify: `src/background/lib/auto-sync-suggestions.test.ts`

- [ ] **Step 1: Write failing add-tab test**

Add to `src/background/handlers/tab-event-handlers.test.ts`:

```typescript
it('detects new translated tab as add-tab candidate for active sync', async () => {
  syncState.isActive = true;
  syncState.linkedTabs = [10];
  vi.mocked(browser.tabs.get).mockResolvedValue({
    id: 10,
    index: 0,
    highlighted: false,
    active: false,
    pinned: false,
    incognito: false,
    url: 'https://example.com/en/docs/install',
  } as browser.Tabs.Tab);

  await getListener('tabs.onUpdated')(
    20,
    { url: 'https://example.com/tr/docs/install' },
    { id: 20, url: 'https://example.com/tr/docs/install', title: 'Aday sekme' },
  );

  expect(showAddTabSuggestion).toHaveBeenCalledWith(
    20,
    'Aday sekme',
    'https://example.com/docs/install',
    'translated-page',
    'high',
  );
});
```

- [ ] **Step 2: Update function signature**

In `src/background/lib/auto-sync-suggestions.ts`, change:

```typescript
export async function showAddTabSuggestion(
  tabId: number,
  tabTitle: string,
  normalizedUrl: string,
): Promise<void> {
```

to:

```typescript
export async function showAddTabSuggestion(
  tabId: number,
  tabTitle: string,
  normalizedUrl: string,
  matchKind?: AutoSyncSuggestionMatchKind,
  matchConfidence?: TranslatedPageConfidence,
): Promise<void> {
```

Include those fields in the `sync-suggestion:add-tab` payload:

```typescript
matchKind,
matchConfidence,
```

- [ ] **Step 3: Compare translated keys in tab event handler**

In `src/background/handlers/tab-event-handlers.ts`, import:

```typescript
import {
  buildTranslatedPageSignature,
  getAutoSyncPageKey,
} from '~/shared/lib/translated-page-url-utils';
```

Replace the `onUpdated` URL key calculation with:

```typescript
const normalizedUrl = getAutoSyncPageKey(url);
```

Replace active-sync same URL comparison with:

```typescript
const syncedTabsWithSameUrl = await Promise.all(
  syncState.linkedTabs.map(async (syncedTabId) => {
    try {
      const syncedTab = await browser.tabs.get(syncedTabId);
      const syncedKey = syncedTab.url ? getAutoSyncPageKey(syncedTab.url) : null;
      return syncedKey === normalizedUrl;
    } catch {
      return false;
    }
  }),
);

const translatedSignature = buildTranslatedPageSignature(url);

if (syncedTabsWithSameUrl.some((match) => match) && !addTabSuggestedTabs.has(tabId)) {
  addTabSuggestedTabs.add(tabId);
  await showAddTabSuggestion(
    tabId,
    tab.title || 'Untitled',
    normalizedUrl,
    translatedSignature?.matchKind,
    translatedSignature?.confidence,
  );
}
```

- [ ] **Step 4: Update add-tab payload tests**

In `src/background/lib/auto-sync-suggestions.test.ts`, add:

```typescript
it('sends translated match metadata with add-tab suggestions', async () => {
  syncState.linkedTabs = [1, 2];

  await showAddTabSuggestion(
    3,
    'Translated tab',
    'https://example.com/docs/install',
    'translated-page',
    'high',
  );

  const addTabCalls = mockedSendMessageWithTimeout.mock.calls.filter(
    (call) => call[0] === 'sync-suggestion:add-tab',
  );
  expect(addTabCalls[0]?.[1]).toMatchObject({
    matchKind: 'translated-page',
    matchConfidence: 'high',
  });
});
```

- [ ] **Step 5: Run add-tab tests**

Run:

```bash
pnpm exec vitest run src/background/handlers/tab-event-handlers.test.ts src/background/lib/auto-sync-suggestions.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit Task 8**

```bash
git add src/background/handlers/tab-event-handlers.ts src/background/handlers/tab-event-handlers.test.ts src/background/lib/auto-sync-suggestions.ts src/background/lib/auto-sync-suggestions.test.ts
git commit -m "feat: detect translated tabs for active sync"
```

## Task 9: Update Documentation and Run Health Checks

**Files:**

- Modify: `docs/guides/sync-suggestion-replacement.md`
- Modify: `src/background/README.md` only if the auto-sync group responsibility table needs a translated-page note.
- Modify: `src/shared/lib/README.md` to list `translated-page-url-utils.ts`.

- [ ] **Step 1: Update sync suggestion guide**

Add this section to `docs/guides/sync-suggestion-replacement.md` after the overview:

```markdown
## Translated Page Matching

Sync suggestions now support translated versions of the same page. The background service worker
derives a canonical page key from each URL by removing locale-only URL parts while preserving page
identity parts.

Supported high-confidence locale carriers:

- Path segment: `/en/docs/install` and `/tr/docs/install`
- Query parameter: `/docs/install?lang=en` and `/docs/install?lang=tr`
- Subdomain: `https://en.example.com/docs/install` and `https://tr.example.com/docs/install`

Query parameters are classified before grouping:

- Locale query keys are removed from the canonical key: `lang`, `locale`, `hl`, `language`, `lng`,
  `ui`, `culture`
- Tracking query keys are removed from the canonical key: `utm_*`, `ref`, `source`, `fbclid`,
  `gclid`
- Identity query keys remain in the canonical key, including `id`, `page`, `doc`, `article`, and
  `slug`

Translated slugs are medium-confidence only. They require deterministic content metadata such as
matching `link[rel="alternate"][hreflang]` references. If metadata is unavailable, the extension
does not show a translated-page suggestion.
```

- [ ] **Step 2: Run targeted tests**

Run:

```bash
pnpm exec vitest run src/shared/lib/translated-page-url-utils.test.ts src/shared/lib/locale-utils.test.ts src/contentScripts/lib/translated-page-metadata.test.ts src/background/lib/translated-page-candidates.test.ts src/background/lib/auto-sync-groups.test.ts src/background/lib/auto-sync-suggestions.test.ts src/background/handlers/tab-event-handlers.test.ts src/__tests__/scenarios.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run project checks**

Run:

```bash
pnpm i18n:validate
pnpm typecheck
pnpm exec vitest run
git diff --check
```

Expected: PASS.

- [ ] **Step 4: Commit docs**

```bash
git add docs/guides/sync-suggestion-replacement.md src/background/README.md src/shared/lib/README.md
git commit -m "docs: document translated page sync matching"
```

If `src/background/README.md` or `src/shared/lib/README.md` did not change, omit those paths from `git add`.

## Final Verification

- [ ] **Step 1: Confirm branch stack**

Run:

```bash
git branch --show-current
git log --oneline main..HEAD
```

Expected: branch is `codex/translated-page-sync`, and history includes PR #376 commits followed by translated-page sync commits.

- [ ] **Step 2: Confirm working tree**

Run:

```bash
git status --short
```

Expected: no modified tracked files. Pre-existing untracked local folders may remain if they were present before this work.

- [ ] **Step 3: Prepare PR note**

Use this PR summary:

```markdown
## Summary

- add locale-aware translated-page URL canonicalization for path, query, and subdomain locale carriers
- group high-confidence translated pages for auto-sync suggestions and mark medium-confidence metadata matches explicitly
- preserve each target tab's locale carrier during URL sync after sync starts
- add translated-page suggestion copy across extension locales

## Verification

- `pnpm exec vitest run src/shared/lib/translated-page-url-utils.test.ts src/shared/lib/locale-utils.test.ts src/contentScripts/lib/translated-page-metadata.test.ts src/background/lib/translated-page-candidates.test.ts src/background/lib/auto-sync-groups.test.ts src/background/lib/auto-sync-suggestions.test.ts src/background/handlers/tab-event-handlers.test.ts src/__tests__/scenarios.test.ts`
- `pnpm i18n:validate`
- `pnpm typecheck`
- `pnpm exec vitest run`
- `git diff --check`

## Stack Note

This branch is based on PR #376 (`codex/command-item-highlight`). Merge PR #376 first, then merge this follow-up PR.
```
