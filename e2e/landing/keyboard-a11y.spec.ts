import { expect, test } from '@playwright/test';

import type { Locator, Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/landing/');
});

async function expectFocusRing(page: Page, locator: Locator) {
  await locator.focus();
  const hasFocusIndicator = await locator.evaluate((el) => {
    const style = window.getComputedStyle(el);
    const boxShadow = style.boxShadow;
    const outline = style.outline;
    const hasBoxShadow = boxShadow !== 'none' && boxShadow !== '';
    const hasOutline = outline !== 'none' && outline !== '' && outline !== '0px none rgb(0, 0, 0)';
    return hasBoxShadow || hasOutline;
  });
  const name = await locator.evaluate(
    (el) => el.getAttribute('aria-label') || el.textContent?.trim().substring(0, 30),
  );
  expect(hasFocusIndicator, `Expected focus ring on "${name}"`).toBe(true);
}

test.describe('keyboard navigation', () => {
  test('language toggle opens with Enter key', async ({ page }) => {
    const trigger = page.getByRole('button', { name: /Change language/i });
    await trigger.focus();
    await page.keyboard.press('Enter');

    await expect(page.getByRole('menu')).toBeVisible();
  });

  test('language toggle opens with Space key', async ({ page }) => {
    const trigger = page.getByRole('button', { name: /Change language/i });
    await trigger.focus();
    await page.keyboard.press('Space');

    await expect(page.getByRole('menu')).toBeVisible();
  });

  test('language toggle menu navigates with arrow keys', async ({ page }) => {
    const trigger = page.getByRole('button', { name: /Change language/i });
    await trigger.focus();
    await page.keyboard.press('Enter');

    await expect(page.getByRole('menu')).toBeVisible();

    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Escape');

    await expect(page.getByRole('menu')).toBeHidden();
  });

  test('sync toggle button activates with Enter key', async ({ page }) => {
    const syncButton = page.getByRole('button', { name: /Enable Sync/i });
    await syncButton.focus();
    await page.keyboard.press('Enter');

    await expect(page.getByRole('button', { name: /Syncing/i })).toBeVisible();
  });

  test('sync toggle button activates with Space key', async ({ page }) => {
    const syncButton = page.getByRole('button', { name: /Enable Sync/i });
    await syncButton.focus();
    await page.keyboard.press('Space');

    await expect(page.getByRole('button', { name: /Syncing/i })).toBeVisible();
  });
});

test.describe('focus visibility', () => {
  test('header logo button shows focus ring', async ({ page }) => {
    const logo = page.getByRole('button', { name: /Synchronize Tab Scrolling|STS/i });
    await expectFocusRing(page, logo);
  });

  test('header nav links show focus ring', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await expectFocusRing(page, nav.getByRole('link', { name: 'Features' }));
    await expectFocusRing(page, nav.getByRole('link', { name: 'Use Cases' }));
  });

  test('language toggle shows focus ring', async ({ page }) => {
    await expectFocusRing(page, page.getByRole('button', { name: /Change language/i }));
  });

  test('theme toggle shows focus ring', async ({ page }) => {
    await expectFocusRing(page, page.getByRole('button', { name: /Toggle dark mode/i }));
  });

  test('sync toggle button shows focus ring', async ({ page }) => {
    await expectFocusRing(page, page.getByRole('button', { name: /Enable Sync/i }));
  });

  test('primary install link shows focus ring', async ({ page }) => {
    await expectFocusRing(page, page.getByRole('link', { name: /Add to Chrome/i }).first());
  });

  test('secondary browser install links show focus ring', async ({ page }) => {
    const secondaryLink = page
      .getByRole('link', {
        name: /Add to (Firefox|Edge|Arc|Brave|Dia)/i,
      })
      .first();
    await secondaryLink.waitFor({ state: 'visible' });
    await secondaryLink.scrollIntoViewIfNeeded();
    await expectFocusRing(page, secondaryLink);
  });

  test('footer links show focus ring', async ({ page }) => {
    const footer = page.getByRole('contentinfo');
    const githubLink = footer.getByRole('link', { name: 'GitHub' });
    await githubLink.scrollIntoViewIfNeeded();
    await expectFocusRing(page, githubLink);
  });
});

test.describe('header layout stability', () => {
  test('opening language dropdown does not shift header elements', async ({ page }) => {
    const themeToggle = page.getByRole('button', { name: /Toggle dark mode/i });

    const beforeRect = await themeToggle.boundingBox();
    expect(beforeRect).not.toBeNull();

    await page.getByRole('button', { name: /Change language/i }).click();
    await expect(page.getByRole('menu')).toBeVisible();

    const afterRect = await themeToggle.boundingBox();
    expect(afterRect).not.toBeNull();

    expect(Math.abs(afterRect!.x - beforeRect!.x)).toBeLessThan(2);
  });
});
