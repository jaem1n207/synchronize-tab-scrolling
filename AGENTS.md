# AGENTS.md

This file provides guidance to AI coding agents when working with code in this repository.

## Project Overview

This is a cross-browser extension (Chrome, Edge, Firefox, Brave) for synchronizing scroll positions across browser tabs. The extension enables users to scroll in one tab and have linked tabs automatically scroll to the same proportional position, which is particularly useful for comparing documents, reviewing code changes, or analyzing data side by side.

## Tech Stack

- **Framework**: React 19 with TypeScript
- **Build Tool**: Vite
- **Styling**: UnoCSS + Tailwind + Shadcn UI
- **State Management**: React Query (@tanstack/react-query)
- **Extension API**: webextension-polyfill for cross-browser compatibility
- **Messaging**: webext-bridge for content script communication
- **Icons**: unplugin-icons

## Development Commands

```bash
# Install dependencies
pnpm install

# Development mode (Chrome/Edge/Brave)
pnpm dev

# Development mode (Firefox)
pnpm dev-firefox

# Production build
pnpm build

# Type checking
pnpm typecheck

# Linting with auto-fix
pnpm lint:fix

# Format code
pnpm format:fix

# Run tests
pnpm test

# Package extension
pnpm pack        # Creates .zip, .crx, and .xpi files

# Launch extension in browser for testing
pnpm start:chromium  # Chrome/Edge/Brave
pnpm start:firefox   # Firefox
```

## Architecture

### Extension Components

1. **Background Script** (`src/background/main.ts`)
   - Service worker (Manifest V3) for Chrome/Edge/Brave
   - Background script for Firefox
   - Manages extension lifecycle and tab events
   - Handles message passing between components
   - See `src/background/README.md` for detailed architecture

2. **Content Scripts** (`src/contentScripts/`)
   - Injected into web pages
   - Creates Shadow DOM for UI isolation
   - Handles scroll synchronization logic
   - Communicates with background script via webext-bridge
   - See `src/contentScripts/README.md` for detailed architecture

3. **Popup** (`src/popup/`)
   - Main UI for tab selection and sync control
   - Built with React and Shadcn UI components
   - See `src/popup/README.md` for detailed architecture

### Build Configuration

- **Vite Configs**:
  - `vite.config.mts`: Main config for popup page
  - `vite.config.background.mts`: Background script bundling
  - `vite.config.content.mts`: Content script bundling

- **Manifest Generation** (`src/manifest.ts`):
  - Dynamically generates manifest.json based on environment
  - Handles browser-specific differences (Firefox vs Chromium)
  - Configures permissions: tabs, storage, activeTab, host_permissions

### Key Implementation Details

1. **Cross-browser Support**:
   - Uses `webextension-polyfill` for unified API
   - Conditional manifest settings for Firefox (`browser_specific_settings`)
   - Different background script configurations per browser

2. **Message Passing**:
   - Uses `webext-bridge` for typed message communication
   - Background ↔ Content Script messaging for scroll sync

3. **Error Handling**:
   - Comprehensive error logging with React 19 error hooks
   - Separate logger instances per component scope

4. **Development Features**:
   - HMR support for faster development
   - Content script auto-reload in dev mode
   - Debug naming for dev builds

### CI/CD & Store Deployment

- **Release trigger**: Push to `main` runs `.github/workflows/release.yml`
- **Version management**: semantic-release analyzes Conventional Commits to determine version
- **Store publishing**: Automated via semantic-release plugins:
  - Chrome Web Store: `semantic-release-chrome` (OAuth 2.0)
  - Firefox AMO: `semantic-release-amo` (JWT, auto-submits source code)
  - Edge Add-ons: `@semantic-release/exec` → `scripts/publish-edge.mjs` (API v1.1, soft-fail)
- **Build separation**: Chrome and Firefox builds share `extension/` output — CI copies to `build/chrome/` and `build/firefox/` before semantic-release
- **Edge reuses Chrome build**: Same Chromium zip uploaded to both stores
- **Credential renewal**: Edge API Key expires and requires manual renewal in Partner Center

See `docs/guides/store-deployment.md` for detailed pipeline, credentials, and troubleshooting.

## Important Notes

- Extension uses Shadow DOM in content scripts for style isolation
- All network requests should use HTTPS (CSP requirement)
- Follows Manifest V3 for Chrome/Edge, with compatibility for Firefox
- Uses absolute z-index (2147483647) for content script UI to ensure visibility

### Adding New Extension Pages (e.g., Options Page)

When adding a new extension page (like an options page), update the following files:

1. `src/manifest.ts` - Add `options_ui` configuration
2. `vite.config.mts` - Add page entry to `rollupOptions.input`
3. `scripts/prepare.ts` - Add view name to `views` array in `stubIndexHtml()` function

## File Structure Patterns

- Components: `src/shared/components/ui/` (Shadcn UI components)
- Utilities: `src/shared/lib/`
- Internationalization: `src/shared/i18n/`
- Type definitions: `.d.ts` files at root and in src/

## Code Architecture & Design Patterns

### Structure Guidelines

- **FSD Segment Structure**: Each slice contains model/ (state), ui/ (components), api/ (server communication), lib/ (utilities)
- **Naming Conventions**: kebab-case for files/folders, PascalCase for component names
- **TypeScript Patterns**: Prefer interface over type, Union Types over enum
- **Type Safety**: Avoid any and type assertions like `as string`, prefer complete type inference including deep nested fields
- **Programming Style**: Declarative and functional programming patterns preferred

### UI Components

- **Form Validation**: Zod schemas with TanStack Form for robust form handling
- **UI Library**: shadcn/ui as base, customize using Awesome shadcn/ui
- **Animations**: Framer Motion for smooth transitions, reference MagicUI for advanced animated components
- **Styling**: UnoCSS
- **Accessibility**: Strict adherence to WCAG 2.1 AA guidelines for universal access

### Testing & Code Quality Philosophy

- **Testing Focus**: Write tests only for core business logic with strong domain coupling
- **Test Runner**: Vitest preferred for fast TypeScript testing
- **Code Comments**: Minimal comments - prefer self-documenting code with clear variable/function names
- **Exception**: Comments only for reusable utility interfaces, domain-specific hacky code, and complex calculations that require step-by-step explanation

### Development Workflow

- **Package Manager**: pnpm
- **New Dependencies**: Always install latest version
- **Code Organization**: Encapsulate complex logic into clear, purpose-specific functions
- **Theme Support**: Support dark/light mode
- **Commit Convention**: Conventional Commits with commitlint validation
- **Pull Requests**: Always create PRs with `--assignee jaem1n207`

## Error Handling & User Experience Patterns

### Suspense Integration

- **Network Requests**: Wrap all async data fetching with React Suspense
- **Loading States**: Provide meaningful loading indicators during data fetching
- **Granular Boundaries**: Use multiple Suspense boundaries for different UI sections
- **Fallback Components**: Design consistent loading skeletons that match final UI structure
- **Progressive Loading**: Load critical content first, defer secondary content

### ErrorBoundary Strategy

- **Granular Error Boundaries**: Wrap individual features and widgets with dedicated error boundaries
- **Error Segmentation**: Isolate errors to prevent entire app crashes
- **Graceful Degradation**: Provide meaningful error messages and recovery options
- **User Experience**: Implement retry mechanisms and alternative workflows
- **Error Context**: Capture and log detailed error context for debugging
- **Recovery Patterns**: Allow users to retry failed operations or continue with partial data

## Accessibility Standards

All components and features must follow WCAG 2.1 AA guidelines:

- **Semantic HTML**: Use proper HTML5 semantic elements, maintain logical heading hierarchy, define landmark regions
- **Keyboard Navigation**: All interactive elements keyboard accessible, visible focus indicators (3:1 contrast), logical tab order, Escape key for modals/overlays
- **Screen Readers**: Use ARIA labels/states/live regions, test with NVDA, JAWS, and VoiceOver
- **Color & Contrast**: 4.5:1 contrast for normal text, 3:1 for large text, never rely solely on color to convey information
- **Forms**: Associate all controls with labels, mark required fields with `aria-required`, group related controls with fieldset/legend
- **Dynamic Content**: Use `aria-live="polite"` for status updates, `aria-live="assertive"` for urgent alerts
- **Responsive**: Support up to 200% text zoom without horizontal scrolling
- **Motion**: Respect `prefers-reduced-motion` for animations

> For detailed accessibility audit patterns, see the `accessibility-auditor` and `web-design-guidelines` agent skills.

## Domain Knowledge

### Critical Pitfalls

See `docs/guides/known-pitfalls.md` (Korean) for 8 critical pitfalls with code examples:

1. Async I/O in hot paths
2. Event vs connection confusion
3. Grace period timing
4. Cache sync issues
5. Timing invariants
6. Global storage misuse
7. Service worker state loss
8. Background state priority

### Scroll Sync Pipeline

See `docs/guides/scroll-sync-pipeline.md` (Korean) for the complete scroll synchronization pipeline:

- Timing constants and thresholds
- Manual offset lifecycle
- Connection monitoring flow

### Store Deployment Pipeline

See `docs/guides/store-deployment.md` (Korean) for the complete CI/CD pipeline:

- GitHub Actions workflow and semantic-release configuration
- Store credentials setup (Chrome, Firefox, Edge)
- Credential renewal procedures
- Troubleshooting deployment failures

### Module Architecture Documentation

Each major module has detailed README documentation:

- `src/background/README.md` — Service worker architecture, message flow, key responsibilities
- `src/background/lib/README.md` — State management modules (sync-state, auto-sync, content-script-manager, keep-alive, messaging)
- `src/background/handlers/README.md` — Event handler registration pattern (scroll-sync, connection, auto-sync, tab-event handlers)
- `src/contentScripts/README.md` — Content script injection, scroll sync logic, Shadow DOM isolation
- `src/contentScripts/hooks/README.md` — useDragPosition and usePanelState hooks
- `src/contentScripts/components/README.md` — SyncControlPanel component (WCAG 2.1 AA, Shadow DOM compatible)
- `src/popup/README.md` — Popup UI architecture with 6 main components
- `src/popup/hooks/README.md` — 5 custom hooks for popup state management
- `src/popup/components/README.md` — 8 popup components with hierarchy and state management
- `src/shared/lib/README.md` — 13 utility modules (URL utils, scroll math, tab similarity, Korean search, etc.)
- `src/shared/hooks/README.md` — 4 shared hooks (keyboard shortcuts, modifier key, persistent state, system theme)
- `src/shared/types/README.md` — Type definitions for messages, sync-state, auto-sync-state
