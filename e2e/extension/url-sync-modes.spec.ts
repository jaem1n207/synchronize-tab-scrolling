import { test, expect } from './fixtures';

import type { Page } from '@playwright/test';

const FOLLOW_CHANGED_TAB_NAME = /Follow changed tab|변경한 탭 따라가기/i;
const KEEP_EACH_TABS_WEBSITE_NAME = /Keep each tab's website|각 탭의 웹사이트 유지/i;
const LANGUAGE_HELPER_COPY =
  /Languages are kept when possible\.|가능한 경우 언어 설정은 유지됩니다\./i;
const START_SYNC_NAME = /Start synchronization|동기화 시작/i;
const STOP_SYNC_NAME = /Stop synchronization|동기화 중지/i;
const URL_SYNC_SWITCH_NAME = /URL Sync|URL 동기화 여부/i;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function selectTabCheckboxName(tabTitle: string): RegExp {
  const escapedTitle = escapeRegExp(tabTitle);
  return new RegExp(`^(?:Select ${escapedTitle}|${escapedTitle} 선택)$`);
}

async function selectTabsAndStartSync(
  popup: Page,
  sourceTitle: string,
  targetTitle: string,
): Promise<void> {
  await popup.getByRole('checkbox', { name: selectTabCheckboxName(sourceTitle) }).click();
  await popup.getByRole('checkbox', { name: selectTabCheckboxName(targetTitle) }).click();
  await popup.getByRole('button', { name: START_SYNC_NAME }).click();
  await expect(popup.getByRole('button', { name: STOP_SYNC_NAME })).toBeVisible();
}

async function chooseKeepEachTabsWebsiteMode(popup: Page): Promise<void> {
  const keepWebsiteRadio = popup.getByRole('radio', { name: KEEP_EACH_TABS_WEBSITE_NAME });

  await popup.getByText(KEEP_EACH_TABS_WEBSITE_NAME).click();
  await expect(keepWebsiteRadio).toBeChecked();
}

async function turnUrlSyncOff(popup: Page): Promise<void> {
  const urlSyncSwitch = popup.getByRole('switch', { name: URL_SYNC_SWITCH_NAME });

  await urlSyncSwitch.click();
  await expect(urlSyncSwitch).not.toBeChecked();
}

test.describe('URL Sync modes', () => {
  test('default Follow changed tab moves target to source website while preserving target language and hash', async ({
    extensionContext,
    fixtureSites,
    openPopup,
  }) => {
    const source = await extensionContext.newPage();
    const target = await extensionContext.newPage();

    await source.goto(fixtureSites.primary.url('/en/home?view=compact#primary-home'));
    await target.goto(fixtureSites.comparison.url('/ko/home?view=compact#comparison-home'));

    const popup = await openPopup();
    await expect(popup.getByRole('radio', { name: FOLLOW_CHANGED_TAB_NAME })).toBeChecked();
    await selectTabsAndStartSync(popup, 'Primary Home', 'Comparison Home');

    await source.goto(fixtureSites.primary.url('/en/about?tab=pricing#plans'));

    await expect(target).toHaveURL(
      fixtureSites.primary.url('/ko/about?tab=pricing#comparison-home'),
    );
  });

  test("Keep each tab's website keeps target origin while applying changed page", async ({
    extensionContext,
    fixtureSites,
    openPopup,
  }) => {
    const source = await extensionContext.newPage();
    const target = await extensionContext.newPage();

    await source.goto(fixtureSites.primary.url('/en/home?view=compact#primary-home'));
    await target.goto(fixtureSites.comparison.url('/ko/home?view=compact#comparison-home'));

    const popup = await openPopup();
    await chooseKeepEachTabsWebsiteMode(popup);
    await selectTabsAndStartSync(popup, 'Primary Home', 'Comparison Home');

    await source.goto(fixtureSites.primary.url('/en/about?tab=pricing#plans'));

    await expect(target).toHaveURL(
      fixtureSites.comparison.url('/ko/about?tab=pricing#comparison-home'),
    );
  });

  test('URL Sync off prevents target navigation', async ({
    extensionContext,
    fixtureSites,
    openPopup,
  }) => {
    const source = await extensionContext.newPage();
    const target = await extensionContext.newPage();
    const targetInitialUrl = fixtureSites.comparison.url('/ko/home?view=compact#comparison-home');

    await source.goto(fixtureSites.primary.url('/en/home?view=compact#primary-home'));
    await target.goto(targetInitialUrl);

    const popup = await openPopup();
    await turnUrlSyncOff(popup);
    await selectTabsAndStartSync(popup, 'Primary Home', 'Comparison Home');

    await source.goto(fixtureSites.primary.url('/en/about?tab=pricing#plans'));

    const didNavigate = await target
      .waitForURL((url) => url.href !== targetInitialUrl, { timeout: 1_000 })
      .then(() => true)
      .catch(() => false);

    expect(didNavigate).toBe(false);
    await expect(target).toHaveURL(targetInitialUrl);
  });

  test('selected mode remains visible and persisted when popup is reopened', async ({
    extensionContext,
    fixtureSites,
    openPopup,
  }) => {
    const source = await extensionContext.newPage();
    const target = await extensionContext.newPage();

    await source.goto(fixtureSites.primary.url('/en/home'));
    await target.goto(fixtureSites.comparison.url('/ko/home'));

    const firstPopup = await openPopup();
    await chooseKeepEachTabsWebsiteMode(firstPopup);
    await firstPopup.close();

    const secondPopup = await openPopup();
    await expect(
      secondPopup.getByRole('radio', { name: KEEP_EACH_TABS_WEBSITE_NAME }),
    ).toBeChecked();
    await expect(secondPopup.getByText(LANGUAGE_HELPER_COPY)).toBeVisible();
  });
});
