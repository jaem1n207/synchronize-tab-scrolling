import { test, expect } from './fixtures';

import type { Page } from '@playwright/test';

const ACTIONS_NAME = /Actions|작업/i;
const ACTIVE_SYNC_HEADING = /Scroll sync is active|스크롤 동기화 중/i;
const ACTIVE_SYNC_TABS_NAME = /Tabs scrolling together|함께 스크롤하는 탭/i;
const ADD_TAB_NAME = /Add to current sync|동기화에 추가하기/i;
const AUTO_SYNC_NAME = /Suggest same-page tabs|같은 페이지 탭 자동 제안/i;
const CURRENT_WINDOW_NAME = /Current window|현재 창/i;
const OTHER_WINDOW_NAME = /Other window|다른 창/i;
const START_SYNC_NAME =
  /^(?:Start synchronization|동기화 시작|Select at least 2 tabs to start \(\d+ selected\)|시작하려면 2개 이상의 탭을 선택하세요 \(\d+개 선택됨\))$/i;
const STOP_SYNC_NAME = /Stop synchronization|동기화 중지/i;

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
  await expect(popup.getByRole('heading', { name: ACTIVE_SYNC_HEADING })).toBeVisible();
}

async function scrollTo(page: Page, scrollY: number): Promise<void> {
  await page.evaluate((nextScrollY) => {
    window.scrollTo(0, nextScrollY);
  }, scrollY);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scrollY);
}

async function expectScrollY(page: Page, scrollY: number): Promise<void> {
  await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 3_000 }).toBe(scrollY);
}

async function expectScrollRemains(page: Page, scrollY: number): Promise<void> {
  let consecutiveStableSamples = 0;

  await expect
    .poll(
      async () => {
        const currentScrollY = await page.evaluate(() => window.scrollY);
        consecutiveStableSamples = currentScrollY === scrollY ? consecutiveStableSamples + 1 : 0;
        return consecutiveStableSamples;
      },
      {
        intervals: [75, 100, 125, 150],
        timeout: 1_000,
      },
    )
    .toBeGreaterThanOrEqual(4);
}

async function readScrollY(page: Page): Promise<number> {
  return page.evaluate(() => window.scrollY);
}

async function openPopupWithLinkedTabCount(
  openPopup: () => Promise<Page>,
  expectedCount: number,
): Promise<Page> {
  let popup: Page | undefined;

  await expect
    .poll(
      async () => {
        if (popup !== undefined && !popup.isClosed()) {
          await popup.close();
        }
        popup = await openPopup();
        return popup
          .getByRole('list', { name: ACTIVE_SYNC_TABS_NAME })
          .getByRole('listitem')
          .count();
      },
      {
        intervals: [100, 200, 300, 500],
        timeout: 5_000,
      },
    )
    .toBe(expectedCount);

  if (popup === undefined) {
    throw new Error('Authoritative active popup did not open');
  }
  return popup;
}

async function enableAutoSync(popup: Page): Promise<void> {
  await popup.getByRole('button', { name: ACTIONS_NAME }).click();
  await popup.getByRole('option').filter({ hasText: AUTO_SYNC_NAME }).click();
  await popup.keyboard.press('Escape');
}

test.describe('Quick Sync shared session workflows', () => {
  test('popup Start relays scrolling and Stop restores independent scrolling', async ({
    extensionContext,
    fixtureSites,
    openPopup,
  }) => {
    const source = await extensionContext.newPage();
    const target = await extensionContext.newPage();

    await source.goto(fixtureSites.primary.url('/session-source'));
    await target.goto(fixtureSites.comparison.url('/session-target'));

    const popup = await openPopup();
    await selectTabsAndStartSync(popup, 'Primary Home', 'Comparison Home');

    await scrollTo(source, 720);
    await expectScrollY(target, 720);

    await popup.getByRole('button', { name: STOP_SYNC_NAME }).click();
    await expect(popup.getByRole('button', { name: START_SYNC_NAME })).toBeVisible();

    const stoppedTargetScrollY = await readScrollY(target);
    await scrollTo(source, 1_080);
    await expectScrollRemains(target, stoppedTargetScrollY);
  });

  test('active snapshot labels tabs in the popup window and another browser window', async ({
    extensionContext,
    fixtureSites,
    movePageToNewWindow,
    openPopup,
  }) => {
    const source = await extensionContext.newPage();
    const target = await extensionContext.newPage();

    await source.goto(fixtureSites.primary.url('/cross-window-source'));
    await target.goto(fixtureSites.comparison.url('/cross-window-target'));

    const setupPopup = await openPopup();
    await selectTabsAndStartSync(setupPopup, 'Primary Home', 'Comparison Home');
    await setupPopup.close();
    await movePageToNewWindow(target);

    const activePopup = await openPopup();
    const activeTabs = activePopup.getByRole('list', { name: ACTIVE_SYNC_TABS_NAME });
    const sourceRow = activeTabs.getByRole('listitem').filter({ hasText: 'Primary Home' });
    const targetRow = activeTabs.getByRole('listitem').filter({ hasText: 'Comparison Home' });

    await expect(sourceRow.getByText(CURRENT_WINDOW_NAME)).toBeVisible();
    await expect(targetRow.getByText(OTHER_WINDOW_NAME)).toBeVisible();
  });

  test('accepted add suggestion preserves original scroll positions and pixel delta', async ({
    extensionContext,
    fixtureSites,
    openPopup,
  }) => {
    const source = await extensionContext.newPage();
    const offsetTarget = await extensionContext.newPage();
    const matchingUrl = fixtureSites.primary.url('/suggestion-match');

    await source.goto(matchingUrl);
    await offsetTarget.goto(fixtureSites.comparison.url('/suggestion-target'));

    const setupPopup = await openPopup();
    await enableAutoSync(setupPopup);
    await selectTabsAndStartSync(setupPopup, 'Primary Home', 'Comparison Home');

    await scrollTo(source, 600);
    await expectScrollY(offsetTarget, 600);

    await offsetTarget.bringToFront();
    await offsetTarget.keyboard.down('Alt');
    await scrollTo(offsetTarget, 840);
    await offsetTarget.keyboard.up('Alt');
    await expect(offsetTarget.locator('html')).not.toHaveClass(/scroll-sync-manual-mode/);

    await source.bringToFront();
    await scrollTo(source, 900);
    await expectScrollY(offsetTarget, 1_140);

    const preAddSourceScrollY = await readScrollY(source);
    const preAddTargetScrollY = await readScrollY(offsetTarget);
    const preAddPixelDelta = preAddTargetScrollY - preAddSourceScrollY;

    const addedTab = await extensionContext.newPage();
    await addedTab.goto(matchingUrl);

    const addButton = addedTab.getByRole('button', { name: ADD_TAB_NAME });
    await expect(addButton).toBeVisible();
    await addButton.click();

    const activePopup = await openPopupWithLinkedTabCount(openPopup, 3);
    const activeTabs = activePopup.getByRole('list', { name: ACTIVE_SYNC_TABS_NAME });
    await expect(activeTabs.getByRole('listitem')).toHaveCount(3);

    const postAddSourceScrollY = await readScrollY(source);
    const postAddTargetScrollY = await readScrollY(offsetTarget);
    const postAddPixelDelta = postAddTargetScrollY - postAddSourceScrollY;

    expect(postAddSourceScrollY).toBe(preAddSourceScrollY);
    expect(postAddTargetScrollY).toBe(preAddTargetScrollY);
    expect(postAddPixelDelta).toBe(preAddPixelDelta);

    await scrollTo(source, 1_050);
    await expectScrollY(offsetTarget, 1_290);
    await expectScrollY(addedTab, 1_050);
  });
});
