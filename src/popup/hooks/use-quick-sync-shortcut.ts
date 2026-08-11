import { useCallback, useEffect, useRef, useState } from 'react';

import browser from 'webextension-polyfill';

import {
  detectShortcutSettingsBrowser,
  findQuickSyncAssignment,
  getShortcutSettingsRoute,
} from '~/popup/lib/quick-sync-shortcuts';
import type {
  QuickSyncShortcutAssignment,
  ShortcutSettingsBrowser,
} from '~/popup/lib/quick-sync-shortcuts';

export type QuickSyncShortcutState =
  | { status: 'loading' }
  | QuickSyncShortcutAssignment
  | { status: 'unavailable' };

export type ShortcutSettingsResult =
  | { status: 'idle' | 'opening' | 'opened' }
  | {
      status: 'fallback';
      browser: ShortcutSettingsBrowser;
      settingsUrl?: string;
    };

export interface UseQuickSyncShortcutResult {
  assignment: QuickSyncShortcutState;
  settingsResult: ShortcutSettingsResult;
  openSettings: () => Promise<ShortcutSettingsResult>;
}

interface CommandChangeEvent {
  addListener: (listener: (changeInfo: browser.Commands.OnChangedChangeInfoType) => void) => void;
  removeListener: (
    listener: (changeInfo: browser.Commands.OnChangedChangeInfoType) => void,
  ) => void;
}

function getShortcutPlatform(): 'mac' | 'other' {
  return /\bMacintosh\b|\bMac OS X\b/.test(navigator.userAgent) ? 'mac' : 'other';
}

function isCommandChangeEvent(value: unknown): value is CommandChangeEvent {
  return (
    typeof value === 'object' &&
    value !== null &&
    'addListener' in value &&
    typeof value.addListener === 'function' &&
    'removeListener' in value &&
    typeof value.removeListener === 'function'
  );
}

export function useQuickSyncShortcut(): UseQuickSyncShortcutResult {
  const [assignment, setAssignment] = useState<QuickSyncShortcutState>({ status: 'loading' });
  const [settingsResult, setSettingsResult] = useState<ShortcutSettingsResult>({ status: 'idle' });
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    let disposed = false;
    let requestGeneration = 0;

    const refreshAssignment = async (): Promise<void> => {
      const generation = ++requestGeneration;
      try {
        const commands = await browser.commands.getAll();
        if (!disposed && generation === requestGeneration) {
          setAssignment(findQuickSyncAssignment(commands, getShortcutPlatform()));
        }
      } catch {
        if (!disposed && generation === requestGeneration) {
          setAssignment({ status: 'unavailable' });
        }
      }
    };

    const handleCommandChange = (changeInfo: browser.Commands.OnChangedChangeInfoType): void => {
      if (changeInfo.name === 'quick-sync-start-or-add') {
        void refreshAssignment();
      }
    };

    const commandChangeEvent: unknown = browser.commands.onChanged;
    if (isCommandChangeEvent(commandChangeEvent)) {
      commandChangeEvent.addListener(handleCommandChange);
    }
    void refreshAssignment();

    return () => {
      disposed = true;
      mountedRef.current = false;
      if (isCommandChangeEvent(commandChangeEvent)) {
        commandChangeEvent.removeListener(handleCommandChange);
      }
    };
  }, []);

  const commitSettingsResult = useCallback((result: ShortcutSettingsResult) => {
    if (mountedRef.current) {
      setSettingsResult(result);
    }
    return result;
  }, []);

  const openSettings = useCallback(async (): Promise<ShortcutSettingsResult> => {
    commitSettingsResult({ status: 'opening' });
    const browserName = await detectShortcutSettingsBrowser(navigator.userAgent, navigator);
    const route = getShortcutSettingsRoute(browserName);

    if (route.kind === 'firefox-api') {
      if (typeof browser.commands.openShortcutSettings === 'function') {
        try {
          await browser.commands.openShortcutSettings();
          return commitSettingsResult({ status: 'opened' });
        } catch {
          // The native API exists but is unavailable in this Firefox context.
        }
      }

      await browser.tabs.create({ active: true, url: 'about:addons' }).catch(() => undefined);
      return commitSettingsResult({
        status: 'fallback',
        browser: 'firefox',
      });
    }

    try {
      await browser.tabs.create({ active: true, url: route.url });
      return commitSettingsResult({ status: 'opened' });
    } catch {
      return commitSettingsResult({
        status: 'fallback',
        browser: browserName,
        settingsUrl: route.url,
      });
    }
  }, [commitSettingsResult]);

  return {
    assignment,
    settingsResult,
    openSettings,
  };
}
