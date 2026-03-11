import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/landing/');
});

test('header nav scrolls to Features anchor', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Features' })
    .click();
  await expect(page.locator('#features')).toBeInViewport();
});

test('header nav scrolls to Use Cases anchor', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Use Cases' })
    .click();
  await expect(page.locator('#use-cases')).toBeInViewport();
});

test('mobile menu opens, navigates, and closes on link click', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });

  const menuToggle = page.getByRole('button', { name: 'Open menu' });
  await expect(menuToggle).toBeVisible();
  await menuToggle.click();

  const mobileNav = page.getByRole('navigation', { name: 'Mobile navigation' });
  await expect(mobileNav).toBeVisible();

  await mobileNav.getByRole('link', { name: 'Features' }).click();
  await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toHaveCount(0);
});

test('header becomes opaque with blur after scrolling', async ({ page }) => {
  const header = page.getByRole('banner');
  await expect(header).toBeVisible();

  await page.mouse.wheel(0, 1200);

  await expect
    .poll(async () => {
      return header.evaluate((element) => element.className);
    })
    .toContain('backdrop-blur-lg');
});

test('logo button scrolls page back to top', async ({ page }) => {
  await page.mouse.wheel(0, 3000);
  await expect.poll(async () => page.evaluate(() => window.scrollY)).toBeGreaterThan(20);

  await page.getByRole('button', { name: 'Synchronize Tab Scrolling' }).click();

  await expect.poll(async () => page.evaluate(() => window.scrollY)).toBeLessThan(20);
});
