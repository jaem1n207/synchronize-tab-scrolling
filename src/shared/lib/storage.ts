/**
 * Browser storage utility for state persistence
 * Implements requirement: State persistence with browser.storage
 */

import browser from 'webextension-polyfill';

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
  MANUAL_SCROLL_OFFSETS: 'manualScrollOffsets',
  URL_SYNC_ENABLED: 'urlSyncEnabled',
} as const;

/**
 * Save panel position
 */
export async function savePanelPosition(position: PanelPosition): Promise<void> {
  try {
    await browser.storage.local.set({
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
    const result = await browser.storage.local.get(STORAGE_KEYS.PANEL_POSITION);
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
    await browser.storage.local.set({
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
    const result = await browser.storage.local.get(STORAGE_KEYS.SYNC_MODE);
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
    await browser.storage.local.set({
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
    const result = await browser.storage.local.get(STORAGE_KEYS.IS_PANEL_MINIMIZED);
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
    await browser.storage.local.set({
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
    const result = await browser.storage.local.get(STORAGE_KEYS.SELECTED_TAB_IDS);
    return (result[STORAGE_KEYS.SELECTED_TAB_IDS] as Array<number>) || [];
  } catch (error) {
    console.error('Failed to load selected tab IDs:', error);
    return [];
  }
}

/**
 * Load manual scroll offsets for all tabs
 */
export async function loadManualScrollOffsets(): Promise<Record<number, number>> {
  try {
    const result = await browser.storage.local.get(STORAGE_KEYS.MANUAL_SCROLL_OFFSETS);
    return (result[STORAGE_KEYS.MANUAL_SCROLL_OFFSETS] as Record<number, number>) || {};
  } catch (error) {
    console.error('Failed to load manual scroll offsets:', error);
    return {};
  }
}

/**
 * Save manual scroll offset for a specific tab
 * @param tabId - The tab ID
 * @param offset - The scroll offset as a ratio (-1 to 1, where 0 means no offset)
 */
export async function saveManualScrollOffset(tabId: number, offset: number): Promise<void> {
  try {
    const offsets = await loadManualScrollOffsets();
    offsets[tabId] = offset;
    await browser.storage.local.set({
      [STORAGE_KEYS.MANUAL_SCROLL_OFFSETS]: offsets,
    });
  } catch (error) {
    console.error('Failed to save manual scroll offset:', error);
  }
}

/**
 * Get manual scroll offset for a specific tab
 * @param tabId - The tab ID
 * @returns The scroll offset ratio, or 0 if no offset exists
 */
export async function getManualScrollOffset(tabId: number): Promise<number> {
  try {
    const offsets = await loadManualScrollOffsets();
    return offsets[tabId] || 0;
  } catch (error) {
    console.error('Failed to get manual scroll offset:', error);
    return 0;
  }
}

/**
 * Clear manual scroll offset for a specific tab
 * @param tabId - The tab ID
 */
export async function clearManualScrollOffset(tabId: number): Promise<void> {
  try {
    const offsets = await loadManualScrollOffsets();
    delete offsets[tabId];
    await browser.storage.local.set({
      [STORAGE_KEYS.MANUAL_SCROLL_OFFSETS]: offsets,
    });
  } catch (error) {
    console.error('Failed to clear manual scroll offset:', error);
  }
}

/**
 * Clear all manual scroll offsets
 */
export async function clearAllManualScrollOffsets(): Promise<void> {
  try {
    await browser.storage.local.set({
      [STORAGE_KEYS.MANUAL_SCROLL_OFFSETS]: {},
    });
  } catch (error) {
    console.error('Failed to clear all manual scroll offsets:', error);
  }
}

/**
 * Save URL sync enabled state
 * @param enabled - Whether URL synchronization is enabled
 */
export async function saveUrlSyncEnabled(enabled: boolean): Promise<void> {
  try {
    await browser.storage.local.set({
      [STORAGE_KEYS.URL_SYNC_ENABLED]: enabled,
    });
  } catch (error) {
    console.error('Failed to save URL sync enabled state:', error);
  }
}

/**
 * Load URL sync enabled state
 * @returns Whether URL synchronization is enabled (default: true)
 */
export async function loadUrlSyncEnabled(): Promise<boolean> {
  try {
    const result = await browser.storage.local.get(STORAGE_KEYS.URL_SYNC_ENABLED);
    return result[STORAGE_KEYS.URL_SYNC_ENABLED] !== undefined
      ? (result[STORAGE_KEYS.URL_SYNC_ENABLED] as boolean)
      : true; // Default to enabled
  } catch (error) {
    console.error('Failed to load URL sync enabled state:', error);
    return true;
  }
}

/**
 * Clear all stored data
 */
export async function clearStorage(): Promise<void> {
  try {
    await browser.storage.local.clear();
  } catch (error) {
    console.error('Failed to clear storage:', error);
  }
}
