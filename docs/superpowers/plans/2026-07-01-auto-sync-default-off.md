# Auto-Sync Default Off Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make same-page tab suggestions opt-in by treating a missing or unreadable
`autoSyncEnabled` preference as disabled.

**Architecture:** Keep the change at the shared storage boundary. The background lifecycle and popup
already consume `loadAutoSyncEnabled()` and already skip auto-sync initialization when it returns
`false`, so implementation only changes the loader contract and its unit tests.

**Tech Stack:** TypeScript, Vitest, webextension-polyfill storage mocks, pnpm, existing
`src/shared/lib/storage.ts` utilities.

---

## File Structure

- Modify: `src/shared/lib/storage.test.ts`
  - Responsibility: prove the stored preference contract for `loadAutoSyncEnabled()`.
- Modify: `src/shared/lib/storage.ts`
  - Responsibility: load and default the `autoSyncEnabled` preference.
- No changes: background lifecycle, popup hook, popup menu, i18n, content scripts, landing, release,
  deploy, or store-stats workflows.

## Task 1: Update The Storage Preference Tests

**Files:**

- Modify: `src/shared/lib/storage.test.ts`

- [ ] **Step 1: Replace the `loadAutoSyncEnabled` test block with the default-off contract**

Replace the existing `describe('loadAutoSyncEnabled', () => { ... });` block in
`src/shared/lib/storage.test.ts` with:

```typescript
describe('loadAutoSyncEnabled', () => {
  it('returns false by default when key is undefined', async () => {
    storageGetMock.mockResolvedValue({});

    await expect(loadAutoSyncEnabled()).resolves.toBe(false);
    expect(storageGetMock).toHaveBeenCalledWith('autoSyncEnabled');
  });

  it('returns explicitly stored false value', async () => {
    storageGetMock.mockResolvedValue({ autoSyncEnabled: false });

    await expect(loadAutoSyncEnabled()).resolves.toBe(false);
  });

  it('returns explicitly stored true value', async () => {
    storageGetMock.mockResolvedValue({ autoSyncEnabled: true });

    await expect(loadAutoSyncEnabled()).resolves.toBe(true);
  });

  it('returns false and logs error when load fails', async () => {
    const error = new Error('get failed');
    storageGetMock.mockRejectedValue(error);

    await expect(loadAutoSyncEnabled()).resolves.toBe(false);
    expect(loggerErrorMock).toHaveBeenCalledWith('Failed to load auto-sync enabled state:', error);
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails for the expected reason**

Run:

```bash
pnpm test -- src/shared/lib/storage.test.ts -t loadAutoSyncEnabled
```

Expected: FAIL. The missing-key and read-failure tests fail because the current implementation still
returns `true`.

Expected failure shape:

```text
expected true to be false
```

- [ ] **Step 3: Commit the failing tests only**

Run:

```bash
git add src/shared/lib/storage.test.ts
git commit -m "test: expect auto-sync suggestions to default off"
```

## Task 2: Implement The Default-Off Loader

**Files:**

- Modify: `src/shared/lib/storage.ts`
- Test: `src/shared/lib/storage.test.ts`

- [ ] **Step 1: Update the loader doc comment and fallback values**

Replace the current `loadAutoSyncEnabled()` comment and function in `src/shared/lib/storage.ts`
with:

```typescript
/**
 * Load auto-sync enabled state for same-URL tabs
 * @returns Whether auto-sync for same-URL tabs is enabled (default: false)
 */
export async function loadAutoSyncEnabled(): Promise<boolean> {
  try {
    const result = await browser.storage.local.get(STORAGE_KEYS.AUTO_SYNC_ENABLED);
    return result[STORAGE_KEYS.AUTO_SYNC_ENABLED] !== undefined
      ? (result[STORAGE_KEYS.AUTO_SYNC_ENABLED] as boolean)
      : false;
  } catch (error) {
    await logger.error('Failed to load auto-sync enabled state:', error);
    return false;
  }
}
```

- [ ] **Step 2: Run the focused test and verify it passes**

Run:

```bash
pnpm test -- src/shared/lib/storage.test.ts -t loadAutoSyncEnabled
```

Expected: PASS with all `loadAutoSyncEnabled` tests passing.

- [ ] **Step 3: Run the full storage test file**

Run:

```bash
pnpm test -- src/shared/lib/storage.test.ts
```

Expected: PASS for the complete storage utility test file.

- [ ] **Step 4: Commit the implementation**

Run:

```bash
git add src/shared/lib/storage.ts
git commit -m "fix: default auto-sync suggestions off"
```

## Task 3: Verify Auto-Sync Privacy And Integration Boundaries

**Files:**

- Inspect: `src/shared/lib/storage.ts`
- Inspect: `src/shared/lib/storage.test.ts`
- Inspect only if tests fail: `src/background/lib/auto-sync-lifecycle.ts`
- Inspect only if tests fail: `src/popup/hooks/use-auto-sync.ts`

- [ ] **Step 1: Search for raw URL or payload logging in touched auto-sync paths**

Run:

```bash
rg -n "logger|url|Url|URL|tab\\.url|window\\.location\\.href|payload|normalizedUrl|sourceUrl|targetUrl" src/shared/lib/storage.ts src/shared/lib/storage.test.ts src/background/lib/auto-sync-lifecycle.ts src/popup/hooks/use-auto-sync.ts
```

Expected: No new logging was added by this implementation. Existing matches are inspected and are
outside the changed lines, or use non-sensitive metadata.

- [ ] **Step 2: Run the repository privacy logging validator**

Run:

```bash
pnpm privacy:logging
```

Expected: PASS. The validator reports no raw URL, title, page metadata, storage payload, or
message-payload logging violations.

- [ ] **Step 3: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS. The loader signature remains `Promise<boolean>`, so no downstream type changes are
expected.

- [ ] **Step 4: Run the relevant health subset**

Run:

```bash
pnpm test -- src/shared/lib/storage.test.ts src/background/lib/auto-sync-lifecycle.test.ts
```

Expected: PASS. Background lifecycle tests continue to pass because they mock
`loadAutoSyncEnabled()` explicitly where enabled or disabled startup behavior is needed.

## Task 4: Final Review And Commit

**Files:**

- Review: `src/shared/lib/storage.ts`
- Review: `src/shared/lib/storage.test.ts`

- [ ] **Step 1: Review the final diff**

Run:

```bash
git diff -- src/shared/lib/storage.ts src/shared/lib/storage.test.ts
```

Expected: Diff only changes:

- `loadAutoSyncEnabled()` missing-key fallback from `true` to `false`
- `loadAutoSyncEnabled()` read-failure fallback from `true` to `false`
- comment text from `default: true` to `default: false`
- focused storage test expectations and names

- [ ] **Step 2: Check final status**

Run:

```bash
git status --short
```

Expected: No unstaged or staged implementation changes remain except unrelated pre-existing files
such as `.playwright-mcp/`.

- [ ] **Step 3: Commit verification-only fixes if any were required**

If Task 3 or Task 4 required an additional code or test correction, commit only that correction:

```bash
git add src/shared/lib/storage.ts src/shared/lib/storage.test.ts
git commit -m "fix: align auto-sync default-off tests"
```

Expected: Skip this step when Task 2 already produced the final passing implementation.

## Self-Review

- Spec coverage: The plan covers missing-key default off, read-failure default off, preservation of
  stored `true` and `false`, no migration key, no popup/background logic changes, focused tests,
  typecheck, and privacy logging validation.
- Placeholder scan: The plan contains complete code replacements, exact commands, and expected
  outcomes.
- Type consistency: The implementation keeps `loadAutoSyncEnabled(): Promise<boolean>` unchanged and
  uses the existing `STORAGE_KEYS.AUTO_SYNC_ENABLED` key.
