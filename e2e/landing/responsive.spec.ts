import { expect, test } from '@playwright/test';

import type { Page } from '@playwright/test';

async function expectInstallLinksVisible(page: Page) {
  await expect(page.getByRole('link', { name: /Add to /i }).first()).toBeVisible();
}

test('desktop layout shows desktop nav and hides mobile menu button', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/landing/');

  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Features' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open menu' })).toBeHidden();
  await expectInstallLinksVisible(page);
});

test('mobile layout hides desktop nav and shows mobile menu button', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/landing/');

  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible();
  await expectInstallLinksVisible(page);
});

test('tablet layout uses desktop navigation at md breakpoint', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/landing/');

  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open menu' })).toBeHidden();
  await expect(page.getByRole('link', { name: 'Use Cases' })).toBeVisible();
  await expectInstallLinksVisible(page);
});
