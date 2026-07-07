# URL Sync Safe Navigation Design

## Context

URL Sync is most useful when synchronized tabs share a transferable URL shape. A common example is
the same document in two languages:

```text
https://developer.chrome.com/blog/inside-browser-part4?hl=en
https://developer.chrome.com/blog/inside-browser-part4?hl=ko
```

If the English tab moves from `inside-browser-part4` to `inside-browser-part3`, the Korean tab can
usually move to the same path while preserving `hl=ko`.

The same behavior becomes harmful when the synchronized tabs are matching reading material but not
matching URL systems:

```text
https://developer.chrome.com/blog/inside-browser-part4?hl=en
https://d2.naver.com/helloworld/6204533
```

The D2 page may be a manual translation or related article, but its series navigation uses another
URL system, such as `/helloworld/5237120`. Applying the source path/query to the target website is
likely to navigate to a 404. Once that happens, every subsequent page change can repeat the bad
navigation until the user disables URL Sync or stops synchronization.

This is not a scroll synchronization issue. Scroll Sync can still be valuable for these tabs. The
problem is that `keep-each-tabs-website` currently treats every valid source and target URL as safe
to combine.

## Goal

Make URL Sync fail closed for unsafe `keep-each-tabs-website` navigation:

- keep Scroll Sync active
- keep the global URL Sync setting unchanged
- skip only the unsafe target tab navigation
- show a short notice explaining that page movement was not synced for this site combination
- keep existing safe URL Sync behavior intact

## Non-Goals

- Do not change scroll ratio math, manual offset behavior, or hot-path scroll timing.
- Do not add network probing to check whether a predicted target URL returns 200 or 404.
- Do not use page body text, AI matching, translation APIs, or external services.
- Do not add a site-specific URL mapping registry.
- Do not infer future navigation compatibility from current translated-page metadata alone.
- Do not change auto-sync grouping in this iteration.
- Do not disable URL Sync globally when one target tab is unsafe.

## Product Rule

`follow-changed-tab` keeps its current meaning:

- other tabs move to the changed tab's website
- target language is preserved when possible
- unrelated domains are still allowed because the target is following a real source URL, not a
  guessed target-site URL

`keep-each-tabs-website` becomes conservative:

- target tabs keep their own website only when the source and target hosts are compatible
- incompatible target tabs do not navigate
- blocked target tabs keep their current URL and manual scroll offset
- other compatible target tabs in the same sync group may still navigate

## Compatibility Model

Add a pure host-compatibility guard before building a `keep-each-tabs-website` URL.

The guard should compare locale-neutral, lower-cased hostnames. It must not log or store raw hosts.

Host normalization:

1. parse source and target as HTTP(S) URLs
2. lower-case hostnames
3. ignore a leading `www.` label
4. remove a locale subdomain when the existing locale detector identifies one
5. keep locale-looking or environment-looking labels when removing them would leave a hosted public
   suffix tenant such as `github.io`, `pages.dev`, `vercel.app`, or `netlify.app`

Compatible cases:

- exact normalized host match
- exact normalized host match after removing one known environment label from either side

Known environment labels:

```text
dev
development
staging
stage
preview
test
testing
qa
beta
canary
sandbox
```

Examples:

```text
developer.chrome.com <-> developer.chrome.com
=> compatible

en.example.com <-> ko.example.com
=> compatible after locale label removal

example.com <-> staging.example.com
=> compatible after environment label removal

docs.example.com <-> preview.docs.example.com
=> compatible after environment label removal

developer.chrome.com <-> d2.naver.com
=> incompatible

docs.example.com <-> app.example.com
=> incompatible

one.github.io <-> two.github.io
=> incompatible

en.github.io <-> ko.github.io
=> incompatible because the first label is a hosted-site tenant, not a removable locale

dev.pages.dev <-> staging.pages.dev
=> incompatible because the first label is a hosted-site tenant, not a removable environment
```

This deliberately avoids a broad registrable-domain or "last two labels" match. That heuristic
would make unrelated hosted sites look compatible, especially on shared suffixes.

## URL Resolution

Extend `UrlSyncBlockedResult.reason`:

```typescript
interface UrlSyncBlockedResult {
  status: 'blocked';
  reason: 'invalid-source-url' | 'invalid-target-url' | 'incompatible-site-boundary';
  notice: UrlSyncNotice;
}
```

`resolveUrlSyncTarget(sourceUrl, targetUrl, mode)` should behave as follows:

1. For `follow-changed-tab`, keep delegating to the existing locale-preserving source-site behavior.
2. For `keep-each-tabs-website`, parse source and target as today.
3. If parsing fails, return the existing invalid URL blocked results.
4. If host compatibility fails, return:

```typescript
{
  status: 'blocked',
  reason: 'incompatible-site-boundary',
  notice: { key: 'urlSyncIncompatibleSiteNotice', severity: 'warning' },
}
```

5. If host compatibility passes, build the target-site URL using the current locale-preserving
   `keep-each-tabs-website` behavior.

The content script already treats blocked URL Sync results correctly:

- it emits a notice
- it leaves `window.location.href` unchanged
- it does not clear the target tab's manual scroll offset
- it logs only non-sensitive metadata such as `reason`, `sourceTabId`, and `mode`

Keep that runtime shape.

## User Feedback

Add a dedicated notice key so invalid URL failures and unsafe site-combination failures are not
collapsed into the same user explanation.

Use this English source copy:

```text
Page changes were not synced for this site combination. Scroll sync is still active.
```

Use this Korean source copy:

```text
이 사이트 조합에서는 페이지 이동을 동기화하지 않았어요. 스크롤 동기화는 계속 유지돼요.
```

The copy must be added to both locale trees:

- `extension/_locales/*/messages.json`
- `src/shared/i18n/_locales/*/messages.json`

All 9 supported locales must pass key parity validation.

## Privacy And Logging

This change touches URL Sync and must follow the repository privacy rules:

- do not log source URLs, target URLs, hostnames, paths, query strings, hashes, tab titles, page
  titles, canonical URLs, alternate links, or full payload objects
- allowed log fields include `reason`, `mode`, `sourceTabId`, booleans, and counts
- do not include the raw source or target site in notices

Before completion, search for:

```text
logger
url
Url
URL
tab.url
window.location.href
payload
normalizedUrl
sourceUrl
targetUrl
```

Any raw URL/title logging introduced by this work is a blocking bug.

## Testing

This feature requires unit, content-script scenario, and extension E2E coverage.

### Pure URL Utility Tests

Add focused tests around the host-compatibility guard and `resolveUrlSyncTarget()`:

- `keep-each-tabs-website` allows exact host matches.
- `keep-each-tabs-website` allows query-locale variants on the same host.
- `keep-each-tabs-website` allows locale-subdomain variants such as `en.example.com` and
  `ko.example.com`.
- `keep-each-tabs-website` allows environment variants such as `example.com` and
  `staging.example.com`.
- `keep-each-tabs-website` allows nested environment variants such as `docs.example.com` and
  `preview.docs.example.com`.
- `keep-each-tabs-website` blocks unrelated hosts such as `developer.chrome.com` and
  `d2.naver.com`.
- `keep-each-tabs-website` blocks sibling product hosts such as `docs.example.com` and
  `app.example.com`.
- `keep-each-tabs-website` blocks shared-suffix hosted sites such as `one.github.io` and
  `two.github.io`.
- `keep-each-tabs-website` blocks locale-looking hosted public suffix tenants such as
  `en.github.io` and `ko.github.io`.
- `keep-each-tabs-website` blocks environment-looking hosted public suffix tenants such as
  `dev.pages.dev` and `staging.pages.dev`.
- blocked incompatible hosts return `reason: 'incompatible-site-boundary'`.
- invalid source and target URL cases keep their existing blocked reasons.
- `follow-changed-tab` remains unchanged for unrelated hosts.

### Content Script Scenario Tests

Add scenario coverage where a target receives `url:sync` in `keep-each-tabs-website` mode:

- incompatible site boundary does not change `window.location.href`.
- incompatible site boundary emits `urlSyncIncompatibleSiteNotice`.
- incompatible site boundary does not clear the target tab's manual scroll offset.
- compatible site boundary still clears manual scroll offset when navigation actually changes the
  target URL.
- same-URL resolution still does not clear manual scroll offset.

### Extension E2E Tests

Extend `e2e/extension/url-sync-modes.spec.ts` with deterministic local fixture pages.

Required E2E cases:

- `keep-each-tabs-website` still navigates a compatible site-family target.
- `keep-each-tabs-website` does not navigate an unrelated target that represents the
  `developer.chrome.com` to `d2.naver.com` failure mode.
- when one source tab changes page, the unrelated target remains on its original URL after a short
  no-navigation assertion.
- the blocked target keeps Scroll Sync active after the skipped URL navigation. The test should
  verify scroll synchronization still works by scrolling the source and observing target scroll
  movement.
- `follow-changed-tab` still navigates an unrelated target to the source website, preserving the
  existing mode contract.

The E2E should not depend on public websites. Use local fixture origins or routed fixture pages that
exercise the same browser-visible URL shapes. The final fixture set uses `127.0.0.1` for compatible
sites and `localhost` for the unrelated site. Because `localhost` may resolve to IPv4 or IPv6,
the unrelated fixture listens on `::` while exposing `localhost` as the public host.

No-navigation helpers should treat only Playwright `TimeoutError` as the expected "no navigation"
result. Unexpected errors must fail the test.

### Validation Commands

Minimum validation for implementation:

```bash
pnpm test
pnpm test:e2e:extension
pnpm typecheck
pnpm i18n:validate
pnpm privacy:logging
```

If implementation touches UI copy or popup/panel behavior, also run the relevant component tests.

## Rollout Notes

This change is intentionally conservative. Users who need cross-site path rewriting for unrelated
domains can still use `follow-changed-tab`, which follows the source website directly. A future
advanced override can be designed separately if real usage shows that unrelated-domain
`keep-each-tabs-website` navigation is common enough to justify extra UI and persistence.
