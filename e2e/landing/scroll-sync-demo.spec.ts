import { expect, test } from '@playwright/test';

import type { Page } from '@playwright/test';

interface PanelState {
  scrollTop: number;
  ratio: number;
}

async function getPanelStates(page: Page): Promise<PanelState[]> {
  return page.evaluate(() => {
    const panels = Array.from(document.querySelectorAll('div')).filter((element) => {
      if (!(element instanceof HTMLDivElement)) return false;
      const style = window.getComputedStyle(element);
      if (style.overflowY !== 'auto' || element.scrollHeight <= element.clientHeight) return false;
      return element.clientHeight >= 300;
    }) as HTMLDivElement[];

    return panels.slice(0, 2).map((panel) => {
      const maxScroll = panel.scrollHeight - panel.clientHeight;
      const ratio = maxScroll > 0 ? panel.scrollTop / maxScroll : 0;
      return { scrollTop: panel.scrollTop, ratio };
    });
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

  await page.evaluate(() => {
    const panels = Array.from(document.querySelectorAll('div')).filter((element) => {
      if (!(element instanceof HTMLDivElement)) return false;
      const style = window.getComputedStyle(element);
      return style.overflowY === 'auto' && element.scrollHeight > element.clientHeight;
    });

    if (panels.length < 2) {
      throw new Error('Expected two scrollable demo panels.');
    }

    const left = panels[0] as HTMLDivElement;
    left.scrollTop = left.scrollHeight * 0.55;
    left.dispatchEvent(new Event('scroll', { bubbles: true }));
  });

  await expect.poll(async () => (await getPanelStates(page)).length).toBe(2);

  const [leftPanel, rightPanel] = await getPanelStates(page);

  expect(leftPanel.scrollTop).toBeGreaterThan(80);
  expect(rightPanel.scrollTop).toBeGreaterThan(20);
  expect(Math.abs(leftPanel.ratio - rightPanel.ratio)).toBeLessThan(0.12);
});
