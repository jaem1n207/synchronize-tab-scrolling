# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

2. **Content Scripts** (`src/contentScripts/`)
   - Injected into web pages
   - Creates Shadow DOM for UI isolation
   - Handles scroll synchronization logic
   - Communicates with background script via webext-bridge

3. **Popup** (`src/popup/`)
   - Main UI for tab selection and sync control
   - Built with React and Shadcn UI components

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

## Accessibility Standards & Guidelines

All components and features must be fully accessible to users with disabilities, following WCAG 2.1 AA guidelines:

### Semantic HTML & Structure

- **Semantic Tags**: Use proper HTML5 semantic elements (`<main>`, `<section>`, `<article>`, `<nav>`, `<header>`, `<footer>`)
- **Heading Hierarchy**: Maintain logical heading structure (h1 → h2 → h3) without skipping levels
- **Landmark Regions**: Define clear page landmarks for screen reader navigation
- **List Semantics**: Use `<ul>`, `<ol>`, and `<dl>` for structured content
- **Form Labels**: Associate all form controls with descriptive `<label>` elements or `aria-labelledby`

### Keyboard Navigation Support

- **Focus Management**: Ensure all interactive elements are keyboard accessible
- **Tab Order**: Maintain logical tab sequence through interactive elements
- **Focus Indicators**: Provide visible focus indicators that meet 3:1 contrast ratio
- **Keyboard Shortcuts**: Implement intuitive keyboard shortcuts for power users
- **Escape Patterns**: Support Escape key to close modals, dropdowns, and overlays
- **Skip Links**: Provide "Skip to main content" links for efficient navigation

### Screen Reader Compatibility

- **ARIA Labels**: Use `aria-label`, `aria-labelledby`, and `aria-describedby` for context
- **ARIA States**: Implement `aria-expanded`, `aria-selected`, `aria-checked` for dynamic states
- **ARIA Live Regions**: Use `aria-live` for real-time status updates and notifications
- **Role Attributes**: Apply appropriate ARIA roles for custom components
- **Screen Reader Testing**: Test with NVDA, JAWS, and VoiceOver screen readers

### Visual Design & Color Accessibility

- **Color Independence**: Never rely solely on color to convey information
- **Contrast Ratios**: Maintain 4.5:1 contrast for normal text, 3:1 for large text
- **Focus Indicators**: Ensure 3:1 contrast ratio for focus states
- **Text Scaling**: Support up to 200% text zoom without horizontal scrolling
- **Color Blindness**: Test with color blindness simulators (Deuteranopia, Protanopia, Tritanopia)

### Real-Time Feedback & Status Updates

- **ARIA Live Regions**: Use `aria-live="polite"` for non-critical updates, `aria-live="assertive"` for urgent alerts
- **Progress Indicators**: Provide accessible progress updates during data processing
- **Error Announcements**: Announce form validation errors immediately to screen readers
- **Success Notifications**: Confirm successful actions with accessible feedback
- **Loading States**: Announce loading states and completion to assistive technologies

### Form Accessibility Standards

- **Required Fields**: Mark required fields with `aria-required="true"` and visual indicators
- **Error Messages**: Associate error messages with form controls using `aria-describedby`
- **Fieldsets**: Group related form controls with `<fieldset>` and `<legend>`
- **Input Types**: Use appropriate HTML5 input types (url, email, tel) for better UX
- **Placeholder Guidelines**: Don't rely on placeholders as labels; use proper labeling

### Interactive Component Accessibility

- **Button States**: Implement disabled, loading, and active states accessibly
- **Modal Dialogs**: Trap focus, manage focus return, and support Escape key
- **Dropdown Menus**: Support arrow key navigation and typeahead functionality
- **Data Tables**: Use proper table headers, captions, and scope attributes
- **Custom Components**: Ensure all custom UI components follow ARIA authoring practices
