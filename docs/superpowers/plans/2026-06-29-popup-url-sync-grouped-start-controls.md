# Popup URL Sync Grouped Start Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the compact URL Sync control into the start-decision area, rename it to user-facing page-change copy, and explain URL Sync modes with safe fixed-domain examples in the expanded editor.

**Architecture:** Keep `UrlSyncSettings` as the shared settings component and keep the popup on the `inline-collapsible` variant. Move the popup instance below the tab list and above the start/action buttons. Keep selected-tab guidance inside the tab-selection flow by letting `TabCommandPalette` render a selection summary node directly below its heading.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Testing Library, Playwright extension E2E, webextension i18n JSON, UnoCSS/Tailwind utility classes.

---

## File Structure

- Modify `src/shared/components/url-sync-settings.tsx`
  - Add example-copy support to mode options.
  - Restyle the inline-collapsible row with a subtle anchored container.
  - Keep switch, disclosure, mode state, notices, and failure behavior unchanged.
- Modify `src/shared/components/url-sync-settings.test.tsx`
  - Update mocked copy.
  - Assert the new label, collapsed summary, no collapsed examples, and expanded examples.
- Modify `src/popup/components/tab-command-palette.tsx`
  - Add an optional `selectionSummary` prop.
  - Render it under the tab-selection heading and above the search/list command surface.
- Modify `src/popup/components/__tests__/tab-command-palette.test.tsx`
  - Cover selection summary placement inside the palette flow.
- Modify `src/popup/components/scroll-sync-popup.tsx`
  - Pass `SelectedTabsChips` into `TabCommandPalette`.
  - Move `UrlSyncSettings` below the tab selection section and above `SyncControlButtons`.
- Modify locale files:
  - `extension/_locales/{de,en,es,fr,hi,ja,ko,zh,zh_CN,zh_TW}/messages.json`
  - `src/shared/i18n/_locales/{de,en,es,fr,hi,ja,ko,zh_CN,zh_TW}/messages.json`
- Modify `e2e/extension/url-sync-modes.spec.ts`
  - Update accessible-name selectors.
  - Add a layout-order assertion that the URL Sync switch sits below the search/list area and above the start button.

---

### Task 1: Update URL Sync Component Tests First

**Files:**

- Modify: `src/shared/components/url-sync-settings.test.tsx`

- [ ] **Step 1: Update the test i18n mock**

Replace the `messages` object values in the test mock with this shape. Keep existing notice keys unchanged.

```tsx
const messages: Record<string, string> = {
  urlSyncNavigation: 'Sync page changes',
  urlSyncStateOn: 'On',
  urlSyncStateOff: 'Off',
  urlSyncExpandSettings: 'Change page sync mode',
  urlSyncCollapseSettings: 'Hide page sync modes',
  urlSyncModeDescription: 'Choose how linked tabs follow page changes.',
  urlSyncModeFollowChangedTab: 'Follow changed tab',
  urlSyncModeFollowChangedTabDescription: 'Other tabs move to the website you changed.',
  urlSyncModeFollowChangedTabExample:
    'Example: if tab A moves to example.com/products, other tabs move to example.com/products too.',
  urlSyncModeKeepEachTabsWebsite: "Keep each tab's website",
  urlSyncModeKeepEachTabsWebsiteDescription:
    'Other tabs stay on their own website and open the matching page.',
  urlSyncModeKeepEachTabsWebsiteExample:
    'Example: if tab A moves to docs.example.com/pricing, tab B opens shop.example.com/pricing.',
  urlSyncModeLanguageHelper: 'Languages are kept when possible.',
  urlSyncModeResetNotice: 'URL Sync mode was reset because the saved setting was not valid.',
  urlSyncKeepWebsiteBlockedNotice:
    'Could not keep this tab on its current website for that page change. No navigation was synced.',
  urlSyncLanguagePreservationNotice: 'Language could not be preserved for this page change.',
  urlSyncSettingSaveFailedNotice:
    'Could not save the URL Sync setting. The previous setting is still being used.',
  urlSyncSettingReadFailedNotice:
    'Could not read the URL Sync setting. URL navigation was not synced.',
};
```

- [ ] **Step 2: Update existing name assertions**

Change test queries that use the old accessible name from `URL Sync` or `Expand URL Sync settings` to the new copy:

```tsx
screen.getByRole('heading', { name: 'Sync page changes' });
screen.getByRole('switch', { name: 'Sync page changes' });
screen.getByRole('region', { name: 'Sync page changes' });
screen.getByRole('button', { name: 'Change page sync mode' });
screen.getByRole('button', { name: 'Hide page sync modes' });
```

- [ ] **Step 3: Add collapsed/expanded example assertions**

Inside `describe('inline-collapsible variant', ...)`, update the collapsed test so it asserts examples are absent:

```tsx
expect(settings).toHaveTextContent('On');
expect(settings).toHaveTextContent("Keep each tab's website");
expect(settings).not.toHaveTextContent('example.com/products');
expect(settings).not.toHaveTextContent('docs.example.com/pricing');
```

Update the expanded test to assert both descriptions and both examples:

```tsx
expect(screen.getByText('Other tabs move to the website you changed.')).toBeInTheDocument();
expect(
  screen.getByText(
    'Example: if tab A moves to example.com/products, other tabs move to example.com/products too.',
  ),
).toBeInTheDocument();
expect(
  screen.getByText('Other tabs stay on their own website and open the matching page.'),
).toBeInTheDocument();
expect(
  screen.getByText(
    'Example: if tab A moves to docs.example.com/pricing, tab B opens shop.example.com/pricing.',
  ),
).toBeInTheDocument();
```

- [ ] **Step 4: Run the focused component test and verify it fails**

Run:

```bash
./node_modules/.bin/vitest run src/shared/components/url-sync-settings.test.tsx
```

Expected: FAIL because `urlSyncModeFollowChangedTabExample` and `urlSyncModeKeepEachTabsWebsiteExample` are not implemented yet, and the component still uses the old accessible names.

---

### Task 2: Implement URL Sync Row Copy, Examples, and Locale Keys

**Files:**

- Modify: `src/shared/components/url-sync-settings.tsx`
- Modify: `src/shared/components/url-sync-settings.test.tsx`
- Modify: all locale files listed in File Structure

- [ ] **Step 1: Add example keys to the mode option type**

In `src/shared/components/url-sync-settings.tsx`, change `URL_SYNC_MODE_OPTIONS` to include `exampleKey`:

```tsx
const URL_SYNC_MODE_OPTIONS: Array<{
  mode: UrlSyncMode;
  labelKey: 'urlSyncModeFollowChangedTab' | 'urlSyncModeKeepEachTabsWebsite';
  descriptionKey:
    | 'urlSyncModeFollowChangedTabDescription'
    | 'urlSyncModeKeepEachTabsWebsiteDescription';
  exampleKey: 'urlSyncModeFollowChangedTabExample' | 'urlSyncModeKeepEachTabsWebsiteExample';
}> = [
  {
    mode: 'follow-changed-tab',
    labelKey: 'urlSyncModeFollowChangedTab',
    descriptionKey: 'urlSyncModeFollowChangedTabDescription',
    exampleKey: 'urlSyncModeFollowChangedTabExample',
  },
  {
    mode: 'keep-each-tabs-website',
    labelKey: 'urlSyncModeKeepEachTabsWebsite',
    descriptionKey: 'urlSyncModeKeepEachTabsWebsiteDescription',
    exampleKey: 'urlSyncModeKeepEachTabsWebsiteExample',
  },
];
```

- [ ] **Step 2: Render examples only in inline expanded mode**

In `renderModeOption`, replace the text span with this structure:

```tsx
<span className="min-w-0">
  <span className="block text-sm font-medium">{t(option.labelKey)}</span>
  <span className="block text-xs text-muted-foreground">{t(option.descriptionKey)}</span>
  {layout === 'inline' && (
    <span className="mt-1 block text-xs leading-snug text-muted-foreground">
      {t(option.exampleKey)}
    </span>
  )}
</span>
```

This keeps examples out of the collapsed row and out of the full card variant. The only visible
examples in this change are inside the expanded inline editor.

- [ ] **Step 3: Anchor the inline row visually without making a large card**

In the `isInlineCollapsible` branch, change the section class from:

```text
className="space-y-2 text-sm"
```

to:

```text
className="rounded-lg border bg-muted/20 p-2 text-sm"
```

Change the disclosure button class from:

```tsx
'flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left',
```

to:

```tsx
'flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-left',
```

Change the fieldset class from:

```text
className="grid grid-cols-1 gap-1"
```

to:

```text
className="mt-2 grid grid-cols-1 gap-1"
```

- [ ] **Step 4: Update all locale values and add example keys**

For every locale JSON file in both trees, update `urlSyncNavigation`, `urlSyncExpandSettings`, and `urlSyncCollapseSettings`, then add the two example keys immediately after each corresponding description key.

Use this exact copy set:

```json
{
  "en": {
    "urlSyncNavigation": "Sync page changes",
    "urlSyncExpandSettings": "Change page sync mode",
    "urlSyncCollapseSettings": "Hide page sync modes",
    "urlSyncModeFollowChangedTabExample": "Example: if tab A moves to example.com/products, other tabs move to example.com/products too.",
    "urlSyncModeKeepEachTabsWebsiteExample": "Example: if tab A moves to docs.example.com/pricing, tab B opens shop.example.com/pricing."
  },
  "ko": {
    "urlSyncNavigation": "페이지 이동도 동기화",
    "urlSyncExpandSettings": "페이지 이동 방식 변경",
    "urlSyncCollapseSettings": "페이지 이동 방식 접기",
    "urlSyncModeFollowChangedTabExample": "예: A탭이 example.com/products로 이동하면 다른 탭도 example.com/products로 이동합니다.",
    "urlSyncModeKeepEachTabsWebsiteExample": "예: A탭이 docs.example.com/pricing으로 이동하면 B탭은 shop.example.com/pricing을 엽니다."
  },
  "ja": {
    "urlSyncNavigation": "ページ移動も同期",
    "urlSyncExpandSettings": "ページ同期モードを変更",
    "urlSyncCollapseSettings": "ページ同期モードを閉じる",
    "urlSyncModeFollowChangedTabExample": "例: Aタブが example.com/products に移動すると、他のタブも example.com/products に移動します。",
    "urlSyncModeKeepEachTabsWebsiteExample": "例: Aタブが docs.example.com/pricing に移動すると、Bタブは shop.example.com/pricing を開きます。"
  },
  "fr": {
    "urlSyncNavigation": "Synchroniser les changements de page",
    "urlSyncExpandSettings": "Changer le mode de synchronisation des pages",
    "urlSyncCollapseSettings": "Masquer les modes de synchronisation des pages",
    "urlSyncModeFollowChangedTabExample": "Exemple : si l'onglet A ouvre example.com/products, les autres onglets ouvrent aussi example.com/products.",
    "urlSyncModeKeepEachTabsWebsiteExample": "Exemple : si l'onglet A ouvre docs.example.com/pricing, l'onglet B ouvre shop.example.com/pricing."
  },
  "es": {
    "urlSyncNavigation": "Sincronizar cambios de página",
    "urlSyncExpandSettings": "Cambiar modo de sincronización de páginas",
    "urlSyncCollapseSettings": "Ocultar modos de sincronización de páginas",
    "urlSyncModeFollowChangedTabExample": "Ejemplo: si la pestaña A va a example.com/products, las demás pestañas también van a example.com/products.",
    "urlSyncModeKeepEachTabsWebsiteExample": "Ejemplo: si la pestaña A va a docs.example.com/pricing, la pestaña B abre shop.example.com/pricing."
  },
  "de": {
    "urlSyncNavigation": "Seitenwechsel mitsynchronisieren",
    "urlSyncExpandSettings": "Seitensynchronisationsmodus ändern",
    "urlSyncCollapseSettings": "Seitensynchronisationsmodi ausblenden",
    "urlSyncModeFollowChangedTabExample": "Beispiel: Wenn Tab A example.com/products öffnet, öffnen die anderen Tabs auch example.com/products.",
    "urlSyncModeKeepEachTabsWebsiteExample": "Beispiel: Wenn Tab A docs.example.com/pricing öffnet, öffnet Tab B shop.example.com/pricing."
  },
  "zh_CN": {
    "urlSyncNavigation": "同步页面变化",
    "urlSyncExpandSettings": "更改页面同步模式",
    "urlSyncCollapseSettings": "收起页面同步模式",
    "urlSyncModeFollowChangedTabExample": "示例：如果标签页 A 打开 example.com/products，其他标签页也会打开 example.com/products。",
    "urlSyncModeKeepEachTabsWebsiteExample": "示例：如果标签页 A 打开 docs.example.com/pricing，标签页 B 会打开 shop.example.com/pricing。"
  },
  "zh_TW": {
    "urlSyncNavigation": "同步頁面變更",
    "urlSyncExpandSettings": "變更頁面同步模式",
    "urlSyncCollapseSettings": "收合頁面同步模式",
    "urlSyncModeFollowChangedTabExample": "範例：如果分頁 A 開啟 example.com/products，其他分頁也會開啟 example.com/products。",
    "urlSyncModeKeepEachTabsWebsiteExample": "範例：如果分頁 A 開啟 docs.example.com/pricing，分頁 B 會開啟 shop.example.com/pricing。"
  },
  "hi": {
    "urlSyncNavigation": "पेज बदलाव भी सिंक करें",
    "urlSyncExpandSettings": "पेज सिंक मोड बदलें",
    "urlSyncCollapseSettings": "पेज सिंक मोड छिपाएं",
    "urlSyncModeFollowChangedTabExample": "उदाहरण: अगर टैब A example.com/products पर जाता है, तो दूसरे टैब भी example.com/products पर जाते हैं।",
    "urlSyncModeKeepEachTabsWebsiteExample": "उदाहरण: अगर टैब A docs.example.com/pricing पर जाता है, तो टैब B shop.example.com/pricing खोलता है।"
  }
}
```

For `extension/_locales/zh/messages.json`, use the `zh_CN` values.

- [ ] **Step 5: Run focused component and i18n checks**

Run:

```bash
./node_modules/.bin/vitest run src/shared/components/url-sync-settings.test.tsx
./node_modules/.bin/esno scripts/validate-i18n.ts
```

Expected: both PASS. If `esno` fails in the sandbox with an IPC or `/private/tmp` permission error, rerun the same command with escalated permissions.

- [ ] **Step 6: Commit Task 2**

Run:

```bash
git add src/shared/components/url-sync-settings.tsx src/shared/components/url-sync-settings.test.tsx extension/_locales src/shared/i18n/_locales
git commit -m "fix(i18n): clarify URL sync page change copy"
```

---

### Task 3: Group Selected Tabs With the Tab Selection Flow

**Files:**

- Modify: `src/popup/components/tab-command-palette.tsx`
- Modify: `src/popup/components/__tests__/tab-command-palette.test.tsx`
- Modify: `src/popup/components/scroll-sync-popup.tsx`

- [ ] **Step 1: Add a failing unit test for `selectionSummary` placement**

In `src/popup/components/__tests__/tab-command-palette.test.tsx`, add this test inside a new `describe('TabCommandPalette selection summary', ...)` block:

```tsx
describe('TabCommandPalette selection summary', () => {
  it('renders the selection summary between the heading and search input', () => {
    render(
      <TabCommandPalette
        currentTabId={1}
        isSyncActive={false}
        selectionSummary={<div data-testid="selection-summary">Select 2 or more tabs</div>}
        selectedTabIds={[]}
        tabs={[
          {
            eligible: true,
            id: 1,
            title: 'Example tab',
            url: 'https://example.com',
          },
        ]}
        onToggleTab={vi.fn()}
      />,
    );

    const heading = screen.getByRole('heading', { name: 'tabSelectionHeading' });
    const summary = screen.getByTestId('selection-summary');
    const searchInput = screen.getByRole('combobox', { name: 'searchTabsLabel' });

    expect(
      heading.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      summary.compareDocumentPosition(searchInput) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the palette test and verify it fails**

Run:

```bash
./node_modules/.bin/vitest run src/popup/components/__tests__/tab-command-palette.test.tsx
```

Expected: FAIL because `selectionSummary` is not a prop on `TabCommandPalette`.

- [ ] **Step 3: Add the `selectionSummary` prop**

In `src/popup/components/tab-command-palette.tsx`, add the prop to the interface:

```tsx
  selectionSummary?: React.ReactNode;
```

Add it to the function destructuring:

```tsx
  selectionSummary,
```

Then render it under the heading block:

```text
        {!isSyncActive && (
          <div
            aria-live="polite"
            aria-relevant="text"
            className="flex items-center justify-between px-1"
          >
            <h2 className="text-sm font-medium" id="tab-selection-heading">
              {t('tabSelectionHeading')}
            </h2>
            {selectedCount > 0 && (
              <Badge
                aria-label={t('tabsSelectedLabel', [String(selectedCount)])}
                className="ml-2"
                variant="default"
              >
                {t('selectedCount', [String(selectedCount)])}
              </Badge>
            )}
          </div>
        )}

        {selectionSummary}
```

Keep `selectionSummary` outside the `!isSyncActive` condition so selected chips remain visible during active sync.

- [ ] **Step 4: Move `SelectedTabsChips` into `TabCommandPalette` from the popup parent**

In `src/popup/components/scroll-sync-popup.tsx`, remove the standalone `SelectedTabsChips` block above `UrlSyncSettings`.

Pass it to `TabCommandPalette`:

```tsx
<TabCommandPalette
  ref={searchInputRef}
  allTabs={tabs}
  currentTabId={currentTabId}
  isSyncActive={syncStatus.isActive}
  sameDomainFilter={sameDomainFilter}
  selectionSummary={
    <SelectedTabsChips
      isSyncActive={syncStatus.isActive}
      tabs={selectedTabsInfo}
      onRemoveTab={handleToggleTab}
    />
  }
  selectedTabIds={selectedTabIds}
  tabs={filteredAndSortedTabs}
  totalTabCount={tabs.length}
  onClearFilter={() => setSameDomainFilter(false)}
  onToggleTab={handleToggleTab}
/>
```

- [ ] **Step 5: Move `UrlSyncSettings` below the tab selection section**

In `src/popup/components/scroll-sync-popup.tsx`, place `UrlSyncSettings` after the closing `</section>` for `TabCommandPalette` and before the button row:

```tsx
        </section>

        <UrlSyncSettings
          enabled={urlSyncEnabled}
          mode={urlSyncMode}
          notice={urlSyncNotice}
          variant="inline-collapsible"
          onEnabledChange={handleUrlSyncChange}
          onModeChange={handleUrlSyncModeChange}
        />

        <div className="flex shrink-0 items-center justify-end gap-2">
```

- [ ] **Step 6: Run the palette test**

Run:

```bash
./node_modules/.bin/vitest run src/popup/components/__tests__/tab-command-palette.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

Run:

```bash
git add src/popup/components/tab-command-palette.tsx src/popup/components/__tests__/tab-command-palette.test.tsx src/popup/components/scroll-sync-popup.tsx
git commit -m "fix: group popup URL sync start controls"
```

---

### Task 4: Update Extension E2E Selectors and Layout Coverage

**Files:**

- Modify: `e2e/extension/url-sync-modes.spec.ts`

- [ ] **Step 1: Update selector constants**

Change the constants at the top of `e2e/extension/url-sync-modes.spec.ts`:

```ts
const URL_SYNC_EXPAND_SETTINGS_NAME = /Change page sync mode|페이지 이동 방식 변경/i;
const URL_SYNC_SWITCH_NAME = /Sync page changes|페이지 이동도 동기화/i;
```

- [ ] **Step 2: Add a layout-order helper**

Add this helper below `selectTabCheckboxName`:

```ts
async function expectUrlSyncRowBeforeStartControls(popup: Page): Promise<void> {
  const searchInput = popup.getByRole('combobox', {
    name: /Search tabs|탭 검색|searchTabsLabel/i,
  });
  const urlSyncSwitch = popup.getByRole('switch', { name: URL_SYNC_SWITCH_NAME });
  const startButton = popup.getByRole('button', { name: START_SYNC_NAME });

  const searchBox = await searchInput.boundingBox();
  const switchBox = await urlSyncSwitch.boundingBox();
  const startBox = await startButton.boundingBox();

  expect(searchBox).not.toBeNull();
  expect(switchBox).not.toBeNull();
  expect(startBox).not.toBeNull();
  expect(switchBox!.y).toBeGreaterThan(searchBox!.y);
  expect(startBox!.y).toBeGreaterThan(switchBox!.y);
}
```

- [ ] **Step 3: Call the layout helper in the first URL Sync E2E test**

In the first test, after `const popup = await openPopup();`, add:

```ts
await expectUrlSyncRowBeforeStartControls(popup);
```

- [ ] **Step 4: Run the focused E2E test**

Run:

```bash
./node_modules/.bin/playwright test --config playwright.config.extension.ts e2e/extension/url-sync-modes.spec.ts
```

Expected: PASS. If Chromium cannot access local browser cache, Application Support paths, or extension launch paths from the sandbox, rerun this same command with escalated permissions.

- [ ] **Step 5: Commit Task 4**

Run:

```bash
git add e2e/extension/url-sync-modes.spec.ts
git commit -m "test: align URL sync E2E with grouped popup"
```

---

### Task 5: Final Verification, Privacy Scan, Build, and Push

**Files:**

- Read-only verification across changed files.

- [ ] **Step 1: Run focused and project checks**

Run:

```bash
./node_modules/.bin/vitest run src/shared/components/url-sync-settings.test.tsx src/popup/components/__tests__/tab-command-palette.test.tsx
./node_modules/.bin/tsc --noEmit --pretty false
NODE_OPTIONS='--experimental-strip-types' ./node_modules/.bin/eslint src/shared/components/url-sync-settings.tsx src/shared/components/url-sync-settings.test.tsx src/popup/components/scroll-sync-popup.tsx src/popup/components/tab-command-palette.tsx src/popup/components/__tests__/tab-command-palette.test.tsx e2e/extension/url-sync-modes.spec.ts --flag unstable_native_nodejs_ts_config --max-warnings=0
./node_modules/.bin/esno scripts/validate-i18n.ts
./node_modules/.bin/playwright test --config playwright.config.extension.ts e2e/extension/url-sync-modes.spec.ts
```

Expected: all PASS. Use escalated permissions only for commands that fail with sandbox, IPC, browser cache, local browser, or extension launch access errors.

- [ ] **Step 2: Run the required privacy/logging search**

Run:

```bash
rg -n "logger|url|Url|URL|tab\\.url|window\\.location\\.href|payload|normalizedUrl|sourceUrl|targetUrl" src/shared/components/url-sync-settings.tsx src/popup/components/scroll-sync-popup.tsx src/popup/components/tab-command-palette.tsx e2e/extension/url-sync-modes.spec.ts
```

Expected: No raw URL or tab title logging is introduced. Locale example strings may contain fixed `example.com` domains only; this is allowed because they are deterministic copy, not user browsing data.

- [ ] **Step 3: Rebuild the extension for manual Arc/Chromium testing**

Run:

```bash
./node_modules/.bin/rimraf --glob extension/dist extension/manifest.json 'extension.*'
./node_modules/.bin/esno scripts/validate-i18n.ts
NODE_ENV=production ./node_modules/.bin/vite build
NODE_ENV=production ./node_modules/.bin/esno scripts/prepare.ts
NODE_ENV=production ./node_modules/.bin/vite build --config vite.config.background.mts
NODE_ENV=production ./node_modules/.bin/vite build --config vite.config.content.mts
```

Expected: build artifacts are refreshed under `extension/`. If `esno` fails with an IPC pipe error under `/private/tmp`, rerun only the failing `esno` command with escalated permissions.

- [ ] **Step 4: Inspect final git history and working tree**

Run:

```bash
git status
git log --oneline -5
```

Expected: working tree is clean except for intentional build artifacts if the repository tracks none of them. The latest commits should be:

```text
test: align URL sync E2E with grouped popup
fix: group popup URL sync start controls
fix(i18n): clarify URL sync page change copy
docs: specify popup URL sync grouping
```

- [ ] **Step 5: Push the branch**

Run:

```bash
git push origin codex/url-sync-mode-design
```

Expected: push succeeds and PR #385 updates with the new commits.
