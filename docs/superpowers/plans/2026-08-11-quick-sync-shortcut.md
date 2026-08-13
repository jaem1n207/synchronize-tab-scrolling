# Quick Sync Shortcut Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one browser-wide Quick Sync shortcut that selects a first tab, starts synchronization from a second tab within exactly 10 seconds, and adds later tabs to the active session without removing the existing popup tab picker or weakening session truthfulness.

**Architecture:** Route popup Start/Stop, Quick Sync Start/Add, accepted auto-sync suggestions, reconnects, and tab lifecycle changes through one serialized manual-session transition gate and orchestrator. Keep the 10-second candidate ephemeral and global across windows, add a generation-bound content-script HUD and Port, persist only authoritative manual-session state with revision and epoch validation, and render the popup from a cross-window background snapshot rather than current-window discovery.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Playwright, Vite, webextension-polyfill, webext-bridge, Chrome/Firefox MV3 manifests, dual-tree WebExtension i18n, pnpm.

## Global Constraints

- The approved design is the source of truth: `docs/superpowers/specs/2026-08-11-quick-sync-shortcut-design.md`.
- Add exactly one browser command named `quick-sync-start-or-add`.
- Suggested defaults are `Command+Shift+Period` on macOS and `Ctrl+Shift+Period` elsewhere. Do not add a fallback command.
- The shortcut means only “start or add.” It never removes a tab and never stops a session.
- The first eligible press creates one global, in-memory candidate with an absolute 10-second deadline. It is not persisted.
- Pressing again in the same candidate tab is a no-op and does not extend the deadline.
- A second eligible tab received before the deadline starts a two-tab manual session. An eligible unlinked tab pressed while active is added without reinitializing existing tabs.
- A linked active-session tab is a no-op and must show that this tab is already included.
- Quick Sync Start requires both tabs to acknowledge `scroll:start`; popup Start preserves its existing “commit the successful subset when at least two tabs succeed” behavior.
- Start/Add/Stop control-plane timeout is 1,000ms. Reconnect timeout is 3,000ms.
- Persist-before-publish is required for Start/Add/Replace. Stop commits durable inactive state before best-effort content cleanup.
- New manual Start/Replace increments `sessionEpoch`; Add/Reconnect preserves it. Every committed topology change increments `revision`.
- Manual content-origin messages must pass synchronous sender, membership, and epoch authorization before relay. Do not add storage I/O to the scroll hot path.
- Auto-sync suggestions remain opt-in. Both replacement and add suggestions require `autoSyncEnabled === true` at acceptance time and include `expectedRevision`.
- The popup’s existing search, tab selection, selected chips, Start button, URL Sync settings, and popup-local `Cmd/Ctrl+S` remain available in the inactive view.
- The active popup view must not render tab-selection controls. It shows the authoritative cross-window session, shortcut guidance, reconnect when needed, and Stop.
- Quick Sync uses a dedicated content-script HUD. Do not reuse or modify the automatic suggestion toast.
- The HUD is non-interactive, does not steal focus, announces outcomes only, and does not announce every countdown tick.
- `commands.getAll()` proves the browser’s current assignment string only. It does not prove physical key delivery or absence of browser/OS conflicts.
- Automated tests and production Chrome/Firefox builds are required on relevant PRs. Chrome stable on macOS and Windows is the release-blocking physical-key baseline; secondary browsers use the risk-based matrix in Task 18.
- Never log raw URLs, tab titles, message payloads, page metadata, or storage objects. Logs may include only tab IDs, counts, generations, revisions, epochs, modes, and reason enums.
- Add user-facing keys to both locale trees for all nine supported locales: `en`, `ko`, `ja`, `fr`, `es`, `de`, `zh_CN`, `zh_TW`, and `hi`.
- Do not edit generated `extension/manifest.json`.
- Do not stage or modify unrelated `.playwright-mcp/`, `.pnpm-store/`, or `.superpowers/` paths.
- Follow repository rules: no `any`, no `@ts-ignore`, no convenience assertions, no empty catches, and update `src/shared/types/messages.ts` together with `shim.d.ts`.

---

## File Structure

### Create

- `src/shared/types/quick-sync.ts`
  - Quick Sync failure, feedback, candidate, recent-outcome, and shortcut-assignment contracts.
- `src/shared/types/sync-session.ts`
  - Authoritative session snapshot, viewer context, transition result, and message-identity contracts.
- `src/shared/lib/quick-sync.ts`
  - Pure countdown, shortcut formatting, Port-name, and shortcut-settings helpers.
- `src/shared/lib/quick-sync.test.ts`
  - Boundary and formatter tests.
- `src/background/lib/sync-state-parser.ts`
- `src/background/lib/sync-state-parser.test.ts`
  - Runtime validation and legacy migration for persisted manual state.
- `src/background/lib/background-initialization.ts`
- `src/background/lib/background-initialization.test.ts`
  - Restore/readiness barrier shared by synchronous event listeners.
- `src/background/lib/sync-transition-gate.ts`
- `src/background/lib/sync-transition-gate.test.ts`
  - FIFO serialization and monotonic operation generation.
- `src/background/lib/manual-session-authorization.ts`
- `src/background/lib/manual-session-authorization.test.ts`
  - Synchronous sender/membership/epoch relay authorization.
- `src/background/lib/manual-override-adapter.ts`
- `src/background/lib/manual-override-adapter.test.ts`
  - Transactional adapter between manual and auto-sync state.
- `src/background/lib/legacy-auto-sync-adapter.ts`
- `src/background/lib/legacy-auto-sync-adapter.test.ts`
  - Explicitly accepted legacy auto-group Start/rollback and manual revision integration.
- `src/background/lib/sync-session-orchestrator.ts`
- `src/background/lib/sync-session-orchestrator.test.ts`
  - Start/Add/Replace/Stop/Reconnect prepare-commit-cleanup flows.
- `src/background/lib/sync-cleanup-retry.ts`
- `src/background/lib/sync-cleanup-retry.test.ts`
  - Generation-safe, idempotent post-Stop content cleanup retries.
- `src/background/lib/sync-session-snapshot.ts`
- `src/background/lib/sync-session-snapshot.test.ts`
  - Cross-window, availability-aware popup snapshot.
- `src/background/lib/quick-sync-candidate.ts`
- `src/background/lib/quick-sync-candidate.test.ts`
  - In-memory candidate generation and exact deadline rules.
- `src/background/lib/quick-sync-feedback.ts`
- `src/background/lib/quick-sync-feedback.test.ts`
  - HUD handshake, badge generation, Port validation, and recent outcome.
- `src/background/lib/quick-sync-coordinator.ts`
- `src/background/lib/quick-sync-coordinator.test.ts`
  - Candidate/session decision table and orchestrator integration.
- `src/background/handlers/quick-sync-command-handler.ts`
- `src/background/handlers/quick-sync-command-handler.test.ts`
  - Browser command adapter, active-tab capture, readiness wait, and revalidation.
- `src/contentScripts/components/quick-sync-hud.tsx`
- `src/contentScripts/components/quick-sync-hud.test.tsx`
  - Pure visual and accessible HUD.
- `src/contentScripts/quick-sync-hud.tsx`
- `src/contentScripts/quick-sync-hud.test.tsx`
  - Shadow DOM mount, webext message handler, candidate Port, and generation lifecycle.
- `src/popup/lib/quick-sync-shortcuts.ts`
- `src/popup/lib/quick-sync-shortcuts.test.ts`
  - Browser detection and shortcut-settings routing.
- `src/popup/hooks/use-quick-sync-shortcut.ts`
- `src/popup/hooks/use-quick-sync-shortcut.test.ts`
  - Actual assignment and remapping state.
- `src/popup/hooks/use-manual-sync-session.ts`
- `src/popup/hooks/use-manual-sync-session.test.ts`
  - Authoritative loading/inactive/active/error state and refetch.
- `src/popup/components/quick-sync-shortcut-status.tsx`
- `src/popup/components/quick-sync-shortcut-status.test.tsx`
  - Assigned, unassigned, unavailable, remap, and fallback UI.
- `src/popup/components/active-sync-session.tsx`
- `src/popup/components/active-sync-session.test.tsx`
  - Active session summary, semantic list, unavailable rows, reconnect, and Stop.
- `src/popup/components/quick-sync-recent-outcome.tsx`
- `src/popup/components/quick-sync-recent-outcome.test.tsx`
  - Short-lived failure context when the popup is opened.
- `src/popup/components/scroll-sync-popup.test.tsx`
  - Four-state popup integration and inactive picker regression.
- `scripts/i18n-validation.ts`
- `scripts/i18n-validation.test.ts`
  - Dual-tree key and placeholder validation.
- `e2e/extension/quick-sync-session.spec.ts`
  - Session-level Chrome E2E without a production-only test backdoor.
- `docs/guides/quick-sync-shortcut.md`
  - Architecture, state table, troubleshooting, and reusable physical QA evidence template.

### Modify

- `src/manifest.ts`, `src/manifest.test.ts`
- `src/shared/types/messages.ts`, `src/shared/types/sync-state.ts`, `src/shared/types/index.ts`
- `src/shared/lib/index.ts`
- `shim.d.ts`
- `src/background/main.ts`
- `src/background/lib/index.ts`
- `src/background/lib/sync-state.ts`, `src/background/lib/sync-state.test.ts`
- `src/background/lib/auto-sync-lifecycle.ts`, `src/background/lib/auto-sync-lifecycle.test.ts`
- `src/background/lib/auto-sync-suggestions.ts`, `src/background/lib/auto-sync-suggestions.test.ts`
- `src/background/lib/content-script-manager.ts`, `src/background/lib/content-script-manager.test.ts`
- `src/background/lib/keep-alive.ts`, `src/background/lib/keep-alive.test.ts`
- `src/background/handlers/index.ts`
- `src/background/handlers/scroll-sync-handlers.ts`, `src/background/handlers/scroll-sync-handlers.test.ts`
- `src/background/handlers/auto-sync-handlers.ts`, `src/background/handlers/auto-sync-handlers.test.ts`
- `src/background/handlers/connection-handlers.ts`, `src/background/handlers/connection-handlers.test.ts`
- `src/background/handlers/tab-event-handlers.ts`, `src/background/handlers/tab-event-handlers.test.ts`
- `src/contentScripts/index.ts`
- `src/contentScripts/components/index.ts`
- `src/contentScripts/lib/scroll-sync-state.ts`, `src/contentScripts/lib/scroll-sync-state.test.ts`
- `src/contentScripts/scroll-sync.ts`, `src/__tests__/scenarios.test.ts`
- `src/contentScripts/keyboard-handler.ts`, `src/contentScripts/keyboard-handler.test.ts`
- `src/contentScripts/hooks/use-panel-state.ts`, covered through `src/contentScripts/components/sync-control-panel.test.tsx`
- `src/popup/types.ts`
- `src/popup/hooks/index.ts`
- `src/popup/hooks/use-sync-control.ts`, `src/popup/hooks/use-sync-control.test.ts`
- `src/popup/components/index.ts`
- `src/popup/components/scroll-sync-popup.tsx`
- `scripts/validate-i18n.ts`
- `extension/_locales/{en,ko,ja,fr,es,de,zh_CN,zh_TW,hi}/messages.json`
- `src/shared/i18n/_locales/{en,ko,ja,fr,es,de,zh_CN,zh_TW,hi}/messages.json`
- `e2e/extension/fixtures.ts`
- `docs/guides/sync-suggestion-replacement.md`
- `src/background/README.md`
- `src/background/handlers/README.md`
- `src/contentScripts/README.md`
- `src/popup/README.md`

### Explicitly Do Not Modify

- `src/contentScripts/suggestion-toast.tsx`
- `src/contentScripts/components/sync-suggestion-toast.tsx`
- Scroll mapping, anchor, receiver scheduling, and `PROGRAMMATIC_SCROLL_GRACE_PERIOD` logic except for carrying cached numeric session identity.
- Landing source, landing tests, deploy workflow, and store-statistics workflow.

## Preflight

- [ ] **Step 1: Read required architecture guidance**

```bash
cat docs/guides/scroll-sync-pipeline.md
cat docs/guides/known-pitfalls.md
cat docs/guides/sync-suggestion-replacement.md
cat src/background/AGENTS.md
cat src/contentScripts/AGENTS.md
cat src/popup/README.md
```

Expected: the worker can name the cleanup-before-start legacy invariant, hot-path restrictions, restore-before-auto ordering, popup-local shortcut behavior, and the auto-suggestion opt-in rule before editing.

- [ ] **Step 2: Create an isolated feature branch**

```bash
git switch -c quick-sync-shortcut
```

Expected:

```text
Switched to a new branch 'quick-sync-shortcut'
```

- [ ] **Step 3: Record the clean baseline**

```bash
git status --short
pnpm typecheck
pnpm test -- --run
pnpm i18n:validate
pnpm privacy:logging
pnpm build
pnpm build-firefox
```

Expected: all baseline commands pass. Untracked `.playwright-mcp/`, `.pnpm-store/`, and `.superpowers/` may be present and remain unstaged.

If a baseline command fails, stop and record the pre-existing failure before feature work. Do not weaken the command or delete the failing test.

## Task 1: Define Shared Quick Sync and Session Contracts

**Files:**

- Create: `src/shared/types/quick-sync.ts`
- Create: `src/shared/types/sync-session.ts`
- Create: `src/shared/types/quick-sync.test.ts`
- Modify: `src/shared/types/messages.ts`
- Modify: `src/shared/types/index.ts`
- Modify: `shim.d.ts`

- [ ] **Step 1: Add a failing contract test**

Create `src/shared/types/quick-sync.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import type { QuickSyncFeedbackMessage, SyncStatusResponseMessage } from '~/shared/types';

describe('Quick Sync message contracts', () => {
  it('keeps an absolute candidate deadline', () => {
    const message: QuickSyncFeedbackMessage = {
      outcome: 'candidate-selected',
      generation: 3,
      expiresAt: 50_000,
    };

    expect(message).toEqual({
      outcome: 'candidate-selected',
      generation: 3,
      expiresAt: 50_000,
    });
  });

  it('preserves unavailable linked tabs in an active snapshot', () => {
    const response: SyncStatusResponseMessage = {
      status: 'active',
      snapshot: {
        revision: 8,
        sessionEpoch: 2,
        mode: 'ratio',
        linkedTabIds: [11, 22],
        tabs: [
          {
            availability: 'available',
            tabId: 11,
            title: 'Visible title',
            windowId: 1,
            location: 'current-tab',
            connectionStatus: 'connected',
          },
          {
            availability: 'unavailable',
            tabId: 22,
            connectionStatus: 'error',
          },
        ],
      },
    };

    expect(response.status).toBe('active');
    if (response.status === 'active') {
      expect(response.snapshot.linkedTabIds).toEqual([11, 22]);
      expect(response.snapshot.tabs[1]).toEqual({
        availability: 'unavailable',
        tabId: 22,
        connectionStatus: 'error',
      });
    }
  });

  it('distinguishes an explicit state error from inactive state', () => {
    const response: SyncStatusResponseMessage = {
      status: 'error',
      reason: 'storage-error',
    };

    expect(response).toEqual({ status: 'error', reason: 'storage-error' });
  });
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

```bash
pnpm test -- --run src/shared/types/quick-sync.test.ts
pnpm typecheck
```

Expected: Vitest may erase type-only imports while transpiling, but `pnpm typecheck` must FAIL with missing-module or missing-export diagnostics before the contracts exist.

- [ ] **Step 3: Add the discriminated contracts**

Add these public contracts, keeping unions as `type` and object shapes as `interface`:

```typescript
export type QuickSyncFailureReason =
  | 'unsupported-page'
  | 'content-unreachable'
  | 'candidate-tab-missing'
  | 'connection-timeout'
  | 'invalid-acknowledgement'
  | 'persistence-failed'
  | 'auto-sync-degraded'
  | 'session-state-unavailable'
  | 'hud-unavailable';

interface QuickSyncFeedbackBase {
  generation: number;
}

export type QuickSyncFeedbackMessage =
  | (QuickSyncFeedbackBase & {
      outcome: 'candidate-selected' | 'same-candidate' | 'second-tab-failed';
      expiresAt: number;
      reason?: QuickSyncFailureReason;
    })
  | (QuickSyncFeedbackBase & {
      outcome: 'connecting';
    })
  | (QuickSyncFeedbackBase & {
      outcome: 'start-succeeded' | 'add-succeeded' | 'already-included' | 'add-failed';
      tabCount: number;
      reason?: QuickSyncFailureReason;
    })
  | (QuickSyncFeedbackBase & {
      outcome: 'clear';
      reason: 'expired' | 'consumed' | 'invalidated' | 'worker-disconnected';
    });

export type QuickSyncFeedbackResponse =
  | { status: 'ready'; generation: number }
  | {
      status: 'failed';
      generation: number;
      reason: 'hud-unavailable' | 'port-unavailable';
    };

export type QuickSyncCommandResult =
  | { status: 'candidate-armed'; generation: number; expiresAt: number }
  | { status: 'started' | 'added' | 'already-included'; tabCount: number }
  | { status: 'rejected'; reason: QuickSyncFailureReason };

export interface RecentQuickSyncOutcome {
  tabId: number;
  resultKind:
    | 'unsupported'
    | 'candidate-failed'
    | 'start-failed'
    | 'add-failed'
    | 'session-state-unavailable';
  reason: QuickSyncFailureReason;
  tabCount?: number;
  expiresAt: number;
}

export interface DismissQuickSyncRecentOutcomeMessage {
  tabId: number;
  expiresAt: number;
}

export type DismissQuickSyncRecentOutcomeResponse = { status: 'dismissed' } | { status: 'stale' };

export type QuickSyncShortcutAssignment =
  | { status: 'loading' }
  | { status: 'assigned'; rawShortcut: string; label: string }
  | { status: 'unassigned' }
  | { status: 'unavailable' };
```

Add the authoritative session contracts:

```typescript
export type SyncStatusRequestMessage =
  | {
      source: 'popup';
      viewerTabId: number;
      viewerWindowId: number;
    }
  | { source: 'content-script' };

export interface SyncStatusViewerContext {
  viewerTabId: number;
  viewerWindowId: number;
}

export interface AvailableManualSyncTab {
  availability: 'available';
  tabId: number;
  title: string;
  favIconUrl?: string;
  windowId: number;
  location: 'current-tab' | 'current-window' | 'other-window';
  connectionStatus: ConnectionStatus;
}

export interface UnavailableManualSyncTab {
  availability: 'unavailable';
  tabId: number;
  connectionStatus: ConnectionStatus;
}

export interface ActiveManualSyncSnapshot {
  revision: number;
  sessionEpoch: number;
  mode: SyncMode;
  linkedTabIds: Array<number>;
  tabs: Array<AvailableManualSyncTab | UnavailableManualSyncTab>;
}

export type SyncStatusResponseMessage =
  | {
      status: 'inactive';
      revision: number;
      sessionEpoch: number;
      recentQuickSyncOutcome?: RecentQuickSyncOutcome;
    }
  | {
      status: 'active';
      snapshot: ActiveManualSyncSnapshot;
      recentQuickSyncOutcome?: RecentQuickSyncOutcome;
    }
  | {
      status: 'error';
      reason: 'storage-error' | 'invalid-state' | 'invalid-viewer-context';
      recentQuickSyncOutcome?: RecentQuickSyncOutcome;
    };

export interface ManualMessageIdentity {
  isAutoSync: false;
  sourceTabId: number;
  sessionEpoch: number;
}

export interface AutoSyncMessageIdentity {
  isAutoSync: true;
  sourceTabId: number;
}

export type SessionMessageIdentity = ManualMessageIdentity | AutoSyncMessageIdentity;

export interface ManualTransitionRejection {
  status: 'rejected';
  reason: QuickSyncFailureReason | 'stale-revision' | 'not-active';
  warning?: 'auto-sync-degraded';
}

export type ManualStartResult =
  | {
      status: 'committed';
      connectedTabIds: Array<number>;
      revision: number;
      sessionEpoch: number;
      warning?: 'auto-sync-degraded';
    }
  | ManualTransitionRejection;

export type ManualAddResult =
  | {
      status: 'committed';
      linkedTabIds: Array<number>;
      revision: number;
      sessionEpoch: number;
    }
  | ManualTransitionRejection;

export type ManualStopResult =
  | {
      status: 'committed';
      revision: number;
      warning?: 'cleanup-incomplete';
    }
  | ManualTransitionRejection;

export type ManualReconnectResult =
  | { status: 'committed'; revision: number }
  | ManualTransitionRejection;

export interface ReconnectManualSessionMessage {
  expectedRevision: number;
}
```

Extend existing message payloads instead of introducing duplicate protocols:

```typescript
export interface StartSyncMessage {
  tabIds: Array<number>;
  mode: SyncMode;
  isAutoSync?: boolean;
  currentTabId?: number;
  sessionEpoch?: number;
}

export interface StopSyncMessage {
  tabIds?: Array<number>;
  isAutoSync?: boolean;
  expectedRevision?: number;
}

export interface StopSyncContentResponse {
  success: boolean;
  tabId: number;
  reason?: string;
}

export type StopSyncResponse = StopSyncContentResponse | ManualStopResult;

export interface ScrollSyncPayload {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  mode: SyncMode;
  timestamp: number;
}

export type ScrollSyncMessage = ScrollSyncPayload & SessionMessageIdentity;

export interface SyncSuggestionResponseMessage {
  normalizedUrl: string;
  accepted: boolean;
  expectedRevision: number;
  snooze?: boolean;
  permanent?: boolean;
}

export interface SyncSuggestionMessage {
  normalizedUrl: string;
  tabCount: number;
  tabIds: Array<number>;
  tabTitles: Array<string>;
  expectedRevision: number;
  matchKind?: AutoSyncSuggestionMatchKind;
  matchConfidence?: TranslatedPageConfidence;
  hasExistingSync?: boolean;
  existingSyncTabCount?: number;
}

export interface AddTabToSyncResponseMessage {
  tabId: number;
  accepted: boolean;
  expectedRevision: number;
  snooze?: boolean;
  permanent?: boolean;
  normalizedUrl?: string;
}

export interface AddTabToSyncMessage {
  tabId: number;
  tabTitle: string;
  hasManualOffsets: boolean;
  normalizedUrl: string;
  expectedRevision: number;
  matchKind?: AutoSyncSuggestionMatchKind;
  matchConfidence?: TranslatedPageConfidence;
}
```

Define `StopSyncResponse` as the existing content-script acknowledgement unioned with `ManualStopResult`. Add `quick-sync:feedback`, `quick-sync:dismiss-recent-outcome`, the typed `sync:get-status`, `sync:reconnect-session`, revision-aware Stop responses, and updated suggestion payloads to both `ProtocolMap` declarations.

- [ ] **Step 4: Run contract and type checks**

```bash
pnpm test -- --run src/shared/types/quick-sync.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/types/quick-sync.ts src/shared/types/sync-session.ts src/shared/types/quick-sync.test.ts src/shared/types/messages.ts src/shared/types/index.ts shim.d.ts
git commit -m "feat: define quick sync session contracts"
```

## Task 2: Add Pure Countdown and Shortcut Helpers

**Files:**

- Create: `src/shared/lib/quick-sync.ts`
- Create: `src/shared/lib/quick-sync.test.ts`
- Modify: `src/shared/lib/index.ts`

- [ ] **Step 1: Add failing boundary and formatting tests**

```typescript
import { describe, expect, it } from 'vitest';

import {
  getQuickSyncPortName,
  getQuickSyncRemainingSeconds,
  parseQuickSyncPortGeneration,
  toQuickSyncShortcutLabel,
} from './quick-sync';

describe('getQuickSyncRemainingSeconds', () => {
  it.each([
    { now: 1_000, expiresAt: 11_000, expected: 10 },
    { now: 1_001, expiresAt: 11_000, expected: 10 },
    { now: 10_000, expiresAt: 11_000, expected: 1 },
    { now: 11_000, expiresAt: 11_000, expected: null },
  ])('returns $expected for $now → $expiresAt', ({ now, expiresAt, expected }) => {
    expect(getQuickSyncRemainingSeconds(now, expiresAt)).toBe(expected);
  });
});

describe('toQuickSyncShortcutLabel', () => {
  it('formats the macOS browser assignment', () => {
    expect(toQuickSyncShortcutLabel('Command+Shift+Period', 'mac')).toBe('⌘ ⇧ .');
  });

  it('formats the Windows and Linux browser assignment', () => {
    expect(toQuickSyncShortcutLabel('Ctrl+Shift+Period', 'other')).toBe('Ctrl ⇧ .');
  });

  it('preserves browser tokens it does not recognize', () => {
    expect(toQuickSyncShortcutLabel('Alt+MediaPlayPause', 'other')).toBe('Alt MediaPlayPause');
  });
});

describe('Quick Sync Port names', () => {
  it('round-trips a safe generation', () => {
    expect(parseQuickSyncPortGeneration(getQuickSyncPortName(12))).toBe(12);
  });

  it.each([
    'quick-sync-candidate:',
    'quick-sync-candidate:-1',
    'quick-sync-candidate:1.5',
    'other:12',
  ])('rejects %s', (name) => {
    expect(parseQuickSyncPortGeneration(name)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

```bash
pnpm test -- --run src/shared/lib/quick-sync.test.ts
```

Expected: FAIL because the helper module does not exist.

- [ ] **Step 3: Implement the pure helpers**

```typescript
export const QUICK_SYNC_CANDIDATE_DURATION_MS = 10_000;
export const QUICK_SYNC_CONTROL_TIMEOUT_MS = 1_000;
export const QUICK_SYNC_RECONNECT_TIMEOUT_MS = 3_000;
export const QUICK_SYNC_RECENT_OUTCOME_DURATION_MS = 30_000;
export const QUICK_SYNC_SUCCESS_HUD_DURATION_MS = 2_500;
export const QUICK_SYNC_FAILURE_HUD_DURATION_MS = 4_000;
export const QUICK_SYNC_BADGE_DURATION_MS = 4_000;
export const QUICK_SYNC_PORT_PREFIX = 'quick-sync-candidate:';

export function getQuickSyncRemainingSeconds(now: number, expiresAt: number): number | null {
  const remainingMilliseconds = expiresAt - now;
  if (remainingMilliseconds <= 0) {
    return null;
  }

  return Math.ceil(remainingMilliseconds / 1_000);
}

export function getQuickSyncPortName(generation: number): string {
  return `${QUICK_SYNC_PORT_PREFIX}${generation}`;
}

export function parseQuickSyncPortGeneration(name: string): number | null {
  if (!name.startsWith(QUICK_SYNC_PORT_PREFIX)) {
    return null;
  }

  const generation = Number(name.slice(QUICK_SYNC_PORT_PREFIX.length));
  return Number.isSafeInteger(generation) && generation >= 0 ? generation : null;
}

export function toQuickSyncShortcutLabel(shortcut: string, platform: 'mac' | 'other'): string {
  const tokens = shortcut.split('+').filter((token) => token.length > 0);
  const labels = tokens.map((token) => {
    if (token === 'Command') return '⌘';
    if (token === 'MacCtrl') return '⌃';
    if (token === 'Shift') return '⇧';
    if (token === 'Period') return '.';
    if (token === 'Alt' && platform === 'mac') return '⌥';
    return token;
  });

  return labels.join(' ');
}
```

- [ ] **Step 4: Run the focused test and typecheck**

```bash
pnpm test -- --run src/shared/lib/quick-sync.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/quick-sync.ts src/shared/lib/quick-sync.test.ts src/shared/lib/index.ts
git commit -m "feat: add quick sync timing helpers"
```

## Task 3: Strengthen Dual-Tree i18n Validation

**Files:**

- Create: `scripts/i18n-validation.ts`
- Create: `scripts/i18n-validation.test.ts`
- Modify: `scripts/validate-i18n.ts`

- [ ] **Step 1: Add failing validator tests**

Extract a side-effect-free validator and cover:

```typescript
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { SUPPORTED_EXTENSION_LOCALES, validateI18nTrees } from './i18n-validation';

const temporaryRoots: Array<string> = [];
const sampleMessage = {
  sample: {
    message: 'Value: $VALUE$',
    placeholders: { value: { content: '$1' } },
  },
};

async function writeMessages(
  root: string,
  tree: 'extension/_locales' | 'src/shared/i18n/_locales',
  locale: string,
  messages: object,
): Promise<void> {
  const directory = path.join(root, tree, locale);
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, 'messages.json'),
    `${JSON.stringify(messages, null, 2)}\n`,
    'utf8',
  );
}

async function createLocaleFixture(options?: {
  omit?: { tree: 'extension/_locales' | 'src/shared/i18n/_locales'; locale: string };
  mismatchKoreanPlaceholder?: boolean;
}): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'scroll-sync-i18n-'));
  temporaryRoots.push(root);

  const trees: ReadonlyArray<'extension/_locales' | 'src/shared/i18n/_locales'> = [
    'extension/_locales',
    'src/shared/i18n/_locales',
  ];

  for (const tree of trees) {
    for (const locale of SUPPORTED_EXTENSION_LOCALES) {
      if (options?.omit?.tree === tree && options.omit.locale === locale) {
        continue;
      }

      const messages =
        options?.mismatchKoreanPlaceholder && tree === 'src/shared/i18n/_locales' && locale === 'ko'
          ? {
              sample: {
                message: '값: $VALUE$',
                placeholders: { value: { content: '$2' } },
              },
            }
          : sampleMessage;
      await writeMessages(root, tree, locale, messages);
    }
  }

  await writeMessages(root, 'extension/_locales', 'zh', sampleMessage);
  return root;
}

afterEach(async () => {
  const roots = temporaryRoots.splice(0);
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

describe('validateI18nTrees', () => {
  it('requires the same nine locales in both trees', async () => {
    const root = await createLocaleFixture({
      omit: { tree: 'extension/_locales', locale: 'hi' },
    });
    const result = await validateI18nTrees(root);

    expect(result.errors).toContain('extension/_locales/hi/messages.json is missing');
    expect(SUPPORTED_EXTENSION_LOCALES).toEqual([
      'en',
      'ko',
      'ja',
      'fr',
      'es',
      'de',
      'zh_CN',
      'zh_TW',
      'hi',
    ]);
  });

  it('reports cross-tree placeholder content mismatches', async () => {
    const root = await createLocaleFixture({ mismatchKoreanPlaceholder: true });
    const result = await validateI18nTrees(root);

    expect(result.errors).toContain('ko: sample placeholder value differs between locale trees');
  });

  it('ignores the legacy extension-only zh locale', async () => {
    const root = await createLocaleFixture();
    const result = await validateI18nTrees(root);

    expect(result.errors).toEqual([]);
  });
});
```

Do not add checked-in fixture JSON. The helper above writes only under the exact `mkdtemp()` result and removes those roots after each test.

- [ ] **Step 2: Run the focused test and confirm it fails**

```bash
pnpm test -- --run scripts/i18n-validation.test.ts
```

Expected: FAIL because the validator module does not exist.

- [ ] **Step 3: Extract the validator and preserve the CLI**

Implement this public boundary:

```typescript
export const SUPPORTED_EXTENSION_LOCALES: ReadonlyArray<string> = [
  'en',
  'ko',
  'ja',
  'fr',
  'es',
  'de',
  'zh_CN',
  'zh_TW',
  'hi',
];

export interface I18nValidationResult {
  errors: Array<string>;
}

export interface I18nValidationOptions {
  requiredMessages?: Readonly<Record<string, ReadonlyArray<string>>>;
}

export async function validateI18nTrees(
  repositoryRoot: string,
  options?: I18nValidationOptions,
): Promise<I18nValidationResult>;
```

The validator must:

1. Check that all nine locale files exist in both trees.
2. Compare every supported locale’s keys with the English baseline in its own tree.
3. Compare key sets between the two English baselines.
4. For the same locale and key in both trees, compare placeholder names and each placeholder’s `content`.
5. Report every mismatch in one run.
6. Ignore `extension/_locales/zh` without deleting it.
7. When `requiredMessages` is supplied, require every named key in every supported file and require the exact placeholder-name list.

Keep `scripts/validate-i18n.ts` as a small CLI:

```typescript
import process from 'node:process';

import { validateI18nTrees } from './i18n-validation';

const result = await validateI18nTrees(process.cwd());

if (result.errors.length > 0) {
  for (const error of result.errors) {
    console.error(error);
  }
  process.exitCode = 1;
}
```

- [ ] **Step 4: Run focused and existing validation**

```bash
pnpm test -- --run scripts/i18n-validation.test.ts
pnpm i18n:validate
```

Expected: PASS before new Quick Sync keys are added.

- [ ] **Step 5: Commit**

```bash
git add scripts/i18n-validation.ts scripts/i18n-validation.test.ts scripts/validate-i18n.ts
git commit -m "test: validate both extension locale trees"
```

## Task 4: Add the Complete Quick Sync Copy Contract

**Files:**

- Modify: `scripts/i18n-validation.ts`
- Modify: `scripts/i18n-validation.test.ts`
- Modify: `scripts/validate-i18n.ts`
- Modify: `extension/_locales/{en,ko,ja,fr,es,de,zh_CN,zh_TW,hi}/messages.json`
- Modify: `src/shared/i18n/_locales/{en,ko,ja,fr,es,de,zh_CN,zh_TW,hi}/messages.json`

- [ ] **Step 1: Add a failing key-family assertion**

Export the required key family from `scripts/i18n-validation.ts`:

```typescript
export const QUICK_SYNC_REQUIRED_MESSAGES: Readonly<Record<string, ReadonlyArray<string>>> = {
  quickSyncCommandDescription: [],
  quickSyncCandidateSelectedTitle: [],
  quickSyncCandidateInstruction: ['remainingSeconds'],
  quickSyncSameCandidateTitle: [],
  quickSyncConnectingTitle: [],
  quickSyncSecondTabRetryInstruction: ['remainingSeconds'],
  quickSyncStartSucceededTitle: ['tabCount'],
  quickSyncAddSucceededTitle: ['tabCount'],
  quickSyncAlreadyIncludedTitle: ['tabCount'],
  quickSyncSecondTabFailedTitle: [],
  quickSyncAddFailedTitle: [],
  quickSyncExistingTabsContinue: ['tabCount'],
  quickSyncUnsupportedTab: [],
  quickSyncCandidateExpiredAnnouncement: [],
  activeSyncHeading: [],
  activeSyncSummary: ['tabCount'],
  activeSyncAddInstruction: ['shortcutLabel'],
  activeSyncTabsHeading: [],
  activeSyncEditNotice: [],
  currentTabLocation: [],
  currentWindowLocation: [],
  otherWindowLocation: [],
  reassignQuickSyncShortcut: [],
  quickSyncShortcutUnassigned: [],
  quickSyncShortcutUnavailable: [],
  activeSyncTabUnavailable: [],
  quickSyncShortcutAssignedSummary: ['shortcutLabel'],
  quickSyncShortcutSettingsFallbackChromium: ['settingsUrl'],
  quickSyncShortcutSettingsFallbackFirefox: [],
  manualSyncStateUnavailable: [],
  retryStatusCheck: [],
  syncCleanupIncomplete: [],
  quickSyncShortcutHeading: [],
  autoSyncRecoveryDegraded: [],
  autoSyncReplacementFailed: [],
};
```

Pass it from `scripts/validate-i18n.ts` on every production validation:

```typescript
const result = await validateI18nTrees(process.cwd(), {
  requiredMessages: QUICK_SYNC_REQUIRED_MESSAGES,
});
```

Extend `scripts/i18n-validation.test.ts`:

```typescript
import { QUICK_SYNC_REQUIRED_MESSAGES, validateI18nTrees } from './i18n-validation';

it('enforces the Quick Sync key and placeholder contract', async () => {
  const result = await validateI18nTrees(process.cwd(), {
    requiredMessages: QUICK_SYNC_REQUIRED_MESSAGES,
  });

  expect(result.errors).toEqual([]);
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
pnpm test -- --run scripts/i18n-validation.test.ts
```

Expected: FAIL because the Quick Sync key family is absent.

- [ ] **Step 3: Add these exact English source strings to both English locale files**

| Key                                         | English message                                                                                             |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `quickSyncCommandDescription`               | `Start scroll sync or add this tab`                                                                         |
| `quickSyncCandidateSelectedTitle`           | `1 tab selected for sync`                                                                                   |
| `quickSyncCandidateInstruction`             | `Press the same shortcut in another tab within $REMAININGSECONDS$ seconds to sync scrolling with this tab.` |
| `quickSyncSameCandidateTitle`               | `This tab is already selected`                                                                              |
| `quickSyncConnectingTitle`                  | `Connecting tabs…`                                                                                          |
| `quickSyncStartSucceededTitle`              | `Scroll sync started · $TABCOUNT$ tabs`                                                                     |
| `quickSyncAddSucceededTitle`                | `This tab was added to sync · $TABCOUNT$ tabs`                                                              |
| `quickSyncAlreadyIncludedTitle`             | `This tab is already in the current sync · $TABCOUNT$ tabs`                                                 |
| `quickSyncSecondTabFailedTitle`             | `Couldn’t connect this tab`                                                                                 |
| `quickSyncSecondTabRetryInstruction`        | `Press the same shortcut in another tab within $REMAININGSECONDS$ seconds to try again.`                    |
| `quickSyncAddFailedTitle`                   | `Couldn’t add this tab`                                                                                     |
| `quickSyncExistingTabsContinue`             | `The existing $TABCOUNT$ tabs are still syncing.`                                                           |
| `quickSyncUnsupportedTab`                   | `Scroll sync isn’t available on this tab`                                                                   |
| `quickSyncCandidateExpiredAnnouncement`     | `The time to select another tab has ended.`                                                                 |
| `activeSyncHeading`                         | `Scroll sync is active`                                                                                     |
| `activeSyncSummary`                         | `Scrolling is synchronized across $TABCOUNT$ tabs.`                                                         |
| `activeSyncAddInstruction`                  | `Press $SHORTCUTLABEL$ in another tab to sync it too.`                                                      |
| `activeSyncTabsHeading`                     | `Tabs scrolling together`                                                                                   |
| `activeSyncEditNotice`                      | `To add or remove tabs in this popup, stop synchronization first.`                                          |
| `currentTabLocation`                        | `Current tab`                                                                                               |
| `currentWindowLocation`                     | `Current window`                                                                                            |
| `otherWindowLocation`                       | `Other window`                                                                                              |
| `reassignQuickSyncShortcut`                 | `Reassign shortcut`                                                                                         |
| `quickSyncShortcutUnassigned`               | `No Quick Sync shortcut is assigned.`                                                                       |
| `quickSyncShortcutUnavailable`              | `Couldn’t load the Quick Sync shortcut.`                                                                    |
| `activeSyncTabUnavailable`                  | `Couldn’t load tab details`                                                                                 |
| `quickSyncShortcutSettingsFallbackChromium` | `Enter $SETTINGSURL$ in the address bar to reassign the shortcut.`                                          |
| `quickSyncShortcutSettingsFallbackFirefox`  | `In Add-ons Manager, open the gear menu and choose Manage Extension Shortcuts.`                             |
| `manualSyncStateUnavailable`                | `Can’t verify the synchronization state.`                                                                   |
| `retryStatusCheck`                          | `Check again`                                                                                               |
| `syncCleanupIncomplete`                     | `Couldn’t clean up sync controls in some tabs. Reload those tabs to remove them.`                           |
| `quickSyncShortcutHeading`                  | `Quick Sync shortcut`                                                                                       |
| `quickSyncShortcutAssignedSummary`          | `Quick Sync: $SHORTCUTLABEL$`                                                                               |
| `autoSyncRecoveryDegraded`                  | `Couldn’t fully restore automatic sync state. Manual sync was not changed.`                                 |
| `autoSyncReplacementFailed`                 | `Couldn’t start the suggested synchronization. The previous synchronization remains stopped.`               |

For placeholder entries, use WebExtension placeholders whose names match the lowercase contract and whose content maps in this exact order:

```json
{
  "placeholders": {
    "remainingSeconds": { "content": "$1" }
  }
}
```

Use the same shape for `tabCount`, `shortcutLabel`, and `settingsUrl`.

- [ ] **Step 4: Add these exact approved and supporting Korean strings to both Korean locale files**

| Key                                         | Korean message                                                                                 |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `quickSyncCommandDescription`               | `스크롤 동기화 시작 또는 탭 추가`                                                              |
| `quickSyncCandidateSelectedTitle`           | `동기화할 탭 1개 선택됨`                                                                       |
| `quickSyncCandidateInstruction`             | `$REMAININGSECONDS$초 안에 다른 탭에서 같은 단축키를 누르면 이 탭과 함께 스크롤 동기화됩니다.` |
| `quickSyncSameCandidateTitle`               | `이 탭은 이미 선택되어 있어요`                                                                 |
| `quickSyncConnectingTitle`                  | `탭을 연결하고 있어요…`                                                                        |
| `quickSyncStartSucceededTitle`              | `스크롤 동기화를 시작했어요 · 현재 $TABCOUNT$개 탭`                                            |
| `quickSyncAddSucceededTitle`                | `이 탭을 동기화에 추가했어요 · 현재 $TABCOUNT$개 탭`                                           |
| `quickSyncAlreadyIncludedTitle`             | `이 탭은 이미 현재 동기화에 포함되어 있어요 · 현재 $TABCOUNT$개 탭`                            |
| `quickSyncSecondTabFailedTitle`             | `이 탭을 연결하지 못했어요`                                                                    |
| `quickSyncSecondTabRetryInstruction`        | `$REMAININGSECONDS$초 안에 다른 탭에서 같은 단축키를 누르면 다시 시도할 수 있어요.`            |
| `quickSyncAddFailedTitle`                   | `이 탭을 추가하지 못했어요`                                                                    |
| `quickSyncExistingTabsContinue`             | `기존 $TABCOUNT$개 탭은 계속 동기화되고 있어요.`                                               |
| `quickSyncUnsupportedTab`                   | `이 탭에서는 스크롤 동기화를 사용할 수 없어요`                                                 |
| `quickSyncCandidateExpiredAnnouncement`     | `다른 탭을 선택할 수 있는 시간이 끝났어요.`                                                    |
| `activeSyncHeading`                         | `스크롤 동기화 중`                                                                             |
| `activeSyncSummary`                         | `현재 $TABCOUNT$개 탭의 스크롤이 함께 움직이고 있어요.`                                        |
| `activeSyncAddInstruction`                  | `다른 탭에서도 $SHORTCUTLABEL$을 누르면 그 탭도 함께 스크롤돼요.`                              |
| `activeSyncTabsHeading`                     | `함께 스크롤하는 탭`                                                                           |
| `activeSyncEditNotice`                      | `이 팝업에서 탭을 추가하거나 해제하려면 먼저 동기화를 중지해야 해요.`                          |
| `currentTabLocation`                        | `현재 탭`                                                                                      |
| `currentWindowLocation`                     | `현재 창`                                                                                      |
| `otherWindowLocation`                       | `다른 창`                                                                                      |
| `reassignQuickSyncShortcut`                 | `단축키 다시 지정`                                                                             |
| `quickSyncShortcutUnassigned`               | `빠른 동기화 단축키가 지정되어 있지 않아요.`                                                   |
| `quickSyncShortcutUnavailable`              | `빠른 동기화 단축키를 불러오지 못했어요.`                                                      |
| `activeSyncTabUnavailable`                  | `탭 정보를 불러오지 못했어요`                                                                  |
| `quickSyncShortcutSettingsFallbackChromium` | `주소창에 $SETTINGSURL$을 입력해 단축키를 다시 지정하세요.`                                    |
| `quickSyncShortcutSettingsFallbackFirefox`  | `부가 기능 관리자에서 톱니바퀴를 누른 뒤 확장 기능 단축키 관리를 선택하세요.`                  |
| `manualSyncStateUnavailable`                | `동기화 상태를 확인할 수 없어요.`                                                              |
| `retryStatusCheck`                          | `다시 확인`                                                                                    |
| `syncCleanupIncomplete`                     | `일부 탭의 동기화 표시를 정리하지 못했어요. 탭을 새로고침하면 사라져요.`                       |
| `quickSyncShortcutHeading`                  | `빠른 동기화 단축키`                                                                           |
| `quickSyncShortcutAssignedSummary`          | `빠른 동기화: $SHORTCUTLABEL$`                                                                 |
| `autoSyncRecoveryDegraded`                  | `자동 동기화 상태를 완전히 복원하지 못했어요. 기존 수동 동기화는 변경하지 않았어요.`           |
| `autoSyncReplacementFailed`                 | `제안된 동기화를 시작하지 못했어요. 이전 동기화는 중지된 상태예요.`                            |

- [ ] **Step 5: Add reviewed translations for the other seven locales**

Use these exact reviewed messages in both locale trees. Preserve every placeholder verbatim.

| Key                                         | `ja`                                                                                                         | `fr`                                                                                                                                    | `es`                                                                                                                           | `de`                                                                                                                                                    | `zh_CN`                                                                              | `zh_TW`                                                                          | `hi`                                                                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `quickSyncCommandDescription`               | `スクロール同期を開始またはこのタブを追加`                                                                   | `Démarrer la synchronisation du défilement ou ajouter cet onglet`                                                                       | `Iniciar la sincronización de desplazamiento o añadir esta pestaña`                                                            | `Scroll-Synchronisierung starten oder diesen Tab hinzufügen`                                                                                            | `开始滚动同步或添加此标签页`                                                         | `開始捲動同步或新增此分頁`                                                       | `स्क्रॉल सिंक शुरू करें या यह टैब जोड़ें`                                                                             |
| `quickSyncCandidateSelectedTitle`           | `同期するタブを1つ選択しました`                                                                              | `1 onglet sélectionné pour la synchronisation`                                                                                          | `1 pestaña seleccionada para sincronizar`                                                                                      | `1 Tab für die Synchronisierung ausgewählt`                                                                                                             | `已选择 1 个要同步的标签页`                                                          | `已選取 1 個要同步的分頁`                                                        | `सिंक के लिए 1 टैब चुना गया`                                                                                          |
| `quickSyncCandidateInstruction`             | `$REMAININGSECONDS$秒以内に別のタブで同じショートカットを押すと、このタブと一緒にスクロールが同期されます。` | `Dans les $REMAININGSECONDS$ secondes, utilisez le même raccourci dans un autre onglet pour synchroniser son défilement avec celui-ci.` | `En los próximos $REMAININGSECONDS$ segundos, usa el mismo atajo en otra pestaña para sincronizar su desplazamiento con esta.` | `Drücke innerhalb von $REMAININGSECONDS$ Sekunden in einem anderen Tab dasselbe Tastenkürzel, um ihn mit diesem Tab zu synchronisieren.`                | `请在 $REMAININGSECONDS$ 秒内于另一个标签页按下相同快捷键，使其与此标签页同步滚动。` | `請在 $REMAININGSECONDS$ 秒內於另一個分頁按下相同快速鍵，使其與此分頁同步捲動。` | `$REMAININGSECONDS$ सेकंड के भीतर किसी दूसरे टैब में यही शॉर्टकट दबाएँ, ताकि उसका स्क्रॉल इस टैब के साथ सिंक हो सके।` |
| `quickSyncSameCandidateTitle`               | `このタブはすでに選択されています`                                                                           | `Cet onglet est déjà sélectionné`                                                                                                       | `Esta pestaña ya está seleccionada`                                                                                            | `Dieser Tab ist bereits ausgewählt`                                                                                                                     | `此标签页已被选择`                                                                   | `此分頁已被選取`                                                                 | `यह टैब पहले से चुना गया है`                                                                                          |
| `quickSyncConnectingTitle`                  | `タブを接続しています…`                                                                                      | `Connexion des onglets…`                                                                                                                | `Conectando pestañas…`                                                                                                         | `Tabs werden verbunden…`                                                                                                                                | `正在连接标签页…`                                                                    | `正在連接分頁…`                                                                  | `टैब कनेक्ट किए जा रहे हैं…`                                                                                          |
| `quickSyncStartSucceededTitle`              | `スクロール同期を開始しました · 現在$TABCOUNT$個のタブ`                                                      | `Synchronisation démarrée · $TABCOUNT$ onglets actuellement`                                                                            | `Sincronización iniciada · $TABCOUNT$ pestañas actualmente`                                                                    | `Scroll-Synchronisierung gestartet · Aktuell $TABCOUNT$ Tabs`                                                                                           | `已开始滚动同步 · 当前 $TABCOUNT$ 个标签页`                                          | `已開始捲動同步 · 目前 $TABCOUNT$ 個分頁`                                        | `स्क्रॉल सिंक शुरू हो गया · अभी $TABCOUNT$ टैब`                                                                       |
| `quickSyncAddSucceededTitle`                | `このタブを同期に追加しました · 現在$TABCOUNT$個のタブ`                                                      | `Cet onglet a été ajouté · $TABCOUNT$ onglets actuellement`                                                                             | `Esta pestaña se añadió · $TABCOUNT$ pestañas actualmente`                                                                     | `Dieser Tab wurde hinzugefügt · Aktuell $TABCOUNT$ Tabs`                                                                                                | `已将此标签页添加到同步 · 当前 $TABCOUNT$ 个标签页`                                  | `已將此分頁新增至同步 · 目前 $TABCOUNT$ 個分頁`                                  | `यह टैब सिंक में जोड़ दिया गया · अभी $TABCOUNT$ टैब`                                                                  |
| `quickSyncAlreadyIncludedTitle`             | `このタブはすでに現在の同期に含まれています · 現在$TABCOUNT$個のタブ`                                        | `Cet onglet fait déjà partie de la synchronisation · $TABCOUNT$ onglets actuellement`                                                   | `Esta pestaña ya está en la sincronización actual · $TABCOUNT$ pestañas actualmente`                                           | `Dieser Tab ist bereits synchronisiert · Aktuell $TABCOUNT$ Tabs`                                                                                       | `此标签页已在当前同步中 · 当前 $TABCOUNT$ 个标签页`                                  | `此分頁已在目前的同步中 · 目前 $TABCOUNT$ 個分頁`                                | `यह टैब मौजूदा सिंक में पहले से शामिल है · अभी $TABCOUNT$ टैब`                                                        |
| `quickSyncSecondTabFailedTitle`             | `このタブに接続できませんでした`                                                                             | `Impossible de connecter cet onglet`                                                                                                    | `No se pudo conectar esta pestaña`                                                                                             | `Dieser Tab konnte nicht verbunden werden`                                                                                                              | `无法连接此标签页`                                                                   | `無法連接此分頁`                                                                 | `इस टैब से कनेक्ट नहीं हो सका`                                                                                        |
| `quickSyncSecondTabRetryInstruction`        | `$REMAININGSECONDS$秒以内に別のタブで同じショートカットを押すと、もう一度試せます。`                         | `Dans les $REMAININGSECONDS$ secondes, utilisez le même raccourci dans un autre onglet pour réessayer.`                                 | `En los próximos $REMAININGSECONDS$ segundos, usa el mismo atajo en otra pestaña para volver a intentarlo.`                    | `Drücke innerhalb von $REMAININGSECONDS$ Sekunden in einem anderen Tab dasselbe Tastenkürzel, um es erneut zu versuchen.`                               | `请在 $REMAININGSECONDS$ 秒内于另一个标签页按下相同快捷键以重试。`                   | `請在 $REMAININGSECONDS$ 秒內於另一個分頁按下相同快速鍵以重試。`                 | `$REMAININGSECONDS$ सेकंड के भीतर किसी दूसरे टैब में यही शॉर्टकट दबाकर फिर कोशिश करें।`                               |
| `quickSyncAddFailedTitle`                   | `このタブを追加できませんでした`                                                                             | `Impossible d’ajouter cet onglet`                                                                                                       | `No se pudo añadir esta pestaña`                                                                                               | `Dieser Tab konnte nicht hinzugefügt werden`                                                                                                            | `无法添加此标签页`                                                                   | `無法新增此分頁`                                                                 | `इस टैब को जोड़ नहीं सके`                                                                                             |
| `quickSyncExistingTabsContinue`             | `既存の$TABCOUNT$個のタブは引き続き同期しています。`                                                         | `Les $TABCOUNT$ onglets existants restent synchronisés.`                                                                                | `Las $TABCOUNT$ pestañas existentes siguen sincronizadas.`                                                                     | `Die vorhandenen $TABCOUNT$ Tabs werden weiter synchronisiert.`                                                                                         | `现有的 $TABCOUNT$ 个标签页仍在同步。`                                               | `現有的 $TABCOUNT$ 個分頁仍在同步。`                                             | `मौजूदा $TABCOUNT$ टैब अभी भी सिंक हो रहे हैं।`                                                                       |
| `quickSyncUnsupportedTab`                   | `このタブではスクロール同期を使用できません`                                                                 | `La synchronisation du défilement n’est pas disponible dans cet onglet`                                                                 | `La sincronización de desplazamiento no está disponible en esta pestaña`                                                       | `Scroll-Synchronisierung ist in diesem Tab nicht verfügbar`                                                                                             | `此标签页不支持滚动同步`                                                             | `此分頁不支援捲動同步`                                                           | `इस टैब पर स्क्रॉल सिंक उपलब्ध नहीं है`                                                                               |
| `quickSyncCandidateExpiredAnnouncement`     | `別のタブを選択できる時間が終了しました。`                                                                   | `Le délai pour sélectionner un autre onglet est écoulé.`                                                                                | `Se acabó el tiempo para seleccionar otra pestaña.`                                                                            | `Die Zeit zum Auswählen eines weiteren Tabs ist abgelaufen.`                                                                                            | `选择另一个标签页的时间已结束。`                                                     | `選取另一個分頁的時間已結束。`                                                   | `दूसरा टैब चुनने का समय समाप्त हो गया।`                                                                               |
| `activeSyncHeading`                         | `スクロール同期中`                                                                                           | `Synchronisation du défilement active`                                                                                                  | `Sincronización de desplazamiento activa`                                                                                      | `Scroll-Synchronisierung aktiv`                                                                                                                         | `正在同步滚动`                                                                       | `正在同步捲動`                                                                   | `स्क्रॉल सिंक चालू है`                                                                                                |
| `activeSyncSummary`                         | `現在$TABCOUNT$個のタブが一緒にスクロールします。`                                                           | `Le défilement est synchronisé dans $TABCOUNT$ onglets.`                                                                                | `El desplazamiento está sincronizado en $TABCOUNT$ pestañas.`                                                                  | `Der Bildlauf ist in $TABCOUNT$ Tabs synchronisiert.`                                                                                                   | `当前 $TABCOUNT$ 个标签页会同步滚动。`                                               | `目前 $TABCOUNT$ 個分頁會同步捲動。`                                             | `अभी $TABCOUNT$ टैब का स्क्रॉल एक साथ चल रहा है।`                                                                     |
| `activeSyncAddInstruction`                  | `別のタブで$SHORTCUTLABEL$を押すと、そのタブも一緒にスクロールします。`                                      | `Appuyez sur $SHORTCUTLABEL$ dans un autre onglet pour le synchroniser aussi.`                                                          | `Pulsa $SHORTCUTLABEL$ en otra pestaña para sincronizarla también.`                                                            | `Drücke $SHORTCUTLABEL$ in einem anderen Tab, um ihn ebenfalls zu synchronisieren.`                                                                     | `在另一个标签页按下 $SHORTCUTLABEL$，即可将其加入同步。`                             | `在另一個分頁按下 $SHORTCUTLABEL$，即可將其加入同步。`                           | `दूसरे टैब में $SHORTCUTLABEL$ दबाएँ, ताकि वह भी साथ स्क्रॉल हो।`                                                     |
| `activeSyncTabsHeading`                     | `一緒にスクロールするタブ`                                                                                   | `Onglets qui défilent ensemble`                                                                                                         | `Pestañas que se desplazan juntas`                                                                                             | `Gemeinsam scrollende Tabs`                                                                                                                             | `同步滚动的标签页`                                                                   | `同步捲動的分頁`                                                                 | `साथ स्क्रॉल होने वाले टैब`                                                                                           |
| `activeSyncEditNotice`                      | `このポップアップでタブを追加または解除するには、先に同期を停止してください。`                               | `Pour ajouter ou retirer des onglets dans cette fenêtre, arrêtez d’abord la synchronisation.`                                           | `Para añadir o quitar pestañas en esta ventana, detén primero la sincronización.`                                              | `Um Tabs in diesem Pop-up hinzuzufügen oder zu entfernen, beende zuerst die Synchronisierung.`                                                          | `若要在此弹出窗口中添加或移除标签页，请先停止同步。`                                 | `若要在此彈出視窗中新增或移除分頁，請先停止同步。`                               | `इस पॉपअप में टैब जोड़ने या हटाने के लिए पहले सिंक रोकें।`                                                            |
| `currentTabLocation`                        | `現在のタブ`                                                                                                 | `Onglet actuel`                                                                                                                         | `Pestaña actual`                                                                                                               | `Aktueller Tab`                                                                                                                                         | `当前标签页`                                                                         | `目前分頁`                                                                       | `मौजूदा टैब`                                                                                                          |
| `currentWindowLocation`                     | `現在のウィンドウ`                                                                                           | `Fenêtre actuelle`                                                                                                                      | `Ventana actual`                                                                                                               | `Aktuelles Fenster`                                                                                                                                     | `当前窗口`                                                                           | `目前視窗`                                                                       | `मौजूदा विंडो`                                                                                                        |
| `otherWindowLocation`                       | `別のウィンドウ`                                                                                             | `Autre fenêtre`                                                                                                                         | `Otra ventana`                                                                                                                 | `Anderes Fenster`                                                                                                                                       | `其他窗口`                                                                           | `其他視窗`                                                                       | `दूसरी विंडो`                                                                                                         |
| `reassignQuickSyncShortcut`                 | `ショートカットを再設定`                                                                                     | `Réattribuer le raccourci`                                                                                                              | `Reasignar atajo`                                                                                                              | `Tastenkürzel neu zuweisen`                                                                                                                             | `重新设置快捷键`                                                                     | `重新設定快速鍵`                                                                 | `शॉर्टकट फिर से सेट करें`                                                                                             |
| `quickSyncShortcutUnassigned`               | `Quick Syncのショートカットが設定されていません。`                                                           | `Aucun raccourci Quick Sync n’est attribué.`                                                                                            | `No hay ningún atajo de Quick Sync asignado.`                                                                                  | `Für Quick Sync ist kein Tastenkürzel zugewiesen.`                                                                                                      | `尚未设置 Quick Sync 快捷键。`                                                       | `尚未設定 Quick Sync 快速鍵。`                                                   | `Quick Sync का कोई शॉर्टकट सेट नहीं है।`                                                                              |
| `quickSyncShortcutUnavailable`              | `Quick Syncのショートカットを読み込めませんでした。`                                                         | `Impossible de charger le raccourci Quick Sync.`                                                                                        | `No se pudo cargar el atajo de Quick Sync.`                                                                                    | `Das Quick-Sync-Tastenkürzel konnte nicht geladen werden.`                                                                                              | `无法加载 Quick Sync 快捷键。`                                                       | `無法載入 Quick Sync 快速鍵。`                                                   | `Quick Sync शॉर्टकट लोड नहीं हो सका।`                                                                                 |
| `activeSyncTabUnavailable`                  | `タブ情報を読み込めませんでした`                                                                             | `Impossible de charger les informations de l’onglet`                                                                                    | `No se pudo cargar la información de la pestaña`                                                                               | `Tab-Informationen konnten nicht geladen werden`                                                                                                        | `无法加载标签页信息`                                                                 | `無法載入分頁資訊`                                                               | `टैब की जानकारी लोड नहीं हो सकी`                                                                                      |
| `quickSyncShortcutSettingsFallbackChromium` | `アドレスバーに$SETTINGSURL$と入力して、ショートカットを再設定してください。`                                | `Saisissez $SETTINGSURL$ dans la barre d’adresse pour réattribuer le raccourci.`                                                        | `Escribe $SETTINGSURL$ en la barra de direcciones para reasignar el atajo.`                                                    | `Gib $SETTINGSURL$ in die Adressleiste ein, um das Tastenkürzel neu zuzuweisen.`                                                                        | `请在地址栏输入 $SETTINGSURL$ 以重新设置快捷键。`                                    | `請在網址列輸入 $SETTINGSURL$ 以重新設定快速鍵。`                                | `शॉर्टकट फिर से सेट करने के लिए एड्रेस बार में $SETTINGSURL$ लिखें।`                                                  |
| `quickSyncShortcutSettingsFallbackFirefox`  | `アドオンマネージャーで歯車メニューを開き、「拡張機能のショートカットを管理」を選択してください。`           | `Dans le gestionnaire de modules complémentaires, ouvrez le menu en forme d’engrenage et choisissez Gérer les raccourcis d’extensions.` | `En el Administrador de complementos, abre el menú del engranaje y elige Gestionar atajos de extensiones.`                     | `Öffne im Add-ons-Manager das Zahnradmenü und wähle „Tastenkombinationen von Erweiterungen verwalten“.`                                                 | `请在附加组件管理器中打开齿轮菜单，然后选择“管理扩展快捷键”。`                       | `請在附加元件管理員中開啟齒輪選單，然後選擇「管理擴充套件快速鍵」。`             | `ऐड-ऑन मैनेजर में गियर मेन्यू खोलें और एक्सटेंशन शॉर्टकट प्रबंधित करें चुनें।`                                        |
| `manualSyncStateUnavailable`                | `同期状態を確認できません。`                                                                                 | `Impossible de vérifier l’état de la synchronisation.`                                                                                  | `No se pudo comprobar el estado de la sincronización.`                                                                         | `Der Synchronisierungsstatus konnte nicht geprüft werden.`                                                                                              | `无法确认同步状态。`                                                                 | `無法確認同步狀態。`                                                             | `सिंक की स्थिति सत्यापित नहीं हो सकी।`                                                                                |
| `retryStatusCheck`                          | `もう一度確認`                                                                                               | `Vérifier à nouveau`                                                                                                                    | `Volver a comprobar`                                                                                                           | `Erneut prüfen`                                                                                                                                         | `重新检查`                                                                           | `重新檢查`                                                                       | `फिर जाँचें`                                                                                                          |
| `syncCleanupIncomplete`                     | `一部のタブで同期コントロールを消去できませんでした。表示を消すには、そのタブを再読み込みしてください。`     | `Impossible de nettoyer les contrôles de synchronisation dans certains onglets. Rechargez-les pour les retirer.`                        | `No se pudieron limpiar los controles de sincronización en algunas pestañas. Recárgalas para quitarlos.`                       | `Die Synchronisierungssteuerung konnte in einigen Tabs nicht entfernt werden. Lade diese Tabs neu.`                                                     | `无法清理部分标签页中的同步控件。请重新加载这些标签页以将其移除。`                   | `無法清理部分分頁中的同步控制項。請重新載入這些分頁以將其移除。`                 | `कुछ टैब में सिंक नियंत्रण साफ़ नहीं हो सके। उन्हें हटाने के लिए उन टैब को फिर लोड करें।`                             |
| `quickSyncShortcutHeading`                  | `Quick Syncショートカット`                                                                                   | `Raccourci Quick Sync`                                                                                                                  | `Atajo de Quick Sync`                                                                                                          | `Quick-Sync-Tastenkürzel`                                                                                                                               | `Quick Sync 快捷键`                                                                  | `Quick Sync 快速鍵`                                                              | `Quick Sync शॉर्टकट`                                                                                                  |
| `quickSyncShortcutAssignedSummary`          | `Quick Sync: $SHORTCUTLABEL$`                                                                                | `Quick Sync : $SHORTCUTLABEL$`                                                                                                          | `Quick Sync: $SHORTCUTLABEL$`                                                                                                  | `Quick Sync: $SHORTCUTLABEL$`                                                                                                                           | `Quick Sync：$SHORTCUTLABEL$`                                                        | `Quick Sync：$SHORTCUTLABEL$`                                                    | `Quick Sync: $SHORTCUTLABEL$`                                                                                         |
| `autoSyncRecoveryDegraded`                  | `自動同期の状態を完全に復元できませんでした。手動同期は変更されていません。`                                 | `Impossible de restaurer complètement la synchronisation automatique. La synchronisation manuelle n’a pas été modifiée.`                | `No se pudo restaurar por completo la sincronización automática. La sincronización manual no cambió.`                          | `Der Zustand der automatischen Synchronisierung konnte nicht vollständig wiederhergestellt werden. Die manuelle Synchronisierung wurde nicht geändert.` | `无法完全恢复自动同步状态。手动同步未发生更改。`                                     | `無法完整還原自動同步狀態。手動同步未變更。`                                     | `ऑटोमैटिक सिंक की स्थिति पूरी तरह बहाल नहीं हो सकी। मैन्युअल सिंक नहीं बदला गया।`                                     |
| `autoSyncReplacementFailed`                 | `提案された同期を開始できませんでした。以前の同期は停止したままです。`                                       | `Impossible de démarrer la synchronisation suggérée. La synchronisation précédente reste arrêtée.`                                      | `No se pudo iniciar la sincronización sugerida. La sincronización anterior sigue detenida.`                                    | `Die vorgeschlagene Synchronisierung konnte nicht gestartet werden. Die vorherige Synchronisierung bleibt beendet.`                                     | `无法启动建议的同步。之前的同步仍处于停止状态。`                                     | `無法啟動建議的同步。先前的同步仍處於停止狀態。`                                 | `सुझाया गया सिंक शुरू नहीं हो सका। पिछला सिंक रुका हुआ है।`                                                           |

- [ ] **Step 6: Run locale validation and focused tests**

```bash
pnpm test -- --run scripts/i18n-validation.test.ts
pnpm i18n:validate
```

Expected: PASS with all nine locales and both trees in parity.

- [ ] **Step 7: Commit the locale contract atomically**

```bash
git add extension/_locales src/shared/i18n/_locales scripts/i18n-validation.ts scripts/i18n-validation.test.ts scripts/validate-i18n.ts
git commit -m "feat: localize quick sync feedback"
```

Do not include the legacy `extension/_locales/zh/messages.json` unless it was intentionally translated and validated as a separate follow-up.

## Task 5: Add the Browser Command to the Dynamic Manifest

**Files:**

- Modify: `src/manifest.ts`
- Modify: `src/manifest.test.ts`

- [ ] **Step 1: Add failing manifest tests**

```typescript
it('defines exactly one Quick Sync command', async () => {
  const commands = (await getManifest()).commands;

  expect(commands).toEqual({
    'quick-sync-start-or-add': {
      suggested_key: {
        default: 'Ctrl+Shift+Period',
        mac: 'Command+Shift+Period',
      },
      description: '__MSG_quickSyncCommandDescription__',
    },
  });
});

it('does not add a commands permission', async () => {
  const permissions = (await getManifest()).permissions;

  expect(permissions).not.toContain('commands');
});
```

The command property is placed in the shared manifest object before the Firefox-only branch, so the unit test covers its single source and the two production builds below cover both generated targets.

- [ ] **Step 2: Run the test and confirm it fails**

```bash
pnpm test -- --run src/manifest.test.ts
```

Expected: FAIL because the command is absent.

- [ ] **Step 3: Add exactly one command**

Add this manifest property in the shared manifest object:

```typescript
commands: {
  'quick-sync-start-or-add': {
    suggested_key: {
      default: 'Ctrl+Shift+Period',
      mac: 'Command+Shift+Period',
    },
    description: '__MSG_quickSyncCommandDescription__',
  },
},
```

Do not add a second command, `_execute_action`, or a `commands` permission.

- [ ] **Step 4: Verify both generated manifests**

```bash
pnpm test -- --run src/manifest.test.ts
pnpm build
node -e "const fs=require('node:fs'); const m=JSON.parse(fs.readFileSync('extension/manifest.json','utf8')); console.log(JSON.stringify(m.commands,null,2))"
cp extension/manifest.json /tmp/quick-sync-chromium-manifest.json
pnpm build-firefox
node -e "const fs=require('node:fs'); const m=JSON.parse(fs.readFileSync('extension/manifest.json','utf8')); console.log(JSON.stringify(m.commands,null,2))"
node -e "const fs=require('node:fs'); const c=JSON.parse(fs.readFileSync('/tmp/quick-sync-chromium-manifest.json','utf8')); const f=JSON.parse(fs.readFileSync('extension/manifest.json','utf8')); if(JSON.stringify(c.commands)!==JSON.stringify(f.commands)) process.exit(1)"
```

If the build output directory differs, inspect the paths printed by the build rather than editing generated source.

Expected: both production manifests contain the same one command and the build resolves the localized description key.

- [ ] **Step 5: Commit**

```bash
git add src/manifest.ts src/manifest.test.ts
git commit -m "feat: register the quick sync browser command"
```

## Task 6: Runtime-Validate and Persist Authoritative Manual State

**Files:**

- Create: `src/background/lib/sync-state-parser.ts`
- Create: `src/background/lib/sync-state-parser.test.ts`
- Modify: `src/shared/types/sync-state.ts`
- Modify: `src/background/lib/sync-state.ts`
- Modify: `src/background/lib/sync-state.test.ts`
- Modify: `src/background/lib/index.ts`

- [ ] **Step 1: Add failing parser tests**

```typescript
import { describe, expect, it } from 'vitest';

import { parseStoredSyncState } from './sync-state-parser';

describe('parseStoredSyncState', () => {
  it('creates a safe inactive default for a missing value', () => {
    expect(parseStoredSyncState(undefined)).toEqual({
      status: 'valid',
      migrated: false,
      state: {
        isActive: false,
        linkedTabs: [],
        connectionStatuses: {},
        lastActiveSyncedTabId: null,
        revision: 0,
        sessionEpoch: 0,
      },
    });
  });

  it('migrates a legacy active state without mode, revision, or epoch', () => {
    expect(
      parseStoredSyncState({
        isActive: true,
        linkedTabs: [10, 20],
        connectionStatuses: { 10: 'connected', 20: 'connected' },
        lastActiveSyncedTabId: 10,
      }),
    ).toEqual({
      status: 'valid',
      migrated: true,
      state: {
        isActive: true,
        linkedTabs: [10, 20],
        connectionStatuses: { 10: 'connected', 20: 'connected' },
        mode: 'ratio',
        lastActiveSyncedTabId: 10,
        revision: 0,
        sessionEpoch: 0,
      },
    });
  });

  it('rejects an explicitly unknown mode', () => {
    expect(
      parseStoredSyncState({
        isActive: true,
        linkedTabs: [10, 20],
        connectionStatuses: { 10: 'connected', 20: 'connected' },
        mode: 'semantic',
        lastActiveSyncedTabId: 10,
        revision: 2,
        sessionEpoch: 1,
      }),
    ).toEqual({ status: 'invalid', reason: 'invalid-mode' });
  });

  it.each([
    { linkedTabs: [10, 10], reason: 'invalid-linked-tabs' },
    { linkedTabs: [0, 10], reason: 'invalid-linked-tabs' },
    { linkedTabs: [10], reason: 'invalid-topology' },
  ])('rejects invalid active topology %#', ({ linkedTabs, reason }) => {
    const result = parseStoredSyncState({
      isActive: true,
      linkedTabs,
      connectionStatuses: {},
      mode: 'ratio',
      lastActiveSyncedTabId: 999,
      revision: 2,
      sessionEpoch: 1,
    });

    expect(result).toEqual({ status: 'invalid', reason });
  });

  it.each([
    { revision: -1, sessionEpoch: 0, reason: 'invalid-revision' },
    { revision: 0, sessionEpoch: 1.5, reason: 'invalid-session-epoch' },
  ])('rejects unsafe counters', ({ revision, sessionEpoch, reason }) => {
    const result = parseStoredSyncState({
      isActive: false,
      linkedTabs: [],
      connectionStatuses: {},
      lastActiveSyncedTabId: null,
      revision,
      sessionEpoch,
    });

    expect(result).toEqual({ status: 'invalid', reason });
  });
});
```

Add state-store tests that make `browser.storage.local.get` and `.set` reject and assert explicit `storage-error` results. Add a test proving that a failed write does not mutate the committed in-memory snapshot.

- [ ] **Step 2: Run the focused tests and confirm they fail**

```bash
pnpm test -- --run src/background/lib/sync-state-parser.test.ts src/background/lib/sync-state.test.ts
```

Expected: FAIL because storage failures are swallowed and stored values are asserted.

- [ ] **Step 3: Extend and validate `SyncState`**

```typescript
export interface SyncState {
  isActive: boolean;
  linkedTabs: Array<number>;
  connectionStatuses: Record<number, ConnectionStatus>;
  mode?: SyncMode;
  lastActiveSyncedTabId: number | null;
  revision: number;
  sessionEpoch: number;
}
```

Add parser results:

```typescript
export type SyncStateValidationReason =
  | 'not-an-object'
  | 'invalid-active-flag'
  | 'invalid-linked-tabs'
  | 'invalid-connection-statuses'
  | 'invalid-mode'
  | 'invalid-last-active-tab'
  | 'invalid-topology'
  | 'invalid-revision'
  | 'invalid-session-epoch';

export type ParseSyncStateResult =
  | { status: 'valid'; state: SyncState; migrated: boolean }
  | { status: 'invalid'; reason: SyncStateValidationReason };
```

Validate every property with `typeof`, `Array.isArray`, `Number.isSafeInteger`, union-value guards, and own-property checks. Linked tab IDs must be unique positive safe integers; reject duplicates rather than silently deduplicating. Require at least two linked tabs when active and zero when inactive. Active mode must be known, except that a missing legacy mode migrates to `ratio`; reject an explicit unknown mode.

Normalize only the approved advisory fields:

- set `lastActiveSyncedTabId` to `null` when inactive or when the stored ID is not linked;
- drop connection-status entries for unlinked tabs;
- add `error` for a linked tab with no stored status;
- remove inactive `mode` and leave inactive topology empty.

Do not repair an invalid topology, explicit invalid mode, invalid status value, or invalid counter.

- [ ] **Step 4: Replace mutable-write persistence with explicit prepare/commit APIs**

Expose:

```typescript
export type RestoreSyncStateResult =
  | { status: 'ready' }
  | { status: 'storage-error' }
  | { status: 'invalid-state'; reason: SyncStateValidationReason };

export type PersistSyncStateResult = { status: 'persisted' } | { status: 'storage-error' };

export function getSyncStateSnapshot(): SyncState;
export function commitSyncState(nextState: SyncState): void;
export async function persistSyncState(nextState: SyncState): Promise<PersistSyncStateResult>;
export async function restoreSyncState(): Promise<RestoreSyncStateResult>;
```

`getSyncStateSnapshot()` returns fresh arrays and records. `persistSyncState(nextState)` writes the supplied candidate without mutating committed memory. The orchestrator calls `commitSyncState(nextState)` only after persistence succeeds. `restoreSyncState()` parses before commit and never silently substitutes inactive state for storage or validation failure.

Remove cross-window reconnect work from `restoreSyncState()`; initialization owns reconciliation in Task 7.

- [ ] **Step 5: Verify state tests and privacy**

```bash
pnpm test -- --run src/background/lib/sync-state-parser.test.ts src/background/lib/sync-state.test.ts
pnpm privacy:logging
pnpm typecheck
```

Expected: PASS. Logs include `linkedTabCount`, `revision`, `sessionEpoch`, and reason enums only.

- [ ] **Step 6: Commit**

```bash
git add src/shared/types/sync-state.ts src/background/lib/sync-state-parser.ts src/background/lib/sync-state-parser.test.ts src/background/lib/sync-state.ts src/background/lib/sync-state.test.ts src/background/lib/index.ts
git commit -m "refactor: validate persisted sync state"
```

## Task 7: Add the Initialization Barrier and Transition Gate

**Files:**

- Create: `src/background/lib/background-initialization.ts`
- Create: `src/background/lib/background-initialization.test.ts`
- Create: `src/background/lib/sync-transition-gate.ts`
- Create: `src/background/lib/sync-transition-gate.test.ts`
- Create: `src/background/main.test.ts`
- Modify: `src/background/lib/auto-sync-lifecycle.ts`
- Modify: `src/background/lib/auto-sync-lifecycle.test.ts`
- Modify: `src/background/main.ts`
- Modify: `src/background/lib/index.ts`

- [ ] **Step 1: Add failing FIFO and readiness tests**

Test the gate with deferred promises:

```typescript
it('serializes transitions and reads revision when each transition starts', async () => {
  const events: Array<string> = [];
  let revision = 4;
  const firstRelease = Promise.withResolvers<void>();
  const gate = createSyncTransitionGate(() => revision);

  const first = gate.run(async (context) => {
    events.push(`first:${context.expectedRevision}`);
    await firstRelease.promise;
    revision = 5;
  });
  const second = gate.run(async (context) => {
    events.push(`second:${context.expectedRevision}`);
  });

  await Promise.resolve();
  expect(events).toEqual(['first:4']);

  firstRelease.resolve();
  await Promise.all([first, second]);

  expect(events).toEqual(['first:4', 'second:5']);
});
```

Inject `getCommittedRevision` into the gate factory in tests so the test does not mutate production state.

Add initialization tests for:

- listener registration occurs synchronously before restore resolves;
- `restoreSyncState()` completes before auto-sync initialization starts;
- manual restore `storage-error` or `invalid-state` prevents tab scanning and returns a degraded auto result;
- a restored active state reconciles linked tabs across all windows inside the transition gate, persists `revision + 1` before committing repaired membership, and restores manual overrides/keep-alive only after that commit;
- restored membership with zero or one surviving tab persists and commits inactive state;
- failed persistence during restore repair leaves manual readiness unavailable and restores neither overrides nor keep-alive;
- an inactive valid state initializes auto-sync normally.
- control-plane handlers await readiness, while `scroll:sync`, `url:sync`, and manual hot-path relays return an immediate typed rejection while readiness is pending/unavailable.

- [ ] **Step 2: Run focused tests and confirm failure**

```bash
pnpm test -- --run src/background/lib/sync-transition-gate.test.ts src/background/lib/background-initialization.test.ts src/background/main.test.ts src/background/lib/auto-sync-lifecycle.test.ts
```

Expected: FAIL because startup has no readiness barrier and the gate is absent.

- [ ] **Step 3: Implement the transition gate**

```typescript
export interface SyncTransitionContext {
  operationGeneration: number;
  expectedRevision: number;
}

export interface SyncTransitionGate {
  run<T>(transition: (context: SyncTransitionContext) => Promise<T>): Promise<T>;
}

export function createSyncTransitionGate(getCommittedRevision: () => number): SyncTransitionGate {
  let tail: Promise<void> = Promise.resolve();
  let operationGeneration = 0;

  return {
    run<T>(transition: (context: SyncTransitionContext) => Promise<T>): Promise<T> {
      const result = tail.then(() =>
        transition({
          operationGeneration: ++operationGeneration,
          expectedRevision: getCommittedRevision(),
        }),
      );
      tail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  };
}
```

Export one background singleton using `getSyncStateSnapshot().revision`. All manual topology mutations must eventually call this singleton; do not export the internal queue.

- [ ] **Step 4: Implement explicit background readiness**

```typescript
export type AutoSyncReadiness =
  | { status: 'ready' }
  | {
      status: 'degraded';
      reason: 'initialization-failed' | 'manual-state-unavailable';
    };

export interface BackgroundReadiness {
  manual: RestoreSyncStateResult;
  auto: AutoSyncReadiness;
}

export type ManualReadinessSnapshot = 'pending' | 'ready' | 'unavailable';

export function initializeBackground(): Promise<BackgroundReadiness>;
export function waitForBackgroundInitialization(): Promise<BackgroundReadiness>;
export function getManualReadinessSnapshot(): ManualReadinessSnapshot;
export function reconcileRestoredManualSession(): Promise<RestoreSyncStateResult>;
```

`initializeBackground()` owns exactly this order:

1. restore and validate manual state;
2. if valid and active, enter `syncTransitionGate.run()` and query each committed linked ID with `browser.tabs.get(tabId)` across windows;
3. when membership changes, create repaired state with `revision + 1`, persist it, then commit memory; when fewer than two tabs survive, persist/commit inactive state;
4. if repair persistence fails, set manual readiness to `unavailable` and stop initialization without restoring overrides or keep-alive;
5. only after the final repaired commit, restore `manualSyncOverriddenTabs` and start keep-alive when at least two tabs remain;
6. initialize auto-sync only when manual readiness is known;
7. return a truth-bearing readiness result.

In `main.ts`, synchronously register the existing runtime, connection, tab, and message listeners first, then call `void initializeBackground()`. Task 13 adds the new command and Port listeners to this same pre-initialization block. Control-plane handlers await `waitForBackgroundInitialization()` before reading or mutating session state and capture event-specific time/tab identity before awaiting.

The `scroll:sync`, `url:sync`, `scroll:manual`, and manual-baseline relay handlers must never await initialization or the transition gate. They synchronously check:

```typescript
if (getManualReadinessSnapshot() !== 'ready') {
  return { success: false, reason: 'session-state-unavailable' };
}
```

They then use only the last committed in-memory state plus sender/membership/epoch authorization.

- [ ] **Step 5: Make auto-sync initialization return an explicit result**

Change `initializeAutoSync()` from `Promise<void>` to a discriminated result. Preserve disabled-as-success and existing scan behavior. Do not catch and discard initialization failure.

- [ ] **Step 6: Run focused and startup regression tests**

```bash
pnpm test -- --run src/background/lib/sync-transition-gate.test.ts src/background/lib/background-initialization.test.ts src/background/main.test.ts src/background/lib/auto-sync-lifecycle.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/background/lib/background-initialization.ts src/background/lib/background-initialization.test.ts src/background/lib/sync-transition-gate.ts src/background/lib/sync-transition-gate.test.ts src/background/lib/auto-sync-lifecycle.ts src/background/lib/auto-sync-lifecycle.test.ts src/background/lib/index.ts src/background/main.ts src/background/main.test.ts
git commit -m "refactor: serialize background sync initialization"
```

## Task 8: Authorize Manual Session Relay With the Committed Epoch

**Files:**

- Create: `src/background/lib/manual-session-authorization.ts`
- Create: `src/background/lib/manual-session-authorization.test.ts`
- Modify: `src/background/handlers/scroll-sync-handlers.ts`
- Modify: `src/background/handlers/scroll-sync-handlers.test.ts`
- Modify: `src/shared/types/messages.ts`
- Modify: `shim.d.ts`
- Modify: `src/contentScripts/lib/scroll-sync-state.ts`
- Modify: `src/contentScripts/lib/scroll-sync-state.test.ts`
- Modify: `src/contentScripts/scroll-sync.ts`
- Modify: `src/contentScripts/keyboard-handler.ts`
- Modify: `src/contentScripts/keyboard-handler.test.ts`
- Modify: `src/__tests__/scenarios.test.ts`

- [ ] **Step 1: Add failing authorization tests**

```typescript
describe('isAuthorizedManualSessionMessage', () => {
  const state = {
    isActive: true,
    linkedTabs: [11, 22],
    connectionStatuses: { 11: 'connected', 22: 'connected' },
    mode: 'ratio',
    lastActiveSyncedTabId: 11,
    revision: 4,
    sessionEpoch: 3,
  };

  it('accepts a committed member with the current epoch', () => {
    expect(
      isAuthorizedManualSessionMessage(state, 11, {
        isAutoSync: false,
        sourceTabId: 11,
        sessionEpoch: 3,
      }),
    ).toBe(true);
  });

  it.each([
    { senderTabId: undefined, sourceTabId: 11, sessionEpoch: 3 },
    { senderTabId: 22, sourceTabId: 11, sessionEpoch: 3 },
    { senderTabId: 33, sourceTabId: 33, sessionEpoch: 3 },
    { senderTabId: 11, sourceTabId: 11, sessionEpoch: 2 },
  ])('rejects unauthorized identity %#', ({ senderTabId, sourceTabId, sessionEpoch }) => {
    expect(
      isAuthorizedManualSessionMessage(state, senderTabId, {
        isAutoSync: false,
        sourceTabId,
        sessionEpoch,
      }),
    ).toBe(false);
  });
});
```

Add relay-handler tests proving that a staged-but-uncommitted Add tab, wrong sender, missing sender, and stale epoch cause no outgoing message and no state mutation.

Add a pending-readiness test that invokes each hot relay and verifies the returned Promise is already resolved from a synchronous rejection path: no readiness Promise, storage method, transition gate, or tab API was called.

- [ ] **Step 2: Run focused tests and confirm failure**

```bash
pnpm test -- --run src/background/lib/manual-session-authorization.test.ts src/background/handlers/scroll-sync-handlers.test.ts
```

Expected: FAIL because relay handlers trust payload identity.

- [ ] **Step 3: Implement the synchronous guard**

```typescript
export function isAuthorizedManualSessionMessage(
  state: SyncState,
  senderTabId: number | undefined,
  identity: ManualMessageIdentity,
): boolean {
  return (
    state.isActive &&
    Number.isSafeInteger(senderTabId) &&
    senderTabId === identity.sourceTabId &&
    state.linkedTabs.includes(identity.sourceTabId) &&
    identity.sessionEpoch === state.sessionEpoch
  );
}
```

Run the synchronous readiness check and this authorization check before any `await`, relay, connection-status change, URL operation, or manual-offset mutation. Auto-sync messages follow their existing group-membership authorization path.

- [ ] **Step 4: Cache and emit the epoch in content scripts**

Add numeric `sessionEpoch` to content-script state. A manual `scroll:start` must carry the committed epoch and cache it alongside tab IDs/mode before synchronization starts. Manual `scroll:sync`, `url:sync`, keyboard manual-adjustment, and manual-baseline messages must carry:

```typescript
{
  isAutoSync: false,
  sourceTabId: currentTabId,
  sessionEpoch: getScrollSyncState().sessionEpoch,
}
```

Auto-sync messages carry:

```typescript
{
  isAutoSync: true,
  sourceTabId: currentTabId,
}
```

Clear the cached epoch on `scroll:stop`. Do not add storage reads, DOM work, or a gate lookup inside `handleScrollCore()`.

- [ ] **Step 5: Add content and scenario regressions**

Cover:

- manual Start caches epoch;
- outgoing scroll and URL payloads use that exact cached epoch;
- Stop clears it;
- a stale content-script instance cannot relay after replacement;
- automatic sync still relays without a manual epoch;
- keyboard manual-scroll messages preserve IME behavior and include identity.

- [ ] **Step 6: Run the focused regressions**

```bash
pnpm test -- --run src/background/lib/manual-session-authorization.test.ts src/background/handlers/scroll-sync-handlers.test.ts src/contentScripts/lib/scroll-sync-state.test.ts src/contentScripts/keyboard-handler.test.ts src/__tests__/scenarios.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/background/lib/manual-session-authorization.ts src/background/lib/manual-session-authorization.test.ts src/background/handlers/scroll-sync-handlers.ts src/background/handlers/scroll-sync-handlers.test.ts src/shared/types/messages.ts shim.d.ts src/contentScripts/lib/scroll-sync-state.ts src/contentScripts/lib/scroll-sync-state.test.ts src/contentScripts/scroll-sync.ts src/contentScripts/keyboard-handler.ts src/contentScripts/keyboard-handler.test.ts src/__tests__/scenarios.test.ts
git commit -m "fix: authorize manual sync messages by session epoch"
```

## Task 9: Build the Transactional Start and Add Orchestrator

**Files:**

- Create: `src/background/lib/manual-override-adapter.ts`
- Create: `src/background/lib/manual-override-adapter.test.ts`
- Create: `src/background/lib/sync-session-orchestrator.ts`
- Create: `src/background/lib/sync-session-orchestrator.test.ts`
- Modify: `src/background/lib/index.ts`
- Modify: `src/background/handlers/scroll-sync-handlers.ts`
- Modify: `src/background/handlers/scroll-sync-handlers.test.ts`

- [ ] **Step 1: Add failing orchestrator tests with injected dependencies**

Define a test factory whose dependencies are fake tabs, messaging, storage, override state, status broadcast, and keep-alive. Cover these exact cases:

```typescript
it('commits Quick Sync Start only after both tabs acknowledge', async () => {
  const harness = createOrchestratorHarness({
    initialState: inactiveState,
    startResponses: {
      11: { success: true, tabId: 11 },
      22: { success: true, tabId: 22 },
    },
  });

  const result = await harness.orchestrator.startManualSession(
    { operationGeneration: 1, expectedRevision: 0 },
    { tabIds: [11, 22], mode: 'ratio', source: 'quick-sync', requireAll: true },
  );

  expect(result).toEqual({
    status: 'committed',
    connectedTabIds: [11, 22],
    revision: 1,
    sessionEpoch: 1,
  });
  expect(harness.persistedStates).toHaveLength(1);
  expect(harness.committedState.linkedTabs).toEqual([11, 22]);
  expect(harness.events).toEqual([
    'override:prepare',
    'start:11',
    'start:22',
    'revalidate',
    'override:commit',
    'state:persist',
    'state:commit',
    'status:broadcast',
    'keep-alive:start',
  ]);
});

it('rolls back Quick Sync Start when either tab returns an invalid acknowledgement', async () => {
  const harness = createOrchestratorHarness({
    initialState: inactiveState,
    startResponses: {
      11: { success: true, tabId: 11 },
      22: { success: true, tabId: 999 },
    },
  });

  const result = await harness.orchestrator.startManualSession(
    { operationGeneration: 1, expectedRevision: 0 },
    { tabIds: [11, 22], mode: 'ratio', source: 'quick-sync', requireAll: true },
  );

  expect(result.status).toBe('rejected');
  expect(harness.committedState).toEqual(inactiveState);
  expect(harness.stopTargets).toEqual([11, 22]);
  expect(harness.overrideRollbacks).toHaveLength(1);
});

it('adds only the new tab and does not reinitialize existing members', async () => {
  const harness = createOrchestratorHarness({ initialState: activeState });

  await harness.orchestrator.addTabToManualSession(
    { operationGeneration: 2, expectedRevision: 7 },
    { tabId: 33, expectedRevision: 7, source: 'quick-sync' },
  );

  expect(harness.startTargets).toEqual([33]);
  expect(harness.committedState.linkedTabs).toEqual([11, 22, 33]);
  expect(harness.committedState.revision).toBe(8);
  expect(harness.committedState.sessionEpoch).toBe(activeState.sessionEpoch);
});

it('commits the popup subset and restores excluded auto membership after cleanup', async () => {
  const harness = createOrchestratorHarness({
    initialState: inactiveState,
    startResponses: {
      11: { success: true, tabId: 11 },
      22: { success: true, tabId: 22 },
      33: { success: false, tabId: 33 },
    },
  });

  const result = await harness.orchestrator.startManualSession(
    { operationGeneration: 1, expectedRevision: 0 },
    { tabIds: [11, 22, 33], mode: 'ratio', source: 'popup', requireAll: false },
  );

  expect(result).toEqual({
    status: 'committed',
    connectedTabIds: [11, 22],
    revision: 1,
    sessionEpoch: 1,
  });
  expect(harness.events).toContain('override:commit:11,22');
  expect(harness.events.slice(-2)).toEqual(['stop:33', 'override:rollback-uncommitted:33']);
});
```

Also test duplicate IDs, fewer than two requested tabs, 1,000ms timeout, content injection failure, failed persistence, failed override commit, stale revision, Add failure preserving linked tabs/revision/epoch/offset state, popup partial success, and status broadcast only after commit.

For persistence failure after override finalization, assert this exact tail:

```typescript
expect(harness.events.slice(-4)).toEqual([
  'state:persist-failed',
  'stop:11',
  'stop:22',
  'override:rollback',
]);
expect(harness.committedState).toEqual(inactiveState);
```

When rollback itself degrades, expect a rejected result with `warning: 'auto-sync-degraded'` and a user-visible recent outcome; never report a committed manual topology.

- [ ] **Step 2: Run focused tests and confirm failure**

```bash
pnpm test -- --run src/background/lib/manual-override-adapter.test.ts src/background/lib/sync-session-orchestrator.test.ts
```

Expected: FAIL because the orchestrator does not exist.

- [ ] **Step 3: Implement the auto-sync override transaction adapter**

```typescript
export interface ManualOverrideSnapshot {
  operationGeneration: number;
  joiningTabIds: Array<number>;
  previousOverrideTabIds: Array<number>;
  affectedGroupIds: Array<string>;
}

export interface ManualOverrideAdapter {
  prepare(
    operationGeneration: number,
    joiningTabIds: ReadonlyArray<number>,
  ): Promise<ManualOverrideSnapshot>;
  commit(
    snapshot: ManualOverrideSnapshot,
    committedJoiningTabIds: ReadonlyArray<number>,
  ): Promise<{ status: 'committed' } | { status: 'stale' }>;
  rollbackUncommitted(
    snapshot: ManualOverrideSnapshot,
    committedJoiningTabIds: ReadonlyArray<number>,
  ): Promise<{ status: 'rolled-back' } | { status: 'degraded' }>;
  rollback(
    snapshot: ManualOverrideSnapshot,
  ): Promise<{ status: 'rolled-back' } | { status: 'degraded' }>;
}
```

Acquire locks only in the order `syncTransitionGate` then `withAutoSyncLock()`. `prepare` captures rollback data for all requested tabs without publishing topology. `commit` verifies the operation generation and finalizes only `committedJoiningTabIds`. `rollbackUncommitted` restores prior auto runtime for the excluded requested tabs after their staged manual runtime has been cleaned. `rollback` restores the complete captured override/group state and returns a degraded result if cleanup is incomplete.

- [ ] **Step 4: Implement Start and Add prepare-commit flows**

```typescript
export interface StartManualSessionInput {
  tabIds: Array<number>;
  mode: SyncMode;
  source: 'popup' | 'quick-sync';
  requireAll: boolean;
}

export interface AddManualSessionTabInput {
  tabId: number;
  expectedRevision: number;
  source: 'quick-sync' | 'suggestion';
}

export interface SyncSessionOrchestratorDependencies {
  getState: () => SyncState;
  persistState: (nextState: SyncState) => Promise<PersistSyncStateResult>;
  commitState: (nextState: SyncState) => void;
  ensureContentScript: (tabId: number) => Promise<boolean>;
  sendStart: (tabId: number, message: StartSyncMessage) => Promise<StartSyncContentResponse>;
  sendStop: (tabId: number, message: StopSyncMessage) => Promise<StopSyncContentResponse>;
  overrideAdapter: ManualOverrideAdapter;
  startKeepAlive: () => void;
  stopKeepAlive: () => void;
  broadcastStatus: () => Promise<void>;
}

export interface SyncSessionOrchestrator {
  startManualSession(
    context: SyncTransitionContext,
    input: StartManualSessionInput,
  ): Promise<ManualStartResult>;
  addTabToManualSession(
    context: SyncTransitionContext,
    input: AddManualSessionTabInput,
  ): Promise<ManualAddResult>;
}

export function createSyncSessionOrchestrator(
  dependencies: SyncSessionOrchestratorDependencies,
): SyncSessionOrchestrator;
```

Start order:

1. validate and deduplicate requested IDs;
2. prepare manual overrides;
3. ensure/inject content scripts;
4. send `scroll:start` with the proposed new epoch to every requested tab and enforce the acknowledgement contract;
5. partition requested IDs into `connectedTabIds` and `rejectedTabIds`; when `requireAll` is `true`, reject unless all requested tabs succeed, and when `false`, require at least two connected tabs;
6. revalidate every connected tab, captured revision, and operation generation;
7. call `ManualOverrideAdapter.commit(snapshot, connectedTabIds)` before any manual-state persistence;
8. persist the complete candidate state, then commit the matching in-memory state;
9. broadcast status and start keep-alive;
10. after a popup partial-success commit, send idempotent Stop to every `rejectedTabId`, then call `rollbackUncommitted(snapshot, connectedTabIds)` so excluded tabs return to their prior auto-sync memberships;
11. on any full transition failure before persistence, clean every requested staged runtime and roll back the complete override snapshot;
12. when persistence fails after override finalization, clean staged runtime and roll back the captured override snapshot while committed manual memory remains unchanged.

Add order:

1. reject stale revision, inactive state, or existing membership;
2. prepare override for only the new tab;
3. ensure/inject and Start only that tab with the current epoch and proposed full tab list;
4. revalidate the tab, expected revision, and operation generation;
5. finalize the override, persist the appended topology with `revision + 1`, then commit memory;
6. broadcast without sending `scroll:start` to existing members;
7. on failure, Stop only the staged tab and roll back the captured override state;
8. expose `auto-sync-degraded` when rollback cannot fully restore the previous auto membership.

- [ ] **Step 5: Adapt existing popup Start**

The existing `scroll:start` background handler calls the transition gate and:

```typescript
startManualSession(context, {
  tabIds: message.tabIds,
  mode: message.mode,
  source: 'popup',
  requireAll: false,
});
```

Preserve `StartSyncBackgroundResponse`, per-tab connection results, manual adjustment hints, and file-access guidance. Do not turn popup Start into Quick Sync require-all behavior.

Extend the background response with optional `warning: 'auto-sync-degraded'`. The inactive popup Start path renders `autoSyncRecoveryDegraded` when present. The Quick Sync coordinator maps the same warning to a HUD/recent outcome. Neither surface may claim manual success when the manual transition itself was rejected.

- [ ] **Step 6: Run focused and existing handler tests**

```bash
pnpm test -- --run src/background/lib/manual-override-adapter.test.ts src/background/lib/sync-session-orchestrator.test.ts src/background/handlers/scroll-sync-handlers.test.ts
pnpm privacy:logging
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/background/lib/manual-override-adapter.ts src/background/lib/manual-override-adapter.test.ts src/background/lib/sync-session-orchestrator.ts src/background/lib/sync-session-orchestrator.test.ts src/background/lib/index.ts src/background/handlers/scroll-sync-handlers.ts src/background/handlers/scroll-sync-handlers.test.ts
git commit -m "refactor: centralize manual sync start and add"
```

## Task 10: Move Stop, Reconnect, and Tab Lifecycle Into the Transition Gate

**Files:**

- Modify: `src/background/lib/sync-session-orchestrator.ts`
- Modify: `src/background/lib/sync-session-orchestrator.test.ts`
- Create: `src/background/lib/sync-cleanup-retry.ts`
- Create: `src/background/lib/sync-cleanup-retry.test.ts`
- Modify: `src/background/handlers/scroll-sync-handlers.ts`
- Modify: `src/background/handlers/scroll-sync-handlers.test.ts`
- Modify: `src/background/handlers/connection-handlers.ts`
- Modify: `src/background/handlers/connection-handlers.test.ts`
- Modify: `src/background/handlers/tab-event-handlers.ts`
- Modify: `src/background/handlers/tab-event-handlers.test.ts`
- Modify: `src/background/lib/content-script-manager.ts`
- Modify: `src/background/lib/content-script-manager.test.ts`
- Modify: `src/background/lib/keep-alive.ts`
- Modify: `src/background/lib/keep-alive.test.ts`

- [ ] **Step 1: Add failing durable-first Stop tests**

Cover:

- Stop persists and commits inactive state before sending content cleanup;
- cleanup timeout/failure returns `{ status: 'committed', warning: 'cleanup-incomplete' }`;
- Stop accepts only `success: true` with the target tab ID and treats a mismatched acknowledgement as incomplete cleanup;
- incomplete cleanup schedules idempotent retries at 1, 3, and 10 seconds;
- retry callbacks enter the transition gate and cancel when the tab has joined a newer manual epoch;
- successful retry removes the pending record and exhausted retries retain the warning without changing topology;
- stale payload tab IDs cannot leave committed linked tabs running;
- Stop clears manual overrides and keep-alive from the committed session;
- a failed durable write leaves the session active and sends no `scroll:stop`;
- closing a linked tab removes it through the gate;
- falling below two tabs performs durable-first automatic Stop;
- two reconnect completions in reverse order cannot overwrite the newer `{revision, attemptGeneration}` result.

- [ ] **Step 2: Run focused tests and confirm failure**

```bash
pnpm test -- --run src/background/lib/sync-session-orchestrator.test.ts src/background/lib/sync-cleanup-retry.test.ts src/background/handlers/scroll-sync-handlers.test.ts src/background/handlers/connection-handlers.test.ts src/background/handlers/tab-event-handlers.test.ts src/background/lib/content-script-manager.test.ts src/background/lib/keep-alive.test.ts
```

Expected: FAIL because each path mutates state independently.

- [ ] **Step 3: Implement durable-first Stop**

```typescript
export async function stopManualSession(
  context: SyncTransitionContext,
  source: 'popup' | 'suggestion-replace' | 'tab-close',
): Promise<ManualStopResult>;
```

For popup requests, reject unless `message.expectedRevision` is a safe integer equal to the gate context’s committed revision. Internal lifecycle calls pass their already captured gate context directly.

The implementation snapshots every committed tab ID, persists inactive state with `revision + 1` and the unchanged epoch, commits it, stops keep-alive, clears overrides, broadcasts inactive status, and then sends best-effort `scroll:stop` to the snapshot. Cleanup failure cannot resurrect the session.

Create the retry scheduler with this exact boundary:

```typescript
export const MANUAL_CLEANUP_RETRY_DELAYS_MS: ReadonlyArray<number> = [1_000, 3_000, 10_000];

export interface PendingManualCleanup {
  tabId: number;
  stoppedRevision: number;
  stoppedSessionEpoch: number;
  attemptIndex: number;
}

export interface ManualCleanupRetryScheduler {
  schedule(input: PendingManualCleanup): void;
  cancelForTab(tabId: number): void;
  cancelAll(): void;
}

export function createManualCleanupRetryScheduler(dependencies: {
  transitionGate: SyncTransitionGate;
  getState: () => SyncState;
  sendStop: (tabId: number) => Promise<StopSyncContentResponse>;
  setTimer: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimer: (timer: ReturnType<typeof setTimeout>) => void;
}): ManualCleanupRetryScheduler;
```

Each timer callback calls `transitionGate.run()`, then:

1. cancels if a current active session contains the tab or has a different `sessionEpoch`;
2. sends idempotent Stop while the gate prevents a new Start from overtaking it;
3. removes the pending entry on a valid acknowledgement;
4. schedules the next delay on timeout or invalid acknowledgement;
5. after the third retry, leaves no timer and preserves only the already-reported cleanup warning.

The scheduler never writes manual topology and never treats a late cleanup result as session state.

- [ ] **Step 4: Implement revision-aware reconnect**

```typescript
export interface ReconnectAttemptToken {
  tabId: number;
  revision: number;
  sessionEpoch: number;
  attemptGeneration: number;
  startMessage: StartSyncMessage;
}

export type BeginReconnectResult =
  | { status: 'ready'; token: ReconnectAttemptToken }
  | ManualTransitionRejection;

export function beginManualReconnect(
  context: SyncTransitionContext,
  tabId: number,
): BeginReconnectResult;

export async function finishManualReconnect(
  context: SyncTransitionContext,
  token: ReconnectAttemptToken,
  acknowledgement: StartSyncContentResponse | null,
): Promise<ManualReconnectResult>;
```

Reconnect is deliberately two-phase so same-revision attempts can overlap:

```typescript
const begin = await syncTransitionGate.run((context) => beginManualReconnect(context, tabId));
if (begin.status !== 'ready') {
  return begin;
}

const acknowledgement = await sendReconnectHandshake(begin.token);

return syncTransitionGate.run((context) =>
  finishManualReconnect(context, begin.token, acknowledgement),
);
```

`beginManualReconnect()` increments and records the latest per-tab attempt generation while the gate is held, captures the current revision/epoch/message, and releases the gate before network I/O. `finishManualReconnect()` applies the result only when committed revision, session epoch, membership, and latest attempt generation still match. It validates the returned tab ID and persists connection-status changes before committing memory. A stale completion returns `stale-revision` and performs no write.

Register `sync:reconnect-session` for the popup. It requires `expectedRevision`, begins tokens for the currently disconnected/error tab IDs, runs their 3,000ms handshakes outside the gate, then finishes each token through separate gate acquisitions. Existing content-origin `scroll:reconnect` keeps its per-tab role but uses the same two-phase operation and manual identity authorization.

The reverse-completion test starts two tokens for the same tab at one revision, resolves the second handshake first, and proves the first completion cannot overwrite the newer result.

- [ ] **Step 5: Replace direct topology mutations**

Route through the gate/orchestrator:

- popup Stop;
- linked-tab close;
- navigation/update reconnect;
- activation reconnect;
- keep-alive reinjection;
- content-script manager reconnect;
- eviction of a truly closed tab.

Use `browser.tabs.get(tabId)` rather than `currentWindow: true`. Candidate lifecycle cleanup is added in Task 13, not mixed into manual Stop.

- [ ] **Step 6: Run focused and background regression tests**

```bash
pnpm test -- --run src/background/lib/sync-session-orchestrator.test.ts src/background/lib/sync-cleanup-retry.test.ts src/background/handlers/scroll-sync-handlers.test.ts src/background/handlers/connection-handlers.test.ts src/background/handlers/tab-event-handlers.test.ts src/background/lib/content-script-manager.test.ts src/background/lib/keep-alive.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/background/lib/sync-session-orchestrator.ts src/background/lib/sync-session-orchestrator.test.ts src/background/lib/sync-cleanup-retry.ts src/background/lib/sync-cleanup-retry.test.ts src/background/handlers/scroll-sync-handlers.ts src/background/handlers/scroll-sync-handlers.test.ts src/background/handlers/connection-handlers.ts src/background/handlers/connection-handlers.test.ts src/background/handlers/tab-event-handlers.ts src/background/handlers/tab-event-handlers.test.ts src/background/lib/content-script-manager.ts src/background/lib/content-script-manager.test.ts src/background/lib/keep-alive.ts src/background/lib/keep-alive.test.ts
git commit -m "refactor: gate manual sync lifecycle transitions"
```

## Task 11: Adapt Accepted Auto-Sync Suggestions to the Shared Orchestrator

**Files:**

- Modify: `src/background/lib/auto-sync-suggestions.ts`
- Modify: `src/background/lib/auto-sync-suggestions.test.ts`
- Create: `src/background/lib/legacy-auto-sync-adapter.ts`
- Create: `src/background/lib/legacy-auto-sync-adapter.test.ts`
- Modify: `src/background/handlers/auto-sync-handlers.ts`
- Modify: `src/background/handlers/auto-sync-handlers.test.ts`
- Modify: `src/shared/types/messages.ts`
- Modify: `shim.d.ts`
- Modify: `src/contentScripts/components/sync-suggestion-toast.test.tsx`

- [ ] **Step 1: Add failing revision and opt-in tests**

Add tests proving:

1. initial suggestions are not created or shown unless stored `autoSyncEnabled` is exactly `true`;
2. add-tab suggestions are also suppressed when the flag is false or malformed;
3. every shown suggestion captures the current manual `revision`;
4. accepted response with stale `expectedRevision` is rejected without changing either manual or auto state;
5. accepted Add initializes only the new tab;
6. accepted replacement performs durable manual Stop before the legacy auto-sync group starts;
7. successful accepted auto start increments revision without creating a manual epoch;
8. if accepted auto start fails, the truthful manual result is inactive rather than silently restoring an unverified old session;
9. decline, snooze, dismissal, grouping, translated-page matching, and toast copy remain unchanged.
10. initial and add-tab toasts echo the exact incoming `expectedRevision` in every accept, decline, snooze, and permanent response.

Use a concrete accepted payload:

```typescript
const acceptance = {
  normalizedUrl: 'https://fixture.invalid/group',
  accepted: true,
  expectedRevision: 6,
};

const addAcceptance = {
  tabId: 33,
  accepted: true,
  expectedRevision: 6,
  normalizedUrl: 'https://fixture.invalid/group',
};
```

- [ ] **Step 2: Run focused tests and confirm failure**

```bash
pnpm test -- --run src/background/lib/auto-sync-suggestions.test.ts src/background/handlers/auto-sync-handlers.test.ts src/contentScripts/components/sync-suggestion-toast.test.tsx
```

Expected: FAIL because accepted responses do not carry revision and add reinitializes existing tabs.

- [ ] **Step 3: Capture and validate `expectedRevision`**

Add `expectedRevision` to suggestion state and every acceptance message. At acceptance time, re-read the committed revision inside `syncTransitionGate.run()`. Return `stale-revision` when it differs; do not attempt a best-effort merge.

- [ ] **Step 4: Recheck explicit opt-in at both production points**

Before initial suggestion display and before add-tab suggestion display:

```typescript
if (autoSyncState.enabled !== true) {
  return;
}
```

The storage loader already treats only explicit booleans as valid; preserve that contract. Passive discovery may update internal candidate information but must not display the Quick Sync HUD or auto suggestion toast while disabled.

- [ ] **Step 5: Route only accepted transitions through the orchestrator**

- Accepted replacement:
  1. call `replaceManualWithAcceptedAutoSync(context, { normalizedUrl, tabIds, expectedRevision })`;
  2. if a manual session is active, durably Stop and clean it first;
  3. let `LegacyAutoSyncAdapter.startAcceptedGroup()` start the explicitly accepted auto group;
  4. on success, persist/commit the next inactive manual revision while preserving `sessionEpoch`;
  5. on failure, keep the post-Stop manual state inactive and report replacement failure.
- Accepted Add:
  1. `addTabToManualSession(context, { tabId, expectedRevision, source: 'suggestion' })`;
  2. never resend `scroll:start` to existing tabs.
- Decline/snooze/dismiss paths remain in the existing suggestion modules.

Do not route passive discovery into the manual transition gate.

Use these exact adapter boundaries:

```typescript
export interface AcceptedAutoSyncInput {
  normalizedUrl: string;
  tabIds: Array<number>;
  expectedRevision: number;
}

export type AcceptedAutoSyncResult =
  | { status: 'committed'; revision: number }
  | {
      status: 'rejected';
      reason: 'stale-revision' | 'auto-start-failed' | 'persistence-failed';
    };

export interface LegacyAutoSyncAdapter {
  startAcceptedGroup(
    input: AcceptedAutoSyncInput,
  ): Promise<{ status: 'started' } | { status: 'failed' }>;
  rollbackAcceptedGroup(input: AcceptedAutoSyncInput): Promise<void>;
}

export async function replaceManualWithAcceptedAutoSync(
  context: SyncTransitionContext,
  input: AcceptedAutoSyncInput,
  dependencies: {
    orchestrator: SyncSessionOrchestrator;
    legacyAutoSyncAdapter: LegacyAutoSyncAdapter;
    getState: () => SyncState;
    persistState: (nextState: SyncState) => Promise<PersistSyncStateResult>;
    commitState: (nextState: SyncState) => void;
  },
): Promise<AcceptedAutoSyncResult>;
```

When `startAcceptedGroup()` succeeds, create an inactive manual-state candidate with `revision + 1` and the unchanged `sessionEpoch`, persist it, then commit memory. If that persistence fails, call `rollbackAcceptedGroup()` and remain at the durable post-Stop revision. Never call manual `startManualSession()` and never increment a manual epoch for this auto transition.

- [ ] **Step 6: Run focused and background tests**

```bash
pnpm test -- --run src/background/lib/auto-sync-suggestions.test.ts src/background/lib/legacy-auto-sync-adapter.test.ts src/background/handlers/auto-sync-handlers.test.ts src/background/lib/sync-session-orchestrator.test.ts src/contentScripts/components/sync-suggestion-toast.test.tsx
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/background/lib/auto-sync-suggestions.ts src/background/lib/auto-sync-suggestions.test.ts src/background/lib/legacy-auto-sync-adapter.ts src/background/lib/legacy-auto-sync-adapter.test.ts src/background/handlers/auto-sync-handlers.ts src/background/handlers/auto-sync-handlers.test.ts src/shared/types/messages.ts shim.d.ts src/contentScripts/components/sync-suggestion-toast.test.tsx
git commit -m "fix: serialize accepted sync suggestions"
```

## Task 12: Provide an Authoritative Cross-Window Session Snapshot

**Files:**

- Create: `src/background/lib/sync-session-snapshot.ts`
- Create: `src/background/lib/sync-session-snapshot.test.ts`
- Modify: `src/background/handlers/connection-handlers.ts`
- Modify: `src/background/handlers/connection-handlers.test.ts`
- Modify: `src/shared/types/messages.ts`
- Modify: `shim.d.ts`
- Modify: `src/contentScripts/hooks/use-panel-state.ts`
- Modify: `src/contentScripts/components/sync-control-panel.test.tsx`
- Modify: `src/background/lib/index.ts`

- [ ] **Step 1: Add failing cross-window and missing-tab tests**

```typescript
it('returns every committed tab across windows in linked order', async () => {
  const snapshot = await buildManualSyncSnapshot(
    {
      isActive: true,
      linkedTabs: [11, 22, 33],
      connectionStatuses: {
        11: 'connected',
        22: 'disconnected',
        33: 'error',
      },
      mode: 'ratio',
      lastActiveSyncedTabId: 11,
      revision: 5,
      sessionEpoch: 2,
    },
    { viewerTabId: 11, viewerWindowId: 1 },
  );

  expect(snapshot.tabs.map((tab) => tab.tabId)).toEqual([11, 22, 33]);
  expect(snapshot.tabs).toEqual([
    expect.objectContaining({ tabId: 11, location: 'current-tab' }),
    expect.objectContaining({ tabId: 22, location: 'current-window' }),
    expect.objectContaining({ tabId: 33, location: 'other-window' }),
  ]);
});

it('preserves a missing linked tab as unavailable without guessing its window', async () => {
  tabsGet.mockRejectedValueOnce(new Error('No tab with id: 33'));

  const snapshot = await buildManualSyncSnapshot(activeState, viewerContext);

  expect(snapshot.linkedTabIds).toContain(33);
  expect(snapshot.tabs).toContainEqual({
    availability: 'unavailable',
    tabId: 33,
    connectionStatus: 'error',
  });
});
```

Add handler tests for loading/active/inactive/error, recent outcome inclusion only for the viewer tab, and no raw URL in the response.

Add malformed viewer tests: popup IDs that are missing, non-positive, or unsafe and content requests without a numeric sender tab return `{ status: 'error', reason: 'invalid-viewer-context' }` without querying or mutating session topology.

- [ ] **Step 2: Run focused tests and confirm failure**

```bash
pnpm test -- --run src/background/lib/sync-session-snapshot.test.ts src/background/handlers/connection-handlers.test.ts src/contentScripts/components/sync-control-panel.test.tsx
```

Expected: FAIL because status queries only the current window, drops missing tabs, and returns URLs.

- [ ] **Step 3: Build snapshots from committed IDs**

```typescript
export async function buildManualSyncSnapshot(
  state: SyncState,
  viewer: SyncStatusViewerContext,
): Promise<ActiveManualSyncSnapshot>;
```

For each committed linked ID, call `browser.tabs.get(tabId)`. An available row may include only:

- numeric tab ID and window ID;
- title and optional favicon for display;
- location derived from the request’s viewer IDs;
- committed connection status.

An unavailable row includes only tab ID and connection status. Do not infer its window. Do not include URL, pending URL, index, incognito state, discarded state, or arbitrary tab objects.

- [ ] **Step 4: Replace `sync:get-status` with the typed response**

The handler:

1. awaits background readiness;
2. returns `{status: 'error'}` for unavailable manual state;
3. resolves viewer context by request source;
4. reads one committed state snapshot;
5. returns inactive or calls `buildManualSyncSnapshot`;
6. attaches a non-expired recent Quick Sync outcome only for a popup request whose record `tabId` equals `viewerTabId`.

For `{source: 'popup'}`, require positive safe-integer `viewerTabId` and `viewerWindowId` from the request; popup messages do not have a content-tab sender. For `{source: 'content-script'}`, require a numeric `sender.tabId`, call `browser.tabs.get(sender.tabId)`, and derive both viewer IDs from that validated tab. Reject missing or mismatched context as an explicit status error.

- [ ] **Step 5: Migrate the content panel consumer in the same slice**

`use-panel-state.ts` sends `{source: 'content-script'}` and lets the background derive viewer context from its validated sender. It must handle the discriminated status response rather than asserting an untyped payload. Preserve existing panel controls and active session behavior. Treat `{status: 'error'}` and transport failure as unknown/error, not inactive. Do not let the panel mutate topology from a guessed current-window list.

- [ ] **Step 6: Run focused, type, and privacy checks**

```bash
pnpm test -- --run src/background/lib/sync-session-snapshot.test.ts src/background/handlers/connection-handlers.test.ts src/contentScripts/components/sync-control-panel.test.tsx
pnpm typecheck
pnpm privacy:logging
```

Expected: PASS. A search for URL-bearing status fields returns no new status payload usage:

```bash
rg -n "sync:get-status|linkedTabs.*url|tab\\.url|payload|title" src/background src/contentScripts src/popup src/shared
```

Review every match; title is allowed only in the local popup snapshot and must not be logged.

- [ ] **Step 7: Commit**

```bash
git add src/background/lib/sync-session-snapshot.ts src/background/lib/sync-session-snapshot.test.ts src/background/handlers/connection-handlers.ts src/background/handlers/connection-handlers.test.ts src/shared/types/messages.ts shim.d.ts src/contentScripts/hooks/use-panel-state.ts src/contentScripts/components/sync-control-panel.test.tsx src/background/lib/index.ts
git commit -m "feat: expose authoritative sync session status"
```

## Task 13: Implement the Quick Sync Candidate, Coordinator, and Command Adapter

**Files:**

- Create: `src/background/lib/quick-sync-candidate.ts`
- Create: `src/background/lib/quick-sync-candidate.test.ts`
- Create: `src/background/lib/quick-sync-feedback.ts`
- Create: `src/background/lib/quick-sync-feedback.test.ts`
- Create: `src/background/lib/quick-sync-coordinator.ts`
- Create: `src/background/lib/quick-sync-coordinator.test.ts`
- Create: `src/background/handlers/quick-sync-command-handler.ts`
- Create: `src/background/handlers/quick-sync-command-handler.test.ts`
- Modify: `src/background/handlers/tab-event-handlers.ts`
- Modify: `src/background/handlers/tab-event-handlers.test.ts`
- Modify: `src/background/handlers/index.ts`
- Modify: `src/background/lib/index.ts`
- Modify: `src/background/main.ts`
- Modify: `src/background/main.test.ts`

- [ ] **Step 1: Add failing fake-clock candidate tests**

```typescript
it('accepts a different-tab command received before the absolute deadline', async () => {
  const candidate = createCandidateStore({ now: () => 20_000 });
  candidate.arm({ tabId: 11, expiresAt: 30_000, generation: 1 });

  const result = candidate.reserveForSecondTab({
    tabId: 22,
    commandReceivedAt: 29_999,
    operationGeneration: 4,
  });

  expect(result).toEqual({
    status: 'reserved',
    candidate: { tabId: 11, expiresAt: 30_000, generation: 1 },
    operationGeneration: 4,
  });
});

it('expires a command received at the deadline', () => {
  const candidate = createCandidateStore({ now: () => 30_000 });
  candidate.arm({ tabId: 11, expiresAt: 30_000, generation: 1 });

  expect(
    candidate.reserveForSecondTab({
      tabId: 22,
      commandReceivedAt: 30_000,
      operationGeneration: 4,
    }),
  ).toEqual({
    status: 'expired',
    generation: 1,
  });
});

it('does not extend a same-tab candidate', () => {
  const candidate = createCandidateStore({ now: () => 25_000 });
  candidate.arm({ tabId: 11, expiresAt: 30_000, generation: 1 });

  expect(
    candidate.reserveForSecondTab({
      tabId: 11,
      commandReceivedAt: 25_000,
      operationGeneration: 4,
    }),
  ).toEqual({
    status: 'same-tab',
    candidate: { tabId: 11, expiresAt: 30_000, generation: 1 },
  });
});
```

Add coordinator tests for all decision-table rows:

- inactive/no candidate → handshake then arm;
- inactive/same candidate → same-tab feedback, unchanged deadline;
- inactive/different candidate → consume, connecting feedback, require-all Start;
- active/included → already-included feedback;
- active/unlinked → Add;
- unsupported candidate or second tab → explicit feedback;
- first candidate closes/navigates → clear;
- successful popup Start and successful accepted suggestion replacement invalidate candidate;
- failed popup Start retains the original candidate and deadline;
- worker restart invalidates candidate through Port disconnect;
- command received before deadline but processed after readiness still qualifies;
- an accepted second-tab attempt reserves its candidate generation so the deadline timer and Port disconnect cannot clear it mid-handshake;
- failed second-tab Start before the original deadline restores the same candidate without extending it;
- failed second-tab Start at or after the original deadline clears the reserved generation;
- candidate tab is revalidated before Start;
- first-tab revalidation failure after HUD/Port success disconnects the provisional Port, clears the HUD, arms no candidate, and records the badge/recent failure;
- Add and second-tab failure preserve any active session.

In `quick-sync-command-handler.test.ts`, capture the function passed to `browser.commands.onCommand.addListener` and invoke it with two supplied eligible tabs. Use the real `createQuickSyncCoordinator()` plus the injected `createSyncSessionOrchestrator()` harness rather than mocking either layer. Await the harness’s committed-state signal and assert the second invocation commits `[11, 22]`. This is the deterministic command-handler integration seam; it proves handler-to-coordinator-to-orchestrator wiring but not OS key delivery.

- [ ] **Step 2: Run focused tests and confirm failure**

```bash
pnpm test -- --run src/background/lib/quick-sync-candidate.test.ts src/background/lib/quick-sync-feedback.test.ts src/background/lib/quick-sync-coordinator.test.ts src/background/handlers/quick-sync-command-handler.test.ts
```

Expected: FAIL because the Quick Sync background modules do not exist.

- [ ] **Step 3: Implement the ephemeral candidate store**

```typescript
export interface QuickSyncCandidate {
  tabId: number;
  expiresAt: number;
  generation: number;
}

export interface QuickSyncCandidateStore {
  read(): QuickSyncCandidate | null;
  reserveGeneration(): number;
  arm(candidate: QuickSyncCandidate): void;
  clear(generation: number): boolean;
  clearForTab(tabId: number): QuickSyncCandidate | null;
  reserveForSecondTab(input: {
    tabId: number;
    commandReceivedAt: number;
    operationGeneration: number;
  }): QuickSyncCandidateDecision;
  finishSecondTabAttempt(input: {
    generation: number;
    operationGeneration: number;
    succeeded: boolean;
    completedAt: number;
  }): 'cleared' | 'restored' | 'stale';
}
```

Keep the record and one optional reservation at module scope in memory only. These methods have no timers or browser listeners and are called only inside `syncTransitionGate.run()`. A matching reserved attempt owns that generation until `finishSecondTabAttempt()`: success clears it, failure before `expiresAt` restores it, and failure at or after `expiresAt` clears it. Do not use `browser.storage`, URLs, or tab titles.

- [ ] **Step 4: Implement feedback readiness, recent outcome, and badge generations**

Use a separate provisional handshake registry:

```typescript
export interface ProvisionalQuickSyncHandshake {
  tabId: number;
  generation: number;
  expiresAt: number;
}

export interface QuickSyncHandshakeRegistry {
  begin(input: ProvisionalQuickSyncHandshake): Promise<browser.Runtime.Port>;
  bindPort(input: { generation: number; senderTabId: number; port: browser.Runtime.Port }): boolean;
  discard(generation: number): browser.Runtime.Port | undefined;
}
```

The exact first-press flow while the transition gate is held is:

```typescript
const generation = candidateStore.reserveGeneration();
const expiresAt = now() + QUICK_SYNC_CANDIDATE_DURATION_MS;
const portPromise = handshakeRegistry.begin({ tabId, generation, expiresAt });
const feedbackPromise = sendFeedback(tabId, {
  outcome: 'candidate-selected',
  generation,
  expiresAt,
});
let port: browser.Runtime.Port | undefined;
let promoted = false;
let failureReason: QuickSyncFailureReason = 'hud-unavailable';

try {
  const result = await Promise.all([feedbackPromise, portPromise]);
  const feedback = result[0];
  port = result[1];

  if (feedback.status !== 'ready' || feedback.generation !== generation) {
    throw new Error('hud-unavailable');
  }

  failureReason = 'candidate-tab-missing';
  await revalidateInvocationTab(tabId);
  candidateStore.arm({ tabId, generation, expiresAt });
  bindActiveCandidatePort({ tabId, generation, expiresAt, port });
  promoted = true;
  return { status: 'candidate-armed', generation, expiresAt };
} catch {
  setRecentOutcome({
    tabId,
    resultKind: 'candidate-failed',
    reason: failureReason,
    expiresAt: now() + QUICK_SYNC_RECENT_OUTCOME_DURATION_MS,
  });
  await showUnsupportedBadge(tabId, generation).catch(() => undefined);
  return { status: 'rejected', reason: failureReason };
} finally {
  if (!promoted) {
    const provisionalPort = handshakeRegistry.discard(generation);
    const portToDisconnect = port ?? provisionalPort;
    portToDisconnect?.disconnect();
    await sendFeedback(tabId, {
      outcome: 'clear',
      generation,
      reason: 'invalidated',
    }).catch(() => undefined);
  }
}
```

The synchronous `runtime.onConnect` listener parses `quick-sync-candidate:<generation>` and calls `handshakeRegistry.bindPort()` with numeric `port.sender.tab.id`. It validates only the hidden provisional record and resolves the pending Port promise; it does not read or mutate the committed candidate. Other commands cannot observe the provisional record because the coordinator still owns the gate. Timeout, feedback failure, invalid sender, or invalid Port discards the provisional record and never arms a candidate.

`begin()` rejects after `min(1_000, expiresAt - now())` milliseconds. The common `finally` path calls `discard()`, retrieves any already-bound Port, disconnects it, and clears the provisional HUD. `sendFeedback()` uses the same 1,000ms control timeout, so `Promise.all()` cannot hold the transition gate indefinitely.

After promotion, Port disconnect schedules `syncTransitionGate.run()` and clears only a matching unreserved candidate. An accepted second-tab reservation survives deadline timer and Port disconnect until its Start attempt finishes. Background restart naturally disconnects the old Port and the new worker has no in-memory candidate.

Store at most one `RecentQuickSyncOutcome` with a 30-second absolute expiry. Store only tab ID, result kind, reason enum, count, and deadline. `quick-sync:dismiss-recent-outcome` clears only a record whose tab ID and expiry both match, so an old popup cannot dismiss a newer record. Badge clear timers also use a separate generation so stale timers cannot clear newer feedback.

Unsupported-page fallback uses action badge text `!`, the localized tooltip `이 탭에서는 스크롤 동기화를 사용할 수 없어요`, and the exact 4-second badge duration. Do not request notification permission.

- [ ] **Step 5: Implement the coordinator under the transition gate**

The coordinator receives:

```typescript
export interface QuickSyncCommandInvocation {
  commandReceivedAt: number;
  activeTabPromise: Promise<browser.Tabs.Tab | undefined>;
}

export interface QuickSyncCoordinatorDependencies {
  candidateStore: QuickSyncCandidateStore;
  handshakeRegistry: QuickSyncHandshakeRegistry;
  now: () => number;
  getState: () => SyncState;
  revalidateInvocationTab: (tabId: number) => Promise<void>;
  sendFeedback: (
    tabId: number,
    message: QuickSyncFeedbackMessage,
  ) => Promise<QuickSyncFeedbackResponse>;
  startManualSession: SyncSessionOrchestrator['startManualSession'];
  addTabToManualSession: SyncSessionOrchestrator['addTabToManualSession'];
  setRecentOutcome: (outcome: RecentQuickSyncOutcome) => void;
  showUnsupportedBadge: (tabId: number, generation: number) => Promise<void>;
}

export function createQuickSyncCoordinator(dependencies: QuickSyncCoordinatorDependencies): {
  handle(
    context: SyncTransitionContext,
    invocation: { commandReceivedAt: number; tabId: number; windowId: number },
  ): Promise<QuickSyncCommandResult>;
  expireCandidate(context: SyncTransitionContext, generation: number, now: number): Promise<void>;
  handleCandidatePortDisconnect(context: SyncTransitionContext, generation: number): Promise<void>;
};
```

Inside `syncTransitionGate.run()`:

- if state is active and the tab is linked, send `already-included`;
- if active and unlinked, call Add with `expectedRevision`;
- if inactive, apply the candidate decision;
- send result HUD/badge/recent-outcome only after the orchestrator returns;
- never expose Stop or Remove.

Candidate and same-candidate HUDs live until the original deadline. Connecting lives until the result. Start/Add/already-included success lives 2.5 seconds. Add failure lives 4 seconds. Second-tab failure keeps the original candidate deadline and supporting retry copy.

All eligibility checks are fail-closed for restricted pages, missing IDs, extension pages, or content injection/handshake failure.

- [ ] **Step 6: Register a synchronous browser command adapter**

```typescript
export const QUICK_SYNC_COMMAND = 'quick-sync-start-or-add';

export function registerQuickSyncCommandHandler(): void {
  browser.commands.onCommand.addListener((command, suppliedTab) => {
    if (command !== QUICK_SYNC_COMMAND) {
      return;
    }

    const commandReceivedAt = Date.now();
    const activeTabPromise =
      suppliedTab?.id !== undefined
        ? Promise.resolve(suppliedTab)
        : browser.tabs.query({ active: true, lastFocusedWindow: true }).then((tabs) => tabs[0]);

    void handleQuickSyncCommand({ commandReceivedAt, activeTabPromise });
  });
}
```

`handleQuickSyncCommand()` accepts this exact pending-invocation shape. It first awaits background readiness and the already-started tab Promise, validates numeric tab/window IDs, re-fetches that tab before mutation, and calls the coordinator.

Register the command listener and Port listener synchronously in `main.ts`. Do not register them inside `initializeBackground()`. The command handler resolves the invocation and then calls `syncTransitionGate.run((context) => coordinator.handle(context, invocation))`.

- [ ] **Step 7: Connect tab lifecycle invalidation**

Every timeout, Port disconnect, tab removal, or top-level navigation callback enters `syncTransitionGate.run()` before reading or clearing a candidate. No timer or browser callback calls `candidateStore.clear()` directly.

Use this timer shape after promotion:

```typescript
setTimeout(
  () => {
    void syncTransitionGate.run((context) =>
      coordinator.expireCandidate(context, generation, Date.now()),
    );
  },
  Math.max(0, expiresAt - Date.now()),
);

port.onDisconnect.addListener(() => {
  void syncTransitionGate.run((context) =>
    coordinator.handleCandidatePortDisconnect(context, generation),
  );
});
```

Do not stop or modify an unrelated active session. After popup Start returns `status: 'committed'`, clear the candidate in the same gated callback; a rejected popup Start retains it. A successfully accepted suggestion transition clears the candidate; a stale/rejected response does not.

- [ ] **Step 8: Run focused and startup regressions**

```bash
pnpm test -- --run src/background/lib/quick-sync-candidate.test.ts src/background/lib/quick-sync-feedback.test.ts src/background/lib/quick-sync-coordinator.test.ts src/background/handlers/quick-sync-command-handler.test.ts src/background/handlers/tab-event-handlers.test.ts src/background/main.test.ts
pnpm privacy:logging
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/background/lib/quick-sync-candidate.ts src/background/lib/quick-sync-candidate.test.ts src/background/lib/quick-sync-feedback.ts src/background/lib/quick-sync-feedback.test.ts src/background/lib/quick-sync-coordinator.ts src/background/lib/quick-sync-coordinator.test.ts src/background/handlers/quick-sync-command-handler.ts src/background/handlers/quick-sync-command-handler.test.ts src/background/handlers/tab-event-handlers.ts src/background/handlers/tab-event-handlers.test.ts src/background/handlers/index.ts src/background/lib/index.ts src/background/main.ts src/background/main.test.ts
git commit -m "feat: coordinate quick sync commands"
```

## Task 14: Add the Dedicated, Accessible Quick Sync HUD

**Files:**

- Create: `src/contentScripts/components/quick-sync-hud.tsx`
- Create: `src/contentScripts/components/quick-sync-hud.test.tsx`
- Create: `src/contentScripts/quick-sync-hud.tsx`
- Create: `src/contentScripts/quick-sync-hud.test.tsx`
- Modify: `src/contentScripts/components/index.ts`
- Modify: `src/contentScripts/index.ts`
- Modify: `src/shared/types/messages.ts`
- Modify: `shim.d.ts`

- [ ] **Step 1: Add failing pure HUD tests**

Use fake timers and the Korean locale to assert:

```typescript
it('updates the visual timer without re-announcing the status', () => {
  vi.setSystemTime(new Date(20_000));
  render(
    <QuickSyncHud
      message={{
        outcome: 'candidate-selected',
        generation: 7,
        expiresAt: 30_000,
      }}
    />,
  );

  const announcement = screen.getByRole('status');
  expect(announcement).toHaveTextContent('동기화할 탭 1개 선택됨');
  expect(screen.getByRole('timer')).toHaveTextContent('10');

  act(() => vi.advanceTimersByTime(1_000));

  expect(screen.getByRole('timer')).toHaveTextContent('9');
  expect(announcement).toHaveTextContent('동기화할 탭 1개 선택됨');
});

it('never renders zero seconds', () => {
  vi.setSystemTime(new Date(29_999));
  render(
    <QuickSyncHud
      message={{
        outcome: 'candidate-selected',
        generation: 7,
        expiresAt: 30_000,
      }}
    />,
  );

  expect(screen.getByRole('timer')).toHaveTextContent('1');
  act(() => vi.advanceTimersByTime(1));
  expect(screen.queryByRole('timer')).not.toBeInTheDocument();
});
```

Also cover same-candidate unchanged deadline, connecting without timer/supporting text, started/added/already-included/failure copy, one true-expiration announcement, restart clear without expiration announcement, no focusable elements, reduced motion, and tabular numerals.

- [ ] **Step 2: Run focused tests and confirm failure**

```bash
pnpm test -- --run src/contentScripts/components/quick-sync-hud.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the accessible visual contract**

Use:

```tsx
<aside
  className="pointer-events-none fixed left-1/2 top-4 z-[2147483647] -translate-x-1/2"
  data-quick-sync-generation={message.generation}
>
  <div>
    <p aria-hidden="true">{title}</p>
    {remainingSeconds !== null ? (
      <span role="timer" aria-live="off" className="tabular-nums">
        {remainingSeconds}
      </span>
    ) : null}
    {supportingText ? <p aria-hidden="true">{supportingText}</p> : null}
  </div>
  <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
    {announcement}
  </p>
</aside>
```

The `role="status"` string changes only when `generation + outcome` changes. Countdown ticks update only the visual `role="timer"` with `aria-live="off"`; the duplicated title and supporting copy remain `aria-hidden`. No button, link, tabindex, click handler, or focus call is allowed.

Use Motion only for short top-center enter/exit polish. With `prefers-reduced-motion`, render without transform animation and with zero transition duration. Use generation-bound timers for the exact lifetimes: 2.5 seconds for Start/Add/already-included success, 4 seconds for Add failure, and the original absolute deadline for candidate/same-candidate/second-tab-failed.

- [ ] **Step 4: Add the separate Shadow DOM mount and handshake**

`initQuickSyncHud()` must:

1. remove orphaned duplicate `#scroll-sync-quick-sync-hud-root` hosts;
2. create exactly one Shadow DOM host;
3. inject the existing content stylesheet into that root;
4. register `quick-sync:feedback`;
5. render the exact generation;
6. for candidate feedback, connect `quick-sync-candidate:<generation>`;
7. return `ready` only after root, stylesheet, render, and Port setup succeed;
8. ignore stale generation clear messages;
9. unmount and remove its host on disconnect or terminal clear.

It must not import, render, or share state with `suggestion-toast.tsx`.

- [ ] **Step 5: Add mount and lifecycle tests**

Cover orphan cleanup, one root after repeated injection, failed stylesheet/Port handshake, validated Port name, stale generation clear, disconnect cleanup, deadline cleanup, and no global focus movement.

- [ ] **Step 6: Register the HUD before synchronization work**

Call `initQuickSyncHud()` synchronously from `src/contentScripts/index.ts` alongside the existing content entrypoint initialization. A failure is reported to the background as `hud-unavailable`; it must not arm a candidate.

- [ ] **Step 7: Run HUD and suggestion-toast regressions**

```bash
pnpm test -- --run src/contentScripts/components/quick-sync-hud.test.tsx src/contentScripts/quick-sync-hud.test.tsx src/contentScripts/suggestion-toast.test.tsx src/contentScripts/components/sync-suggestion-toast.test.tsx
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/contentScripts/components/quick-sync-hud.tsx src/contentScripts/components/quick-sync-hud.test.tsx src/contentScripts/quick-sync-hud.tsx src/contentScripts/quick-sync-hud.test.tsx src/contentScripts/components/index.ts src/contentScripts/index.ts src/shared/types/messages.ts shim.d.ts
git commit -m "feat: show quick sync shortcut feedback"
```

## Task 15: Read the Actual Shortcut Assignment and Open Remapping UI

**Files:**

- Create: `src/popup/lib/quick-sync-shortcuts.ts`
- Create: `src/popup/lib/quick-sync-shortcuts.test.ts`
- Create: `src/popup/hooks/use-quick-sync-shortcut.ts`
- Create: `src/popup/hooks/use-quick-sync-shortcut.test.ts`
- Create: `src/popup/components/quick-sync-shortcut-status.tsx`
- Create: `src/popup/components/quick-sync-shortcut-status.test.tsx`
- Modify: `src/popup/hooks/index.ts`
- Modify: `src/popup/components/index.ts`

- [ ] **Step 1: Add failing formatter and settings-route tests**

```typescript
describe('findQuickSyncAssignment', () => {
  it('uses the browser-reported assignment', () => {
    expect(
      findQuickSyncAssignment(
        [
          { name: '_execute_action', shortcut: 'Command+Shift+Y' },
          {
            name: 'quick-sync-start-or-add',
            shortcut: 'Command+Alt+Period',
          },
        ],
        'mac',
      ),
    ).toEqual({
      status: 'assigned',
      rawShortcut: 'Command+Alt+Period',
      label: '⌘ ⌥ .',
    });
  });

  it('treats an empty shortcut as unassigned', () => {
    expect(
      findQuickSyncAssignment([{ name: 'quick-sync-start-or-add', shortcut: '' }], 'mac'),
    ).toEqual({ status: 'unassigned' });
  });
});

describe('getShortcutSettingsRoute', () => {
  const routes: Array<[ShortcutSettingsBrowser, string]> = [
    ['edge', 'edge://extensions/shortcuts'],
    ['brave', 'brave://extensions/shortcuts'],
    ['chrome', 'chrome://extensions/shortcuts'],
    ['chromium-other', 'chrome://extensions/shortcuts'],
  ];

  it.each(routes)('maps %s to %s', (browserName, expectedUrl) => {
    expect(getShortcutSettingsRoute(browserName)).toEqual({
      kind: 'internal-page',
      url: expectedUrl,
    });
  });

  it('uses the native Firefox API route', () => {
    expect(getShortcutSettingsRoute('firefox')).toEqual({
      kind: 'firefox-api',
    });
  });
});
```

- [ ] **Step 2: Add failing hook tests**

Mock `browser.commands.getAll`, `browser.commands.openShortcutSettings`, and `browser.tabs.create`. Cover:

- assigned command uses its actual browser string;
- empty command is unassigned;
- missing command is unassigned;
- rejected `getAll()` is unavailable and does not display the manifest suggestion;
- `commands.onChanged` refreshes the assignment while the popup is open;
- Firefox awaits `openShortcutSettings()` and does not open `about:addons` on success;
- unavailable/rejected Firefox API opens `about:addons` and shows the gear-menu fallback;
- Chromium resolves `tabs.create()` before reporting opened;
- internal-page rejection preserves focus on the CTA and exposes manual URL guidance;
- no UI claims a shortcut is conflict-free.

- [ ] **Step 3: Run focused tests and confirm failure**

```bash
pnpm test -- --run src/popup/lib/quick-sync-shortcuts.test.ts src/popup/hooks/use-quick-sync-shortcut.test.ts
```

Expected: FAIL because the helper and hook do not exist.

- [ ] **Step 4: Implement pure browser routing**

```typescript
export type ShortcutSettingsBrowser = 'chrome' | 'edge' | 'brave' | 'firefox' | 'chromium-other';

export type ShortcutSettingsRoute =
  | { kind: 'firefox-api' }
  | { kind: 'internal-page'; url: string };

export function findQuickSyncAssignment(
  commands: ReadonlyArray<browser.Commands.Command>,
  platform: 'mac' | 'other',
): QuickSyncShortcutAssignment;

export function getShortcutSettingsRoute(
  browserName: ShortcutSettingsBrowser,
): ShortcutSettingsRoute;
```

Detect Firefox and Edge from stable user-agent markers. Feature-detect Brave without an assertion:

```typescript
export function hasBraveRuntime(
  value: unknown,
): value is { brave: { isBrave: () => Promise<boolean> } } {
  if (typeof value !== 'object' || value === null || !('brave' in value)) {
    return false;
  }

  const brave = value.brave;
  return (
    typeof brave === 'object' &&
    brave !== null &&
    'isBrave' in brave &&
    typeof brave.isBrave === 'function'
  );
}
```

Unknown Chromium derivatives use `chromium-other`; do not mislabel them as Chrome.

- [ ] **Step 5: Implement the hook and status component**

```typescript
export type ShortcutSettingsResult =
  | { status: 'idle' | 'opening' | 'opened' }
  | {
      status: 'fallback';
      browser: ShortcutSettingsBrowser;
      settingsUrl?: string;
    };
```

`useQuickSyncShortcut()`:

1. starts at `loading`;
2. calls `browser.commands.getAll()`;
3. selects only `quick-sync-start-or-add`;
4. treats empty/missing as `unassigned`;
5. treats rejection as `unavailable`;
6. listens for command assignment changes;
7. exposes an awaited, user-triggered remap function.

`QuickSyncShortcutStatus` shows the real label when assigned, the approved warning and remap CTA when unassigned, and an unavailable message plus CTA when the API fails. Never use the manifest’s suggested key as a fallback label.

- [ ] **Step 6: Run component, hook, and type tests**

```bash
pnpm test -- --run src/popup/lib/quick-sync-shortcuts.test.ts src/popup/hooks/use-quick-sync-shortcut.test.ts src/popup/components/quick-sync-shortcut-status.test.tsx
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/popup/lib/quick-sync-shortcuts.ts src/popup/lib/quick-sync-shortcuts.test.ts src/popup/hooks/use-quick-sync-shortcut.ts src/popup/hooks/use-quick-sync-shortcut.test.ts src/popup/components/quick-sync-shortcut-status.tsx src/popup/components/quick-sync-shortcut-status.test.tsx src/popup/hooks/index.ts src/popup/components/index.ts
git commit -m "feat: surface the assigned quick sync shortcut"
```

## Task 16: Add the Truthful Manual-Session Popup Hook

**Files:**

- Create: `src/popup/hooks/use-manual-sync-session.ts`
- Create: `src/popup/hooks/use-manual-sync-session.test.ts`
- Modify: `src/popup/hooks/use-sync-control.ts`
- Modify: `src/popup/hooks/use-sync-control.test.ts`
- Modify: `src/popup/hooks/index.ts`
- Modify: `src/popup/types.ts`

- [ ] **Step 1: Add failing loading/error/refetch tests**

```typescript
it('keeps a status transport failure distinct from inactive', async () => {
  sendMessageMock.mockRejectedValueOnce(new Error('worker unavailable'));

  const { result } = renderHook(() => useManualSyncSession());

  await waitFor(() => {
    expect(result.current.state).toEqual({
      status: 'error',
      reason: 'transport-error',
    });
  });
});

it('uses the active tab only as viewer context', async () => {
  tabsQueryMock.mockResolvedValueOnce([{ id: 11, windowId: 3, active: true }]);
  sendMessageMock.mockResolvedValueOnce(activeCrossWindowResponse);

  renderHook(() => useManualSyncSession());

  await waitFor(() => {
    expect(sendMessageMock).toHaveBeenCalledWith(
      'sync:get-status',
      { source: 'popup', viewerTabId: 11, viewerWindowId: 3 },
      'background',
    );
  });
});

it('refetches authoritative status after Stop even when cleanup warns', async () => {
  sendMessageMock
    .mockResolvedValueOnce(activeResponse)
    .mockResolvedValueOnce({
      status: 'committed',
      revision: 9,
      warning: 'cleanup-incomplete',
    })
    .mockResolvedValueOnce(inactiveResponse);

  const { result } = renderHook(() => useManualSyncSession());
  await waitFor(() => expect(result.current.state.status).toBe('active'));

  await act(() => result.current.stop());

  expect(result.current.state.status).toBe('inactive');
  expect(result.current.warning).toBe('cleanup-incomplete');
});
```

Also test:

- explicit `{status: 'error'}` remains error;
- Stop rejected/timeout refetches and stays active if background says active;
- reconnect success/failure/timeout refetches;
- rapid refetch responses cannot let an older response replace a newer response;
- unavailable linked tabs remain in the active snapshot;
- recent Quick Sync outcome is preserved only until its supplied expiry;
- popup Start `auto-sync-degraded` warning is rendered with explicit recovery copy;
- no local optimistic connection-status mutation.

- [ ] **Step 2: Run focused tests and confirm failure**

```bash
pnpm test -- --run src/popup/hooks/use-manual-sync-session.test.ts src/popup/hooks/use-sync-control.test.ts
```

Expected: FAIL because `useSyncControl` currently converts failures to inactive and filters to the current window.

- [ ] **Step 3: Implement the authoritative hook**

```typescript
export type PopupSessionState =
  | { status: 'loading' }
  | SyncStatusResponseMessage
  | { status: 'error'; reason: 'transport-error' };

export interface UseManualSyncSessionResult {
  state: PopupSessionState;
  isStopping: boolean;
  isReconnecting: boolean;
  warning?: 'cleanup-incomplete';
  refetch: () => Promise<void>;
  stop: () => Promise<void>;
  reconnect: () => Promise<void>;
}
```

The hook uses `browser.tabs.query({active: true, currentWindow: true})` only to obtain viewer IDs. It never filters `linkedTabIds` with that query.

Stop sends `scroll:stop` with `{ expectedRevision: snapshot.revision }`, awaits `ManualStopResult`, and always refetches. Reconnect sends `sync:reconnect-session` with `{ expectedRevision: snapshot.revision }`, awaits `ManualReconnectResult`, and always refetches. Guard refetch ordering with a local request generation. No result is fabricated locally.

- [ ] **Step 4: Reduce `useSyncControl` to inactive-start responsibilities**

Keep:

- tab selection input;
- manual Start and its partial success contract;
- file-access education and retry;
- popup-local action callbacks needed by inactive view.

Remove:

- `sync:get-status` assertion;
- current-window linked-tab filtering;
- automatic Stop caused by a filtered list;
- optimistic Stop;
- local fake reconnect.

- [ ] **Step 5: Run focused and type tests**

```bash
pnpm test -- --run src/popup/hooks/use-manual-sync-session.test.ts src/popup/hooks/use-sync-control.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/popup/hooks/use-manual-sync-session.ts src/popup/hooks/use-manual-sync-session.test.ts src/popup/hooks/use-sync-control.ts src/popup/hooks/use-sync-control.test.ts src/popup/hooks/index.ts src/popup/types.ts
git commit -m "refactor: read popup state from the active session"
```

## Task 17: Integrate the Dedicated Active Popup View

**Files:**

- Create: `src/popup/components/active-sync-session.tsx`
- Create: `src/popup/components/active-sync-session.test.tsx`
- Create: `src/popup/components/quick-sync-recent-outcome.tsx`
- Create: `src/popup/components/quick-sync-recent-outcome.test.tsx`
- Create: `src/popup/components/scroll-sync-popup.test.tsx`
- Modify: `src/popup/components/scroll-sync-popup.tsx`
- Modify: `src/popup/components/index.ts`
- Modify: `src/popup/components/sync-control-buttons.tsx`
- Modify: `src/popup/hooks/use-sync-control.test.ts`

- [ ] **Step 1: Add failing active-view component tests**

```typescript
it('renders an authoritative active session without picker controls', () => {
  render(
    <ActiveSyncSession
      snapshot={threeTabCrossWindowSnapshot}
      shortcut={{ status: 'assigned', rawShortcut: 'Command+Shift+Period', label: '⌘ ⇧ .' }}
      isStopping={false}
      isReconnecting={false}
      onOpenShortcutSettings={vi.fn()}
      onReconnect={vi.fn()}
      onStop={vi.fn()}
    />,
  );

  expect(
    screen.getByRole('heading', { name: '스크롤 동기화 중' }),
  ).toBeInTheDocument();
  expect(
    screen.getByText('현재 3개 탭의 스크롤이 함께 움직이고 있어요.'),
  ).toBeInTheDocument();
  expect(
    screen.getByText('다른 탭에서도 ⌘ ⇧ .을 누르면 그 탭도 함께 스크롤돼요.'),
  ).toBeInTheDocument();

  const list = screen.getByRole('list', { name: '함께 스크롤하는 탭' });
  expect(within(list).getAllByRole('listitem')).toHaveLength(3);
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
});
```

Add tests for available title/favicon, unavailable generic row, exact `현재 탭`/`현재 창`/`다른 창` labels, reconnect button only when a row is disconnected/error, Stop button, unassigned shortcut CTA, cleanup warning, and no tab edit controls.

- [ ] **Step 2: Add failing popup integration tests**

Cover four explicit branches:

- loading → stable skeleton with no inactive controls;
- error → persistent `동기화 상태를 확인할 수 없어요.` and `다시 확인`;
- inactive → existing search, selection, selected chips, Start, sort, select-all, URL Sync settings, and local shortcut;
- active → dedicated active view, URL Sync settings, shortcut guidance, reconnect if needed, and Stop.

Add keyboard regressions:

```typescript
it('keeps popup-local Meta/Ctrl+S start and stop behavior', async () => {
  renderPopupWithState({ status: 'inactive' });
  fireEvent.keyDown(document, { key: 's', metaKey: true });
  expect(startMock).toHaveBeenCalledOnce();

  rerenderPopupWithState(activeResponse);
  fireEvent.keyDown(document, { key: 's', metaKey: true });
  expect(stopMock).toHaveBeenCalledOnce();
});

it('does not implement the browser-wide command as a popup DOM key handler', () => {
  renderPopupWithState({ status: 'inactive' });
  fireEvent.keyDown(document, { key: '.', metaKey: true, shiftKey: true });

  expect(startMock).not.toHaveBeenCalled();
  expect(stopMock).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Run focused tests and confirm failure**

```bash
pnpm test -- --run src/popup/components/active-sync-session.test.tsx src/popup/components/quick-sync-recent-outcome.test.tsx src/popup/components/scroll-sync-popup.test.tsx src/popup/hooks/use-sync-control.test.ts
```

Expected: FAIL because active state still renders the disabled picker and lacks authoritative branches.

- [ ] **Step 4: Implement `ActiveSyncSession`**

Use semantic heading/list/listitem/button elements. Available rows render snapshot metadata; unavailable rows render only the generic localized unavailable copy and connection state. Do not expose the tab ID or invent a title, favicon, or window label for unavailable rows.

Render the exact approved notice:

```text
이 팝업에서 탭을 추가하거나 해제하려면 먼저 동기화를 중지해야 해요.
```

This communicates the current-screen constraint without making Stop sound mandatory for normal shortcut use. The shortcut remains consistently additive.

- [ ] **Step 5: Implement recent outcome and shortcut status surfaces**

`QuickSyncRecentOutcome` accepts the typed background record and renders only non-expired, actionable failure context. It uses the approved reason copy, never raw tab information, and dismisses through `quick-sync:dismiss-recent-outcome` with the record’s tab ID and expiry. Remove the notice locally only after `{status: 'dismissed'}` or after an authoritative refetch no longer returns it. Success remains represented by active session truth and HUD; do not create noisy persistent success history.

- [ ] **Step 6: Branch `ScrollSyncPopup` by authoritative state**

Use this composition:

```tsx
<>
  {session.state.status === 'loading' ? <PopupSessionSkeleton /> : null}
  {session.state.status === 'error' ? <ManualSyncStateError onRetry={session.refetch} /> : null}
  {session.state.status === 'inactive' ? <InactiveSyncPicker /> : null}
  {session.state.status === 'active' ? (
    <ActiveSyncSession
      snapshot={session.state.snapshot}
      shortcut={shortcut.assignment}
      isStopping={session.isStopping}
      isReconnecting={session.isReconnecting}
      onOpenShortcutSettings={shortcut.openSettings}
      onReconnect={session.reconnect}
      onStop={session.stop}
    />
  ) : null}
</>
```

Define `PopupSessionSkeleton`, `ManualSyncStateError`, and `InactiveSyncPicker` as private components in `scroll-sync-popup.tsx`, using the existing picker/search/selection JSX inside `InactiveSyncPicker`. The invariant is that `TabCommandPalette`, selection chips, and `SyncControlButtons` mount only in that inactive component. Keep `UrlSyncSettings` outside the branch so it appears in both inactive and active states.

- [ ] **Step 7: Preserve popup-local keyboard behavior**

Keep IME guards. Local `Cmd/Ctrl+S` invokes Start in inactive state and authoritative Stop in active state. It must not invoke the Quick Sync browser command. Do not add a DOM listener for `Cmd/Ctrl+Shift+.`.

- [ ] **Step 8: Run popup, accessibility, and type regressions**

```bash
pnpm test -- --run src/popup/components/active-sync-session.test.tsx src/popup/components/quick-sync-shortcut-status.test.tsx src/popup/components/quick-sync-recent-outcome.test.tsx src/popup/components/scroll-sync-popup.test.tsx src/popup/hooks/use-manual-sync-session.test.ts src/popup/hooks/use-sync-control.test.ts
pnpm typecheck
pnpm lint:check
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/popup/components/active-sync-session.tsx src/popup/components/active-sync-session.test.tsx src/popup/components/quick-sync-recent-outcome.tsx src/popup/components/quick-sync-recent-outcome.test.tsx src/popup/components/scroll-sync-popup.test.tsx src/popup/components/scroll-sync-popup.tsx src/popup/components/index.ts src/popup/components/sync-control-buttons.tsx src/popup/hooks/use-sync-control.test.ts
git commit -m "feat: add the active sync popup view"
```

## Task 18: Add Session E2E, Documentation, and Risk-Based Browser QA

**Files:**

- Create: `e2e/extension/quick-sync-session.spec.ts`
- Modify: `e2e/extension/fixtures.ts`
- Create: `docs/guides/quick-sync-shortcut.md`
- Modify: `docs/guides/sync-suggestion-replacement.md`
- Modify: `src/background/README.md`
- Modify: `src/background/handlers/README.md`
- Modify: `src/contentScripts/README.md`
- Modify: `src/popup/README.md`

- [ ] **Step 1: Add failing Chrome session E2E**

Do not claim Playwright keyboard events prove browser-global shortcut delivery. The Quick Sync event route is exercised deterministically in Task 13 by capturing the registered `commands.onCommand` listener and invoking it against the real coordinator plus injected orchestrator harness. Use public extension behavior in Playwright to test the three shared session outcomes:

1. Start two eligible fixture tabs from the existing popup, verify actual scroll relay, then Stop and verify independent scrolling.
2. Start one tab in each of two browser windows, open the popup, and verify the authoritative active snapshot lists both with correct current/other-window labels.
3. With auto suggestions explicitly enabled, start two matching tabs, create a third matching tab, accept the legitimate add-tab suggestion, and verify:
   - all three tabs now synchronize;
   - the original two tabs do not jump when the Add commits;
   - their pre-Add scroll positions and manual offset relationship remain unchanged;
   - a subsequent user scroll still relays to all three tabs.

Record the two original tabs’ `scrollY` values and their pixel delta immediately before accepting Add, then assert the same values and delta immediately after the active snapshot reaches three tabs. Use only behavioral page and popup observations. Do not add a production counter, global, test-only message, manifest permission, or hidden UI control.

- [ ] **Step 2: Run the E2E and confirm any missing behavior fails**

```bash
pnpm build
rm -rf .extension-e2e/chromium-extension
mkdir -p .extension-e2e/chromium-extension
cp -R extension/. .extension-e2e/chromium-extension/
EXTENSION_E2E_DIR=.extension-e2e/chromium-extension pnpm exec playwright test --config playwright.config.extension.ts quick-sync-session.spec.ts
```

Expected before completing the fixture: at least one new cross-window/Add assertion fails.

- [ ] **Step 3: Complete only the test fixture support needed by the public flows**

Add deterministic local fixture pages/windows and helpers. Keep fixture URLs local and never print them in extension logs or committed QA evidence. Preserve serial extension E2E execution.

- [ ] **Step 4: Document architecture and troubleshooting**

`docs/guides/quick-sync-shortcut.md` must include:

- the command name and suggested defaults;
- the exact candidate decision table and 10-second boundary;
- candidate generation/Port lifecycle;
- transition gate, revision, and epoch invariants;
- Start/Add/Stop/Reconnect transaction order;
- popup inactive/active responsibilities;
- auto-suggestion interaction and opt-in;
- `commands.getAll()` evidence boundary;
- browser remapping paths;
- privacy-safe logging examples;
- the physical QA template below.

Update module READMEs and suggestion-replacement guide with links and the shared orchestrator ownership. Do not duplicate the full design prose.

- [ ] **Step 5: Perform the privacy completion search before the final commit**

```bash
rg -n "logger|url|Url|URL|tab\\.url|window\\.location\\.href|payload|normalizedUrl|sourceUrl|targetUrl|title" src/background src/contentScripts src/popup src/shared scripts e2e
```

Review every new or changed match. Blocking failures include:

- logging a raw URL, title, tab object, payload, storage result, or snapshot;
- sending these values to external services or PR comments;
- recording fixture URLs/titles/screenshots in the physical QA artifact.

- [ ] **Step 6: Commit E2E and documentation**

```bash
git add e2e/extension/quick-sync-session.spec.ts e2e/extension/fixtures.ts docs/guides/quick-sync-shortcut.md docs/guides/sync-suggestion-replacement.md src/background/README.md src/background/handlers/README.md src/contentScripts/README.md src/popup/README.md
git commit -m "test: cover quick sync session workflows"
```

- [ ] **Step 7: Freeze and record the exact candidate commit**

```bash
git diff --exit-code
git diff --cached --exit-code
git status --short
git rev-parse HEAD
```

Expected: no tracked or staged changes remain; only the known unrelated untracked tool directories may appear. Copy the full SHA into `/tmp/quick-sync-shortcut-browser-matrix.md`. No code, test, locale, documentation, or configuration file may change after this point. If anything changes, commit it and restart at Step 7.

- [ ] **Step 8: Run the complete automated release gate on that SHA**

Run in this order:

```bash
pnpm privacy:logging:test
pnpm privacy:logging
pnpm i18n:validate
pnpm lint:check
pnpm typecheck
pnpm test -- --run
pnpm build
rm -rf .extension-e2e/chromium-extension
mkdir -p .extension-e2e/chromium-extension
cp -R extension/. .extension-e2e/chromium-extension/
pnpm build-firefox
EXTENSION_E2E_DIR=.extension-e2e/chromium-extension pnpm test:e2e:extension
git rev-parse HEAD
git diff --exit-code
```

Expected: every command passes and the final SHA exactly matches Step 7. Preserve the Chromium build before the Firefox build because both use `extension/`.

- [ ] **Step 9: Record `commands.getAll()` assignment evidence separately**

In each physically tested profile, inspect only non-sensitive command metadata:

```javascript
browser.commands.getAll().then((commands) =>
  console.table(
    commands.map(({ name, shortcut, description }) => ({
      name,
      shortcut,
      description,
    })),
  ),
);
```

For Chromium raw DevTools, use `chrome.commands.getAll`. Verify:

1. the command exists;
2. its default assignment is present or truthfully empty;
3. clearing it produces `shortcut === ''`;
4. user remapping is reflected by the returned string and popup;
5. no UI claims the assignment is conflict-free.

This proves assignment/remapping reflection only. It does not satisfy Step 10.

- [ ] **Step 10: Execute the Chrome-first physical shortcut matrix**

Record date, the Step 7 SHA, exact OS build, exact browser stable version, assignment string, scenario pass/fail, remap result, and non-sensitive failure reason in `/tmp/quick-sync-shortcut-browser-matrix.md`, using the guide’s QA template. Never record URLs, titles, page content, raw logs, or screenshots.

| Browser / OS            | Physical key scenarios                                                                                                                    |         Gate |                 Estimated hands-on cost |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -----------: | --------------------------------------: |
| Chrome stable / macOS   | `⌘ ⇧ .`: assignment, first press, second press, Add, same/included no-op, cross-window, popup truth, clear/remap, two-tab scroll and Stop |     Blocking | Chrome macOS + Windows: 20–30 min total |
| Chrome stable / Windows | `Ctrl ⇧ .`: same essential flow and clear/remap delivery                                                                                  |     Blocking |                          Included above |
| Firefox stable / one OS | production Firefox build, start/add/stop, worker wake-up, restricted page, native remap settings                                          |     Blocking |                                8–12 min |
| Edge stable / Windows   | assignment, physical delivery, two-tab Start, user remap                                                                                  |     Blocking |            Edge + Brave: 8–14 min total |
| Brave stable / one OS   | assignment, HUD, physical delivery, two-tab Start                                                                                         |     Blocking |                          Included above |
| Arc stable / macOS      | Space/Split focus and browser interception exploration                                                                                    |     Advisory |                       Optional 5–10 min |
| Dia and Linux           | manifest and automated Chromium/Firefox contracts only for this release                                                                   | Non-blocking |             No physical completion cost |

Why this boundary:

- Chrome receives the full two-OS release gate because it is the primary user path and shortcuts are OS-delivered.
- Firefox exercises a distinct extension implementation and settings API, so one blocking OS smoke has high marginal value.
- Edge and Brave are Chromium derivatives; targeted delivery/remap smoke captures vendor interception risk without duplicating the entire Chrome matrix.
- Arc is exploratory because it is not an officially supported release target and its workspace UI increases manual variance.
- Dia and a separate Linux physical run add more cost than risk reduction for this release; automated manifest/build contracts remain.

Any blocking row failure holds the feature release. Arc failure is documented as advisory and does not block.

- [ ] **Step 11: Attach the redacted QA artifact to the PR**

Attach `/tmp/quick-sync-shortcut-browser-matrix.md` with the repository’s GitHub workflow. Include the exact tested commit SHA. Do not paste raw browser logs.

The artifact must explicitly state:

```text
commands.getAll() evidence verifies assignment state only.
Physical-key rows verify OS/browser delivery to commands.onCommand.
```

After attachment, run `git rev-parse HEAD` once more and confirm it still equals the artifact SHA. Any tracked change invalidates the evidence and requires Steps 7–11 again.

## Final Acceptance Checklist

- [ ] One and only one `quick-sync-start-or-add` manifest command exists in Chromium and Firefox builds.
- [ ] Actual assignment, unassigned state, API failure, and user remapping are truthful in the popup.
- [ ] First press arms only after a successful HUD/Port handshake and uses an absolute 10-second deadline.
- [ ] Same-tab press does not extend the deadline.
- [ ] Second different-tab press before the deadline starts only when both tabs acknowledge.
- [ ] Active unlinked press adds only the new tab; existing tabs are not reinitialized.
- [ ] Active linked press is a no-op with the approved included-tab feedback.
- [ ] Shortcut never stops or removes a tab.
- [ ] Popup inactive picker/search/selection/Start and popup-local `Cmd/Ctrl+S` remain intact.
- [ ] Popup active state removes selection controls and shows authoritative cross-window rows, shortcut guidance, reconnect when needed, and Stop.
- [ ] Status loading, inactive, active, transport error, storage error, and invalid-state remain distinct.
- [ ] Durable state is runtime-validated, revisioned, and epoch-protected.
- [ ] All manual topology mutations pass through one FIFO transition gate.
- [ ] Manual relay validates sender, committed membership, and epoch before any await.
- [ ] Start/Add use prepare-commit; Stop is durable-first; Add failure preserves the active session.
- [ ] Auto suggestions remain explicit opt-in and accepted responses validate `expectedRevision`.
- [ ] Dedicated HUD is non-interactive, focus-safe, reduced-motion-safe, generation-bound, and silent on countdown ticks.
- [ ] Both locale trees pass nine-locale key and placeholder parity.
- [ ] No raw URL, title, payload, page metadata, or storage object is logged or attached as QA evidence.
- [ ] Unit, type, lint, privacy, i18n, Chromium build, Firefox build, and extension E2E gates pass.
- [ ] Chrome macOS and Windows full physical rows pass.
- [ ] Firefox, Edge, and Brave targeted physical rows pass.
- [ ] Arc result, if run, is advisory; Dia and Linux physical runs are non-blocking.
- [ ] The PR contains the exact commit SHA and a redacted browser-matrix artifact that separates assignment evidence from physical-key delivery evidence.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-11-quick-sync-shortcut.md`. Choose one implementation mode:

1. **Subagent-Driven (recommended):** execute in this task with a fresh worker per implementation task and review after each task.
2. **Inline Execution:** execute the plan sequentially in this task with explicit checkpoints between tasks.

Do not start either mode without the user’s explicit choice.
