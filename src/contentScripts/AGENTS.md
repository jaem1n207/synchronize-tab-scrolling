# Content Scripts — Scroll Sync Engine

Injected into all web pages. Core scroll synchronization engine (1114 lines), Shadow DOM UI (panel + toast), keyboard handler for manual position offset. Two independent React roots in Shadow DOM.

**Read `docs/guides/scroll-sync-pipeline.md` before modifying `scroll-sync.ts`.**
For URL Sync navigation changes, also read `docs/guides/url-sync-safe-navigation.md`.

## Key Files

| File                                      | Purpose                                                                 | Complexity |
| ----------------------------------------- | ----------------------------------------------------------------------- | ---------- |
| `scroll-sync.ts`                          | Core sync engine. 4 state objects, scroll capture/relay, URL monitoring | 1114 lines |
| `keyboard-handler.ts`                     | Option/Alt key detection for manual offset mode                         | 202 lines  |
| `index.ts`                                | Entry point. Calls `initScrollSync()` + initializes keyboard handler    | 11 lines   |
| `panel.tsx`                               | SyncControlPanel mounted in Shadow DOM. Drag, minimize, status display  | —          |
| `suggestion-toast.tsx`                    | Auto-sync suggestion toast in Shadow DOM. Orphaned container cleanup    | —          |
| `lib/instant-programmatic-scroll.ts`      | Instant receiver-side scroll apply + latest-wins rAF scheduler          | 143 lines  |
| `lib/instant-programmatic-scroll.test.ts` | Helper/scheduler regression tests                                       | 293 lines  |
| `lib/scroll-sync-state.ts`                | State object factories and timing constants                             | 81 lines   |
| `hooks/use-drag-position.ts`              | Draggable panel positioning with viewport edge snapping                 | 202 lines  |
| `hooks/use-panel-state.ts`                | Sync status tracking, URL sync enabled state/mode, connection status    | 190 lines  |

## Scroll Sync Pipeline

```
User scrolls in Tab A
  → handleScroll() (throttled 50ms, passive listener)
  → getScrollInfo() → {scrollTop, scrollHeight, clientHeight}
  → calculateScrollRatio() / pixel-delta anchor mapping
  → derive logical scroll position from cached manual offset
  → sendMessage('scroll:sync', {scrollTop, sourceTabId, ...})
  → [Background] relays to all other synced tabs
  → [Tab B] receives → map logical scroll position through own manual anchor
  → Store latest pending receiver target
  → requestAnimationFrame applies newest target only
  → applyInstantProgrammaticScroll(targetPosition)
  → Temporarily force scroll root/body scrollBehavior: auto, then restore
  → Grace period (200ms) suppresses scroll event from programmatic scroll
```

**Key**: Default sync is ratio-based (`scrollTop / (scrollHeight - clientHeight)`), but manual
anchors change the mapping. Newly captured manual anchors use `mode: 'pixel-delta'` and preserve the
signed pixel distance from the aligned point; mode-less anchors and explicit `piecewise-ratio`
anchors keep the legacy mapping for compatibility.
Receiver-side sync targets are latest-wins per animation frame so pages do not replay stale scroll
positions during rapid source scrolling. `lastSyncedRatio` is updated only when the scheduled target
actually applies.

## Timing Constants (INVARIANTS — do not modify without understanding constraints)

| Constant                           | Value    | Constraint                        |
| ---------------------------------- | -------- | --------------------------------- |
| `THROTTLE_DELAY`                   | 50ms     | Must be < GRACE_PERIOD            |
| `PROGRAMMATIC_SCROLL_GRACE_PERIOD` | 200ms    | Must exceed pipeline max (~135ms) |
| `MOUSEMOVE_THROTTLE`               | 50ms     | Wheel mode Alt release detection  |
| `CONNECTION_CHECK_INTERVAL`        | 30,000ms | Health check ping frequency       |
| `CONNECTION_TIMEOUT_THRESHOLD`     | 60,000ms | Declare connection lost           |
| `MAX_RECONNECTION_ATTEMPTS`        | 3        | Backoff: 500ms, 1000ms, 2000ms    |

**Pipeline max delay**: THROTTLE (50) + relay (2-15) + receiver rAF coalescing (~16) + browser jitter (0-50) ≈ 135ms. Grace period MUST exceed this.

## Manual Offset System

1. User holds **Option** (Mac) / **Alt** (Win) → snapshot baseline ratio synchronously
2. Scroll freely — incoming sync messages ignored during manual mode
3. Release key → save `{ ratio, pixels, anchor }` and set `anchor.mode = 'pixel-delta'`
4. Update `cachedManualOffset` before sync resumes, then persist to `browser.storage.local`
5. Resume sync with signed pixel delta preserved from the aligned anchor

**Wheel mode** (unfocused tabs — Arc/Dia split view): Detect Alt via `wheel.altKey` property. Release detection via `mousemove` event throttling since `keyup` doesn't fire in unfocused tabs.

**Offset cleared on**: URL navigation, sync stop, or manual reset.
Pending receiver targets are cancelled before manual baselines, resets, and stop transitions so
unapplied future targets cannot pollute offsets or apply after state changes.

## Shadow DOM Mounting

- Three independent React roots: `panel.tsx` (`#scroll-sync-panel-root`),
  `suggestion-toast.tsx`, and `quick-sync-hud.tsx`
- `panel.tsx` uses `attachShadow({ mode: 'closed' })`. Its synchronized-tab display may contain
  only the current title, current-tab flag, signed manual pixel offset, and connection status.
  Keep that data unavailable to host-page DOM traversal; never add URL, favicon, tab ID, or window
  ID to the content snapshot.
- `suggestion-toast.tsx` and `quick-sync-hud.tsx` use open Shadow roots because their UI contains no
  synchronized-tab title or manual-offset data.
- z-index `2147483647` — maximum safe value, ensures visibility above all page content
- **Re-injection safety**: Check for existing orphaned containers before creating new Shadow DOM roots
- `messageHandlersRegistered` flag prevents duplicate `onMessage` handler registration on re-injection

## Connection Health

```
[HEALTHY] → ping every 30s → background responds
         → no response for 60s → [UNHEALTHY]
         → reconnect (3 attempts, exponential backoff)
         → all fail → request content script re-injection
```

Reconnection triggers: visibility change (tab becomes visible), message send failure, health check timeout.

## Anti-Patterns

- **NEVER** log raw URLs, tab titles, page titles, canonical URLs, alternate links, or full message payloads. `window.location.href`, `payload.url`, `sourceUrl`, `targetUrl`, and `normalizedUrl` may contain tokens, emails, private document IDs, search terms, or workspace paths. Log only `tabId`, `sourceTabId`, `mode`, `reason`, counts, booleans, or enum states.
- **NEVER** `await` in `handleScrollCore()` — scroll fires 20x/sec, async adds variable delay
- **NEVER** read storage, scan the DOM, or do text/semantic matching in active manual anchor scroll paths. `handleScrollCore()` and `scroll:sync` use cached state plus numeric scroll metrics only.
- **NEVER** reduce `PROGRAMMATIC_SCROLL_GRACE_PERIOD` below 200ms — causes feedback loops
- **NEVER** use page-native smooth scrolling for receiver sync. Use `applyInstantProgrammaticScroll()` and keep the `scrollBehavior` override scoped to the actual programmatic assignment.
- **ALWAYS** update `cachedManualOffset` at ALL save/clear points — mismatch causes misaligned scrolling
- **ALWAYS** store newly captured manual anchors with `mode: 'pixel-delta'`. Only mode-less or explicit `piecewise-ratio` stored anchors should use legacy mapping.
- **ALWAYS** coalesce incoming receiver targets with latest-wins rAF scheduling and update `lastSyncedRatio` only when a target actually applies.
- **ALWAYS** check for orphaned containers before creating Shadow DOM roots
- **ALWAYS** use `passive: true` on scroll event listeners
- **ALWAYS** use CustomEvent (not webext-bridge) for same-context communication between scroll-sync.ts and panel.tsx
- **ALWAYS** keep visible URL Sync mode aligned with actual behavior. If storage read/write/repair fails, emit an explicit failure notice and skip unsafe navigation instead of silently falling back to another mode.
- **ALWAYS** keep `keep-each-tabs-website` fail-closed. Incompatible site boundaries must emit a notice and return before `clearManualScrollOffset()` or navigation so the target URL, cached offset, and scroll sync session remain intact.
