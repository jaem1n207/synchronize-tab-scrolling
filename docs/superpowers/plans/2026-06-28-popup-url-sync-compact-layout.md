# Popup URL Sync Compact Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the popup URL Sync controls compact by default while keeping the active mode and state visible.

**Architecture:** Extend the shared `UrlSyncSettings` component with explicit layout variants, then switch only the popup to an inline-collapsible variant. Preserve the current content-script panel compact behavior, keep URL Sync runtime state unchanged, and add small i18n labels for the collapsed row status and disclosure controls.

**Tech Stack:** React 19, TypeScript, Testing Library, Vitest, UnoCSS utility classes, local shadcn-style primitives, browser i18n JSON.

---

## File Map

- Modify: `src/shared/components/url-sync-settings.test.tsx`
  - Adds the behavioral contract for the popup inline-collapsible variant.
- Modify: `src/shared/components/url-sync-settings.tsx`
  - Adds explicit variants and renders the compact popup row.
- Modify: `src/popup/components/scroll-sync-popup.tsx`
  - Uses the popup inline-collapsible variant instead of the full card.
- Modify: locale JSON files under `extension/_locales/*/messages.json`
  - Adds compact URL Sync row labels for extension runtime i18n.
- Modify: locale JSON files under `src/shared/i18n/_locales/*/messages.json`
  - Adds the same compact URL Sync row labels for shared React i18n.

## Task 1: Lock the Compact Popup Contract in Tests

**Files:**

- Modify: `src/shared/components/url-sync-settings.test.tsx`

- [ ] **Step 1: Add compact-row i18n keys to the test mock**

In the `messages` object inside the `vi.mock('~/shared/i18n', ...)` block, add these entries after
`urlSyncNavigation`:

```typescript
      urlSyncStateOn: 'On',
      urlSyncStateOff: 'Off',
      urlSyncExpandSettings: 'Expand URL Sync settings',
      urlSyncCollapseSettings: 'Collapse URL Sync settings',
```

- [ ] **Step 2: Add tests for the popup inline-collapsible variant**

Add this `describe` block before the existing `it('renders compact mode without the popup frame', ...)`
test:

```typescript
  describe('inline-collapsible variant', () => {
    it('renders collapsed with status, active mode, and helper copy visible', () => {
      render(
        <UrlSyncSettings
          enabled={true}
          mode="keep-each-tabs-website"
          variant="inline-collapsible"
          onEnabledChange={vi.fn()}
          onModeChange={vi.fn()}
        />,
      );

      const settings = screen.getByRole('region', { name: 'URL Sync' });
      const disclosure = screen.getByRole('button', { name: 'Expand URL Sync settings' });

      expect(settings).toHaveAttribute('data-variant', 'inline-collapsible');
      expect(settings).toHaveTextContent('On');
      expect(settings).toHaveTextContent("Keep each tab's website");
      expect(settings).toHaveTextContent('Languages are kept when possible.');
      expect(disclosure).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByText('Other tabs stay on their own website and open the matching page.')).not.toBeInTheDocument();
    });

    it('expands inline and exposes both mode descriptions', async () => {
      const user = userEvent.setup();

      render(
        <UrlSyncSettings
          enabled={true}
          mode="follow-changed-tab"
          variant="inline-collapsible"
          onEnabledChange={vi.fn()}
          onModeChange={vi.fn()}
        />,
      );

      const disclosure = screen.getByRole('button', { name: 'Expand URL Sync settings' });

      await user.click(disclosure);

      expect(screen.getByRole('button', { name: 'Collapse URL Sync settings' })).toHaveAttribute(
        'aria-expanded',
        'true',
      );
      expect(screen.getByText('Other tabs move to the website you changed.')).toBeInTheDocument();
      expect(
        screen.getByText('Other tabs stay on their own website and open the matching page.'),
      ).toBeInTheDocument();
    });

    it('collapses after a successful mode change', async () => {
      const onModeChange = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();

      render(
        <UrlSyncSettings
          enabled={true}
          mode="follow-changed-tab"
          variant="inline-collapsible"
          onEnabledChange={vi.fn()}
          onModeChange={onModeChange}
        />,
      );

      await user.click(screen.getByRole('button', { name: 'Expand URL Sync settings' }));
      await user.click(screen.getByRole('radio', { name: /Keep each tab's website/i }));

      expect(onModeChange).toHaveBeenCalledWith('keep-each-tabs-website');
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Expand URL Sync settings' })).toHaveAttribute(
          'aria-expanded',
          'false',
        );
      });
    });

    it('keeps the editor open after a failed mode change', async () => {
      const onModeChange = vi.fn().mockRejectedValue(new Error('mode save failed'));
      const user = userEvent.setup();

      render(
        <UrlSyncSettings
          enabled={true}
          mode="follow-changed-tab"
          variant="inline-collapsible"
          onEnabledChange={vi.fn()}
          onModeChange={onModeChange}
        />,
      );

      await user.click(screen.getByRole('button', { name: 'Expand URL Sync settings' }));
      await user.click(screen.getByRole('radio', { name: /Keep each tab's website/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Collapse URL Sync settings' })).toHaveAttribute(
          'aria-expanded',
          'true',
        );
      });
    });

    it('keeps the active mode visible but disables mode choices when URL Sync is off', async () => {
      const user = userEvent.setup();

      render(
        <UrlSyncSettings
          enabled={false}
          mode="keep-each-tabs-website"
          variant="inline-collapsible"
          onEnabledChange={vi.fn()}
          onModeChange={vi.fn()}
        />,
      );

      expect(screen.getByText('Off')).toBeInTheDocument();
      expect(screen.getByText("Keep each tab's website")).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Expand URL Sync settings' }));

      expect(screen.getByRole('radio', { name: /Follow changed tab/i })).toBeDisabled();
      expect(screen.getByRole('radio', { name: /Keep each tab's website/i })).toBeDisabled();
    });
  });
```

- [ ] **Step 3: Update the existing compact test to preserve panel behavior**

Replace:

```typescript
expect(settings).toHaveAttribute('data-compact', 'true');
```

with:

```typescript
expect(settings).toHaveAttribute('data-variant', 'panel-compact');
```

Leave the existing checks that the compact panel has no card border/background.

- [ ] **Step 4: Run the focused test and confirm it fails**

Run:

```bash
pnpm test -- --run src/shared/components/url-sync-settings.test.tsx
```

Expected: FAIL because `variant` and the new i18n keys are not implemented yet.

Do not commit yet. These tests are committed with the implementation in Task 2.

## Task 2: Implement `UrlSyncSettings` Variants

**Files:**

- Modify: `src/shared/components/url-sync-settings.tsx`
- Modify: `src/shared/components/url-sync-settings.test.tsx`

- [ ] **Step 1: Add icon imports and variant types**

At the top of `src/shared/components/url-sync-settings.tsx`, add the lucide icon imports after the
React import:

```typescript
import IconCheck from '~icons/lucide/check';
import IconChevronDown from '~icons/lucide/chevron-down';
```

Replace the props interface with:

```typescript
type UrlSyncSettingsVariant = 'card' | 'inline-collapsible' | 'panel-compact';

interface UrlSyncSettingsProps {
  enabled: boolean;
  mode: UrlSyncMode;
  notice?: UrlSyncNotice | null;
  compact?: boolean;
  variant?: UrlSyncSettingsVariant;
  onEnabledChange: (enabled: boolean) => void | Promise<void>;
  onModeChange: (mode: UrlSyncMode) => void | Promise<void>;
}
```

- [ ] **Step 2: Add selected option and variant state**

Inside `UrlSyncSettings`, after the existing `useId()` declarations, add:

```typescript
const inlineEditorId = React.useId();
const resolvedVariant: UrlSyncSettingsVariant = variant ?? (compact ? 'panel-compact' : 'card');
const selectedOption =
  URL_SYNC_MODE_OPTIONS.find((option) => option.mode === mode) ?? URL_SYNC_MODE_OPTIONS[0];
const isInlineCollapsible = resolvedVariant === 'inline-collapsible';
const [inlineEditorExpanded, setInlineEditorExpanded] = React.useState(false);
```

- [ ] **Step 3: Collapse only after successful inline mode changes**

Replace the `Promise.resolve()` block inside `handleModeChange` with this version:

```typescript
Promise.resolve()
  .then(() => onModeChange(nextMode))
  .then(() => {
    if (isInlineCollapsible) {
      setInlineEditorExpanded(false);
    }
  })
  .catch(() => {})
  .finally(() => {
    pendingModeRef.current = null;
    rerenderPendingState();
  });
```

This keeps the editor open when `onModeChange` throws or rejects.

- [ ] **Step 4: Add a shared mode option renderer**

Before the `return` statement, add this helper inside `UrlSyncSettings`:

```typescript
  const renderModeOption = (
    option: (typeof URL_SYNC_MODE_OPTIONS)[number],
    layout: 'card' | 'inline',
  ) => {
    const selected = option.mode === mode;
    const optionId = `${radioGroupName}-${option.mode}`;
    const enabledChangePending = pendingEnabledRef.current;
    const modeChangePending = pendingModeRef.current !== null;

    return (
      <div key={option.mode} className="relative">
        <input
          checked={selected}
          className="peer sr-only"
          disabled={!enabled || enabledChangePending || modeChangePending}
          id={optionId}
          name={radioGroupName}
          type="radio"
          value={option.mode}
          onChange={() => {
            handleModeChange(option.mode);
          }}
        />
        <label
          className={cn(
            'flex min-w-0 cursor-pointer text-left transition-colors',
            'border border-transparent whitespace-normal leading-snug',
            'peer-focus-visible:outline-none peer-focus-visible:ring-2',
            'peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2',
            'peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
            layout === 'card' && 'flex-col gap-0.5 rounded-md px-3 py-2',
            layout === 'inline' && 'items-start gap-2 rounded-md px-2.5 py-2',
            selected && 'border-primary bg-primary/10 text-primary',
            !selected && enabled && 'hover:bg-accent hover:text-accent-foreground',
          )}
          htmlFor={optionId}
        >
          {layout === 'inline' && (
            <span
              aria-hidden="true"
              className={cn(
                'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                selected ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
              )}
            >
              {selected && <IconCheck className="h-3 w-3" />}
            </span>
          )}
          <span className="min-w-0">
            <span className="block text-sm font-medium">{t(option.labelKey)}</span>
            <span className="block text-xs text-muted-foreground">{t(option.descriptionKey)}</span>
          </span>
        </label>
      </div>
    );
  };
```

- [ ] **Step 5: Add the inline-collapsible render branch**

Before the current `return (` block, add:

```typescript
  if (isInlineCollapsible) {
    const statusLabel = enabled ? t('urlSyncStateOn') : t('urlSyncStateOff');
    const disclosureLabel = inlineEditorExpanded
      ? t('urlSyncCollapseSettings')
      : t('urlSyncExpandSettings');

    return (
      <section
        aria-labelledby={headingId}
        className="rounded-lg border bg-card/60 px-3 py-2"
        data-variant="inline-collapsible"
      >
        <div className="flex min-w-0 items-center gap-2">
          <button
            aria-controls={inlineEditorId}
            aria-expanded={inlineEditorExpanded}
            aria-label={disclosureLabel}
            className={cn(
              'flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md py-1 text-left',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            )}
            type="button"
            onClick={() => {
              setInlineEditorExpanded((value) => !value);
            }}
          >
            <span className="shrink-0 text-sm font-medium" id={headingId}>
              {t('urlSyncNavigation')}
            </span>
            <span
              className={cn(
                'shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium leading-none',
                enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
              )}
            >
              {statusLabel}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {t(selectedOption.labelKey)}
            </span>
            <IconChevronDown
              aria-hidden="true"
              className={cn(
                'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                inlineEditorExpanded && 'rotate-180',
              )}
            />
          </button>
          <Switch
            aria-label={t('urlSyncNavigation')}
            checked={enabled}
            className="h-5 w-9 [&>span]:h-4 [&>span]:w-4 [&>span[data-state=checked]]:translate-x-4"
            disabled={pendingEnabledRef.current}
            onCheckedChange={handleEnabledChange}
          />
        </div>

        <p className="mt-1 truncate text-[11px] text-muted-foreground" id={helperId}>
          {t('urlSyncModeLanguageHelper')}
        </p>

        {inlineEditorExpanded && (
          <fieldset
            aria-describedby={helperId}
            className="mt-2 grid grid-cols-1 gap-1"
            id={inlineEditorId}
          >
            <legend className="sr-only">{t('urlSyncNavigation')}</legend>
            {URL_SYNC_MODE_OPTIONS.map((option) => renderModeOption(option, 'inline'))}
          </fieldset>
        )}

        {notice && (
          <p
            aria-live="polite"
            className={cn('mt-2 rounded-md border px-2 py-1.5 text-xs', getNoticeClassName(notice))}
            role="status"
          >
            {t(notice.key)}
          </p>
        )}
      </section>
    );
  }
```

- [ ] **Step 6: Update the existing card/panel return**

In the existing `<section>`:

Replace:

```typescript
      className={cn('space-y-2', compact ? 'text-sm' : 'rounded-lg border bg-card/60 p-3')}
      data-compact={compact ? 'true' : 'false'}
```

with:

```typescript
      className={cn(
        'space-y-2',
        resolvedVariant === 'panel-compact' ? 'text-sm' : 'rounded-lg border bg-card/60 p-3',
      )}
      data-variant={resolvedVariant}
```

Then replace the current `URL_SYNC_MODE_OPTIONS.map(...)` block inside the fieldset with this JSX
expression:

```text
{URL_SYNC_MODE_OPTIONS.map((option) => renderModeOption(option, 'card'))}
```

- [ ] **Step 7: Run the focused component tests**

Run:

```bash
pnpm test -- --run src/shared/components/url-sync-settings.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit component and test changes**

```bash
git add src/shared/components/url-sync-settings.tsx src/shared/components/url-sync-settings.test.tsx
git commit -m "feat: add compact URL sync settings variant"
```

## Task 3: Use the Compact Variant in Popup and Add Locale Keys

**Files:**

- Modify: `src/popup/components/scroll-sync-popup.tsx`
- Modify: `extension/_locales/en/messages.json`
- Modify: `extension/_locales/ko/messages.json`
- Modify: `extension/_locales/ja/messages.json`
- Modify: `extension/_locales/fr/messages.json`
- Modify: `extension/_locales/es/messages.json`
- Modify: `extension/_locales/de/messages.json`
- Modify: `extension/_locales/zh_CN/messages.json`
- Modify: `extension/_locales/zh_TW/messages.json`
- Modify: `extension/_locales/hi/messages.json`
- Modify: `extension/_locales/zh/messages.json`
- Modify: `src/shared/i18n/_locales/en/messages.json`
- Modify: `src/shared/i18n/_locales/ko/messages.json`
- Modify: `src/shared/i18n/_locales/ja/messages.json`
- Modify: `src/shared/i18n/_locales/fr/messages.json`
- Modify: `src/shared/i18n/_locales/es/messages.json`
- Modify: `src/shared/i18n/_locales/de/messages.json`
- Modify: `src/shared/i18n/_locales/zh_CN/messages.json`
- Modify: `src/shared/i18n/_locales/zh_TW/messages.json`
- Modify: `src/shared/i18n/_locales/hi/messages.json`

- [ ] **Step 1: Switch the popup to the inline-collapsible variant**

In `src/popup/components/scroll-sync-popup.tsx`, update the popup `UrlSyncSettings` usage:

```tsx
<UrlSyncSettings
  enabled={urlSyncEnabled}
  mode={urlSyncMode}
  notice={urlSyncNotice}
  variant="inline-collapsible"
  onEnabledChange={handleUrlSyncChange}
  onModeChange={handleUrlSyncModeChange}
/>
```

Do not change the content script panel usage in this task. Its existing `compact` prop is mapped to
`panel-compact` by Task 2.

- [ ] **Step 2: Add compact labels to every locale tree**

Add these four keys immediately after `urlSyncNavigation` in every locale file listed in this task.

Use the following messages:

| Locale | `urlSyncStateOn` | `urlSyncStateOff` | `urlSyncExpandSettings`            | `urlSyncCollapseSettings`           |
| ------ | ---------------- | ----------------- | ---------------------------------- | ----------------------------------- |
| en     | `On`             | `Off`             | `Expand URL Sync settings`         | `Collapse URL Sync settings`        |
| ko     | `켜짐`           | `꺼짐`            | `URL 동기화 설정 펼치기`           | `URL 동기화 설정 접기`              |
| ja     | `オン`           | `オフ`            | `URL同期設定を展開`                | `URL同期設定を折りたたむ`           |
| fr     | `Activé`         | `Désactivé`       | `Développer les réglages URL Sync` | `Réduire les réglages URL Sync`     |
| es     | `Activado`       | `Desactivado`     | `Expandir ajustes de URL Sync`     | `Contraer ajustes de URL Sync`      |
| de     | `Ein`            | `Aus`             | `URL-Sync-Einstellungen erweitern` | `URL-Sync-Einstellungen einklappen` |
| zh_CN  | `开启`           | `关闭`            | `展开 URL 同步设置`                | `收起 URL 同步设置`                 |
| zh_TW  | `開啟`           | `關閉`            | `展開 URL 同步設定`                | `收合 URL 同步設定`                 |
| hi     | `चालू`           | `बंद`             | `URL Sync सेटिंग खोलें`            | `URL Sync सेटिंग बंद करें`          |
| zh     | `开启`           | `关闭`            | `展开 URL 同步设置`                | `收起 URL 同步设置`                 |

Each key must use this JSON shape:

```json
  "urlSyncStateOn": {
    "message": "On"
  },
  "urlSyncStateOff": {
    "message": "Off"
  },
  "urlSyncExpandSettings": {
    "message": "Expand URL Sync settings"
  },
  "urlSyncCollapseSettings": {
    "message": "Collapse URL Sync settings"
  },
```

- [ ] **Step 3: Run i18n validation**

Run:

```bash
pnpm i18n:validate
```

Expected: PASS.

- [ ] **Step 4: Run the focused component tests again**

Run:

```bash
pnpm test -- --run src/shared/components/url-sync-settings.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit popup and locale changes**

```bash
git add src/popup/components/scroll-sync-popup.tsx extension/_locales src/shared/i18n/_locales
git commit -m "feat: compact URL sync controls in popup"
```

## Task 4: Final Verification

**Files:**

- No planned file edits.

- [ ] **Step 1: Run focused tests**

Run:

```bash
pnpm test -- --run src/shared/components/url-sync-settings.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 3: Run i18n validation**

Run:

```bash
pnpm i18n:validate
```

Expected: PASS.

- [ ] **Step 4: Run lint check**

Run:

```bash
pnpm lint:check
```

Expected: PASS.

- [ ] **Step 5: Inspect the final diff for privacy and UI regressions**

Run:

```bash
rg -n "logger|url|Url|URL|tab.url|window.location.href|payload|normalizedUrl|sourceUrl|targetUrl" src/shared/components/url-sync-settings.tsx src/popup/components/scroll-sync-popup.tsx
```

Expected: only i18n key names and component text references. No raw URL, title, payload, or tab
metadata logging is introduced.

Run:

```bash
git diff --stat HEAD~2..HEAD
```

Expected: changes are limited to the shared URL Sync settings component, its test, popup wiring,
and locale messages.

- [ ] **Step 6: Report the result**

Report:

- component test result
- typecheck result
- i18n validation result
- lint result
- final commit hashes

Do not claim manual popup testing unless it was actually performed.

## Self-Review Notes

- Spec coverage: popup uses inline-collapsible controls, active mode stays visible, helper copy stays visible, no popover/drawer is introduced, failed mode changes keep the editor open, notices remain compact, and the content panel compact layout is preserved.
- Placeholder scan: every step contains concrete edits, commands, and expected results.
- Type consistency: `variant`, `UrlSyncSettingsVariant`, `inline-collapsible`, and `panel-compact` are used consistently across tests, component code, and popup wiring.
