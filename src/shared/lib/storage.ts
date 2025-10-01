/**
 * Browser storage utility for state persistence
 * Implements requirement: State persistence with browser.storage
 */

import * as Browser from 'webextension-polyfill';

import type { PanelPosition } from '~/popup/types';
import type { SyncMode } from '~/shared/types/messages';

/**
 * Storage keys
 */
const STORAGE_KEYS = {
  PANEL_POSITION: 'panelPosition',
  SYNC_MODE: 'syncMode',
  IS_PANEL_MINIMIZED: 'isPanelMinimized',
  SELECTED_TAB_IDS: 'selectedTabIds',
} as const;

/**
 * Save panel position
 */
export async function savePanelPosition(position: PanelPosition): Promise<void> {
  try {
    await Browser.storage.local.set({
      [STORAGE_KEYS.PANEL_POSITION]: position,
    });
  } catch (error) {
    console.error('Failed to save panel position:', error);
  }
}

/**
 * Load panel position
 */
export async function loadPanelPosition(): Promise<PanelPosition | null> {
  try {
    const result = await Browser.storage.local.get(STORAGE_KEYS.PANEL_POSITION);
    return (result[STORAGE_KEYS.PANEL_POSITION] as PanelPosition) || null;
  } catch (error) {
    console.error('Failed to load panel position:', error);
    return null;
  }
}

/**
 * Save sync mode preference
 */
export async function saveSyncMode(mode: SyncMode): Promise<void> {
  try {
    await Browser.storage.local.set({
      [STORAGE_KEYS.SYNC_MODE]: mode,
    });
  } catch (error) {
    console.error('Failed to save sync mode:', error);
  }
}

/**
 * Load sync mode preference
 */
export async function loadSyncMode(): Promise<SyncMode> {
  try {
    const result = await Browser.storage.local.get(STORAGE_KEYS.SYNC_MODE);
    return (result[STORAGE_KEYS.SYNC_MODE] as SyncMode) || 'ratio';
  } catch (error) {
    console.error('Failed to load sync mode:', error);
    return 'ratio';
  }
}

/**
 * Save panel minimized state
 */
export async function savePanelMinimized(isMinimized: boolean): Promise<void> {
  try {
    await Browser.storage.local.set({
      [STORAGE_KEYS.IS_PANEL_MINIMIZED]: isMinimized,
    });
  } catch (error) {
    console.error('Failed to save panel minimized state:', error);
  }
}

/**
 * Load panel minimized state
 */
export async function loadPanelMinimized(): Promise<boolean> {
  try {
    const result = await Browser.storage.local.get(STORAGE_KEYS.IS_PANEL_MINIMIZED);
    return (result[STORAGE_KEYS.IS_PANEL_MINIMIZED] as boolean) || false;
  } catch (error) {
    console.error('Failed to load panel minimized state:', error);
    return false;
  }
}

/**
 * Save selected tab IDs (for persistence across popup reopens)
 */
export async function saveSelectedTabIds(tabIds: Array<number>): Promise<void> {
  try {
    await Browser.storage.local.set({
      [STORAGE_KEYS.SELECTED_TAB_IDS]: tabIds,
    });
  } catch (error) {
    console.error('Failed to save selected tab IDs:', error);
  }
}

/**
 * Load selected tab IDs
 */
export async function loadSelectedTabIds(): Promise<Array<number>> {
  try {
    const result = await Browser.storage.local.get(STORAGE_KEYS.SELECTED_TAB_IDS);
    return (result[STORAGE_KEYS.SELECTED_TAB_IDS] as Array<number>) || [];
  } catch (error) {
    console.error('Failed to load selected tab IDs:', error);
    return [];
  }
}

/**
 * Clear all stored data
 */
export async function clearStorage(): Promise<void> {
  try {
    await Browser.storage.local.clear();
  } catch (error) {
    console.error('Failed to clear storage:', error);
  }
}
