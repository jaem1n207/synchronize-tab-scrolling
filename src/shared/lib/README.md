# Shared Library

Pure utility functions and cross-cutting services used by background, content scripts, and popup. Each module is independently testable with co-located test files.

## Module Overview

| Module                   | Lines | Responsibility                                            | Tests |
| ------------------------ | ----- | --------------------------------------------------------- | ----- |
| `auto-sync-url-utils.ts` | —     | URL normalization and exclusion for auto-sync grouping    | Yes   |
| `url-utils.ts`           | —     | Forbidden URL detection, URL validation                   | Yes   |
| `scroll-math.ts`         | —     | Scroll position calculations, ratio-based positioning     | Yes   |
| `tab-similarity.ts`      | —     | Tab title/URL similarity scoring for matching             | Yes   |
| `korean-search.ts`       | —     | Korean text search with Hangul decomposition (초성 검색)  | Yes   |
| `performance-utils.ts`   | —     | Debounce, throttle, and performance measurement utilities | Yes   |
| `locale-utils.ts`        | —     | Locale detection and language code normalization          | Yes   |
| `storage.ts`             | —     | Typed wrappers for `browser.storage.local` operations     | Yes   |
| `logger.ts`              | —     | `ExtensionLogger` class with scoped, leveled logging      | —     |
| `animations.ts`          | —     | CSS animation keyframe definitions                        | Yes   |
| `env.ts`                 | —     | Environment detection (dev/prod, browser type)            | —     |
| `platform.ts`            | —     | OS detection for platform-specific keybindings            | Yes   |
| `utils.ts`               | —     | General-purpose utilities (cn, clsx wrappers)             | Yes   |
| `index.ts`               | —     | Barrel file re-exporting all modules                      | —     |

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
