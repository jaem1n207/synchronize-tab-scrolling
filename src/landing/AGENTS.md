# Landing Page

Marketing site at `https://jaem1n207.github.io/synchronize-tab-scrolling/`. Completely separate from extension: own Vite config, CI pipeline, i18n system, and theme management.

**ALWAYS use `(landing)` commit scope.** Without it, commits trigger extension store releases.

## Key Files

| File                          | Purpose                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------- |
| `main.tsx`                    | Entry point. Detects prerendered content → `hydrateRoot()` or `createRoot()`                      |
| `app.tsx`                     | Root component. Header → Hero → Problem → HowItWorks → Features → UseCases → Trust → CTA → Footer |
| `index.html`                  | HTML template. Blocking `<script>` for theme + i18n FOUC prevention, JSON-LD                      |
| `lib/i18n.tsx`                | `LocaleProvider` + `useLocale()` + `useTranslation()`. 10 languages                               |
| `lib/detect-browser.ts`       | UA-based browser detection with result caching                                                    |
| `lib/constants.ts`            | Store URLs and browser key mappings                                                               |
| `lib/translations/*.ts`       | 10 translation files (en, ko, de, ru, it, vi, id, pl, tr, zh_TW)                                  |
| `components/theme-toggle.tsx` | Dark/light toggle. Separates explicit user choice from system theme                               |
| `components/hero/`            | Interactive scroll sync demo (6 sub-components)                                                   |
| `components/sections/`        | 6 content sections                                                                                |
| `hooks/use-scroll-sync.ts`    | Hero demo scroll sync logic                                                                       |
| `public/store-stats.json`     | Chrome/Firefox ratings, version, users (updated weekly by CI)                                     |

## Build & Deploy

- **Vite config**: `vite.config.landing.mts` — `LANDING_BASE=/synchronize-tab-scrolling/`
- **Build**: `pnpm build:landing` → `dist-landing/`
- **Prerender**: `pnpm prerender:landing` — Playwright captures rendered HTML, injects into dist
- **Deploy**: GitHub Pages via `deploy-landing.yml`
- **Prerender server strips `LANDING_BASE` from asset requests** — critical for GitHub Pages subdirectory deployment

## i18n (SEPARATE from extension)

- **10 languages**: en, ko, de, ru, it, vi, id, pl, tr, zh_TW (different set from extension's 9)
- **Storage key**: `landing-locale` (not shared with extension)
- **Architecture**: `LocaleProvider` context → `useLocale()` → `useTranslation()` hooks
- **FOUC prevention**: Blocking `<script>` in `<head>` sets `document.documentElement.lang` before React loads. `i18n-loading` CSS class hides content. 3-second fail-open timeout

## Theme

- **Storage key**: `landing-theme` (not shared with extension)
- **FOUC prevention**: Blocking `<script>` applies `.dark` class before CSS loads
- **Explicit vs system**: Only persists to `localStorage` on user click. System theme changes auto-apply only if no explicit choice made
- **`localStorage` can throw `SecurityError`** — both blocking script and React code wrap in try/catch

## Store Stats Automation

- **Weekly cron** (Monday 06:00 UTC): fetches Chrome Web Store (HTML scraping) + Firefox AMO (REST API v5)
- **Vite plugin** `injectStoreStats()`: injects ratings into JSON-LD `aggregateRating` at build time
- **Fallback**: existing `store-stats.json` values preserved if fetch fails
- **Commits** with `(landing)` scope → triggers landing deploy only

## Browser Detection Edge Cases

| Browser         | Detected As | Reason                                            |
| --------------- | ----------- | ------------------------------------------------- |
| Chrome          | `chrome`    | Direct UA match                                   |
| Arc, Dia, Brave | `chrome`    | Chromium-based, same UA pattern                   |
| Edge            | `edge`      | `Edg/` in UA — must check BEFORE Chrome           |
| Safari          | `safari`    | `Safari` in UA AND NOT `Chrome`                   |
| Prerender       | `chrome`    | Playwright runs Chromium. Actual users may differ |

Result cached per module instance. Detection order matters: Edge → Firefox → Safari → Chrome → unknown.

## Testing

- **Unit**: `src/landing/__tests__/` and `*/__tests__/` (Vitest + jsdom). Setup mocks IntersectionObserver, localStorage, matchMedia
- **Accessibility**: axe-core tests on Header, Hero, Features, Footer, and full App
- **E2E**: `e2e/landing/` (Playwright, port 4173) — page-load, i18n, navigation, responsive, keyboard-a11y, scroll-sync-demo
