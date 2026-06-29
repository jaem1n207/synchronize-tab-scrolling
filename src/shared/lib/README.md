# Shared Library

Pure utility functions and cross-cutting services used by background, content scripts, and popup. Each module is independently testable with co-located test files.

## Module Overview

| Module                         | Lines | Responsibility                                            | Tests |
| ------------------------------ | ----- | --------------------------------------------------------- | ----- |
| `auto-sync-url-utils.ts`       | —     | URL normalization and exclusion for auto-sync grouping    | Yes   |
| `url-utils.ts`                 | 306   | URL eligibility, local-file/PDF/special-scheme detection  | Yes   |
| `file-scheme-access.ts`        | 62    | Chromium file URL access probing and settings URLs        | Yes   |
| `scroll-math.ts`               | —     | Scroll position calculations, ratio-based positioning     | Yes   |
| `tab-similarity.ts`            | —     | Tab title/URL similarity scoring for matching             | Yes   |
| `korean-search.ts`             | —     | Korean text search with Hangul decomposition (초성 검색)  | Yes   |
| `korean-josa.ts`               | —     | Korean particle formatting for localized UI placeholders  | Yes   |
| `performance-utils.ts`         | —     | Debounce, throttle, and performance measurement utilities | Yes   |
| `locale-utils.ts`              | —     | Locale detection; delegates URL sync locale preservation  | Yes   |
| `translated-page-url-utils.ts` | —     | Translated-page keys, metadata matching, locale URL sync  | Yes   |
| `contextual-hints.ts`          | —     | Contextual hint registry, allowlists, thresholds, labels  | Yes   |
| `storage.ts`                   | —     | Typed wrappers for `browser.storage.local` operations     | Yes   |
| `logger.ts`                    | —     | `ExtensionLogger` class with scoped, leveled logging      | —     |
| `animations.ts`                | —     | CSS animation keyframe definitions                        | Yes   |
| `env.ts`                       | —     | Environment detection (dev/prod, browser type)            | —     |
| `platform.ts`                  | —     | OS detection for platform-specific keybindings            | Yes   |
| `utils.ts`                     | —     | General-purpose utilities (cn, clsx wrappers)             | Yes   |
| `index.ts`                     | —     | Barrel file re-exporting all modules                      | —     |

`url-utils.ts` allows browser-readable `file://` pages for manual sync while keeping PDFs, local
Word documents, browser internal pages, and unstable special schemes blocked. `file-scheme-access.ts`
wraps Chromium's `chrome.extension.isAllowedFileSchemeAccess()` API and returns the browser-specific
extension settings URL used by the popup.

`locale-utils.ts` keeps the legacy locale API, but URL sync locale preservation delegates to
`translated-page-url-utils.ts` so path, query, and subdomain locale carriers use one implementation.

`contextual-hints.ts` owns the contextual onboarding hint registry, the supported webpage-overlay
hint allowlist, pending URL Sync hint ID validation, and OS-specific shortcut labels. Keep renderer
and listener guards pointed at these helpers so supported hint IDs do not drift.

## Testing Strategy

Pure utility functions have 100% test coverage with co-located `*.test.ts` files. Tests use Vitest with descriptive `describe/it` blocks organized by input categories.

## Import Pattern

```typescript
import { normalizeUrlForAutoSync, isUrlExcluded } from '~/shared/lib';
import { ExtensionLogger } from '~/shared/lib/logger';
```

## Design Principles

- **Pure functions**: No side effects, deterministic outputs for given inputs
- **Type safety**: Strict TypeScript with no `any` or type assertions
- **Independence**: Each module can be tested in isolation without mocking
- **Cross-platform**: Works in background (service worker), content script, and popup contexts
- **Privacy**: Local-file helpers inspect URL metadata and browser capability only, never file contents
