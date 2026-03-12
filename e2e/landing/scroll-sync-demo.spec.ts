import { expect, test } from '@playwright/test';

import type { Page } from '@playwright/test';

/** Shared panel selector — used by both scroll mutation and state assertions. */
async function getDemoPanelScrollTops(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const panels = Array.from(document.querySelectorAll('div')).filter((el) => {
      const style = window.getComputedStyle(el);
      return (
        style.overflowY === 'auto' && el.scrollHeight > el.clientHeight && el.clientHeight >= 100
      );
    }) as HTMLDivElement[];
    return panels.slice(0, 2).map((p) => p.scrollTop);
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/landing/');
});

test('hero demo toggles sync state and updates hint text', async ({ page }) => {
  const toggleButton = page.getByRole('button', { name: 'Enable Sync' });

  await expect(toggleButton).toBeVisible();
  await expect(page.getByText('Not synced')).toBeVisible();
  await expect(page.getByText('Scroll the left panel')).toBeVisible();

  await toggleButton.click();

  await expect(page.getByRole('button', { name: 'Syncing' })).toBeVisible();
  await expect(page.getByText('Synced', { exact: true })).toBeVisible();
  await expect(page.getByText('Scroll either panel')).toBeVisible();
});

test('scrolling one demo panel syncs the other proportionally', async ({ page }) => {
  await page.getByRole('button', { name: 'Enable Sync' }).click();
  await expect(page.getByText('Synced', { exact: true })).toBeVisible();

  // Wait for both panels to be present before scrolling
  await expect.poll(async () => (await getDemoPanelScrollTops(page)).length).toBe(2);

  // Scroll the left panel using the same selector criteria as assertions
  await page.evaluate(() => {
    const panels = Array.from(document.querySelectorAll('div')).filter((el) => {
      const style = window.getComputedStyle(el);
      return (
        style.overflowY === 'auto' && el.scrollHeight > el.clientHeight && el.clientHeight >= 100
      );
    }) as HTMLDivElement[];

    if (panels.length < 2) throw new Error('Expected two scrollable demo panels.');

    const left = panels[0];
    left.scrollTop = Math.floor(left.scrollHeight * 0.5);
    left.dispatchEvent(new Event('scroll', { bubbles: true }));
  });

  // Wait for scroll sync to propagate — verify right panel moved
  await expect.poll(async () => (await getDemoPanelScrollTops(page))[1] ?? 0).toBeGreaterThan(10);
});
