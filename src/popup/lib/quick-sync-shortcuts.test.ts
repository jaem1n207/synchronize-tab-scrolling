import { describe, expect, it, vi } from 'vitest';

import {
  detectShortcutSettingsBrowser,
  findQuickSyncAssignment,
  getShortcutSettingsRoute,
  hasBraveRuntime,
} from './quick-sync-shortcuts';

import type { ShortcutSettingsBrowser, ShortcutSettingsRoute } from './quick-sync-shortcuts';
import type browser from 'webextension-polyfill';

const commands: Array<browser.Commands.Command> = [
  { name: '_execute_action', shortcut: 'Command+Shift+Y' },
  {
    name: 'quick-sync-start-or-add',
    shortcut: 'Command+Alt+Period',
  },
];

describe('findQuickSyncAssignment', () => {
  it('uses only the exact browser-reported Quick Sync assignment', () => {
    expect(findQuickSyncAssignment(commands, 'mac')).toEqual({
      status: 'assigned',
      rawShortcut: 'Command+Alt+Period',
      label: '⌘ ⌥ .',
    });
  });

  it('treats an empty shortcut as unassigned without using another command', () => {
    expect(
      findQuickSyncAssignment(
        [
          { name: '_execute_action', shortcut: 'Command+Shift+Y' },
          { name: 'quick-sync-start-or-add', shortcut: '' },
        ],
        'mac',
      ),
    ).toEqual({ status: 'unassigned' });
  });

  it('treats a missing command or shortcut as unassigned', () => {
    expect(
      findQuickSyncAssignment([{ name: '_execute_action', shortcut: 'Ctrl+Y' }], 'other'),
    ).toEqual({ status: 'unassigned' });
    expect(findQuickSyncAssignment([{ name: 'quick-sync-start-or-add' }], 'other')).toEqual({
      status: 'unassigned',
    });
  });

  it('formats platform tokens and preserves tokens it does not recognize', () => {
    expect(
      findQuickSyncAssignment(
        [{ name: 'quick-sync-start-or-add', shortcut: 'Ctrl+Hyper+MediaPlayPause' }],
        'other',
      ),
    ).toEqual({
      status: 'assigned',
      rawShortcut: 'Ctrl+Hyper+MediaPlayPause',
      label: 'Ctrl Hyper MediaPlayPause',
    });
  });
});

describe('getShortcutSettingsRoute', () => {
  const routeCases: Array<
    [ShortcutSettingsBrowser, Extract<ShortcutSettingsRoute, { kind: 'internal-page' }>['url']]
  > = [
    ['edge', 'edge://extensions/shortcuts'],
    ['brave', 'brave://extensions/shortcuts'],
    ['chrome', 'chrome://extensions/shortcuts'],
    ['chromium-other', 'chrome://extensions/shortcuts'],
  ];

  it.each(routeCases)('maps %s to its exact internal page', (browserName, expectedUrl) => {
    expect(getShortcutSettingsRoute(browserName)).toEqual({
      kind: 'internal-page',
      url: expectedUrl,
    });
  });

  it('uses the native Firefox API route', () => {
    expect(getShortcutSettingsRoute('firefox')).toEqual({
      kind: 'firefox-api',
    });
  });
});

describe('detectShortcutSettingsBrowser', () => {
  const userAgentCases: Array<[string, ShortcutSettingsBrowser]> = [
    ['Mozilla/5.0 Firefox/141.0', 'firefox'],
    ['Mozilla/5.0 Chrome/140.0 Safari/537.36 Edg/140.0', 'edge'],
  ];

  it.each(userAgentCases)(
    'uses the stable user-agent marker for %s',
    async (userAgent, expected) => {
      await expect(detectShortcutSettingsBrowser(userAgent, {})).resolves.toBe(expected);
    },
  );

  it('feature-detects Brave with a strict runtime guard', async () => {
    const isBrave = vi.fn().mockResolvedValue(true);
    const runtime = { brave: { isBrave } };

    expect(hasBraveRuntime(runtime)).toBe(true);
    await expect(
      detectShortcutSettingsBrowser('Mozilla/5.0 Chrome/140.0 Safari/537.36', runtime),
    ).resolves.toBe('brave');
    expect(isBrave).toHaveBeenCalledOnce();
  });

  it.each([null, {}, { brave: null }, { brave: {} }, { brave: { isBrave: true } }])(
    'rejects malformed Brave runtime values',
    (value) => {
      expect(hasBraveRuntime(value)).toBe(false);
    },
  );

  it('identifies Chrome only from its stable browser brand', async () => {
    await expect(
      detectShortcutSettingsBrowser('Mozilla/5.0 Chrome/140.0 Safari/537.36', {
        userAgentData: {
          brands: [{ brand: 'Google Chrome', version: '140' }],
        },
      }),
    ).resolves.toBe('chrome');
  });

  it('classifies an unknown Chromium derivative as chromium-other', async () => {
    await expect(
      detectShortcutSettingsBrowser('Mozilla/5.0 Chrome/140.0 Safari/537.36', {
        userAgentData: {
          brands: [{ brand: 'Chromium', version: '140' }],
        },
      }),
    ).resolves.toBe('chromium-other');
  });
});
