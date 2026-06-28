# URL Sync Mode Design

## Context

GitHub issue #384 asks for relative URL navigation sync:

https://github.com/jaem1n207/synchronize-tab-scrolling/issues/384

The reported workflow is comparing production and staging pages, such as:

```text
https://acme.com/en-US/about-us
https://staging.acme.com/en-US/about-us
```

The current URL Sync implementation sends one absolute source URL in `url:sync`:

```typescript
interface UrlSyncMessage {
  url: string;
  sourceTabId: number;
}
```

The receiving content script applies `applyLocalePreservingSync(sourceUrl, targetUrl)`. That
preserves the target tab's language carrier when possible, but it still rebuilds the final URL from
the source tab's protocol and host. This is correct for existing users who expect linked tabs to
follow the changed tab's website, but it breaks staging and production comparisons because the
staging tab leaves its own website.

This is not a scroll synchronization bug. The root issue is that URL Sync currently has only one
navigation policy. The product needs two explicit policies that are visible and understandable to
non-developer users.

## Goal

Add a clear URL Sync mode selector with two modes:

- `Follow changed tab`
- `Keep each tab's website`

The existing behavior remains the default. The new mode lets each target tab keep its current
website while following the changed page within that website.

Users must always be able to see which mode is active. If the extension cannot apply the displayed
mode, it must not silently behave like another mode.

## Non-Goals

- Do not add a `smart` mode.
- Do not infer staging, preview, live, or development environments automatically.
- Do not change scroll ratio math, manual offset behavior, or hot-path scroll timing.
- Do not change auto-sync grouping behavior in this iteration.
- Do not remove language-preserving URL Sync behavior.
- Do not replace URL Sync with per-site rules or a site-specific mapping system.

## User Model

Most users should not need to understand terms such as absolute URL, relative URL, origin, host, or
path. The UI should frame the choice as a behavior:

- Should the other tabs follow the website I just changed?
- Or should each tab stay on its own website?

Developer-facing names can be more precise internally, but user-facing copy should stay in plain
language.

## Product Behavior

### URL Sync Toggle

Keep the existing URL Sync on/off toggle.

When URL Sync is on, show the active mode directly below the toggle. When URL Sync is off, keep the
mode visible but disabled so users can still understand what will happen when URL Sync is turned
back on.

### Mode 1: Follow Changed Tab

This is the default and preserves current behavior.

User-facing label:

```text
Follow changed tab
```

User-facing explanation:

```text
Other tabs move to the website you changed.
```

Behavior:

- Use the changed tab's protocol, website, and page as the base.
- Preserve each target tab's language when possible.
- If language preservation fails, navigation may fall back within this same mode, but the user
  should be told that language could not be preserved.

Example:

```text
Changed tab after:
https://example.com/en/about

Other tab before:
https://staging.example.com/ko/home

Other tab after:
https://example.com/ko/about
```

The other tab followed the changed tab's website, while keeping Korean when possible.

### Mode 2: Keep Each Tab's Website

This is the new mode for staging, production, preview, and similar comparison workflows.

User-facing label:

```text
Keep each tab's website
```

User-facing explanation:

```text
Other tabs stay on their own website and open the matching page.
```

Behavior:

- Preserve the target tab's protocol, host, and port.
- Apply the changed tab's page movement within that target website.
- Preserve each target tab's language when possible.
- Do not fall back to `Follow changed tab` if this mode cannot produce a safe target URL.

Example:

```text
Changed tab after:
https://example.com/en/about

Other tab before:
https://staging.example.com/ko/home

Other tab after:
https://staging.example.com/ko/about
```

The other tab stayed on staging while opening the matching page, and it kept Korean when possible.

### Shared Language Rule

Both modes should show a small helper line near the selector:

```text
Languages are kept when possible.
```

This is a common rule, not a separate mode. It should not be hidden in a tooltip because translated
page comparison is a core extension workflow.

## URL Calculation Rules

### Follow Changed Tab

Use the existing locale-preserving URL sync behavior.

Given:

```text
sourceUrl = https://example.com/en/about?tab=pricing#plans
targetUrl = https://staging.example.com/ko/home?view=compact#intro
```

Result:

```text
https://example.com/ko/about?tab=pricing#intro
```

This mode follows the source website and page, preserves the target language carrier, uses the
source page-identifying query, and preserves the target hash according to the existing
locale-preserving behavior.

### Keep Each Tab's Website

Use the target tab's website boundary and apply the source page movement inside it.

Given:

```text
sourceUrl = https://example.com/en/about?tab=pricing#plans
targetUrl = https://staging.example.com/ko/home?view=compact#intro
```

Result:

```text
https://staging.example.com/ko/about?tab=pricing#intro
```

This mode preserves:

- target protocol
- target host
- target port
- target language carrier
- target hash, matching the existing URL Sync behavior

It applies:

- source page path after language normalization
- source page-identifying query, while preserving target language query carriers

If either URL cannot be parsed as an HTTP or HTTPS URL, this mode should not navigate.

## State Truth Rule

The mode displayed in the UI must always match the mode that will actually be applied.

Silent fallback from one user-selected mode to another is not allowed.

### Missing or Invalid Saved Mode

If the stored `urlSyncMode` is missing because the user has not chosen a mode yet:

- Default to `follow-changed-tab`.
- Show `Follow changed tab` in the UI.
- Do not show an error. This is the normal first-install and upgrade path.

If the stored `urlSyncMode` is unknown or unreadable:

- Reset the actual mode to `follow-changed-tab`.
- Save `follow-changed-tab` back to storage.
- Broadcast the repaired mode to linked tabs when possible.
- Show `Follow changed tab` in the UI.
- Show an actionable message:

```text
URL Sync mode was reset because the saved setting was not valid.
```

### Keep Each Tab's Website Calculation Failure

If the user selected `Keep each tab's website` but the extension cannot safely produce a target URL:

- Do not navigate.
- Do not behave like `Follow changed tab`.
- Keep the selected mode unchanged.
- Show an actionable message:

```text
Could not keep this tab on its current website for that page change. No navigation was synced.
```

The message should make it clear that the user can switch to `Follow changed tab` if they want the
other behavior.

### Language Preservation Failure

If the user selected `Follow changed tab` and language preservation fails, a source URL fallback is
allowed because the extension is still following the selected mode. However, the user should be
notified:

```text
Language could not be preserved for this page change.
```

The same notice can apply in `Keep each tab's website` when navigation remains within the selected
mode but language preservation cannot be applied.

## UI Design

### Popup

The popup should expose URL Sync status and mode clearly enough that a user does not need to hunt
through a menu to understand current behavior.

Recommended structure:

```text
URL Sync                         [on/off]
Choose how linked tabs follow page changes.

[ Follow changed tab       ]
[ Keep each tab's website  ]

Languages are kept when possible.
```

The selector should be a compact segmented control or two-option radio group, not a hidden dropdown.
The selected mode needs a strong visual state, such as a checkmark, selected background, or both.

When URL Sync is off:

- Keep the selected mode visible.
- Disable mode changes.
- Retain the helper text.

### In-Page Panel

The content script panel should mirror the same setting because some users primarily control sync
from the in-page panel.

The panel has less room, so the mode selector can be compact, but the active mode must still be
visible. If space is tight, show the two labels with concise descriptions available in a tooltip or
details row. The current mode should not be represented only by an icon.

### Copy

English source copy:

```text
URL Sync
Choose how linked tabs follow page changes.
Follow changed tab
Other tabs move to the website you changed.
Keep each tab's website
Other tabs stay on their own website and open the matching page.
Languages are kept when possible.
URL Sync mode was reset because the saved setting was not valid.
Could not keep this tab on its current website for that page change. No navigation was synced.
Language could not be preserved for this page change.
```

All copy must be added to both locale trees:

- `extension/_locales`
- `src/shared/i18n/_locales`

All supported locales must remain complete.

## Architecture

### Types

Add a shared URL Sync mode type:

```typescript
export type UrlSyncMode = 'follow-changed-tab' | 'keep-each-tabs-website';
```

Add a mode change message:

```typescript
export interface UrlSyncModeChangedMessage {
  mode: UrlSyncMode;
  notice?: string;
}
```

Update `ProtocolMap` in:

- `src/shared/types/messages.ts`
- `shim.d.ts`

### Storage

Keep the existing boolean toggle and add a separate mode preference:

```typescript
urlSyncEnabled: boolean;
urlSyncMode: UrlSyncMode;
```

Add:

```typescript
saveUrlSyncMode(mode: UrlSyncMode): Promise<void>
loadUrlSyncMode(): Promise<UrlSyncMode>
```

The load path should validate the stored value. If the value is missing, return
`follow-changed-tab` without an error notice. If the value is invalid, callers that can write should
repair storage to `follow-changed-tab` and surface the reset notice.

### URL Resolution

Add a pure URL resolution API in `src/shared/lib/translated-page-url-utils.ts` or a focused
adjacent module:

```typescript
interface UrlSyncNavigationResult {
  status: 'navigate';
  url: string;
  notice?: string;
}

interface UrlSyncBlockedResult {
  status: 'blocked';
  reason: 'invalid-source-url' | 'invalid-target-url';
  message: string;
}

type UrlSyncResolutionResult = UrlSyncNavigationResult | UrlSyncBlockedResult;

function resolveUrlSyncTarget(
  sourceUrl: string,
  targetUrl: string,
  mode: UrlSyncMode,
): UrlSyncResolutionResult;
```

`follow-changed-tab` should delegate to the existing `applyTranslatedPageLocaleSync()` behavior so
existing tests and behavior stay stable.

`keep-each-tabs-website` should reuse the same locale analysis helpers where possible, but rebuild
the final URL from the target tab's protocol, host, and port.

### Content Script Runtime

In `src/contentScripts/scroll-sync.ts`:

- On `url:sync`, load the current URL Sync enabled state.
- If disabled, do not navigate.
- Load and validate the current mode.
- Resolve the target URL with the current mode.
- If resolution returns `blocked`, keep the current URL and show the error message.
- If resolution returns `navigate`, clear manual scroll offset and navigate.
- If the resolved URL equals `window.location.href`, do not clear manual scroll offset.

This preserves the existing manual offset invariant: offsets are cleared when navigation actually
changes the page, not when a failed mode resolution leaves the tab in place.

### Background Relay

In `src/background/handlers/scroll-sync-handlers.ts`:

- Continue relaying `url:sync` payloads as-is.
- Add relay support for `sync:url-mode-changed`.
- Relay mode change messages to linked tabs except the sender.

The `url:sync` payload does not need to include the mode. Each target tab must resolve against its
own current URL and the current stored mode.

### Popup and Panel Hooks

Update the existing URL Sync state hooks so they expose:

```typescript
urlSyncEnabled: boolean;
urlSyncMode: UrlSyncMode;
handleUrlSyncChange(enabled: boolean): Promise<void>;
handleUrlSyncModeChange(mode: UrlSyncMode): Promise<void>;
urlSyncNotice?: string;
```

Mode changes should:

- update local React state
- save to storage
- broadcast to linked tabs
- show/reset notice state consistently

## Testing

### Pure URL Utility Tests

Cover:

- `follow-changed-tab` returns existing `applyTranslatedPageLocaleSync()` results.
- `keep-each-tabs-website` preserves target protocol, host, and port.
- path language carrier preservation.
- query language carrier preservation.
- subdomain language carrier preservation.
- staging/production examples from issue #384.
- source identity query handling.
- target hash preservation.
- invalid source URL blocks `keep-each-tabs-website` navigation.
- invalid target URL blocks `keep-each-tabs-website` navigation.

### Storage Tests

Cover:

- default mode is `follow-changed-tab`.
- missing stored mode does not show an error notice.
- valid mode saves and loads.
- invalid stored mode falls back to `follow-changed-tab`.
- invalid stored mode can be repaired by the runtime path that has write access.

### Content Script Scenario Tests

Cover:

- URL Sync enabled plus `follow-changed-tab` navigates with existing behavior.
- URL Sync enabled plus `keep-each-tabs-website` keeps target website.
- URL Sync disabled ignores URL sync regardless of mode.
- blocked `keep-each-tabs-website` resolution does not navigate.
- blocked resolution does not clear manual scroll offset.
- successful navigation clears manual scroll offset.
- mode repair broadcasts and updates visible state.

### UI Tests

Cover:

- popup displays the selected URL Sync mode.
- in-page panel displays the selected URL Sync mode.
- selector is disabled when URL Sync is off.
- selecting a mode saves storage and broadcasts the mode change.
- reset/error notices are visible and understandable.
- i18n key parity across both locale trees.

## Verification

Minimum verification:

```bash
pnpm test
pnpm typecheck
pnpm i18n:validate
```

Preferred verification before PR:

```bash
pnpm health
```

If UI layout changes are substantial, add a Playwright check or manual screenshot review for the
popup and in-page panel to ensure labels fit and the active mode is obvious.
