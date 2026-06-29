# Contextual Onboarding Hints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add situation-based onboarding hints that introduce scroll-sync features only when the
user encounters the relevant situation.

**Architecture:** Add a shared contextual-hint registry, dismissed-hint storage, and pure manual
height-threshold helper first. Extend the existing `scroll:start` handshake so content scripts
return non-sensitive scroll metrics, let the background decide whether to send a manual-adjustment
hint, and render lightweight webpage overlays in a dedicated Shadow DOM root. Update existing
suggestion toast copy so add-tab wording clearly means "add to the current sync".

**Tech Stack:** React 19, TypeScript, webext-bridge, webextension-polyfill storage, Vitest, Testing
Library, UnoCSS/Tailwind classes, existing browser i18n JSON.

---

## Scope Check

This is one subsystem: contextual onboarding hints for the extension. It spans shared helpers,
background trigger wiring, content-script overlay rendering, existing toast copy, and i18n, but each
task below produces a working, testable slice.

## File Structure

- Create: `src/shared/types/contextual-hints.ts`
  - Owns stable hint ids, message payloads, and scroll metric types.
- Create: `src/shared/lib/contextual-hints.ts`
  - Owns pure registry, manual page-length threshold logic, and OS-aware shortcut labels.
- Create: `src/shared/lib/contextual-hints.test.ts`
  - Covers threshold, zero-height filtering, registry, and platform label behavior.
- Modify: `src/shared/lib/storage.ts`
  - Adds dismissed contextual hint id storage.
- Modify: `src/shared/lib/storage.test.ts`
  - Covers load/save failure behavior and validates only known hint ids are returned.
- Modify: `src/shared/types/messages.ts`
  - Adds typed contextual hint messages and typed `scroll:start` return data.
- Modify: `shim.d.ts`
  - Adds ProtocolMap entries and `scroll:start` return typing.
- Modify: `src/background/handlers/scroll-sync-handlers.ts`
  - Collects scroll metrics from connected tabs and sends manual-adjustment hints when threshold
    passes.
- Modify: `src/background/handlers/scroll-sync-handlers.test.ts`
  - Covers metric aggregation, threshold triggering, and privacy-safe hint payloads.
- Create: `src/contentScripts/contextual-hints.tsx`
  - Creates the contextual hint Shadow DOM root, registers message handlers, checks dismissed
    storage, and applies session cooldown.
- Create: `src/contentScripts/components/contextual-hint-overlay.tsx`
  - Renders the lightweight webpage overlay.
- Create: `src/contentScripts/components/contextual-hint-overlay.test.tsx`
  - Covers copy, OS key label, auto-dismiss, `다음에 보기`, `이 안내 숨기기`, and `설정 바꾸기`.
- Modify: `src/contentScripts/components/index.ts`
  - Exports the overlay component.
- Modify: `src/contentScripts/index.ts`
  - Initializes contextual hints alongside scroll sync.
- Modify: `src/contentScripts/scroll-sync.ts`
  - Returns scroll metrics on start, stores URL-sync hint markers before navigation, and emits the
    post-navigation hint on the next page.
- Modify: `src/contentScripts/panel.tsx`
  - Listens for URL Sync setting open events and drives the panel setting control.
- Modify: `src/contentScripts/components/sync-control-panel.tsx`
  - Accepts a token to open the panel and expand URL Sync settings.
- Modify: `src/shared/components/url-sync-settings.tsx`
  - Accepts an expansion token for direct `설정 바꾸기` actions.
- Modify: `src/contentScripts/components/sync-suggestion-toast.tsx`
  - Updates existing add-tab copy and removes URL/title lines from the touched add-tab toast.
- Modify: both locale trees
  - `extension/_locales/{de,en,es,fr,hi,ja,ko,zh,zh_CN,zh_TW}/messages.json`
  - `src/shared/i18n/_locales/{de,en,es,fr,hi,ja,ko,zh_CN,zh_TW}/messages.json`
- Modify: `src/__tests__/scenarios.test.ts`
  - Adds a scenario-level assertion that URL sync queues the page-change hint without raw URL copy.

## Task 1: Shared Hint Types And Pure Helpers

**Files:**

- Create: `src/shared/types/contextual-hints.ts`
- Create: `src/shared/lib/contextual-hints.ts`
- Create: `src/shared/lib/contextual-hints.test.ts`
- Modify: `src/shared/lib/index.ts`

- [ ] **Step 1: Write failing tests for hint helper behavior**

Create `src/shared/lib/contextual-hints.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import {
  CONTEXTUAL_HINT_REGISTRY,
  getContextualHintShortcutLabel,
  getManualAdjustmentHintDecision,
  isContextualHintId,
} from './contextual-hints';

describe('contextual hints', () => {
  it('defines every contextual hint with a stable surface', () => {
    expect(CONTEXTUAL_HINT_REGISTRY['manual-scroll-adjustment']).toMatchObject({
      id: 'manual-scroll-adjustment',
      surface: 'webpage-overlay',
      dismissible: true,
    });
    expect(CONTEXTUAL_HINT_REGISTRY['page-change-synced']).toMatchObject({
      id: 'page-change-synced',
      surface: 'webpage-overlay',
      dismissible: true,
    });
    expect(CONTEXTUAL_HINT_REGISTRY['add-tab-to-sync']).toMatchObject({
      id: 'add-tab-to-sync',
      surface: 'existing-toast',
      dismissible: true,
    });
  });

  it('validates known hint ids', () => {
    expect(isContextualHintId('manual-scroll-adjustment')).toBe(true);
    expect(isContextualHintId('page-change-synced')).toBe(true);
    expect(isContextualHintId('unknown-hint')).toBe(false);
  });

  it('shows manual hint when scrollable heights cross ratio and pixel thresholds', () => {
    const decision = getManualAdjustmentHintDecision([
      { tabId: 1, scrollHeight: 2000, clientHeight: 1000, scrollableHeight: 1000 },
      { tabId: 2, scrollHeight: 3400, clientHeight: 1000, scrollableHeight: 2400 },
    ]);

    expect(decision).toEqual({
      shouldShow: true,
      largestScrollableHeight: 2400,
      smallestScrollableHeight: 1000,
      absoluteDifference: 1400,
      ratio: 2.4,
    });
  });

  it('skips manual hint when only ratio threshold passes', () => {
    expect(
      getManualAdjustmentHintDecision([
        { tabId: 1, scrollHeight: 1000, clientHeight: 600, scrollableHeight: 400 },
        { tabId: 2, scrollHeight: 1560, clientHeight: 900, scrollableHeight: 660 },
      ]).shouldShow,
    ).toBe(false);
  });

  it('skips manual hint when only pixel threshold passes', () => {
    expect(
      getManualAdjustmentHintDecision([
        { tabId: 1, scrollHeight: 2400, clientHeight: 1000, scrollableHeight: 1400 },
        { tabId: 2, scrollHeight: 4050, clientHeight: 2000, scrollableHeight: 2050 },
      ]).shouldShow,
    ).toBe(false);
  });

  it('ignores zero-height tabs before evaluating the threshold', () => {
    expect(
      getManualAdjustmentHintDecision([
        { tabId: 1, scrollHeight: 1000, clientHeight: 1000, scrollableHeight: 0 },
        { tabId: 2, scrollHeight: 2600, clientHeight: 1000, scrollableHeight: 1600 },
      ]).shouldShow,
    ).toBe(false);
  });

  it('returns OS-specific manual shortcut labels', () => {
    expect(getContextualHintShortcutLabel('macos')).toBe('⌥ Option');
    expect(getContextualHintShortcutLabel('windows')).toBe('Alt');
    expect(getContextualHintShortcutLabel('linux')).toBe('Alt');
    expect(getContextualHintShortcutLabel('unknown')).toBe('Alt 또는 Option');
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm vitest run src/shared/lib/contextual-hints.test.ts
```

Expected: FAIL because `src/shared/lib/contextual-hints.ts` does not exist.

- [ ] **Step 3: Add shared hint types**

Create `src/shared/types/contextual-hints.ts`:

```typescript
export type ContextualHintId =
  | 'start-minimum-tabs'
  | 'manual-scroll-adjustment'
  | 'page-change-synced'
  | 'keep-website-path-synced'
  | 'sync-suggestion'
  | 'add-tab-to-sync'
  | 'floating-panel';

export type ContextualHintSurface =
  | 'popup-inline'
  | 'webpage-overlay'
  | 'floating-panel-inline'
  | 'existing-toast';

export type ContextualHintAction = 'dismiss-temporary' | 'hide-permanently' | 'open-settings';

export interface ContextualHintDefinition {
  id: ContextualHintId;
  surface: ContextualHintSurface;
  dismissible: boolean;
}

export interface ContextualHintScrollMetrics {
  tabId: number;
  scrollHeight: number;
  clientHeight: number;
  scrollableHeight: number;
}

export interface ManualAdjustmentHintDecision {
  shouldShow: boolean;
  largestScrollableHeight: number;
  smallestScrollableHeight: number;
  absoluteDifference: number;
  ratio: number;
}

export interface ContextualHintShowMessage {
  hintId: ContextualHintId;
  surface: 'webpage-overlay' | 'floating-panel-inline';
  source: 'sync-start' | 'url-sync' | 'panel-open';
}

export interface ContextualHintActionMessage {
  hintId: ContextualHintId;
  action: ContextualHintAction;
}
```

- [ ] **Step 4: Implement pure helper logic**

Create `src/shared/lib/contextual-hints.ts`:

```typescript
import { getPlatform, type Platform } from './platform';
import type {
  ContextualHintDefinition,
  ContextualHintId,
  ContextualHintScrollMetrics,
  ManualAdjustmentHintDecision,
} from '../types/contextual-hints';

export const MANUAL_HINT_MIN_SCROLLABLE_RATIO = 1.4;
export const MANUAL_HINT_MIN_SCROLLABLE_DELTA_PX = 600;

export const CONTEXTUAL_HINT_REGISTRY: Record<ContextualHintId, ContextualHintDefinition> = {
  'start-minimum-tabs': {
    id: 'start-minimum-tabs',
    surface: 'popup-inline',
    dismissible: false,
  },
  'manual-scroll-adjustment': {
    id: 'manual-scroll-adjustment',
    surface: 'webpage-overlay',
    dismissible: true,
  },
  'page-change-synced': {
    id: 'page-change-synced',
    surface: 'webpage-overlay',
    dismissible: true,
  },
  'keep-website-path-synced': {
    id: 'keep-website-path-synced',
    surface: 'webpage-overlay',
    dismissible: true,
  },
  'sync-suggestion': {
    id: 'sync-suggestion',
    surface: 'existing-toast',
    dismissible: true,
  },
  'add-tab-to-sync': {
    id: 'add-tab-to-sync',
    surface: 'existing-toast',
    dismissible: true,
  },
  'floating-panel': {
    id: 'floating-panel',
    surface: 'floating-panel-inline',
    dismissible: true,
  },
};

export function isContextualHintId(value: unknown): value is ContextualHintId {
  return typeof value === 'string' && value in CONTEXTUAL_HINT_REGISTRY;
}

export function getContextualHintShortcutLabel(platform: Platform = getPlatform()): string {
  if (platform === 'macos') {
    return '⌥ Option';
  }

  if (platform === 'windows' || platform === 'linux') {
    return 'Alt';
  }

  return 'Alt 또는 Option';
}

export function getManualAdjustmentHintDecision(
  metrics: ReadonlyArray<ContextualHintScrollMetrics>,
): ManualAdjustmentHintDecision {
  const scrollableHeights = metrics
    .map((metric) => metric.scrollableHeight)
    .filter((height) => Number.isFinite(height) && height > 0)
    .sort((first, second) => first - second);

  if (scrollableHeights.length < 2) {
    return {
      shouldShow: false,
      largestScrollableHeight: 0,
      smallestScrollableHeight: 0,
      absoluteDifference: 0,
      ratio: 0,
    };
  }

  const smallestScrollableHeight = scrollableHeights[0];
  const largestScrollableHeight = scrollableHeights[scrollableHeights.length - 1];
  const absoluteDifference = largestScrollableHeight - smallestScrollableHeight;
  const ratio = largestScrollableHeight / smallestScrollableHeight;

  return {
    shouldShow:
      ratio >= MANUAL_HINT_MIN_SCROLLABLE_RATIO &&
      absoluteDifference >= MANUAL_HINT_MIN_SCROLLABLE_DELTA_PX,
    largestScrollableHeight,
    smallestScrollableHeight,
    absoluteDifference,
    ratio,
  };
}
```

- [ ] **Step 5: Export the helper from the shared lib barrel**

Append to `src/shared/lib/index.ts`:

```typescript
export * from './contextual-hints';
```

- [ ] **Step 6: Run the focused test and verify it passes**

Run:

```bash
pnpm vitest run src/shared/lib/contextual-hints.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the shared helper**

```bash
git add src/shared/types/contextual-hints.ts src/shared/lib/contextual-hints.ts src/shared/lib/contextual-hints.test.ts src/shared/lib/index.ts
git commit -m "feat: add contextual hint helpers"
```

## Task 2: Dismissed Hint Storage

**Files:**

- Modify: `src/shared/lib/storage.ts`
- Modify: `src/shared/lib/storage.test.ts`

- [ ] **Step 1: Add failing storage tests**

Update the import in `src/shared/lib/storage.test.ts` to include:

```typescript
import {
  loadDismissedContextualHintIds,
  saveDismissedContextualHintId,
} from './storage';
```

Append these tests to `src/shared/lib/storage.test.ts`:

```typescript
describe('contextual hint dismissal storage', () => {
  it('loads only known dismissed contextual hint ids', async () => {
    storageGetMock.mockResolvedValue({
      dismissedContextualHintIds: [
        'manual-scroll-adjustment',
        'unknown-hint',
        'page-change-synced',
      ],
    });

    await expect(loadDismissedContextualHintIds()).resolves.toEqual(
      new Set(['manual-scroll-adjustment', 'page-change-synced']),
    );
    expect(storageGetMock).toHaveBeenCalledWith('dismissedContextualHintIds');
  });

  it('returns an empty set when no contextual hints are dismissed', async () => {
    storageGetMock.mockResolvedValue({});

    await expect(loadDismissedContextualHintIds()).resolves.toEqual(new Set());
  });

  it('returns null when dismissed hint read fails', async () => {
    const error = new Error('get failed');
    storageGetMock.mockRejectedValue(error);

    await expect(loadDismissedContextualHintIds()).resolves.toBeNull();
    expect(loggerErrorMock).toHaveBeenCalledWith(
      'Failed to load dismissed contextual hint IDs:',
      error,
    );
  });

  it('saves a dismissed contextual hint id while preserving previous ids', async () => {
    storageGetMock.mockResolvedValue({
      dismissedContextualHintIds: ['manual-scroll-adjustment'],
    });
    storageSetMock.mockResolvedValue(undefined);

    await expect(saveDismissedContextualHintId('page-change-synced')).resolves.toBe(true);

    expect(storageSetMock).toHaveBeenCalledWith({
      dismissedContextualHintIds: ['manual-scroll-adjustment', 'page-change-synced'],
    });
  });

  it('does not duplicate a dismissed contextual hint id', async () => {
    storageGetMock.mockResolvedValue({
      dismissedContextualHintIds: ['manual-scroll-adjustment'],
    });
    storageSetMock.mockResolvedValue(undefined);

    await expect(saveDismissedContextualHintId('manual-scroll-adjustment')).resolves.toBe(true);

    expect(storageSetMock).toHaveBeenCalledWith({
      dismissedContextualHintIds: ['manual-scroll-adjustment'],
    });
  });

  it('returns false when dismissed hint save fails', async () => {
    const error = new Error('set failed');
    storageGetMock.mockResolvedValue({ dismissedContextualHintIds: [] });
    storageSetMock.mockRejectedValue(error);

    await expect(saveDismissedContextualHintId('manual-scroll-adjustment')).resolves.toBe(false);
    expect(loggerErrorMock).toHaveBeenCalledWith(
      'Failed to save dismissed contextual hint ID:',
      error,
    );
  });
});
```

- [ ] **Step 2: Run the storage tests and verify they fail**

Run:

```bash
pnpm vitest run src/shared/lib/storage.test.ts
```

Expected: FAIL because the two storage functions are not implemented.

- [ ] **Step 3: Add the storage key and functions**

In `src/shared/lib/storage.ts`, add the import:

```typescript
import type { ContextualHintId } from '~/shared/types/contextual-hints';
import { isContextualHintId } from './contextual-hints';
```

Add this key to `STORAGE_KEYS`:

```typescript
DISMISSED_CONTEXTUAL_HINT_IDS: 'dismissedContextualHintIds',
```

Append these functions near the other storage helpers:

```typescript
export async function loadDismissedContextualHintIds(): Promise<Set<ContextualHintId> | null> {
  try {
    const result = await browser.storage.local.get(STORAGE_KEYS.DISMISSED_CONTEXTUAL_HINT_IDS);
    const stored = result[STORAGE_KEYS.DISMISSED_CONTEXTUAL_HINT_IDS];

    if (!Array.isArray(stored)) {
      return new Set();
    }

    return new Set(stored.filter(isContextualHintId));
  } catch (error) {
    await logger.error('Failed to load dismissed contextual hint IDs:', error);
    return null;
  }
}

export async function saveDismissedContextualHintId(
  hintId: ContextualHintId,
): Promise<boolean> {
  try {
    const dismissedHintIds = await loadDismissedContextualHintIds();
    const nextHintIds = dismissedHintIds ?? new Set<ContextualHintId>();
    nextHintIds.add(hintId);

    await browser.storage.local.set({
      [STORAGE_KEYS.DISMISSED_CONTEXTUAL_HINT_IDS]: Array.from(nextHintIds),
    });

    return true;
  } catch (error) {
    await logger.error('Failed to save dismissed contextual hint ID:', error);
    return false;
  }
}
```

- [ ] **Step 4: Run the storage tests and verify they pass**

Run:

```bash
pnpm vitest run src/shared/lib/storage.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit dismissed hint storage**

```bash
git add src/shared/lib/storage.ts src/shared/lib/storage.test.ts
git commit -m "feat: persist contextual hint dismissals"
```

## Task 3: Scroll Start Metrics And Background Manual Hint Trigger

**Files:**

- Modify: `src/shared/types/messages.ts`
- Modify: `shim.d.ts`
- Modify: `src/contentScripts/scroll-sync.ts`
- Modify: `src/background/handlers/scroll-sync-handlers.ts`
- Modify: `src/background/handlers/scroll-sync-handlers.test.ts`

- [ ] **Step 1: Add failing background tests**

Update the `sendMessageWithTimeout` mock in `src/background/handlers/scroll-sync-handlers.test.ts`
so the default success response includes metrics:

```typescript
vi.mocked(sendMessageWithTimeout).mockImplementation(async (_, __, destination) => ({
  success: true,
  tabId: destination.tabId,
  scrollMetrics: {
    tabId: destination.tabId ?? 0,
    scrollHeight: destination.tabId === 1 ? 2000 : 3400,
    clientHeight: 1000,
    scrollableHeight: destination.tabId === 1 ? 1000 : 2400,
  },
}));
```

Append these tests inside `describe('scroll:start', ...)`:

```typescript
it('sends manual adjustment hint when connected tab heights cross the threshold', async () => {
  const handler = getHandler<StartSyncMessage>('scroll:start');

  await handler({
    data: { tabIds: [1, 2], mode: 'ratio', isAutoSync: false },
    sender: {},
  });

  expect(sendMessage).toHaveBeenCalledWith(
    'contextual-hint:show',
    {
      hintId: 'manual-scroll-adjustment',
      surface: 'webpage-overlay',
      source: 'sync-start',
    },
    { context: 'content-script', tabId: 1 },
  );
  expect(sendMessage).toHaveBeenCalledWith(
    'contextual-hint:show',
    {
      hintId: 'manual-scroll-adjustment',
      surface: 'webpage-overlay',
      source: 'sync-start',
    },
    { context: 'content-script', tabId: 2 },
  );
});

it('does not send manual adjustment hint when height threshold is not crossed', async () => {
  const handler = getHandler<StartSyncMessage>('scroll:start');

  vi.mocked(sendMessageWithTimeout).mockImplementation(async (_, __, destination) => ({
    success: true,
    tabId: destination.tabId,
    scrollMetrics: {
      tabId: destination.tabId ?? 0,
      scrollHeight: destination.tabId === 1 ? 2000 : 2500,
      clientHeight: 1000,
      scrollableHeight: destination.tabId === 1 ? 1000 : 1500,
    },
  }));

  await handler({
    data: { tabIds: [1, 2], mode: 'ratio', isAutoSync: false },
    sender: {},
  });

  expect(sendMessage).not.toHaveBeenCalledWith(
    'contextual-hint:show',
    expect.anything(),
    expect.anything(),
  );
});
```

- [ ] **Step 2: Run the background tests and verify they fail**

Run:

```bash
pnpm vitest run src/background/handlers/scroll-sync-handlers.test.ts
```

Expected: FAIL because `contextual-hint:show` is not sent and message types are missing.

- [ ] **Step 3: Add typed message payloads and returns**

In `src/shared/types/messages.ts`, import contextual hint types:

```typescript
import type {
  ContextualHintActionMessage,
  ContextualHintScrollMetrics,
  ContextualHintShowMessage,
} from './contextual-hints';
```

Add these interfaces after `StartSyncMessage`:

```typescript
export interface StartSyncAckMessage {
  success: boolean;
  tabId: number;
  scrollMetrics?: ContextualHintScrollMetrics;
}

export interface StartSyncResponseMessage {
  success: boolean;
  connectedTabs: Array<number>;
  connectionResults: Record<number, { success: boolean; error?: string }>;
  error?: string;
}
```

Add ProtocolMap entries:

```typescript
'contextual-hint:show': ContextualHintShowMessage;
'contextual-hint:action': ContextualHintActionMessage;
```

In `shim.d.ts`, update imports and the `scroll:start` protocol:

```typescript
import type {
  ContextualHintActionMessage,
  ContextualHintShowMessage,
} from '~/shared/types/contextual-hints';
import type { StartSyncAckMessage, StartSyncResponseMessage } from '~/shared/types/messages';

'scroll:start': ProtocolWithReturn<StartSyncMessage, StartSyncAckMessage | StartSyncResponseMessage>;
'contextual-hint:show': ProtocolWithReturn<ContextualHintShowMessage, unknown>;
'contextual-hint:action': ProtocolWithReturn<ContextualHintActionMessage, unknown>;
```

- [ ] **Step 4: Return scroll metrics from content script start ack**

In `src/contentScripts/scroll-sync.ts`, change the `scroll:start` return from:

```typescript
return { success: true, tabId: syncState.tabId };
```

to:

```typescript
const startScrollInfo = getScrollInfo();
const startScrollableHeight = Math.max(
  0,
  startScrollInfo.scrollHeight - startScrollInfo.clientHeight,
);

return {
  success: true,
  tabId: syncState.tabId,
  scrollMetrics: {
    tabId: syncState.tabId,
    scrollHeight: startScrollInfo.scrollHeight,
    clientHeight: startScrollInfo.clientHeight,
    scrollableHeight: startScrollableHeight,
  },
};
```

- [ ] **Step 5: Send manual hint from the background after successful start**

In `src/background/handlers/scroll-sync-handlers.ts`, add imports:

```typescript
import { getManualAdjustmentHintDecision } from '~/shared/lib/contextual-hints';
import type { ContextualHintScrollMetrics } from '~/shared/types/contextual-hints';
import type { StartSyncAckMessage } from '~/shared/types/messages';
```

Before the `promises` map, create a metrics array:

```typescript
const connectedScrollMetrics: Array<ContextualHintScrollMetrics> = [];
```

Change the `sendMessageWithTimeout` generic and success branch:

```typescript
const response = await sendMessageWithTimeout<StartSyncAckMessage>(
  'scroll:start',
  { ...startRequest, currentTabId: tabId },
  { context: 'content-script', tabId },
  1_000,
);

if (response && response.success && response.tabId === tabId) {
  logger.info(`Tab ${tabId} acknowledged connection successfully`);
  connectionResults[tabId] = { success: true };
  syncState.connectionStatuses[tabId] = 'connected';

  if (response.scrollMetrics) {
    connectedScrollMetrics.push(response.scrollMetrics);
  }
} else {
  logger.error(`Tab ${tabId} returned invalid acknowledgment`);
  connectionResults[tabId] = { success: false, error: 'Invalid acknowledgment' };
  syncState.connectionStatuses[tabId] = 'error';
}
```

After `await broadcastSyncStatus();`, add:

```typescript
const manualHintDecision = getManualAdjustmentHintDecision(connectedScrollMetrics);

if (!startRequest.isAutoSync && manualHintDecision.shouldShow) {
  await Promise.allSettled(
    connectedTabIds.map((tabId) =>
      sendMessage(
        'contextual-hint:show',
        {
          hintId: 'manual-scroll-adjustment',
          surface: 'webpage-overlay',
          source: 'sync-start',
        },
        { context: 'content-script', tabId },
      ),
    ),
  );

  logger.info('Manual adjustment hint sent', {
    connectedTabCount: connectedTabIds.length,
    heightBucket: Math.round(manualHintDecision.absoluteDifference / 100) * 100,
  });
}
```

- [ ] **Step 6: Run background and type tests**

Run:

```bash
pnpm vitest run src/background/handlers/scroll-sync-handlers.test.ts src/shared/lib/contextual-hints.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit scroll start trigger wiring**

```bash
git add src/shared/types/messages.ts shim.d.ts src/contentScripts/scroll-sync.ts src/background/handlers/scroll-sync-handlers.ts src/background/handlers/scroll-sync-handlers.test.ts
git commit -m "feat: trigger manual adjustment hints"
```

## Task 4: Webpage Overlay Surface And Dismiss Behavior

**Files:**

- Create: `src/contentScripts/components/contextual-hint-overlay.tsx`
- Create: `src/contentScripts/components/contextual-hint-overlay.test.tsx`
- Create: `src/contentScripts/contextual-hints.tsx`
- Modify: `src/contentScripts/components/index.ts`
- Modify: `src/contentScripts/index.ts`

- [ ] **Step 1: Write failing overlay component tests**

Create `src/contentScripts/components/contextual-hint-overlay.test.tsx`:

```typescript
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ContextualHintOverlay } from './contextual-hint-overlay';

vi.mock('~/shared/i18n', () => ({
  t: (key: string, substitutions?: string | string[]) => {
    const value = Array.isArray(substitutions) ? substitutions[0] : substitutions;
    const messages: Record<string, string> = {
      contextualHintManualTitle: '페이지 길이가 달라 보이나요?',
      contextualHintManualInstruction: `${value ?? 'Alt'}를 누른 채 이 탭만 스크롤해보세요.`,
      contextualHintManualResult: '손을 떼면 지금 차이가 유지돼요.',
      contextualHintPageChangeSyncedTitle: '다른 탭도 같은 페이지로 이동했어요',
      contextualHintPageChangeSyncedBody: '원하지 않으면 페이지 이동 동기화를 끌 수 있어요.',
      contextualHintNextTime: '다음에 보기',
      contextualHintHide: '이 안내 숨기기',
      contextualHintChangeSettings: '설정 바꾸기',
    };
    return messages[key] ?? key;
  },
}));

describe('ContextualHintOverlay', () => {
  it('renders manual adjustment copy with the provided shortcut label', () => {
    render(
      <ContextualHintOverlay
        hintId="manual-scroll-adjustment"
        shortcutLabel="⌥ Option"
        onAction={vi.fn()}
      />,
    );

    expect(screen.getByText('페이지 길이가 달라 보이나요?')).toBeInTheDocument();
    expect(screen.getByText('⌥ Option를 누른 채 이 탭만 스크롤해보세요.')).toBeInTheDocument();
    expect(screen.getByText('손을 떼면 지금 차이가 유지돼요.')).toBeInTheDocument();
  });

  it('temporary dismiss does not request permanent hide', () => {
    const onAction = vi.fn();
    render(
      <ContextualHintOverlay
        hintId="manual-scroll-adjustment"
        shortcutLabel="Alt"
        onAction={onAction}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '다음에 보기' }));

    expect(onAction).toHaveBeenCalledWith('dismiss-temporary');
  });

  it('permanent hide requests permanent dismissal', () => {
    const onAction = vi.fn();
    render(
      <ContextualHintOverlay
        hintId="manual-scroll-adjustment"
        shortcutLabel="Alt"
        onAction={onAction}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '이 안내 숨기기' }));

    expect(onAction).toHaveBeenCalledWith('hide-permanently');
  });

  it('settings hint exposes a direct settings action', () => {
    const onAction = vi.fn();
    render(<ContextualHintOverlay hintId="page-change-synced" onAction={onAction} />);

    fireEvent.click(screen.getByRole('button', { name: '설정 바꾸기' }));

    expect(onAction).toHaveBeenCalledWith('open-settings');
  });

  it('auto-dismisses without permanent hide', () => {
    vi.useFakeTimers();
    const onAction = vi.fn();
    render(
      <ContextualHintOverlay
        autoDismissMs={8000}
        hintId="manual-scroll-adjustment"
        shortcutLabel="Alt"
        onAction={onAction}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(8000);
    });

    expect(onAction).toHaveBeenCalledWith('dismiss-temporary');
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run the overlay component test and verify it fails**

Run:

```bash
pnpm vitest run src/contentScripts/components/contextual-hint-overlay.test.tsx
```

Expected: FAIL because the overlay component does not exist.

- [ ] **Step 3: Implement the overlay component**

Create `src/contentScripts/components/contextual-hint-overlay.tsx`:

```typescript
import * as React from 'react';

import { AnimatePresence, motion } from 'motion/react';

import { Button } from '~/shared/components/ui/button';
import { t } from '~/shared/i18n';
import {
  ANIMATION_DURATIONS,
  EASING_FUNCTIONS,
  getMotionTransition,
  prefersReducedMotion,
} from '~/shared/lib/animations';
import type { ContextualHintAction, ContextualHintId } from '~/shared/types/contextual-hints';

import IconInfo from '~icons/lucide/info';
import IconX from '~icons/lucide/x';

const DEFAULT_AUTO_DISMISS_MS = 9_000;

interface ContextualHintOverlayProps {
  hintId: ContextualHintId;
  shortcutLabel?: string;
  autoDismissMs?: number;
  onAction: (action: ContextualHintAction) => void;
}

function getHintCopy(hintId: ContextualHintId, shortcutLabel?: string) {
  if (hintId === 'manual-scroll-adjustment') {
    return {
      title: t('contextualHintManualTitle'),
      lines: [
        t('contextualHintManualInstruction', shortcutLabel ?? 'Alt 또는 Option'),
        t('contextualHintManualResult'),
      ],
      primaryAction: null,
    };
  }

  if (hintId === 'keep-website-path-synced') {
    return {
      title: t('contextualHintKeepWebsiteTitle'),
      lines: [t('contextualHintKeepWebsiteBody')],
      primaryAction: 'open-settings' as const,
    };
  }

  return {
    title: t('contextualHintPageChangeSyncedTitle'),
    lines: [t('contextualHintPageChangeSyncedBody')],
    primaryAction: 'open-settings' as const,
  };
}

export function ContextualHintOverlay({
  hintId,
  shortcutLabel,
  autoDismissMs = DEFAULT_AUTO_DISMISS_MS,
  onAction,
}: ContextualHintOverlayProps) {
  const [visible, setVisible] = React.useState(true);
  const reducedMotion = prefersReducedMotion();
  const copy = getHintCopy(hintId, shortcutLabel);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      onAction('dismiss-temporary');
    }, autoDismissMs);

    return () => {
      clearTimeout(timer);
    };
  }, [autoDismissMs, onAction]);

  const handleAction = React.useCallback(
    (action: ContextualHintAction) => {
      setVisible(false);
      onAction(action);
    },
    [onAction],
  );

  return (
    <AnimatePresence mode="wait">
      {visible && (
        <motion.div
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="fixed bottom-6 right-6 z-[2147483647] w-[320px] max-w-[calc(100vw-32px)] rounded-lg border border-border/60 bg-background/95 p-3 text-foreground shadow-2xl backdrop-blur-xl pointer-events-auto"
          exit={reducedMotion ? undefined : { opacity: 0, y: 16, scale: 0.96 }}
          initial={reducedMotion ? false : { opacity: 0, y: 16, scale: 0.96 }}
          transition={getMotionTransition(
            ANIMATION_DURATIONS.normal,
            EASING_FUNCTIONS.easeOutCubic,
          )}
        >
          <div className="flex items-start gap-2.5">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <IconInfo aria-hidden="true" className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-medium leading-snug">{copy.title}</h4>
              <div className="mt-1 space-y-0.5">
                {copy.lines.map((line) => (
                  <p key={line} className="text-xs leading-snug text-muted-foreground">
                    {line}
                  </p>
                ))}
              </div>
            </div>
            <button
              aria-label={t('dismiss')}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              type="button"
              onClick={() => handleAction('dismiss-temporary')}
            >
              <IconX aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 flex flex-wrap justify-end gap-2">
            {copy.primaryAction && (
              <Button size="sm" onClick={() => handleAction(copy.primaryAction)}>
                {t('contextualHintChangeSettings')}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleAction('dismiss-temporary')}
            >
              {t('contextualHintNextTime')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => handleAction('hide-permanently')}>
              {t('contextualHintHide')}
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 4: Export the component**

Append to `src/contentScripts/components/index.ts`:

```typescript
export { ContextualHintOverlay } from './contextual-hint-overlay';
```

- [ ] **Step 5: Implement the content-script hint root and session cooldown**

Create `src/contentScripts/contextual-hints.tsx`:

```typescript
import { createRoot } from 'react-dom/client';
import { onMessage } from 'webext-bridge/content-script';
import browser from 'webextension-polyfill';

import { ContextualHintOverlay } from './components';
import { getContextualHintShortcutLabel } from '~/shared/lib/contextual-hints';
import { ExtensionLogger } from '~/shared/lib/logger';
import {
  loadDismissedContextualHintIds,
  saveDismissedContextualHintId,
} from '~/shared/lib/storage';
import type {
  ContextualHintAction,
  ContextualHintId,
  ContextualHintShowMessage,
} from '~/shared/types/contextual-hints';

const logger = new ExtensionLogger({ scope: 'contextual-hints' });

let root: ReturnType<typeof createRoot> | null = null;
let container: HTMLDivElement | null = null;
let currentHint: ContextualHintShowMessage | null = null;
let handlersRegistered = false;
const sessionShownHintIds = new Set<ContextualHintId>();

function ensureContainer(): HTMLDivElement {
  const existing = document.querySelectorAll('#scroll-sync-contextual-hints-root');
  if (existing.length > 0 && !container) {
    existing.forEach((element) => element.remove());
  }

  if (container && document.body.contains(container)) {
    return container;
  }

  container = document.createElement('div');
  container.id = 'scroll-sync-contextual-hints-root';
  container.className = 'tailwind tailwind-no-preflight';
  container.setAttribute('style', 'all: revert;');
  document.body.appendChild(container);

  const shadowRoot = container.attachShadow({ mode: 'open' });
  const app = document.createElement('div');
  app.className = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  app.style.cssText = 'position: fixed; inset: 0; pointer-events: none; z-index: 2147483647;';
  shadowRoot.appendChild(app);

  const style = document.createElement('link');
  style.rel = 'stylesheet';
  style.href = browser.runtime.getURL('dist/contentScripts/synchronize-tab-scrolling.css');
  app.appendChild(style);

  const mount = document.createElement('div');
  mount.style.cssText = 'pointer-events: auto;';
  app.appendChild(mount);

  root = createRoot(mount);
  return container;
}

function renderCurrentHint(): void {
  if (!currentHint || !root) {
    root?.render(null);
    return;
  }

  root.render(
    <ContextualHintOverlay
      hintId={currentHint.hintId}
      shortcutLabel={getContextualHintShortcutLabel()}
      onAction={(action) => {
        handleHintAction(currentHint?.hintId ?? 'manual-scroll-adjustment', action);
      }}
    />,
  );
}

async function handleHintAction(hintId: ContextualHintId, action: ContextualHintAction) {
  currentHint = null;
  renderCurrentHint();

  if (action === 'hide-permanently') {
    await saveDismissedContextualHintId(hintId);
    return;
  }

  if (action === 'open-settings') {
    window.dispatchEvent(new CustomEvent('scroll-sync-open-url-sync-settings'));
  }
}

async function maybeShowHint(hint: ContextualHintShowMessage): Promise<void> {
  if (sessionShownHintIds.has(hint.hintId)) {
    return;
  }

  const dismissedHintIds = await loadDismissedContextualHintIds();
  if (dismissedHintIds === null || dismissedHintIds.has(hint.hintId)) {
    return;
  }

  ensureContainer();
  sessionShownHintIds.add(hint.hintId);
  currentHint = hint;
  renderCurrentHint();

  logger.info('Contextual hint shown', {
    hintId: hint.hintId,
    surface: hint.surface,
    source: hint.source,
  });
}

export function initContextualHints(): void {
  if (handlersRegistered) {
    return;
  }

  onMessage('contextual-hint:show', ({ data }) => {
    maybeShowHint(data).catch((error) => {
      logger.warn('Failed to show contextual hint', {
        hintId: data.hintId,
        error,
      });
    });
  });

  handlersRegistered = true;
}
```

- [ ] **Step 6: Initialize contextual hints in the content script entry**

Modify `src/contentScripts/index.ts`:

```typescript
import '~/shared/styles';
import { initContextualHints } from './contextual-hints';
import { initScrollSync } from './scroll-sync';

(() => {
  initContextualHints();
  initScrollSync();
})();
```

- [ ] **Step 7: Run focused tests and typecheck**

Run:

```bash
pnpm vitest run src/contentScripts/components/contextual-hint-overlay.test.tsx src/shared/lib/storage.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit overlay surface**

```bash
git add src/contentScripts/components/contextual-hint-overlay.tsx src/contentScripts/components/contextual-hint-overlay.test.tsx src/contentScripts/contextual-hints.tsx src/contentScripts/components/index.ts src/contentScripts/index.ts
git commit -m "feat: show contextual hint overlays"
```

## Task 5: URL Sync Setting CTA And Post-Navigation Hints

**Files:**

- Modify: `src/shared/components/url-sync-settings.tsx`
- Modify: `src/shared/components/url-sync-settings.test.tsx`
- Modify: `src/contentScripts/components/sync-control-panel.tsx`
- Modify: `src/contentScripts/panel.tsx`
- Modify: `src/contentScripts/scroll-sync.ts`
- Modify: `src/__tests__/scenarios.test.ts`

- [ ] **Step 1: Add failing URL Sync expansion test**

In `src/shared/components/url-sync-settings.test.tsx`, add:

```typescript
it('expands the inline editor when expandToken changes', () => {
  const { rerender } = render(
    <UrlSyncSettings
      enabled
      expandToken={0}
      mode="follow-changed-tab"
      variant="inline-collapsible"
      onEnabledChange={vi.fn()}
      onModeChange={vi.fn()}
    />,
  );

  expect(screen.queryByRole('radio', { name: /Follow changed tab/ })).not.toBeInTheDocument();

  rerender(
    <UrlSyncSettings
      enabled
      expandToken={1}
      mode="follow-changed-tab"
      variant="inline-collapsible"
      onEnabledChange={vi.fn()}
      onModeChange={vi.fn()}
    />,
  );

  expect(screen.getByRole('radio', { name: /Follow changed tab/ })).toBeInTheDocument();
});
```

- [ ] **Step 2: Add `expandToken` to UrlSyncSettings**

In `src/shared/components/url-sync-settings.tsx`, add to props:

```typescript
expandToken?: number;
```

Destructure it with a default:

```typescript
expandToken = 0,
```

Add this effect after `inlineEditorExpanded` state:

```typescript
React.useEffect(() => {
  if (isInlineCollapsible && expandToken > 0) {
    setInlineEditorExpanded(true);
  }
}, [expandToken, isInlineCollapsible]);
```

- [ ] **Step 3: Wire panel open token to SyncControlPanel**

In `src/contentScripts/components/sync-control-panel.tsx`, add prop:

```typescript
openUrlSyncSettingsToken?: number;
```

Pass it into `UrlSyncSettings`:

```tsx
<UrlSyncSettings
  compact
  enabled={urlSyncEnabled}
  expandToken={openUrlSyncSettingsToken}
  mode={urlSyncMode}
  notice={urlSyncNotice}
  onEnabledChange={onUrlSyncEnabledChange}
  onModeChange={onUrlSyncModeChange}
/>
```

Add this effect after `handleTriggerMouseDown`:

```typescript
React.useEffect(() => {
  if ((openUrlSyncSettingsToken ?? 0) > 0) {
    handleOpenChange(true);
  }
}, [handleOpenChange, openUrlSyncSettingsToken]);
```

- [ ] **Step 4: Listen for overlay setting CTA in panel app**

In `src/contentScripts/panel.tsx`, add state:

```typescript
const [openUrlSyncSettingsToken, setOpenUrlSyncSettingsToken] = useState(0);
```

Add effect:

```typescript
useEffect(() => {
  const handleOpenUrlSyncSettings = () => {
    setOpenUrlSyncSettingsToken((value) => value + 1);
  };

  window.addEventListener('scroll-sync-open-url-sync-settings', handleOpenUrlSyncSettings);
  return () => {
    window.removeEventListener('scroll-sync-open-url-sync-settings', handleOpenUrlSyncSettings);
  };
}, []);
```

Pass the token:

```tsx
<SyncControlPanel
  isConnectionHealthy={isConnectionHealthy}
  openUrlSyncSettingsToken={openUrlSyncSettingsToken}
  urlSyncEnabled={urlSyncEnabled}
  urlSyncMode={urlSyncMode}
  urlSyncNotice={urlSyncNotice}
  onReconnect={handleManualReconnect}
  onUrlSyncEnabledChange={handleUrlSyncEnabledChange}
  onUrlSyncModeChange={handleUrlSyncModeChange}
/>
```

- [ ] **Step 5: Queue URL Sync hints across navigation**

In `src/contentScripts/scroll-sync.ts`, add helpers near URL sync helpers:

```typescript
const PENDING_CONTEXTUAL_HINT_KEY = 'scrollSyncPendingContextualHint';

function savePendingContextualHint(hintId: 'page-change-synced' | 'keep-website-path-synced') {
  try {
    sessionStorage.setItem(PENDING_CONTEXTUAL_HINT_KEY, hintId);
  } catch (error) {
    logger.warn('Failed to save pending contextual hint', { hintId, error });
  }
}

function emitPendingContextualHint() {
  try {
    const hintId = sessionStorage.getItem(PENDING_CONTEXTUAL_HINT_KEY);
    if (hintId !== 'page-change-synced' && hintId !== 'keep-website-path-synced') {
      return;
    }

    sessionStorage.removeItem(PENDING_CONTEXTUAL_HINT_KEY);
    window.dispatchEvent(
      new CustomEvent('scroll-sync-contextual-hint', {
        detail: {
          hintId,
          surface: 'webpage-overlay',
          source: 'url-sync',
        },
      }),
    );
  } catch (error) {
    logger.warn('Failed to emit pending contextual hint', { error });
  }
}
```

In `initScrollSync()`, call this after `translated-page:get-metadata` registration:

```typescript
emitPendingContextualHint();
```

Before `navigateToUrl(resolution.url);`, add:

```typescript
savePendingContextualHint(
  modeRepairResult.mode === 'keep-each-tabs-website'
    ? 'keep-website-path-synced'
    : 'page-change-synced',
);
```

In `src/contentScripts/contextual-hints.tsx`, register the CustomEvent:

```typescript
window.addEventListener('scroll-sync-contextual-hint', (event) => {
  if (!(event instanceof CustomEvent)) {
    return;
  }

  maybeShowHint(event.detail).catch((error) => {
    logger.warn('Failed to show contextual hint from event', { error });
  });
});
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
pnpm vitest run src/shared/components/url-sync-settings.test.tsx src/__tests__/scenarios.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit URL Sync settings CTA**

```bash
git add src/shared/components/url-sync-settings.tsx src/shared/components/url-sync-settings.test.tsx src/contentScripts/components/sync-control-panel.tsx src/contentScripts/panel.tsx src/contentScripts/scroll-sync.ts src/contentScripts/contextual-hints.tsx src/__tests__/scenarios.test.ts
git commit -m "feat: open page sync settings from hints"
```

## Task 6: Existing Toast Copy, i18n, And Final Validation

**Files:**

- Modify: `src/contentScripts/components/sync-suggestion-toast.tsx`
- Modify: locale files listed in File Structure
- Modify: `src/contentScripts/components/contextual-hint-overlay.test.tsx`

- [ ] **Step 1: Update add-tab toast copy and remove raw URL/title display**

In `src/contentScripts/components/sync-suggestion-toast.tsx`, remove
`formatTitleWithKoreanJosa` import and delete `titleWithSubjectJosa`.

Change `getAddTabSuggestionTitleKey` to:

```typescript
function getAddTabSuggestionTitleKey(): Parameters<typeof t>[0] {
  return 'addCurrentTabToSyncTitle';
}
```

Replace the add-tab text block with:

```tsx
<div className="flex-1 min-w-0 pointer-events-none">
  <h4 className="font-medium text-sm text-foreground">{t(getAddTabSuggestionTitleKey())}</h4>
  <p className="mt-1 text-xs text-muted-foreground">{t('addCurrentTabToSyncBody')}</p>
  {suggestion.hasManualOffsets && (
    <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
      {t('warningResetScrollOffsets')}
    </p>
  )}
</div>
```

Change the add button to keep using `addTabButton`, and change skip copy through i18n.

- [ ] **Step 2: Add contextual hint i18n keys**

Add these English messages to both English locale files:

```json
{
  "contextualHintManualTitle": { "message": "Do the pages look different in length?" },
  "contextualHintManualInstruction": {
    "message": "Hold $KEY$ and scroll only this tab.",
    "placeholders": { "key": { "content": "$1", "example": "Alt" } }
  },
  "contextualHintManualResult": { "message": "When you let go, this difference stays in sync." },
  "contextualHintPageChangeSyncedTitle": {
    "message": "Other tabs moved to the same page"
  },
  "contextualHintPageChangeSyncedBody": {
    "message": "You can turn off page change sync if you do not want this."
  },
  "contextualHintKeepWebsiteTitle": { "message": "Each tab kept its own site" },
  "contextualHintKeepWebsiteBody": { "message": "Only the matching path was synced." },
  "contextualHintNextTime": { "message": "Show later" },
  "contextualHintHide": { "message": "Hide this hint" },
  "contextualHintChangeSettings": { "message": "Change setting" },
  "addCurrentTabToSyncTitle": { "message": "Add this tab to the current sync?" },
  "addCurrentTabToSyncBody": {
    "message": "After you add it, this tab scrolls with the tabs already syncing."
  }
}
```

Add these Korean messages to both Korean locale files:

```json
{
  "contextualHintManualTitle": { "message": "페이지 길이가 달라 보이나요?" },
  "contextualHintManualInstruction": {
    "message": "$KEY$를 누른 채 이 탭만 스크롤해보세요.",
    "placeholders": { "key": { "content": "$1", "example": "Alt" } }
  },
  "contextualHintManualResult": { "message": "손을 떼면 지금 차이가 유지돼요." },
  "contextualHintPageChangeSyncedTitle": {
    "message": "다른 탭도 같은 페이지로 이동했어요"
  },
  "contextualHintPageChangeSyncedBody": {
    "message": "원하지 않으면 페이지 이동 동기화를 끌 수 있어요."
  },
  "contextualHintKeepWebsiteTitle": { "message": "각 탭의 사이트를 유지했어요" },
  "contextualHintKeepWebsiteBody": { "message": "가능한 같은 경로로만 이동했어요." },
  "contextualHintNextTime": { "message": "다음에 보기" },
  "contextualHintHide": { "message": "이 안내 숨기기" },
  "contextualHintChangeSettings": { "message": "설정 바꾸기" },
  "addCurrentTabToSyncTitle": { "message": "현재 동기화에 이 탭을 추가할까요?" },
  "addCurrentTabToSyncBody": {
    "message": "추가하면 이 탭도 지금 동기화 중인 탭들과 함께 스크롤돼요."
  }
}
```

For `de`, `es`, `fr`, `hi`, `ja`, `zh`, `zh_CN`, and `zh_TW`, add the same keys with the exact
English messages from the English block in this task. This keeps key parity deterministic for this
feature plan and avoids adding unreviewed machine translations.

- [ ] **Step 3: Update existing button and warning copy**

Update these keys in both locale trees:

English:

```json
{
  "addTabButton": { "message": "Add to sync" },
  "skipButton": { "message": "Do later" },
  "warningResetScrollOffsets": {
    "message": "Adding this tab resets scroll differences you adjusted."
  }
}
```

Korean:

```json
{
  "addTabButton": { "message": "동기화에 추가하기" },
  "skipButton": { "message": "다음에 하기" },
  "warningResetScrollOffsets": {
    "message": "추가하면 조정한 스크롤 차이는 초기화돼요."
  }
}
```

For other locales, keep the existing meaning and use concrete action labels. Do not use generic
`OK`, `Cancel`, `Confirm`, or `Dismiss`.

- [ ] **Step 4: Run validation**

Run:

```bash
pnpm i18n:validate
pnpm privacy:logging
pnpm vitest run src/contentScripts/components/contextual-hint-overlay.test.tsx src/shared/lib/contextual-hints.test.ts src/shared/lib/storage.test.ts src/background/handlers/scroll-sync-handlers.test.ts src/shared/components/url-sync-settings.test.tsx
pnpm typecheck
```

Expected: all commands PASS.

- [ ] **Step 5: Commit copy and validation changes**

```bash
git add src/contentScripts/components/sync-suggestion-toast.tsx extension/_locales src/shared/i18n/_locales src/contentScripts/components/contextual-hint-overlay.test.tsx
git commit -m "fix(i18n): clarify contextual hint copy"
```

## Final Verification

- [ ] **Step 1: Run full health checks**

Run:

```bash
pnpm health
pnpm test
```

Expected: both commands PASS.

- [ ] **Step 2: Search privacy-sensitive terms before completion**

Run:

```bash
rg -n "logger|url|Url|URL|tab.url|window.location.href|payload|normalizedUrl|sourceUrl|targetUrl" src/contentScripts src/background src/shared
pnpm privacy:logging
```

Expected: no new raw URL/title logging from contextual hints; `pnpm privacy:logging` PASS.

- [ ] **Step 3: Review commit history**

Run:

```bash
git log --oneline origin/main..HEAD
git status
```

Expected: feature commits are atomic and working tree is clean.
