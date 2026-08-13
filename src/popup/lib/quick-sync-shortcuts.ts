import { toQuickSyncShortcutLabel } from '~/shared/lib/quick-sync';

import type browser from 'webextension-polyfill';

const QUICK_SYNC_COMMAND_NAME = 'quick-sync-start-or-add';

export type ShortcutSettingsBrowser = 'chrome' | 'edge' | 'brave' | 'firefox' | 'chromium-other';

export type ShortcutSettingsRoute =
  | { kind: 'firefox-api' }
  | { kind: 'internal-page'; url: string };

export type QuickSyncShortcutAssignment =
  | {
      status: 'assigned';
      rawShortcut: string;
      label: string;
    }
  | { status: 'unassigned' };

export function findQuickSyncAssignment(
  commands: ReadonlyArray<browser.Commands.Command>,
  platform: 'mac' | 'other',
): QuickSyncShortcutAssignment {
  const shortcut = commands.find((command) => command.name === QUICK_SYNC_COMMAND_NAME)?.shortcut;
  if (shortcut === undefined || shortcut.length === 0) {
    return { status: 'unassigned' };
  }

  return {
    status: 'assigned',
    rawShortcut: shortcut,
    label: toQuickSyncShortcutLabel(shortcut, platform),
  };
}

export function getShortcutSettingsRoute(
  browserName: ShortcutSettingsBrowser,
): ShortcutSettingsRoute {
  switch (browserName) {
    case 'firefox':
      return { kind: 'firefox-api' };
    case 'edge':
      return { kind: 'internal-page', url: 'edge://extensions/shortcuts' };
    case 'brave':
      return { kind: 'internal-page', url: 'brave://extensions/shortcuts' };
    case 'chrome':
    case 'chromium-other':
      return { kind: 'internal-page', url: 'chrome://extensions/shortcuts' };
  }
}

export function hasBraveRuntime(
  value: unknown,
): value is { brave: { isBrave: () => Promise<boolean> } } {
  if (typeof value !== 'object' || value === null || !('brave' in value)) {
    return false;
  }

  const brave = value.brave;
  return (
    typeof brave === 'object' &&
    brave !== null &&
    'isBrave' in brave &&
    typeof brave.isBrave === 'function'
  );
}

function hasGoogleChromeBrand(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || !('userAgentData' in value)) {
    return false;
  }

  const userAgentData = value.userAgentData;
  if (
    typeof userAgentData !== 'object' ||
    userAgentData === null ||
    !('brands' in userAgentData) ||
    !Array.isArray(userAgentData.brands)
  ) {
    return false;
  }

  return userAgentData.brands.some(
    (brand) =>
      typeof brand === 'object' &&
      brand !== null &&
      'brand' in brand &&
      brand.brand === 'Google Chrome',
  );
}

export async function detectShortcutSettingsBrowser(
  userAgent: string,
  runtimeValue: unknown,
): Promise<ShortcutSettingsBrowser> {
  if (/\bFirefox\//.test(userAgent)) {
    return 'firefox';
  }
  if (/\bEdg\//.test(userAgent)) {
    return 'edge';
  }

  if (hasBraveRuntime(runtimeValue)) {
    const isBrave = await runtimeValue.brave.isBrave().catch(() => false);
    if (isBrave) {
      return 'brave';
    }
  }

  if (hasGoogleChromeBrand(runtimeValue)) {
    return 'chrome';
  }

  return 'chromium-other';
}
