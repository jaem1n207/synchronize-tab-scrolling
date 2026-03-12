import { expect, test } from '@playwright/test';

const STORE_HOST_PATTERNS = [
  'https://chromewebstore.google.com/',
  'https://addons.mozilla.org/',
  'https://microsoftedge.microsoft.com/',
];

test.beforeEach(async ({ page }) => {
  await page.goto('/landing/');
});

test('loads page and renders core SEO tags', async ({ page }) => {
  await expect(
    page.getByRole('heading', { level: 1, name: 'Stop losing your place.' }),
  ).toBeVisible();
  await expect(page).toHaveTitle(/Synchronize Tab Scrolling/i);

  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    'content',
    /Synchronize Tab Scrolling/,
  );
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute(
    'content',
    /.{10,}/,
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    /og-image\.png$/,
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    /synchronize-tab-scrolling/,
  );

  const jsonLdScripts = page.locator('script[type="application/ld+json"]');
  await expect(jsonLdScripts).toHaveCount(2);

  const jsonLdContents = await jsonLdScripts.evaluateAll((scripts) =>
    scripts.map((el) => el.textContent ?? ''),
  );
  for (const content of jsonLdContents) {
    const parsed = JSON.parse(content);
    expect(parsed).toHaveProperty('@context', 'https://schema.org');
    expect(parsed).toHaveProperty('@type');
  }
});

test('renders critical sections', async ({ page }) => {
  await expect(
    page.getByRole('heading', { level: 1, name: 'Stop losing your place.' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Features' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Who is this for?' })).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 2, name: 'Privacy first. Always.' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Ready to sync?' })).toBeVisible();
  await expect(page.getByRole('contentinfo')).toBeVisible();
});

test('install links point to real store domains', async ({ page }) => {
  await expect(
    page.getByRole('heading', { level: 1, name: 'Stop losing your place.' }),
  ).toBeVisible();

  const installHrefs = await page.evaluate(() => {
    const selectors = [
      'a[data-umami-event="install-primary"]',
      'a[data-umami-event="install-secondary"]',
    ];
    return selectors.flatMap((sel) =>
      Array.from(document.querySelectorAll(sel)).map((el) => el.getAttribute('href') ?? ''),
    );
  });

  expect(installHrefs.length).toBeGreaterThan(0);
  for (const href of installHrefs) {
    expect(STORE_HOST_PATTERNS.some((prefix) => href.startsWith(prefix))).toBeTruthy();
  }
});

test('external links open safely in new tab', async ({ page }) => {
  await expect(
    page.getByRole('heading', { level: 1, name: 'Stop losing your place.' }),
  ).toBeVisible();

  const externalLinkAttrs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a[href^="http"]')).map((anchor) => ({
      href: anchor.getAttribute('href') ?? '',
      target: anchor.getAttribute('target') ?? '',
      rel: anchor.getAttribute('rel') ?? '',
    }));
  });

  expect(externalLinkAttrs.length).toBeGreaterThan(0);

  for (const link of externalLinkAttrs) {
    expect(link.target).toBe('_blank');
    expect(link.rel.includes('noopener')).toBeTruthy();
    expect(link.rel.includes('noreferrer')).toBeTruthy();
  }
});
