# Content Scripts — Scroll Sync Engine

Injected into all web pages. Core scroll synchronization engine (987 lines), Shadow DOM UI (panel + toast), keyboard handler for manual position offset. Two independent React roots in Shadow DOM.

**Read `docs/guides/scroll-sync-pipeline.md` before modifying `scroll-sync.ts`.**

## Key Files

| File                         | Purpose                                                                 | Complexity |
| ---------------------------- | ----------------------------------------------------------------------- | ---------- |
| `scroll-sync.ts`             | Core sync engine. 4 state objects, scroll capture/relay, URL monitoring | 987 lines  |
| `keyboard-handler.ts`        | Option/Alt key detection for manual offset mode                         | 202 lines  |
| `index.ts`                   | Entry point. Calls `initScrollSync()` + initializes keyboard handler    | 11 lines   |
| `panel.tsx`                  | SyncControlPanel mounted in Shadow DOM. Drag, minimize, status display  | —          |
| `suggestion-toast.tsx`       | Auto-sync suggestion toast in Shadow DOM. Orphaned container cleanup    | —          |
| `lib/scroll-sync-state.ts`   | State object factories and timing constants                             | —          |
| `hooks/use-drag-position.ts` | Draggable panel positioning with viewport edge snapping                 | 204 lines  |
| `hooks/use-panel-state.ts`   | Sync status tracking, URL sync toggle, connection status                | 190 lines  |

## Scroll Sync Pipeline

```
User scrolls in Tab A
  → handleScroll() (throttled 50ms, passive listener)
  → getScrollInfo() → {scrollTop, scrollHeight, clientHeight}
  → calculateScrollRatio() → ratio 0-1
  → Subtract manual offset from ratio
  → sendMessage('scroll:sync', {ratio, sourceTabId, ...})
  → [Background] relays to all other synced tabs
  → [Tab B] receives → apply own manual offset
  → window.scrollTo({top: targetPosition, behavior: 'auto'})
  → Grace period (200ms) suppresses scroll event from programmatic scroll
```

**Key**: Ratio-based positioning — `scrollTop / (scrollHeight - clientHeight)`. Proportional sync across documents of different heights.

## Timing Constants (INVARIANTS — do not modify without understanding constraints)

| Constant                           | Value    | Constraint                        |
| ---------------------------------- | -------- | --------------------------------- |
| `THROTTLE_DELAY`                   | 50ms     | Must be < GRACE_PERIOD            |
| `PROGRAMMATIC_SCROLL_GRACE_PERIOD` | 200ms    | Must exceed pipeline max (~115ms) |
| `MOUSEMOVE_THROTTLE`               | 50ms     | Wheel mode Alt release detection  |
| `CONNECTION_CHECK_INTERVAL`        | 30,000ms | Health check ping frequency       |
| `CONNECTION_TIMEOUT_THRESHOLD`     | 60,000ms | Declare connection lost           |
| `MAX_RECONNECTION_ATTEMPTS`        | 3        | Backoff: 500ms, 1000ms, 2000ms    |

**Pipeline max delay**: THROTTLE (50) + network (~50) + processing (~15) ≈ 115ms. Grace period MUST exceed this.

## Manual Offset System

1. User holds **Option** (Mac) / **Alt** (Win) → snapshot baseline ratio synchronously
2. Scroll freely — incoming sync messages ignored during manual mode
3. Release key → `offsetRatio = currentRatio - baselineSnapshot`
4. Clamp to ±0.5 → save to `browser.storage.local`
5. Resume sync with offset applied to all future scroll calculations

**Wheel mode** (unfocused tabs — Arc/Dia split view): Detect Alt via `wheel.altKey` property. Release detection via `mousemove` event throttling since `keyup` doesn't fire in unfocused tabs.

**Offset cleared on**: URL navigation, sync stop, or manual reset.

## Shadow DOM Mounting

- Two independent React roots: `panel.tsx` (`#scroll-sync-panel-root`), `suggestion-toast.tsx`
- `attachShadow({ mode: 'open' })` for style isolation from host page
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

- **NEVER** `await` in `handleScrollCore()` — scroll fires 20x/sec, async adds variable delay
- **NEVER** reduce `PROGRAMMATIC_SCROLL_GRACE_PERIOD` below 200ms — causes feedback loops
- **ALWAYS** update `cachedManualOffset` at ALL save/clear points — mismatch causes misaligned scrolling
- **ALWAYS** check for orphaned containers before creating Shadow DOM roots
- **ALWAYS** use `passive: true` on scroll event listeners
- **ALWAYS** use CustomEvent (not webext-bridge) for same-context communication between scroll-sync.ts and panel.tsx
