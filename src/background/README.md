# Background Service Worker

Extension background script (Manifest V3 service worker for Chromium, persistent background script for Firefox). Serves as the central hub for tab management, scroll synchronization orchestration, and inter-component message routing.

Quick Sync의 command, 후보 lifecycle, transaction 순서, QA 경계는
[`docs/guides/quick-sync-shortcut.md`](../../docs/guides/quick-sync-shortcut.md)를 참고하세요.

## Architecture

```
background/
├── main.ts                  # Entry point — registers listeners, starts initialization
├── content-script-hmr.ts    # Dev-only HMR support for content scripts
├── handlers/                # Message and event handler registrations
└── lib/                     # Core business logic modules
```

`lib/contextual-hint-state.ts` keeps tab-keyed pending URL Sync contextual hints in the background
so the hint survives cross-origin navigation within the same tab without storing raw URLs or page
metadata.

## Entry Point

**`main.ts`** registers listeners synchronously before asynchronous restoration so an MV3 wake-up
command is not missed:

1. Register Quick Sync command/Port listeners and all bridge/tab handlers.
2. Call `initializeBackground()`.
3. Restore and runtime-validate manual state from `browser.storage.local`.
4. Only when manual state is ready, initialize auto-sync from saved preferences.
5. Publish separate manual/auto readiness; handlers await the barrier before mutation.

Quick Sync captures the invocation tab and event timestamp immediately, then waits for readiness
before entering the shared transition gate.

## Key Responsibilities

- **Scroll Sync Orchestration**: Receives scroll positions from one tab and relays to all linked tabs
- **Manual Session Transactions**: Serializes Start/Add/Stop/Reconnect through one transition gate
- **Quick Sync Coordination**: Owns the ephemeral 10-second candidate and delegates topology changes
  to the shared session orchestrator
- **Connection Management**: Tracks tab connection health, handles reconnection after service worker restarts
- **Auto-Sync**: Opt-in same-page suggestion flow. When enabled, groups tabs with matching URLs and suggests synchronization
- **State Persistence**: Survives service worker termination via `browser.storage.local`
- **Keep-Alive**: Prevents Chromium service worker from terminating during active sync

## Message Flow

```
Content Script A ──scroll:sync──► Background ──scroll:sync──► Content Script B
                                      │                           Content Script C
Popup ──scroll:start──► Background ──scroll:start──► Content Scripts
Command ──────────────► Coordinator ──Start/Add────► Session Orchestrator
```

All cross-tab communication routes through the background script. Content scripts and popup never
communicate directly. The hot scroll relay reads only committed numeric membership and epoch state;
it never waits for the transition gate.
