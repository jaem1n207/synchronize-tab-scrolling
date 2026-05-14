import { sendMessage } from 'webext-bridge/background';
import browser from 'webextension-polyfill';

import { isLocalDevelopmentServer, isUrlExcluded } from '~/shared/lib/auto-sync-url-utils';
import { ExtensionLogger } from '~/shared/lib/logger';
import {
  buildTranslatedPageSignature,
  getAutoSyncPageKey,
  type AutoSyncSuggestionMatchKind,
  type TranslatedPageConfidence,
  type TranslatedPageMetadata,
} from '~/shared/lib/translated-page-url-utils';
import { isForbiddenUrl } from '~/shared/lib/url-utils';
import type { AutoSyncGroup } from '~/shared/types/auto-sync-state';
import type { AutoSyncGroupInfo } from '~/shared/types/messages';

import {
  autoSyncState,
  autoSyncRetryTimers,
  dismissedUrlGroups,
  pendingSuggestions,
  MAX_AUTO_SYNC_GROUP_SIZE,
  isTabManuallyOverridden,
  withAutoSyncLock,
} from './auto-sync-state';
import {
  showSyncSuggestion,
  sendSuggestionToSingleTab,
  isDomainSnoozed,
  isDomainPermanentlyExcluded,
} from './auto-sync-suggestions';
import { sendMessageWithTimeout } from './messaging';
import { findTranslatedPageCandidateGroup } from './translated-page-candidates';

const logger = new ExtensionLogger({ scope: 'background/auto-sync-groups' });

const CONTENT_SCRIPT_FILE = 'dist/contentScripts/index.global.js';
const CONTENT_SCRIPT_SETTLE_DELAY_MS = 100;
const MAX_TRANSLATED_PAGE_INIT_REPROBE_GROUPS = 10;

interface GroupMetadata {
  matchKind: AutoSyncSuggestionMatchKind;
  matchConfidence: TranslatedPageConfidence;
}

function getCurrentGroupMetadata(group: AutoSyncGroup): GroupMetadata | null {
  if (!group.tabUrls || group.tabUrls.size < group.tabIds.size) {
    return null;
  }

  const translatedSignatures = Array.from(group.tabUrls.values()).flatMap((url) => {
    const signature = buildTranslatedPageSignature(url);
    return signature ? [signature] : [];
  });
  const canonicalKeys = new Set(translatedSignatures.map((signature) => signature.canonicalKey));
  const hasTranslatedPage = translatedSignatures.some(
    (signature) => signature.matchKind === 'translated-page',
  );

  if (hasTranslatedPage && canonicalKeys.size === 1) {
    return { matchKind: 'translated-page', matchConfidence: 'high' };
  }

  if (
    group.matchKind === 'possible-translation' &&
    group.matchConfidence === 'medium' &&
    canonicalKeys.size > 1
  ) {
    return { matchKind: 'possible-translation', matchConfidence: 'medium' };
  }

  return { matchKind: 'same-url', matchConfidence: 'low' };
}

async function getTabUrl(tabId: number): Promise<string | null> {
  try {
    const tab = await browser.tabs.get(tabId);
    return tab.url ?? null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function getAlternateUrls(value: unknown): TranslatedPageMetadata['alternateUrls'] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }

    const hreflang = getOptionalString(item.hreflang);
    const href = getOptionalString(item.href);

    if (!hreflang || !href) {
      return [];
    }

    return [{ hreflang, href }];
  });
}

async function getTabMetadata(tabId: number, url: string): Promise<TranslatedPageMetadata | null> {
  try {
    const response = await sendMessageWithTimeout(
      'translated-page:get-metadata',
      { tabId },
      { context: 'content-script', tabId },
      500,
    );

    if (!isRecord(response) || response.success !== true) {
      return null;
    }

    return {
      url,
      title: getOptionalString(response.title),
      canonicalUrl: getOptionalString(response.canonicalUrl),
      alternateUrls: getAlternateUrls(response.alternateUrls),
    };
  } catch {
    return null;
  }
}

function getSingletonTabId(group: AutoSyncGroup): number | null {
  if (group.tabIds.size !== 1) {
    return null;
  }

  const [tabId] = group.tabIds;
  return tabId ?? null;
}

async function waitForContentScriptSettle(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, CONTENT_SCRIPT_SETTLE_DELAY_MS);
  });
}

async function ensureContentScriptInjectedForMetadata(
  tabId: number,
  injectedTabIds: Set<number>,
  failedInjectionTabIds: Set<number>,
): Promise<boolean> {
  if (injectedTabIds.has(tabId)) {
    return true;
  }

  if (failedInjectionTabIds.has(tabId)) {
    return false;
  }

  try {
    await browser.scripting.executeScript({
      target: { tabId },
      files: [CONTENT_SCRIPT_FILE],
    });
    injectedTabIds.add(tabId);
    logger.info('[AUTO-SYNC] Content script injected for translated candidate probe', { tabId });
    return true;
  } catch (error) {
    failedInjectionTabIds.add(tabId);
    logger.warn('[AUTO-SYNC] Content script injection failed for translated candidate probe', {
      tabId,
      error,
    });
    return false;
  }
}

async function getInjectedTabMetadata(
  tabId: number,
  url: string,
  injectedTabIds: Set<number>,
  failedInjectionTabIds: Set<number>,
): Promise<TranslatedPageMetadata | null> {
  const injected = await ensureContentScriptInjectedForMetadata(
    tabId,
    injectedTabIds,
    failedInjectionTabIds,
  );

  if (!injected) {
    return null;
  }

  return getTabMetadata(tabId, url);
}

function recomputeAutoSyncGroupMetadata(group: AutoSyncGroup): boolean {
  const metadata = getCurrentGroupMetadata(group);

  if (
    !metadata ||
    (group.matchKind === metadata.matchKind && group.matchConfidence === metadata.matchConfidence)
  ) {
    return false;
  }

  group.matchKind = metadata.matchKind;
  group.matchConfidence = metadata.matchConfidence;
  return true;
}

export function refreshAutoSyncGroupMetadata(
  normalizedUrl: string,
  tabId: number,
  url: string,
): boolean {
  const group = autoSyncState.groups.get(normalizedUrl);

  if (!group || !group.tabIds.has(tabId)) {
    return false;
  }

  group.tabUrls ??= new Map();
  group.tabUrls.set(tabId, url);

  return recomputeAutoSyncGroupMetadata(group);
}

export async function refreshTranslatedPageCandidateGroups(): Promise<void> {
  await withAutoSyncLock(refreshTranslatedPageCandidateGroupsInternal);
}

async function refreshTranslatedPageCandidateGroupsInternal(): Promise<void> {
  if (!autoSyncState.enabled || autoSyncState.groups.size < 2) {
    return;
  }

  const sourceEntries = Array.from(autoSyncState.groups.entries())
    .filter(([, group]) => !group.isActive && getSingletonTabId(group) !== null)
    .slice(0, MAX_TRANSLATED_PAGE_INIT_REPROBE_GROUPS)
    .reverse();

  if (sourceEntries.length < 2) {
    return;
  }

  const injectedTabIds = new Set<number>();
  const failedInjectionTabIds = new Set<number>();

  await Promise.all(
    sourceEntries.map(async ([, group]) => {
      const tabId = getSingletonTabId(group);
      if (tabId === null) {
        return;
      }

      await ensureContentScriptInjectedForMetadata(tabId, injectedTabIds, failedInjectionTabIds);
    }),
  );

  if (injectedTabIds.size > 0) {
    await waitForContentScriptSettle();
  }

  let didMergeCandidate = false;

  for (const [sourceGroupKey] of sourceEntries) {
    const sourceGroup = autoSyncState.groups.get(sourceGroupKey);
    if (!sourceGroup || sourceGroup.isActive) {
      continue;
    }

    const sourceTabId = getSingletonTabId(sourceGroup);
    if (sourceTabId === null) {
      continue;
    }

    const sourceUrl = sourceGroup.tabUrls?.get(sourceTabId) ?? (await getTabUrl(sourceTabId));
    if (!sourceUrl) {
      continue;
    }

    const candidate = await findTranslatedPageCandidateGroup({
      tabId: sourceTabId,
      url: sourceUrl,
      groups: autoSyncState.groups,
      maxGroupSize: MAX_AUTO_SYNC_GROUP_SIZE,
      getTabUrl,
      getMetadata: (metadataTabId, metadataUrl) =>
        getInjectedTabMetadata(metadataTabId, metadataUrl, injectedTabIds, failedInjectionTabIds),
    });

    if (!candidate || candidate.normalizedUrl === sourceGroupKey) {
      continue;
    }

    const targetGroup = autoSyncState.groups.get(candidate.normalizedUrl);
    if (
      !targetGroup ||
      targetGroup.isActive ||
      targetGroup.tabIds.has(sourceTabId) ||
      targetGroup.tabIds.size >= MAX_AUTO_SYNC_GROUP_SIZE
    ) {
      continue;
    }

    removeTabFromAutoSyncGroup(sourceGroupKey, sourceTabId);

    targetGroup.tabIds.add(sourceTabId);
    targetGroup.tabUrls ??= new Map();
    targetGroup.tabUrls.set(sourceTabId, sourceUrl);
    targetGroup.matchKind = candidate.matchKind;
    targetGroup.matchConfidence = candidate.matchConfidence;
    recomputeAutoSyncGroupMetadata(targetGroup);

    didMergeCandidate = true;
    logger.info('[AUTO-SYNC] Refreshed translated page candidate group', {
      tabId: sourceTabId,
      sourceGroupKey,
      targetGroupKey: candidate.normalizedUrl,
      matchKind: candidate.matchKind,
      matchConfidence: candidate.matchConfidence,
    });
  }

  if (didMergeCandidate) {
    logger.info('[AUTO-SYNC] Translated page candidate refresh complete', {
      groupCount: autoSyncState.groups.size,
    });
  }
}

export function removeTabFromAutoSyncGroup(normalizedUrl: string, tabId: number): boolean {
  const group = autoSyncState.groups.get(normalizedUrl);

  if (!group?.tabIds.has(tabId)) {
    return false;
  }

  group.tabIds.delete(tabId);
  group.tabUrls?.delete(tabId);
  logger.debug(`Removed tab ${tabId} from auto-sync group`, { normalizedUrl });

  if (group.tabIds.size === 0) {
    autoSyncState.groups.delete(normalizedUrl);
    logger.debug(`Removed empty auto-sync group`, { normalizedUrl });
  } else {
    recomputeAutoSyncGroupMetadata(group);
  }

  return true;
}

/**
 * Cancel any pending retry timer for a group
 */
export function cancelAutoSyncRetry(normalizedUrl: string): void {
  const existingTimer = autoSyncRetryTimers.get(normalizedUrl);
  if (existingTimer) {
    clearTimeout(existingTimer);
    autoSyncRetryTimers.delete(normalizedUrl);
  }
}

/**
 * Stop auto-sync for a specific URL group
 */
export async function stopAutoSyncForGroup(normalizedUrl: string): Promise<void> {
  cancelAutoSyncRetry(normalizedUrl);

  const group = autoSyncState.groups.get(normalizedUrl);
  if (!group) return;

  const tabIds = Array.from(group.tabIds);
  logger.info(`Stopping auto-sync for group`, { normalizedUrl, tabIds });

  const promises = tabIds.map(async (tabId) => {
    try {
      await sendMessage('scroll:stop', { isAutoSync: true }, { context: 'content-script', tabId });
    } catch (error) {
      logger.debug(`Failed to stop auto-sync for tab ${tabId}`, { error });
    }
  });

  await Promise.all(promises);
  group.isActive = false;

  pendingSuggestions.delete(normalizedUrl);
}

/**
 * Remove tab from all auto-sync groups
 */
export async function removeTabFromAllAutoSyncGroups(tabId: number): Promise<void> {
  for (const [normalizedUrl, group] of autoSyncState.groups.entries()) {
    if (group.tabIds.has(tabId)) {
      removeTabFromAutoSyncGroup(normalizedUrl, tabId);

      if (group.tabIds.size < 2) {
        cancelAutoSyncRetry(normalizedUrl);
        if (group.isActive) {
          await stopAutoSyncForGroup(normalizedUrl);
        }
      }
    }
  }
}

/**
 * Get other tab IDs in the same active auto-sync group as the given tab
 * @returns Array of tab IDs in the same group (excluding the given tab)
 */
export function getAutoSyncGroupMembers(tabId: number): number[] {
  for (const [, group] of autoSyncState.groups) {
    if (group.isActive && group.tabIds.has(tabId)) {
      return Array.from(group.tabIds).filter((id) => id !== tabId);
    }
  }
  return [];
}

/**
 * Check if a tab is in any active auto-sync group
 */
export function isTabInActiveAutoSyncGroup(tabId: number): boolean {
  for (const [, group] of autoSyncState.groups) {
    if (group.isActive && group.tabIds.has(tabId)) {
      return true;
    }
  }
  return false;
}

/**
 * Get the auto-sync group key that currently contains the given tab.
 */
export function getAutoSyncGroupKeyForTab(tabId: number): string | null {
  for (const [normalizedUrl, group] of autoSyncState.groups) {
    if (group.tabIds.has(tabId)) {
      return normalizedUrl;
    }
  }
  return null;
}

/**
 * Update auto-sync group for a tab based on its URL (with mutex lock)
 * @param tabId - The tab ID
 * @param url - The tab's URL
 * @param skipStartSync - If true, don't start sync even if group has 2+ tabs (used when page isn't fully loaded)
 * @param skipBroadcast - If true, don't broadcast group update (used during batch initialization)
 * @returns The normalized URL if the tab was added to a group, null otherwise
 */
export async function updateAutoSyncGroup(
  tabId: number,
  url: string,
  skipStartSync: boolean = false,
  skipBroadcast: boolean = false,
): Promise<string | null> {
  return withAutoSyncLock(() =>
    updateAutoSyncGroupInternal(tabId, url, skipStartSync, skipBroadcast),
  );
}

/**
 * Internal implementation of updateAutoSyncGroup (called within mutex lock)
 */
async function updateAutoSyncGroupInternal(
  tabId: number,
  url: string,
  skipStartSync: boolean = false,
  skipBroadcast: boolean = false,
): Promise<string | null> {
  logger.info('[AUTO-SYNC] updateAutoSyncGroupInternal called', {
    tabId,
    url,
    skipStartSync,
    skipBroadcast,
  });

  if (!autoSyncState.enabled) {
    logger.info('[AUTO-SYNC] Auto-sync disabled, skipping update');
    return null;
  }

  const normalizedUrl = getAutoSyncPageKey(url);
  if (!normalizedUrl) {
    logger.info('[AUTO-SYNC] URL normalization returned null, skipping');
    return null;
  }

  const translatedSignature = buildTranslatedPageSignature(url);

  if (isForbiddenUrl(url)) {
    logger.debug(`[AUTO-SYNC] URL is forbidden, skipping auto-sync`, { url, tabId });
    await removeTabFromAllAutoSyncGroups(tabId);
    return null;
  }

  if (isLocalDevelopmentServer(url)) {
    logger.debug(`[AUTO-SYNC] URL is local dev server, skipping auto-sync`, { url, tabId });
    await removeTabFromAllAutoSyncGroups(tabId);
    return null;
  }

  if (isUrlExcluded(url, autoSyncState.excludedUrls)) {
    logger.debug(`[AUTO-SYNC] URL excluded from auto-sync`, { url, tabId });
    await removeTabFromAllAutoSyncGroups(tabId);
    return null;
  }

  if (isTabManuallyOverridden(tabId)) {
    logger.debug(`[AUTO-SYNC] Tab ${tabId} is in manual sync, skipping auto-sync`);
    return null;
  }

  logger.info('[AUTO-SYNC] Removing tab from existing groups', { tabId });
  await removeTabFromAllAutoSyncGroups(tabId);

  let groupKey = normalizedUrl;
  let group = autoSyncState.groups.get(groupKey);
  let matchKind = translatedSignature?.matchKind;
  let matchConfidence = translatedSignature?.confidence;

  if (!skipStartSync && !group && autoSyncState.groups.size > 0) {
    const candidate = await findTranslatedPageCandidateGroup({
      tabId,
      url,
      groups: autoSyncState.groups,
      maxGroupSize: MAX_AUTO_SYNC_GROUP_SIZE,
      getTabUrl,
      getMetadata: getTabMetadata,
    });

    if (candidate) {
      groupKey = candidate.normalizedUrl;
      group = autoSyncState.groups.get(groupKey);
      matchKind = candidate.matchKind;
      matchConfidence = candidate.matchConfidence;
    }
  }

  const isNewGroup = !group;
  if (!group) {
    group = {
      tabIds: new Set(),
      isActive: false,
      matchKind,
      matchConfidence,
      tabUrls: new Map(),
    };
    autoSyncState.groups.set(groupKey, group);
    logger.info('[AUTO-SYNC] Created new group', { normalizedUrl: groupKey });
  }

  if (group.tabIds.size >= MAX_AUTO_SYNC_GROUP_SIZE && !group.tabIds.has(tabId)) {
    logger.warn('[AUTO-SYNC] Group size limit reached, tab not added', {
      normalizedUrl: groupKey,
      currentSize: group.tabIds.size,
      maxSize: MAX_AUTO_SYNC_GROUP_SIZE,
      tabId,
    });
    return null;
  }

  if (!isNewGroup && matchKind && matchConfidence) {
    group.matchKind = matchKind;
    group.matchConfidence = matchConfidence;
  }

  group.tabIds.add(tabId);
  group.tabUrls ??= new Map();
  group.tabUrls.set(tabId, url);
  recomputeAutoSyncGroupMetadata(group);

  logger.info('[AUTO-SYNC] Tab added to group', {
    tabId,
    normalizedUrl: groupKey,
    groupSize: group.tabIds.size,
    groupTabIds: Array.from(group.tabIds),
    isNewGroup,
    isActive: group.isActive,
  });

  const shouldShowSuggestion = !skipStartSync && group.tabIds.size >= 2 && !group.isActive;
  logger.info('[AUTO-SYNC] Checking if should show suggestion', {
    skipStartSync,
    groupSize: group.tabIds.size,
    isActive: group.isActive,
    shouldShowSuggestion,
  });

  if (
    shouldShowSuggestion &&
    !dismissedUrlGroups.has(groupKey) &&
    !isDomainPermanentlyExcluded(groupKey) &&
    !isDomainSnoozed(groupKey)
  ) {
    if (pendingSuggestions.has(groupKey)) {
      logger.info('[AUTO-SYNC] Sending suggestion to newly joined tab (from updateAutoSyncGroup)', {
        tabId,
        normalizedUrl: groupKey,
      });
      await sendSuggestionToSingleTab(tabId, groupKey, group);
    } else {
      logger.info('[AUTO-SYNC] Showing suggestion for group', {
        normalizedUrl: groupKey,
        tabIds: Array.from(group.tabIds),
      });
      await showSyncSuggestion(groupKey);
    }
  }

  if (!skipBroadcast) {
    await broadcastAutoSyncGroupUpdate();
  }

  return groupKey;
}

/**
 * Broadcast auto-sync group update to all content scripts
 */
export async function broadcastAutoSyncGroupUpdate(): Promise<void> {
  const groups: Array<AutoSyncGroupInfo> = [];

  for (const [normalizedUrl, group] of autoSyncState.groups.entries()) {
    groups.push({
      normalizedUrl,
      tabIds: Array.from(group.tabIds),
      isActive: group.isActive,
      matchKind: group.matchKind,
      matchConfidence: group.matchConfidence,
    });
  }

  const allTabIds = new Set<number>();
  for (const group of autoSyncState.groups.values()) {
    for (const tabId of group.tabIds) {
      allTabIds.add(tabId);
    }
  }

  logger.info('[AUTO-SYNC] Broadcasting group update', {
    groupCount: groups.length,
    tabCount: allTabIds.size,
  });

  const MESSAGE_TIMEOUT = 1000;

  const sendWithTimeout = async (tabId: number): Promise<void> => {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Message timeout')), MESSAGE_TIMEOUT);
    });

    try {
      await Promise.race([
        sendMessage('auto-sync:group-updated', { groups }, { context: 'content-script', tabId }),
        timeoutPromise,
      ]);
    } catch (error) {
      logger.debug(`[AUTO-SYNC] Failed to broadcast to tab ${tabId}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  await Promise.all(Array.from(allTabIds).map(sendWithTimeout));

  logger.info('[AUTO-SYNC] Broadcast complete');
}
