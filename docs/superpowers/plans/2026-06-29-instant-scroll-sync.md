# Instant Scroll Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make receiver-side scroll sync bypass page-defined smooth scrolling and apply only the latest pending target per animation frame.

**Architecture:** Add a focused content-script helper module for instant programmatic scrolling and latest-wins scheduling. Keep DOM style overrides scoped to extension-origin sync operations, then integrate the helper into `scroll-sync.ts` without changing URL sync, manual offset storage, or background relay behavior.

**Tech Stack:** React 19 content scripts, TypeScript, Vitest with jsdom, webext-bridge, existing `~/` alias.

---

## File Structure

- Create: `src/contentScripts/lib/instant-programmatic-scroll.ts`
  - Owns instant scroll application and latest-wins scheduling.
  - Exposes small functions that are easy to unit test without importing the full content script.
- Create: `src/contentScripts/lib/instant-programmatic-scroll.test.ts`
  - Covers smooth-scroll bypass, style restoration, fallback behavior, non-finite targets, and scheduler latest-wins semantics.
- Modify: `src/contentScripts/scroll-sync.ts`
  - Imports the new helper.
  - Replaces receiver-side direct `window.scrollTo({ behavior: 'auto' })` calls with a single scheduled instant-scroll path.
  - Cancels pending scheduled receiver scrolls during sync restart, sync stop, and manual mode activation.
- Modify: `docs/guides/scroll-sync-pipeline.md`
  - Updates the receiver pipeline to describe rAF latest-wins and instant scroll behavior.
- Modify: `docs/guides/known-pitfalls.md`
  - Adds a pitfall note: page CSS `scroll-behavior: smooth` must not affect extension-driven sync scrolls.

## Task 1: Instant Scroll Helper

**Files:**

- Create: `src/contentScripts/lib/instant-programmatic-scroll.test.ts`
- Create: `src/contentScripts/lib/instant-programmatic-scroll.ts`

- [ ] **Step 1: Write failing tests for instant scroll application**

Create `src/contentScripts/lib/instant-programmatic-scroll.test.ts` with these tests:

```typescript
import { afterEach, describe, expect, it, vi } from 'vitest';

import { applyInstantProgrammaticScroll } from './instant-programmatic-scroll';

describe('applyInstantProgrammaticScroll', () => {
  afterEach(() => {
    document.documentElement.style.scrollBehavior = '';
    document.documentElement.scrollTop = 0;
    document.body.innerHTML = '';
    document.body.style.scrollBehavior = '';
    vi.restoreAllMocks();
  });

  it('temporarily forces root scroll behavior to auto and restores the inline value', () => {
    document.documentElement.style.scrollBehavior = 'smooth';

    const applied = applyInstantProgrammaticScroll(420);

    expect(applied).toBe(true);
    expect(document.documentElement.scrollTop).toBe(420);
    expect(document.documentElement.style.scrollBehavior).toBe('smooth');
  });

  it('restores an empty root scroll behavior value after applying the scroll', () => {
    document.documentElement.style.scrollBehavior = '';

    const applied = applyInstantProgrammaticScroll(240);

    expect(applied).toBe(true);
    expect(document.documentElement.scrollTop).toBe(240);
    expect(document.documentElement.style.scrollBehavior).toBe('');
  });

  it('temporarily overrides and restores body scroll behavior when body is not the root', () => {
    document.documentElement.style.scrollBehavior = 'smooth';
    document.body.style.scrollBehavior = 'smooth';

    const applied = applyInstantProgrammaticScroll(360);

    expect(applied).toBe(true);
    expect(document.documentElement.scrollTop).toBe(360);
    expect(document.documentElement.style.scrollBehavior).toBe('smooth');
    expect(document.body.style.scrollBehavior).toBe('smooth');
  });

  it('falls back to window.scrollTo when root assignment does not move the page', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const originalDescriptor = Object.getOwnPropertyDescriptor(
      document.documentElement,
      'scrollTop',
    );

    Object.defineProperty(document.documentElement, 'scrollTop', {
      configurable: true,
      get: () => 0,
      set: () => {},
    });

    const applied = applyInstantProgrammaticScroll(500);

    expect(applied).toBe(true);
    expect(scrollTo).toHaveBeenCalledWith(0, 500);

    if (originalDescriptor) {
      Object.defineProperty(document.documentElement, 'scrollTop', originalDescriptor);
    } else {
      Object.defineProperty(document.documentElement, 'scrollTop', {
        configurable: true,
        writable: true,
        value: 0,
      });
    }
  });

  it('does not apply non-finite scroll targets', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

    expect(applyInstantProgrammaticScroll(Number.NaN)).toBe(false);
    expect(applyInstantProgrammaticScroll(Number.POSITIVE_INFINITY)).toBe(false);
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm vitest run src/contentScripts/lib/instant-programmatic-scroll.test.ts
```

Expected: FAIL because `src/contentScripts/lib/instant-programmatic-scroll.ts` does not exist.

- [ ] **Step 3: Implement the instant scroll helper**

Create `src/contentScripts/lib/instant-programmatic-scroll.ts`:

```typescript
interface ScrollBehaviorSnapshot {
  element: HTMLElement;
  scrollBehavior: string;
}

function isHTMLElement(element: Element | null, documentRef: Document): element is HTMLElement {
  const HTMLElementConstructor = documentRef.defaultView?.HTMLElement;
  return Boolean(HTMLElementConstructor && element instanceof HTMLElementConstructor);
}

function getScrollRoot(documentRef: Document): HTMLElement {
  const scrollingElement = documentRef.scrollingElement;
  if (isHTMLElement(scrollingElement, documentRef)) {
    return scrollingElement;
  }

  return documentRef.documentElement;
}

function collectScrollBehaviorSnapshots(
  documentRef: Document,
  scrollRoot: HTMLElement,
): Array<ScrollBehaviorSnapshot> {
  const snapshots: Array<ScrollBehaviorSnapshot> = [
    {
      element: scrollRoot,
      scrollBehavior: scrollRoot.style.scrollBehavior,
    },
  ];

  if (documentRef.body && documentRef.body !== scrollRoot) {
    snapshots.push({
      element: documentRef.body,
      scrollBehavior: documentRef.body.style.scrollBehavior,
    });
  }

  return snapshots;
}

function forceAutoScrollBehavior(snapshots: ReadonlyArray<ScrollBehaviorSnapshot>): void {
  snapshots.forEach(({ element }) => {
    element.style.scrollBehavior = 'auto';
  });
}

function restoreScrollBehavior(snapshots: ReadonlyArray<ScrollBehaviorSnapshot>): void {
  snapshots.forEach(({ element, scrollBehavior }) => {
    element.style.scrollBehavior = scrollBehavior;
  });
}

export function applyInstantProgrammaticScroll(
  top: number,
  documentRef: Document = document,
  windowRef: Window = window,
): boolean {
  if (!Number.isFinite(top)) {
    return false;
  }

  const scrollRoot = getScrollRoot(documentRef);
  const snapshots = collectScrollBehaviorSnapshots(documentRef, scrollRoot);
  const previousScrollTop = scrollRoot.scrollTop;

  forceAutoScrollBehavior(snapshots);

  try {
    scrollRoot.scrollTop = top;

    if (scrollRoot.scrollTop === previousScrollTop && previousScrollTop !== top) {
      windowRef.scrollTo(0, top);
    }

    return true;
  } finally {
    restoreScrollBehavior(snapshots);
  }
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
pnpm vitest run src/contentScripts/lib/instant-programmatic-scroll.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the helper**

```bash
git add src/contentScripts/lib/instant-programmatic-scroll.ts src/contentScripts/lib/instant-programmatic-scroll.test.ts
git commit -m "fix: add instant programmatic scroll helper"
```

## Task 2: Latest-Wins Scheduler

**Files:**

- Modify: `src/contentScripts/lib/instant-programmatic-scroll.test.ts`
- Modify: `src/contentScripts/lib/instant-programmatic-scroll.ts`

- [ ] **Step 1: Add failing scheduler tests**

First, update the helper import at the top of
`src/contentScripts/lib/instant-programmatic-scroll.test.ts`:

```typescript
import {
  applyInstantProgrammaticScroll,
  createLatestProgrammaticScrollScheduler,
} from './instant-programmatic-scroll';
```

Then append this harness and test block after the existing
`describe('applyInstantProgrammaticScroll', ...)` block:

```typescript
interface ScheduledFrame {
  id: number;
  callback: FrameRequestCallback;
}

function createFrameHarness() {
  const frames: Array<ScheduledFrame> = [];
  let nextFrameId = 1;

  return {
    frames,
    requestFrame: vi.fn((callback: FrameRequestCallback) => {
      const id = nextFrameId;
      nextFrameId += 1;
      frames.push({ id, callback });
      return id;
    }),
    cancelFrame: vi.fn((id: number) => {
      const index = frames.findIndex((frame) => frame.id === id);
      if (index >= 0) {
        frames.splice(index, 1);
      }
    }),
    flushNextFrame() {
      const frame = frames.shift();
      if (frame) {
        frame.callback(16);
      }
    },
  };
}

describe('createLatestProgrammaticScrollScheduler', () => {
  it('applies only the latest target scheduled before the frame runs', () => {
    const frameHarness = createFrameHarness();
    const apply = vi.fn();
    const scheduler = createLatestProgrammaticScrollScheduler({
      requestFrame: frameHarness.requestFrame,
      cancelFrame: frameHarness.cancelFrame,
      apply,
    });

    scheduler.schedule({ top: 100, mode: 'ratio', sourceTabId: 1 });
    scheduler.schedule({ top: 200, mode: 'ratio', sourceTabId: 1 });
    scheduler.schedule({ top: 300, mode: 'ratio', sourceTabId: 1 });

    expect(frameHarness.requestFrame).toHaveBeenCalledTimes(1);

    frameHarness.flushNextFrame();

    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith({ top: 300, mode: 'ratio', sourceTabId: 1 });
  });

  it('schedules a new frame after the pending frame has flushed', () => {
    const frameHarness = createFrameHarness();
    const apply = vi.fn();
    const scheduler = createLatestProgrammaticScrollScheduler({
      requestFrame: frameHarness.requestFrame,
      cancelFrame: frameHarness.cancelFrame,
      apply,
    });

    scheduler.schedule({ top: 100, mode: 'ratio', sourceTabId: 1 });
    frameHarness.flushNextFrame();
    scheduler.schedule({ top: 400, mode: 'element', sourceTabId: 2 });
    frameHarness.flushNextFrame();

    expect(frameHarness.requestFrame).toHaveBeenCalledTimes(2);
    expect(apply).toHaveBeenNthCalledWith(1, { top: 100, mode: 'ratio', sourceTabId: 1 });
    expect(apply).toHaveBeenNthCalledWith(2, { top: 400, mode: 'element', sourceTabId: 2 });
  });

  it('cancels the pending frame and clears the latest target', () => {
    const frameHarness = createFrameHarness();
    const apply = vi.fn();
    const scheduler = createLatestProgrammaticScrollScheduler({
      requestFrame: frameHarness.requestFrame,
      cancelFrame: frameHarness.cancelFrame,
      apply,
    });

    scheduler.schedule({ top: 100, mode: 'ratio', sourceTabId: 1 });
    scheduler.cancel();
    frameHarness.flushNextFrame();

    expect(frameHarness.cancelFrame).toHaveBeenCalledWith(1);
    expect(apply).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm vitest run src/contentScripts/lib/instant-programmatic-scroll.test.ts
```

Expected: FAIL because `createLatestProgrammaticScrollScheduler` is not exported.

- [ ] **Step 3: Implement the scheduler**

First, add this type import at the top of
`src/contentScripts/lib/instant-programmatic-scroll.ts`:

```typescript
import type { SyncMode } from '~/shared/types/messages';
```

Then append this code below `applyInstantProgrammaticScroll()`:

```typescript
export interface ProgrammaticScrollTarget {
  top: number;
  mode: SyncMode;
  sourceTabId: number;
}

export interface LatestProgrammaticScrollScheduler {
  schedule: (target: ProgrammaticScrollTarget) => void;
  cancel: () => void;
}

interface LatestProgrammaticScrollSchedulerOptions {
  requestFrame: (callback: FrameRequestCallback) => number;
  cancelFrame: (frameId: number) => void;
  apply: (target: ProgrammaticScrollTarget) => void;
}

export function createLatestProgrammaticScrollScheduler({
  requestFrame,
  cancelFrame,
  apply,
}: LatestProgrammaticScrollSchedulerOptions): LatestProgrammaticScrollScheduler {
  let pendingTarget: ProgrammaticScrollTarget | null = null;
  let pendingFrameId: number | null = null;

  function flushPendingTarget(): void {
    pendingFrameId = null;

    const target = pendingTarget;
    pendingTarget = null;

    if (!target) {
      return;
    }

    apply(target);
  }

  return {
    schedule(target) {
      pendingTarget = target;

      if (pendingFrameId !== null) {
        return;
      }

      pendingFrameId = requestFrame(flushPendingTarget);
    },
    cancel() {
      pendingTarget = null;

      if (pendingFrameId === null) {
        return;
      }

      cancelFrame(pendingFrameId);
      pendingFrameId = null;
    },
  };
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
pnpm vitest run src/contentScripts/lib/instant-programmatic-scroll.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the scheduler**

```bash
git add src/contentScripts/lib/instant-programmatic-scroll.ts src/contentScripts/lib/instant-programmatic-scroll.test.ts
git commit -m "fix: coalesce programmatic scroll targets"
```

## Task 3: Scroll Sync Integration

**Files:**

- Modify: `src/contentScripts/scroll-sync.ts`

- [ ] **Step 1: Import the helper and scheduler**

Modify the import section of `src/contentScripts/scroll-sync.ts`:

```typescript
import {
  applyInstantProgrammaticScroll,
  createLatestProgrammaticScrollScheduler,
  type ProgrammaticScrollTarget,
} from './lib/instant-programmatic-scroll';
```

Place it with the other relative imports after `./keyboard-handler`.

- [ ] **Step 2: Add the scheduled apply path near module state**

Add this near the existing module state declarations after `let cachedManualOffset`:

```typescript
const programmaticScrollScheduler = createLatestProgrammaticScrollScheduler({
  requestFrame: (callback) => window.requestAnimationFrame(callback),
  cancelFrame: (frameId) => window.cancelAnimationFrame(frameId),
  apply: applyScheduledProgrammaticScroll,
});

function applyScheduledProgrammaticScroll(target: ProgrammaticScrollTarget): void {
  if (!syncState.isActive || syncState.isManualScrollEnabled) {
    return;
  }

  syncState.lastProgrammaticScrollTime = Date.now();
  const applied = applyInstantProgrammaticScroll(target.top);

  logger.debug('Applied scheduled scroll sync', {
    sourceTabId: target.sourceTabId,
    mode: target.mode,
    applied,
  });
}

function scheduleProgrammaticScroll(target: ProgrammaticScrollTarget): void {
  programmaticScrollScheduler.schedule(target);
}

function cancelPendingProgrammaticScroll(): void {
  programmaticScrollScheduler.cancel();
}
```

- [ ] **Step 3: Cancel pending receiver scrolls during sync reset and stop**

In the `scroll:start` handler, inside the `if (syncState.isActive)` cleanup branch, add:

```typescript
cancelPendingProgrammaticScroll();
```

Also add it before resetting state for the new sync session:

```typescript
cancelPendingProgrammaticScroll();
```

In the `scroll:stop` handler, add this before removing listeners:

```typescript
cancelPendingProgrammaticScroll();
```

- [ ] **Step 4: Replace direct receiver scroll application**

In the `scroll:sync` handler, replace the direct `window.scrollTo` block with this target selection
and scheduling:

```typescript
let nextScrollTop = clampedScrollTop;

if (payload.mode === 'element') {
  const nearest = findNearestElement();
  if (nearest) {
    const elements = findSemanticElements();
    if (nearest.index < elements.length) {
      nextScrollTop = elements[nearest.index].scrollTop;
    }
  }
}

scheduleProgrammaticScroll({
  top: nextScrollTop,
  mode: payload.mode,
  sourceTabId: payload.sourceTabId,
});
```

Remove the old `syncState.lastProgrammaticScrollTime = Date.now();` line from the handler because
the scheduled apply function now sets it immediately before the actual programmatic scroll.

- [ ] **Step 5: Cancel pending receiver scrolls when manual mode starts**

In the `scroll:manual` handler, after the baseline snapshot for `payload.enabled`, add:

```typescript
cancelPendingProgrammaticScroll();
```

Keep the existing `syncState.isManualScrollEnabled = payload.enabled;` assignment.

- [ ] **Step 6: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit the integration**

```bash
git add src/contentScripts/scroll-sync.ts
git commit -m "fix: schedule instant scroll sync targets"
```

## Task 4: Documentation and Verification

**Files:**

- Modify: `docs/guides/scroll-sync-pipeline.md`
- Modify: `docs/guides/known-pitfalls.md`

- [ ] **Step 1: Update the pipeline guide**

In `docs/guides/scroll-sync-pipeline.md`, update the receiver section to describe:

```text
├─ targetRatio = sourceRatio + offsetRatio
├─ pixel 변환 & clamp
├─ latest pending target으로 저장
├─ requestAnimationFrame에서 최신 target만 적용
├─ lastProgrammaticScrollTime = Date.now()
└─ scroll-behavior를 auto로 임시 우회 후 즉시 scrollTop 적용
```

Also add one paragraph below the diagram:

```markdown
수신 탭은 페이지 CSS의 `scroll-behavior: smooth`가 동기화 스크롤에 적용되지 않도록
프로그램 스크롤을 적용하는 짧은 구간에만 scroll root의 inline `scrollBehavior`를
`auto`로 바꾼 뒤 즉시 복원합니다. 빠른 연속 메시지는 `requestAnimationFrame` 단위로
최신 target만 적용해 오래된 위치를 순차 재생하지 않습니다.
```

- [ ] **Step 2: Add a known pitfall for page smooth scrolling**

In `docs/guides/known-pitfalls.md`, add a new pitfall before the code review checklist:

```markdown
## Pitfall 10: 페이지 `scroll-behavior: smooth`가 동기화 스크롤을 애니메이션화

### 규칙

> 확장이 적용하는 프로그램 스크롤은 페이지 CSS의 smooth scrolling을 우회해야 합니다.

### 배경

MDN 같은 문서 페이지는 `html { scroll-behavior: smooth; }`를 설정합니다.
수신 탭에서 `window.scrollTo({ top, behavior: 'auto' })`만 호출하면 브라우저가
computed `scroll-behavior`를 따라 부드러운 스크롤 애니메이션을 실행할 수 있습니다.
이 경우 수신 탭이 오래된 위치를 천천히 따라가고, 발신 탭도 되튕기거나 멈춘 것처럼
보일 수 있습니다.

### 적용 원칙

- 동기화 수신 경로는 `applyInstantProgrammaticScroll()`을 사용합니다.
- 수신 메시지는 frame당 최신 target 하나만 적용합니다.
- 페이지의 smooth scrolling을 동기화 기간 전체에서 끄지 말고, 프로그램 스크롤 적용
  순간에만 짧게 우회합니다.
- 사용자 anchor navigation이나 페이지 자체 스크롤 UX를 전역으로 변경하지 않습니다.
```

- [ ] **Step 3: Run focused and project checks**

Run:

```bash
pnpm vitest run src/contentScripts/lib/instant-programmatic-scroll.test.ts
pnpm typecheck
pnpm test
pnpm i18n:validate
pnpm privacy:logging
```

Expected: all commands PASS.

- [ ] **Step 4: Manual QA**

Use a local extension build or browser run:

```bash
pnpm build
pnpm start:chromium
```

Verify:

- Sync MDN Korean `Object.assign()` with MDN English `Object.assign()`.
- Scroll either tab quickly with trackpad or wheel.
- Receiver should jump to the latest position without visible smooth catch-up.
- Source tab should stay scrollable while receiver updates.
- Sync Naver with another eligible page and confirm no new jitter.
- Enter and exit manual offset mode and confirm offsets still apply.

- [ ] **Step 5: Commit docs and verification notes**

```bash
git add docs/guides/scroll-sync-pipeline.md docs/guides/known-pitfalls.md
git commit -m "docs: document instant scroll sync pipeline"
```

## Final Verification

- [ ] Run:

```bash
git status
git log --oneline main..HEAD
```

- [ ] Confirm the branch has these implementation commits after the design and plan docs:

```text
fix: add instant programmatic scroll helper
fix: coalesce programmatic scroll targets
fix: schedule instant scroll sync targets
docs: document instant scroll sync pipeline
```

- [ ] Open a PR against `main` with assignee `jaem1n207`.
