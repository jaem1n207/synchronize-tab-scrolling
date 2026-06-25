import browser from 'webextension-polyfill';

import { detectBrowserType } from './url-utils';

export interface FileSchemeAccessInfo {
  canCheck: boolean;
  allowed: boolean;
  settingsUrl: string;
}

export interface FileSchemeAccessRoot {
  navigator?: Navigator;
  chrome?: {
    extension?: {
      isAllowedFileSchemeAccess?: () => Promise<boolean> | boolean;
    };
  };
}

export function getFileSchemeSettingsUrl(
  browserType: ReturnType<typeof detectBrowserType>,
  extensionId = browser.runtime.id,
): string {
  if (browserType === 'edge') {
    return `edge://extensions/?id=${extensionId}`;
  }

  return `chrome://extensions/?id=${extensionId}`;
}

export async function getFileSchemeAccessInfo(
  root: FileSchemeAccessRoot = globalThis,
): Promise<FileSchemeAccessInfo> {
  const settingsUrl = getFileSchemeSettingsUrl(detectBrowserType());
  const isAllowedFileSchemeAccess = root.chrome?.extension?.isAllowedFileSchemeAccess;

  if (!isAllowedFileSchemeAccess) {
    return {
      canCheck: false,
      allowed: false,
      settingsUrl,
    };
  }

  try {
    return {
      canCheck: true,
      allowed: await isAllowedFileSchemeAccess(),
      settingsUrl,
    };
  } catch {
    return {
      canCheck: false,
      allowed: false,
      settingsUrl,
    };
  }
}
