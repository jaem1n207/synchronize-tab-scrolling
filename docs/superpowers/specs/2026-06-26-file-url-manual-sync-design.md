# File URL Manual Sync Design

## Context

A Chrome Web Store reviewer reported a real workflow gap:

> I generate reports using an Oracle database that are produced in HTML format and that are saved as
> local files. I can load these up in Chrome and view them as web pages just fine, but I need to
> synchronize their scrolling.

The current extension excludes `file://` pages even when the browser renders them as ordinary
scrollable documents. This blocks local reports, text exports, Markdown files, JSON files, logs, and
other browser-readable local files from manual scroll synchronization.

This is not a scroll engine limitation. Ratio-based sync already works from scroll metrics such as
`scrollTop`, `scrollHeight`, and `clientHeight`. The current failure is at the eligibility and
permission boundary:

- `src/manifest.ts` grants `*://*/*`, which covers HTTP and HTTPS but not local files in Chrome.
- `src/shared/lib/url-utils.ts` treats `file://` as a forbidden protocol.
- `src/popup/hooks/use-tab-discovery.ts` explains all `file:` tabs as unsupported special protocol
  pages.

Chrome supports local file match patterns, but users must manually enable per-extension file URL
access. Chrome exposes this state through `chrome.extension.isAllowedFileSchemeAccess()`. The UI
should tell users exactly how to resolve the issue instead of presenting local files as permanently
unsupported.

Sources:

- Chrome match patterns: https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns
- Chrome file scheme access API:
  https://developer.chrome.com/docs/extensions/reference/api/extension#method-isAllowedFileSchemeAccess
- MDN match patterns: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Match_patterns

## Goal

Support manual scroll sync for browser-readable local files opened with `file://`.

Supported examples:

- `file:///Users/me/report.html`
- `file:///Users/me/notes.md`
- `file:///Users/me/export.json`
- `file:///Users/me/log.txt`
- `file:///Users/me/table.csv`

The extension should not parse, upload, or otherwise inspect file contents for this feature. It only
needs the same scroll metrics it already uses on web pages.

## Non-Goals

- Do not enable auto-sync suggestions for `file://` pages in this iteration.
- Do not group local file paths automatically.
- Do not add content-based matching or file parsing.
- Do not support PDF viewer pages in this iteration.
- Do not support browser internal pages such as `chrome://`, `edge://`, `about:`, or extension store
  pages.
- Do not support unstable special schemes such as `data:`, `blob:`, `javascript:`, or `view-source:`.
- Do not change scroll ratio math, manual offset behavior, hot-path timing constants, or
  `scroll-sync.ts` pipeline invariants.

## Product Behavior

### File Access Enabled

When a browser-readable `file://` tab is open and the browser allows this extension to access file
URLs:

- The tab appears in the popup as eligible.
- The user can select it with other eligible tabs.
- Starting manual sync sends the existing `scroll:start`, `scroll:sync`, and `scroll:stop` messages.
- The content script uses the existing scroll sync engine without file-type-specific logic.

### File Access Disabled

When a `file://` tab is open but Chrome or Edge file URL access is disabled:

- The tab appears under unavailable tabs.
- The reason explains that local file access is off.
- The row shows a visible "Open extension settings" action.
- The tooltip or row detail provides the browser settings URL as text.
- After enabling "Allow access to file URLs", the user should reopen the popup or retry tab
  discovery.

Settings URL targets:

- Chrome: `chrome://extensions/?id=<runtime.id>`
- Edge: `edge://extensions/?id=<runtime.id>`
- Other Chromium browsers: `chrome://extensions/?id=<runtime.id>` fallback

If a browser rejects a direct deep link, the UI should still show the URL text so the user can copy
or recognize the target.

## Architecture

### Manifest

Update the generated manifest to include local file access in every place that needs content script
availability:

- `host_permissions`
- `content_scripts.matches`
- `web_accessible_resources.matches`

The local file match pattern must use the three-slash file form supported by Chrome match patterns.

### URL Eligibility

Refactor URL eligibility so `file://` is no longer a blanket forbidden protocol.

Add small pure helpers instead of threading special cases through popup code:

```typescript
export function isFileUrl(url: string | null | undefined): boolean;
export function isPdfUrl(url: string | null | undefined): boolean;
export function isUnsupportedSpecialScheme(url: string | null | undefined): boolean;
```

`isForbiddenUrl()` should keep blocking:

- empty or invalid URLs
- browser internal pages
- extension store pages
- Google services already blocked today
- `data:`, `blob:`, `javascript:`, `vbscript:`, `filesystem:`, `view-source:`
- direct PDF URLs and known PDF viewer paths
- auth/login/search/special-domain patterns already blocked today

`file://` pages should be eligible unless they are direct PDFs or local Word documents
(`.doc`/`.docx`). This intentionally includes browser-rendered text-like local files such as
Markdown, JSON, text, CSV, and logs.

### File Access State

Add a small browser capability helper in shared or popup code:

```typescript
interface FileSchemeAccessInfo {
  canCheck: boolean;
  allowed: boolean;
  settingsUrl: string;
}
```

Behavior:

- Chromium browsers should use `chrome.extension.isAllowedFileSchemeAccess()` when available.
- If the API is unavailable, fall back conservatively:
  - In Firefox, avoid claiming a Chrome-only toggle exists.
  - For unsupported/unknown browsers, let actual content script connection determine success and
    show a generic security restriction if it fails.
- Build the settings URL from `browser.runtime.id` and browser detection.

Keep this helper isolated so popup eligibility and sync failure handling can share the same copy and
settings URL.

### Popup Discovery

`use-tab-discovery` should classify tabs with these states:

- Web page eligible: current behavior.
- Local file eligible: `file://` and file scheme access is allowed.
- Local file blocked by browser setting: unavailable with actionable reason and settings URL.
- Unsupported URL: unavailable with current restriction reasons.

Extend `TabInfo` with optional fields for actionable unavailable tabs:

```typescript
interface TabInfo {
  fileAccessSettingsUrl?: string;
  unavailableActionLabel?: string;
}
```

The unavailable tab row should render a visible inline action button when those fields exist.
Pressing it opens the settings URL in a new tab. Do not hide the only action inside a hover-only
tooltip because keyboard and touch users need a reliable path to the same fix.

### Manual Sync Runtime

Manual sync should keep using the existing background and content script message path.

If a selected file tab fails to connect despite being marked eligible, prefer a file-access-specific
error if any selected tab uses `file://`. This handles races where the user disables file access
after popup discovery or where the browser refuses injection for a local file.

Do not add async work to `handleScrollCore()` or the scroll event path.

### Auto-Sync

Leave `getAutoSyncPageKey()` and auto-sync grouping behavior unchanged for `file://`.

Rationale:

- Auto-sync would require local path grouping, privacy review, snooze/exclusion semantics, and
  additional UI copy.
- The user request is satisfied by manual sync.
- Keeping auto-sync out of scope reduces release risk.

## User-Facing Copy

English source copy:

```text
Local file access is off
Turn on "Allow access to file URLs" for this extension, then reopen the popup.
Open extension settings
Synchronized using scroll position only. File contents are not uploaded.
```

The copy must be added to both locale trees:

- `extension/_locales`
- `src/shared/i18n/_locales`

All supported locales must remain complete.

## Privacy

This feature increases the extension's declared local file surface, so the implementation must keep
privacy boundaries explicit:

- Do not read local file contents for matching.
- Do not upload local file contents.
- Do not add local file paths to auto-sync suggestion payloads.
- Do not add local file paths to release analytics or remote logging.
- Do not expose full local file paths in new UI surfaces beyond the existing tab URL display.

The popup should include a short reassurance that synchronization uses scroll position only and does
not upload file contents.

## Testing

Unit tests:

- `isForbiddenUrl('file:///Users/me/report.html')` returns `false`.
- `isForbiddenUrl('file:///Users/me/notes.md')` returns `false`.
- `isForbiddenUrl('file:///Users/me/export.json')` returns `false`.
- `isForbiddenUrl('file:///Users/me/log.txt')` returns `false`.
- `isForbiddenUrl('file:///Users/me/report.pdf')` remains `true`.
- `isForbiddenUrl('file:///Users/me/report.doc')` remains `true`.
- `isForbiddenUrl('file:///Users/me/report.docx')` remains `true`.
- `data:`, `blob:`, `view-source:`, `chrome://`, `edge://`, and `about:` remain blocked.
- File access helper returns the correct settings URL for Chrome and Edge.
- Popup tab discovery marks file tabs eligible when file access is allowed.
- Popup tab discovery marks file tabs unavailable with an action URL when file access is disabled.

Build/i18n checks:

- Generated manifest includes local file match patterns.
- `pnpm i18n:validate`
- `pnpm typecheck`
- `pnpm test`

Manual QA:

- In Chrome with file URL access off, open a local `.html`, `.md`, and `.json` file. Confirm each
  appears unavailable with the settings action.
- Open the settings action and enable "Allow access to file URLs".
- Reopen the popup. Confirm the same local files are selectable.
- Start manual sync between two local files and confirm scroll sync works.
- Confirm a local `.pdf` remains unavailable.
- Confirm normal HTTPS pages still behave as before.

## Release Notes

Release note draft:

```text
Added manual scroll sync support for browser-readable local files opened with file://. In Chrome and
Edge, enable "Allow access to file URLs" in the extension settings when prompted. Sync uses scroll
position only; file contents are not uploaded.
```

Chrome Web Store response draft:

```text
Thanks Russ. This is a good use case and the limitation was on our side. We now support manual
scroll synchronization for browser-readable local files opened with file://. Chrome requires one
extra step: open the extension details page and enable "Allow access to file URLs". The popup now
shows that setting link when local file access is off.
```

## Browser Support

Chrome and Edge are the guaranteed release targets for this iteration because they expose the
documented file scheme access check and settings toggle. Brave and other Chromium browsers should
use the same fallback settings URL shape. Firefox support is best-effort during implementation: if
Firefox exposes local files differently, keep the generic security restriction copy there and avoid
showing Chrome-specific instructions.
