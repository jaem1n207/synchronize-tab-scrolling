# Translated Page Sync Design

## Context

PR #376 (`codex/command-item-highlight`) is still open and should remain unmerged while this work is
prepared. The translated-page sync follow-up must branch from that PR branch, then land after PR
#376 has been merged. This keeps the later merge stack clean because the follow-up includes the
command-item changes as its base.

User feedback:

> This was added, but there's a bug. Let's say we open an English page, the page is the same, and
> then we translate it into Turkish. The URL structure probably changes, and it can't synchronize
> the two pages.

The bug is not in scroll ratio synchronization itself. Ratio-based scroll sync can already align
documents with different heights after the user manually links tabs. The failure is that the
extension treats URL identity too literally when deciding whether tabs are the same page. Today,
`normalizeUrlForAutoSync()` groups tabs by protocol, host, and pathname after dropping query and
hash. This misses translated versions of the same document when locale is represented in the path,
query string, or subdomain.

There is already `applyLocalePreservingSync()` in `src/shared/lib/locale-utils.ts`, but it only
handles path-based locale preservation during URL sync. It does not help automatic grouping, and it
does not cover query- or subdomain-based locale structures.

## Goal

Support translated pages as first-class sync candidates:

- Automatically suggest sync for high-confidence translated versions of the same page.
- Offer an explicit "may be translations" suggestion for medium-confidence cases.
- Preserve each target tab's locale structure during synced navigation after sync starts.
- Support locale carried by path segments, query parameters, and subdomains.

## Non-Goals

- Do not use translation APIs, AI content matching, or page body text comparison.
- Do not automatically start sync without user confirmation.
- Do not infer matches from title similarity alone.
- Do not add a large site-specific registry in this iteration.
- Do not change scroll ratio math, manual offset behavior, or hot-path scroll handling.
- Do not merge or rewrite PR #376 from this branch.

## Branching

Create the implementation branch from `origin/codex/command-item-highlight`:

```text
main
  -> PR #376: codex/command-item-highlight
       -> follow-up: codex/translated-page-sync
```

The follow-up PR should target `main` after PR #376 lands, or be retargeted as needed while PR #376
is still open. Avoid duplicating or undoing PR #376 changes in the follow-up work.

## Architecture

Add a pure shared URL analysis module:

```text
src/shared/lib/translated-page-url-utils.ts
```

The module should parse a URL into two concepts:

```typescript
interface LocaleDescriptor {
  value: string;
  source: 'path' | 'query' | 'subdomain';
  key?: string;
  index?: number;
}

interface TranslatedPageSignature {
  canonicalKey: string;
  locale?: LocaleDescriptor;
  confidence: 'high' | 'medium' | 'low';
}
```

The `canonicalKey` represents page identity after removing locale-only URL parts while preserving
document identity parts. The `locale` descriptor records where the language code came from so URL
sync can later rewrite a source URL into the target tab's locale structure.

The existing auto-sync path should continue to support exact same-URL grouping. Translated-page
matching is an additional grouping path:

- Exact normalized URL match: existing behavior.
- High-confidence translated-page match: same translated-page group, normal suggestion flow.
- Medium-confidence translated-page match: suggestion with explicit uncertainty copy.
- Low-confidence translated-page match: no automatic suggestion.

## URL Matching Rules

### Locale Detection

Detect locale values in these carriers:

- Path segment: `/en/docs/install`, `/tr/docs/install`, `/en-US/docs/install`.
- Query parameter: `/docs/install?lang=en`, `/docs/install?locale=tr`.
- Subdomain label: `https://en.example.com/docs/install`.

Locale values should reuse the existing locale-code knowledge from `locale-utils.ts` where
possible. Regional values should handle common casing variants such as `en-US`, `en-us`, and
`pt_BR` if normalizing them can be done deterministically.

### Query Classification

Query handling must stop treating every query parameter as disposable. Query parameters fall into
three groups:

- Locale query: `lang`, `locale`, `hl`, `language`, `lng`, `ui`, `culture`.
- Tracking/noise query: `utm_*`, `ref`, `source`, `fbclid`, `gclid`.
- Identity query: everything else, including `id`, `page`, `doc`, `article`, `slug`.

Locale and tracking parameters are excluded from the canonical key. Identity parameters remain in
the canonical key, sorted deterministically.

Examples:

```text
/docs/install?lang=en&page=setup
/docs/install?lang=tr&page=setup
=> high confidence, same canonical key

/docs/install?lang=en&page=setup
/docs/install?lang=tr&page=config
=> not the same page
```

### High Confidence

High confidence means the same canonical page key can be derived deterministically after removing
locale-only URL parts.

Examples:

```text
https://example.com/en/docs/install
https://example.com/tr/docs/install
=> https://example.com/docs/install
```

```text
https://example.com/docs/install?lang=en
https://example.com/docs/install?lang=tr
=> https://example.com/docs/install
```

```text
https://en.example.com/docs/install
https://tr.example.com/docs/install
=> https://example.com/docs/install
```

High-confidence matches can use the standard sync suggestion flow with copy that says the tabs are
versions of the same translated page rather than literally the same URL.

### Medium Confidence

Medium confidence means locale carriers are present, root domain is compatible, and at least one
strong supporting signal suggests the pages are translations, but the canonical page key is not
identical. This covers translated slugs:

```text
https://example.com/en/getting-started
https://example.com/tr/baslangic
```

Preferred supporting signals:

- Both pages expose `link[rel="alternate"][hreflang]` entries that include each other's URL.
- Both pages expose the same `link[rel="canonical"]` after locale normalization.
- A content script can report page metadata that gives a stronger page-equivalence signal than URL
  shape alone.

Title similarity, tab creation timing, or shared brand words may help order candidates, but should
not be enough by themselves to show a medium-confidence suggestion.

Medium-confidence matches should show a distinct suggestion message, such as:

```text
These tabs may be translations of the same page. Start sync?
```

### Low Confidence

Low confidence means the extension cannot identify a translated-page relationship safely. Do not
show an automatic suggestion. The user can still manually select tabs in the popup.

Examples:

```text
https://example.com/en/pricing
https://example.com/tr/blog
```

## URL Sync Behavior

Once tabs are linked, navigation should preserve the target tab's locale carrier. The target tab's
existing locale structure wins over the source tab's structure.

Path locale:

```text
source before: /en/docs/install
source after:  /en/docs/config
target before: /tr/docs/install
target after:  /tr/docs/config
```

Query locale:

```text
source before: /docs/install?lang=en
source after:  /docs/config?lang=en
target before: /docs/install?lang=tr
target after:  /docs/config?lang=tr
```

Subdomain locale:

```text
source before: https://en.example.com/docs/install
source after:  https://en.example.com/docs/config
target before: https://tr.example.com/docs/install
target after:  https://tr.example.com/docs/config
```

Mixed carriers should prefer the target carrier. For example, if the source uses `/en/...` and the
target uses `?lang=tr`, the result should update the target path to the source page identity while
keeping `?lang=tr`.

If URL conversion fails, keep the existing fallback behavior: use the source URL directly. This is
consistent with current `applyLocalePreservingSync()` behavior.

## Auto-Sync Flow

The background auto-sync flow should remain guarded by the existing constraints:

- Auto-sync enabled.
- HTTP or HTTPS URL.
- Not forbidden URL.
- Not local development server.
- Not excluded URL or permanently excluded domain.
- Not domain-snoozed.
- Not manually overridden by active manual sync.
- Maximum auto-sync group size respected.

After these checks, grouping should consider translated-page signatures in addition to exact URL
keys.

High-confidence groups can reuse the existing `sync-suggestion:show` message with an added match
reason or match confidence field. Medium-confidence groups should also use the suggestion
infrastructure, but the payload should let the toast render uncertainty-aware copy.

## Content Metadata Flow

Medium-confidence matching may require page metadata that the background script cannot read
directly. Use content scripts to collect only small, deterministic metadata:

- `link[rel="canonical"]`.
- `link[rel="alternate"][hreflang]`.
- Current URL and document title if already available.

This should be requested outside the scroll hot path and with short timeouts, following existing
background messaging patterns. If metadata is unavailable, fall back to low confidence rather than
showing a speculative suggestion.

## UI Copy and i18n

The existing sync suggestion toast copy says "same URL". That wording is inaccurate for translated
page matches.

Add conditional copy for:

- High confidence: same translated page.
- Medium confidence: may be translations of the same page.

The content script toast renders shared i18n messages, so new keys must be added to all supported
extension locales under both locale trees when implementation begins:

```text
extension/_locales/
src/shared/i18n/_locales/
```

All 9 extension locales must remain complete.

## Error Handling

Failure should bias toward fewer suggestions:

- Invalid URL: no translated-page signature, use existing normalization fallback where possible.
- Ambiguous locale detection: low confidence.
- Metadata request timeout: low confidence.
- URL conversion failure during sync: source URL fallback.
- Unsupported protocol: no translated-page matching.

Do not throw from URL utility functions for malformed user or page URLs.

## Testing

### URL Utility Tests

Cover:

- Path locale high-confidence match.
- Query locale high-confidence match.
- Subdomain locale high-confidence match.
- Regional locale variants.
- Locale query removal.
- Tracking query removal.
- Identity query preservation.
- Different identity query values do not match.
- Unrelated localized pages remain low confidence.

### URL Sync Tests

Cover:

- Path locale preservation.
- Query locale preservation.
- Subdomain locale preservation.
- Mixed source and target carrier where target carrier wins.
- Invalid URL fallback.

### Background Tests

Cover:

- Two translated high-confidence tabs form one suggestion group.
- Existing exact same-URL grouping still works.
- Medium-confidence payload carries uncertainty metadata for the toast.
- Low-confidence localized pages do not trigger suggestions.
- Domain snooze, permanent exclusion, local-dev, forbidden URL, and manual override guards still
  apply.

### Content Script Tests

Cover metadata extraction for:

- Canonical link.
- Alternate hreflang links.
- Missing metadata.
- Malformed metadata URLs.

## Acceptance Criteria

- Opening English and Turkish versions of the same path-based page triggers a sync suggestion.
- Opening English and Turkish versions of the same query-locale page triggers a sync suggestion.
- Opening English and Turkish versions of the same subdomain-locale page triggers a sync suggestion.
- Translated slugs only trigger a suggestion when deterministic metadata supports the match.
- Unrelated localized pages do not trigger a sync suggestion.
- After sync starts, navigating in one tab preserves the other tab's locale carrier.
- Existing same-URL auto-sync behavior continues to pass regression tests.
- The implementation remains out of the scroll hot path.
- The design stacks cleanly on top of PR #376.
