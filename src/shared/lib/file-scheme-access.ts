import browser from 'webextension-polyfill';

import { ExtensionLogger } from './logger';
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

const logger = new ExtensionLogger({ scope: 'file-scheme-access' });

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
  } catch (error) {
    void logger.warn('Failed to check file scheme access:', error);
    return {
      canCheck: false,
      allowed: false,
      settingsUrl,
    };
  }
}
