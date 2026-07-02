# Follow Changed Tab Query Sync Design

## Context

URL Sync has two modes:

- `follow-changed-tab`: other tabs move to the website and page changed by the source tab.
- `keep-each-tabs-website`: other tabs keep their current website and open the matching page.

The existing mode design says `follow-changed-tab` should use the source page-identifying query
while preserving each target tab's language carrier. The implementation does this when the target
has a path, query, or subdomain locale marker, but it keeps `target.search` when the target has no
locale marker.

This causes search/result pages to lose query parameters. Example:

```text
A before: https://www.naver.com/
B before: https://www.naver.com/

A after:
https://search.naver.com/search.naver?where=nexearch&sm=top_hty&fbm=0&ie=utf8&query=hello&ackey=0eid74s6

B actual after:
https://search.naver.com/search.naver
```

The expected behavior is that B follows the same search page including the source page-identifying
query. Site-generated query values may change after navigation; the extension should not add
site-specific Naver rules.

## Goal

Make `follow-changed-tab` synchronize page-identifying query parameters the same way
`keep-each-tabs-website` does, without changing language preservation behavior.

Success criteria:

- Source identity query parameters are applied when `follow-changed-tab` receives a source URL with
  query parameters and the target URL has no locale marker.
- Target language carriers are still preserved for path locale, query locale, and subdomain locale
  targets.
- Locale-valued language query parameters such as `lang=en`, `locale=ko`, or `hl=ja` remain language
  carriers, not ordinary page identity query parameters.
- Tracking query parameters already treated as noise stay excluded from synced identity query.
- No raw URL or tab title logging is added.

## Non-Goals

- Do not add Naver-specific query rewriting.
- Do not copy target query parameters that are not language carriers.
- Do not change URL Sync message payloads or `ProtocolMap`.
- Do not change auto-sync grouping, tab discovery, popup UI, or scroll timing behavior.
- Do not change how URL Sync preserves the target hash.

## Design

Keep the fix in the pure URL utility layer:

- `resolveUrlSyncTarget(sourceUrl, targetUrl, 'follow-changed-tab')` continues to delegate to
  `applyTranslatedPageLocaleSync(sourceUrl, targetUrl)`.
- `applyTranslatedPageLocaleSync()` should use `buildSourceIdentitySearch(source)` when it rebuilds
  a source-website URL for a target without a locale marker.
- When the source locale came from query parameters and the target has no locale marker,
  `applyTranslatedPageLocaleSync()` should take an early `sourceLocale?.source === 'query' &&
!targetLocale` branch. That branch rebuilds the URL with `buildSourceIdentitySearch(source)`,
  stripping locale-valued query carriers such as `lang` and `hl` while preserving source identity
  query parameters.
- The generic `!targetLocale` fallback should keep returning `sourceUrl` for path/subdomain source
  locales. If neither side has a locale marker, it should rebuild from the source protocol, host,
  path, source identity query, and target hash.
- The existing path/query/subdomain locale branches should stay on the same helper path they already
  use, because those branches already apply source identity query while preserving target language.

The changed no-target-locale rebuild path should build:

```text
source protocol + source host + source path + source identity query + target hash
```

instead of:

```text
source protocol + source host + source path + target query + target hash
```

This keeps the behavior mode-general and avoids any search-engine-specific assumptions.

## Data Flow

1. A source tab changes URL and sends `url:sync` with the changed tab URL.
2. Background relays the message unchanged.
3. Each target content script checks URL Sync enabled state and repairs the stored mode if needed.
4. The target content script resolves the navigation URL with its current URL and the stored mode.
5. For `follow-changed-tab`, the resolver follows the source website and page, preserves target
   language carriers, applies source identity query, and preserves the target hash.
6. If the resolved URL differs from the current URL, manual offset is cleared and the content script
   navigates.

## Error Handling

Do not add new error states. Existing behavior stays:

- If either URL cannot be parsed in `follow-changed-tab`, return the source URL as the legacy
  fallback.
- If the resolved URL equals the current URL, skip navigation and do not clear manual offset.
- If storage repair fails before resolution, skip navigation and surface the existing URL Sync
  notice.

## Privacy

This change manipulates raw URLs in memory because navigation requires them, but it must not log
source URLs, target URLs, resolved URLs, tab titles, document titles, payload objects, or page
metadata. Existing logging should remain limited to tab IDs, mode, reason, counts, and booleans.

Before finishing implementation, run the repository privacy scan required by `AGENTS.md` for URL
Sync changes and review any logger-adjacent matches manually.

## Testing

Add pure utility regression tests in `src/shared/lib/translated-page-url-utils.test.ts`:

- `follow-changed-tab` applies source identity query when the target has no locale marker.
- A Naver-shaped source URL resolves to the same host/path with the source query, while preserving the
  target hash if present.
- `follow-changed-tab` still preserves target query locale and combines source identity query with
  the target locale query.
- `follow-changed-tab` still preserves target path locale and subdomain locale.

Add a content script scenario test only if pure utility coverage does not protect the actual
`url:sync` receiver path clearly enough. The existing scenario tests already cover enabled URL Sync
navigation and locale preservation, so a single no-target-locale query scenario is sufficient if
added.

Verification commands:

```bash
pnpm vitest run src/shared/lib/translated-page-url-utils.test.ts
pnpm vitest run src/__tests__/scenarios.test.ts
pnpm privacy:logging
pnpm typecheck
```

If time is tight, the minimum verification is the translated-page utility test plus the privacy
logging scan, because the behavior change is isolated to the pure URL resolver and touches raw URL
handling.
