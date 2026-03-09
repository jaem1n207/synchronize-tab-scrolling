# Background Service Worker

Extension background script (Manifest V3 service worker for Chromium, persistent background script for Firefox). Serves as the central hub for tab management, scroll synchronization orchestration, and inter-component message routing.

## Architecture

```
background/
├── main.ts                  # Entry point — initializes state, registers all handlers
├── content-script-hmr.ts    # Dev-only HMR support for content scripts
├── handlers/                # Message and event handler registrations
└── lib/                     # Core business logic modules
```

## Entry Point

**`main.ts`** (48 lines) orchestrates startup:

1. Restores persisted sync state from `browser.storage.local`
2. Initializes auto-sync from saved preferences
3. Registers all message handlers (scroll sync, connection, auto-sync)
4. Registers browser event listeners (tab lifecycle, storage changes)
5. Resumes keep-alive if sync was active before service worker restart

## Key Responsibilities

- **Scroll Sync Orchestration**: Receives scroll positions from one tab and relays to all linked tabs
- **Connection Management**: Tracks tab connection health, handles reconnection after service worker restarts
- **Auto-Sync**: Automatically groups tabs with matching URLs and suggests synchronization
- **State Persistence**: Survives service worker termination via `browser.storage.local`
- **Keep-Alive**: Prevents Chromium service worker from terminating during active sync

## Message Flow

```
Content Script A ──scroll:sync──► Background ──scroll:sync──► Content Script B
                                      │                           Content Script C
Popup ──scroll:start──► Background ──scroll:start──► Content Scripts
```

All cross-tab communication routes through the background script. Content scripts and popup never communicate directly.
