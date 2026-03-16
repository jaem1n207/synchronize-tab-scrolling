# AGENTS.md

Cross-browser extension (Chrome/Edge/Firefox/Brave) synchronizing scroll positions across tabs. React 19 + TypeScript, Vite, UnoCSS + Tailwind + shadcn/ui, webextension-polyfill, webext-bridge.

## Structure

```
src/
├── background/          # Service worker (MV3). State, message relay, auto-sync
├── contentScripts/      # Page injection. Scroll sync engine, Shadow DOM UI
├── popup/               # Extension popup. Tab selection, sync control
├── shared/              # Cross-cutting. 13 utils, 4 hooks, shadcn UI, types, i18n
├── landing/             # Marketing site. SEPARATE build/CI/deploy pipeline
└── manifest.ts          # Dynamic manifest (Firefox vs Chromium)
scripts/                 # Build: prepare, prerender, manifest, i18n validate, store stats
docs/guides/             # Domain guides (Korean). Required reading before modifying related code
.github/workflows/       # 3 pipelines: release, deploy-landing, update-store-stats
```

## Where to Look

| Task                    | Location                                                     | Notes                                                                    |
| ----------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Scroll sync logic       | `src/contentScripts/scroll-sync.ts`                          | 987-line state machine. Read `docs/guides/scroll-sync-pipeline.md` first |
| Add message type        | `src/shared/types/messages.ts` + `shim.d.ts`                 | Must update ProtocolMap augmentation in both                             |
| Add shared utility      | `src/shared/lib/`                                            | Export via barrel `index.ts`                                             |
| Add popup feature       | `src/popup/components/` + `src/popup/hooks/`                 | See `src/popup/README.md`                                                |
| Add i18n key            | `extension/_locales/` + `src/shared/i18n/_locales/`          | Must exist in BOTH. Run `pnpm i18n:validate`                             |
| Modify background state | `src/background/lib/sync-state.ts` or `auto-sync-state.ts`   | Mutable objects. Persist via storage                                     |
| Add background handler  | `src/background/handlers/`                                   | Register in `main.ts` startup sequence                                   |
| Add content script UI   | `src/contentScripts/panel.tsx` or `suggestion-toast.tsx`     | Shadow DOM. z-index 2147483647                                           |
| Add shadcn component    | `src/shared/components/ui/`                                  | Re-export in barrel. Uses UnoCSS                                         |
| Modify manifest         | `src/manifest.ts`                                            | Check Firefox vs Chromium branches                                       |
| Add extension page      | `src/manifest.ts` + `vite.config.mts` + `scripts/prepare.ts` | Must update all three                                                    |
| Landing page work       | `src/landing/`                                               | Separate build. ALWAYS use `(landing)` commit scope                      |
| CI/CD changes           | `.github/workflows/`                                         | Two isolated pipelines. See CI Isolation Rules below                     |

## Commands

```bash
pnpm dev                # Dev (Chrome/Edge/Brave)
pnpm dev-firefox        # Dev (Firefox)
pnpm build              # Production build
pnpm typecheck          # Type checking
pnpm lint:fix           # ESLint + auto-fix
pnpm format:fix         # Prettier
pnpm test               # Vitest unit tests
pnpm test:e2e           # Playwright E2E (extension)
pnpm test:e2e:landing   # Playwright E2E (landing)
pnpm i18n:validate      # Validate locale key parity
pnpm health             # All checks (lint + format + typecheck + i18n)
pnpm pack               # Create .zip, .crx, .xpi
pnpm start:chromium     # Launch in Chrome/Edge/Brave
pnpm start:firefox      # Launch in Firefox
```

## Conventions

- **Files**: kebab-case. **Components**: PascalCase. **Hooks**: useCamelCase
- **Imports**: `~/` alias → `src/`. ESLint-enforced ordering: react → external → `~/` → relative → type
- **Barrel files**: Every directory with multiple exports has `index.ts`
- **TypeScript**: `interface` over `type`. Union types over enum. No `any`, no `as` assertions. `import type` enforced
- **Formatting**: Prettier — `singleQuote`, `printWidth: 100`, `tabWidth: 2`, `semi: true`
- **Commits**: Conventional Commits. Landing changes MUST use `(landing)` scope — without it, commits trigger extension store releases. `release.config.js`: `releaseRules: [{ scope: 'landing', release: false }]`
- **Pull Requests**: Always `--assignee jaem1n207`

## Anti-Patterns

### P0: Timing & State (will cause sync bugs)

1. **No async I/O in scroll handlers** — Never `await` in `handleScrollCore()`. Scroll fires 20x/sec
2. **Grace period invariant** — `PROGRAMMATIC_SCROLL_GRACE_PERIOD` (200ms) must exceed pipeline max (~115ms)
3. **Cache sync at ALL points** — `cachedManualOffset` must update at every save/clear. Mismatch → misaligned scrolling
4. **Startup ordering** — `restoreSyncState()` before `initializeAutoSync()`. Wrong order → race conditions
5. **Cleanup before new sync** — `scroll:stop` to old tabs BEFORE `scroll:start` to new. Prevents orphaned DOM

### P1: Storage & State (will cause leaks)

6. **Tab-specific data → `sessionStorage`** — Never `browser.storage.local` for per-tab state
7. **SW in-memory state lost on restart** — `Set`/`Map` state must restore from persistent storage
8. **Check `syncState` before pinging content scripts** — Chrome throttles background tab network

### P2: UI (will cause visual bugs)

9. **CSS Grid + truncate** — Add `min-w-0` to Grid items in DialogContent
10. **Dialog scroll** — Use `overflow-y-auto` + `overscroll-contain`, NOT Radix ScrollArea
11. **IME guard** — Check `isComposing || keyCode === 229` before keyboard nav in CJK input

### P3: i18n (will cause missing translations)

12. **Dual locale dirs** — Keys in BOTH `extension/_locales/` AND `src/shared/i18n/_locales/`
13. **9 locales complete** — en, ko, ja, fr, es, de, zh_CN, zh_TW, hi

### Never

- `@ts-ignore`, `as any` — fix the type
- Empty `catch(e) {}` — log or handle
- Delete failing tests to "pass"

## CI/CD

### Two Isolated Pipelines

| Change                | `release.yml` | `deploy-landing.yml` |
| --------------------- | ------------- | -------------------- |
| `src/landing/**` only | Skipped       | Runs                 |
| Extension code only   | Runs          | Skipped              |
| `src/shared/**`       | Runs          | Runs                 |
| Both                  | Runs          | Runs                 |

- **Extension release**: semantic-release → Chrome Web Store + Firefox AMO + Edge Add-ons. Dual build (Chrome + Firefox). Edge API key expires — manual renewal
- **Landing deploy**: Build → Playwright prerender → GitHub Pages. `LANDING_BASE=/synchronize-tab-scrolling/`
- **Store stats**: Weekly cron fetches CWS + AMO ratings. Commits with `(landing)` scope

## Architecture

- **Message passing**: webext-bridge (24 typed messages via `ProtocolMap` in `shim.d.ts`). CustomEvent for same-context (faster, untyped)
- **State**: No Redux/Zustand. Mutable module-level objects + `withAutoSyncLock()` mutex. Persisted to `browser.storage.local`
- **Content script UI**: Two independent React roots in Shadow DOM (`panel.tsx`, `suggestion-toast.tsx`). z-index 2147483647
- **Build**: 4 Vite configs — popup (HTML+JS), background (IIFE), content (IIFE), landing (HTML+JS). `mangle: false` for CWS readability
- **Manifest**: Generated by `scripts/manifest.ts` at build time, not by Vite

## Domain Knowledge

### Required Reading (Korean)

| Feature                     | Guide                                              |
| --------------------------- | -------------------------------------------------- |
| Scroll sync engine          | `docs/guides/scroll-sync-pipeline.md`              |
| Critical pitfalls (9)       | `docs/guides/known-pitfalls.md`                    |
| Domain exclusion            | `docs/guides/domain-exclusion.md`                  |
| Sync suggestion replacement | `docs/guides/sync-suggestion-replacement.md`       |
| Landing FOUC prevention     | `docs/guides/landing-fouc-and-flash-prevention.md` |
| Store deployment            | `docs/guides/store-deployment.md`                  |
| Store stats automation      | `docs/guides/store-stats-automation.md`            |
| Landing test fixes          | `docs/guides/landing-test-and-deploy-fix.md`       |

### Module READMEs

Each module has detailed architecture docs. See subdirectory AGENTS.md for background, contentScripts, and landing specifics:

- `src/background/README.md` + `AGENTS.md` — Service worker, state management, handlers
- `src/contentScripts/README.md` + `AGENTS.md` — Scroll sync engine, Shadow DOM, timing
- `src/landing/AGENTS.md` — Separate build/CI, i18n, theme, prerender
- `src/popup/README.md` — Popup architecture, hooks, components
- `src/shared/lib/README.md` — 13 utility modules
- `src/shared/hooks/README.md` — 4 shared hooks
- `src/shared/types/README.md` — Message, sync-state, auto-sync-state types

## Notes

- Shadow DOM in content scripts — styles must inject into shadow root
- HTTPS required (CSP). `localStorage` can throw `SecurityError` — always try/catch
- Content script re-injection: check for orphaned containers before creating new roots
- `pnpm health` before submitting PRs
