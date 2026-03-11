import { expect, test } from '@playwright/test';

const EN_HEADLINE = 'Stop losing your place.';
const KO_HEADLINE_REGEX = /더 이상 스크롤 위치를\s*잃지 마세요\./;
const DE_HEADLINE = 'Nie wieder den Überblick verlieren.';

test.beforeEach(async ({ page }) => {
  await page.goto('/landing/');
  await page.evaluate(() => {
    window.localStorage.setItem('landing-locale', 'en');
  });
  await page.reload();
});

test('defaults to English', async ({ page }) => {
  await expect(page.getByRole('heading', { level: 1, name: EN_HEADLINE })).toBeVisible();
  await expect(page.getByRole('button', { name: /English: Change language/i })).toBeVisible();
  await expect.poll(async () => page.evaluate(() => document.documentElement.lang)).toBe('en');
});

test('switches to Korean and updates document language', async ({ page }) => {
  await page.getByRole('button', { name: /English: Change language/i }).click();
  await page.getByRole('menuitem', { name: '한국어' }).click();

  await expect(page.getByRole('heading', { level: 1, name: KO_HEADLINE_REGEX })).toBeVisible();
  await expect(page.getByRole('button', { name: /한국어: Change language/i })).toBeVisible();
  await expect.poll(async () => page.evaluate(() => document.documentElement.lang)).toBe('ko');
});

test('language persists after reload via localStorage', async ({ page }) => {
  await page.getByRole('button', { name: /English: Change language/i }).click();
  await page.getByRole('menuitem', { name: '한국어' }).click();
  await expect(page.getByRole('heading', { level: 1, name: KO_HEADLINE_REGEX })).toBeVisible();

  await page.reload();

  await expect(page.getByRole('heading', { level: 1, name: KO_HEADLINE_REGEX })).toBeVisible();
  await expect(page.getByRole('button', { name: /한국어: Change language/i })).toBeVisible();
  await expect
    .poll(async () => page.evaluate(() => localStorage.getItem('landing-locale')))
    .toBe('ko');
});

test('supports multiple languages (English, Korean, German)', async ({ page }) => {
  await expect(page.getByRole('heading', { level: 1, name: EN_HEADLINE })).toBeVisible();

  await page.getByRole('button', { name: /English: Change language/i }).click();
  await page.getByRole('menuitem', { name: '한국어' }).click();
  await expect(page.getByRole('heading', { level: 1, name: KO_HEADLINE_REGEX })).toBeVisible();

  await page.getByRole('button', { name: /한국어: Change language/i }).click();
  await page.getByRole('menuitem', { name: 'Deutsch' }).click();
  await expect(page.getByRole('heading', { level: 1, name: DE_HEADLINE })).toBeVisible();
  await expect.poll(async () => page.evaluate(() => document.documentElement.lang)).toBe('de');

  await page.getByRole('button', { name: /Deutsch: Change language/i }).click();
  await page.getByRole('menuitem', { name: 'English' }).click();
  await expect(page.getByRole('heading', { level: 1, name: EN_HEADLINE })).toBeVisible();
  await expect.poll(async () => page.evaluate(() => document.documentElement.lang)).toBe('en');
});
