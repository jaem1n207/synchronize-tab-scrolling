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
import {
  findTranslatedPageCandidateGroup,
  type CandidateLookupResult,
} from './translated-page-candidates';

const logger = new ExtensionLogger({ scope: 'background/auto-sync-groups' });

const CONTENT_SCRIPT_FILE = 'dist/contentScripts/index.global.js';
const CONTENT_SCRIPT_SETTLE_DELAY_MS = 100;
const MAX_TRANSLATED_PAGE_INIT_REPROBE_GROUPS = 10;

interface GroupMetadata {
  matchKind: AutoSyncSuggestionMatchKind;
  matchConfidence: TranslatedPageConfidence;
}

interface SingletonGroupSnapshot {
  groupKey: string;
  tabId: number;
  url: string | null;
  matchKind?: AutoSyncSuggestionMatchKind;
  matchConfidence?: TranslatedPageConfidence;
}

interface ResolvedSingletonGroupSnapshot extends SingletonGroupSnapshot {
  url: string;
}

interface UpdateAutoSyncGroupContext {
  tabId: number;
  url: string;
  normalizedUrl: string;
  skipStartSync: boolean;
  skipBroadcast: boolean;
  matchKind?: AutoSyncSuggestionMatchKind;
  matchConfidence?: TranslatedPageConfidence;
}

interface UpdateCandidateLookup {
  context: UpdateAutoSyncGroupContext;
  groups: Map<string, AutoSyncGroup>;
}

interface CandidateTargetSnapshot {
  tabId: number;
  url: string;
}

interface CandidateApplyState {
  candidate: CandidateLookupResult;
  targetSnapshot: CandidateTargetSnapshot;
}

type CandidateApplyResolution =
  | { status: 'apply'; state: CandidateApplyState | null }
  | { status: 'source-stale' };

type UpdateAutoSyncGroupPreparation =
  | { status: 'complete'; result: string | null }
  | { status: 'lookup-candidate'; lookup: UpdateCandidateLookup };

type MetadataProbeResult =
  | { responded: true; metadata: TranslatedPageMetadata | null }
  | { responded: false };

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

async function requestTabMetadata(tabId: number, url: string): Promise<MetadataProbeResult> {
  try {
    const response = await sendMessageWithTimeout(
      'translated-page:get-metadata',
      { tabId },
      { context: 'content-script', tabId },
      500,
    );

    if (!isRecord(response) || response.success !== true) {
      return { responded: true, metadata: null };
    }

    return {
      responded: true,
      metadata: {
        url: getOptionalString(response.url) ?? url,
        title: getOptionalString(response.title),
        canonicalUrl: getOptionalString(response.canonicalUrl),
        alternateUrls: getAlternateUrls(response.alternateUrls),
      },
    };
  } catch {
    return { responded: false };
  }
}

async function getTabMetadata(tabId: number, url: string): Promise<TranslatedPageMetadata | null> {
  const result = await requestTabMetadata(tabId, url);
  return result.responded ? result.metadata : null;
}

function getSingletonTabId(group: AutoSyncGroup): number | null {
  if (group.tabIds.size !== 1) {
    return null;
  }

  const [tabId] = group.tabIds;
  return tabId ?? null;
}

function getRepresentativeTabId(group: AutoSyncGroup): number | null {
  const [representativeTabId] = Array.from(group.tabIds).sort((first, second) => first - second);
  return representativeTabId ?? null;
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

function getMetadataCacheKey(tabId: number, url: string): string {
  return `${tabId}\n${url}`;
}

async function getInjectedTabMetadata(
  tabId: number,
  url: string,
  injectedTabIds: Set<number>,
  failedInjectionTabIds: Set<number>,
  metadataCache?: Map<string, TranslatedPageMetadata>,
): Promise<TranslatedPageMetadata | null> {
  const cacheKey = getMetadataCacheKey(tabId, url);
  const cachedMetadata = metadataCache?.get(cacheKey);
  if (cachedMetadata) {
    return cachedMetadata;
  }

  const initialProbe = await requestTabMetadata(tabId, url);
  if (initialProbe.responded) {
    if (initialProbe.metadata) {
      metadataCache?.set(cacheKey, initialProbe.metadata);
    }
    return initialProbe.metadata;
  }

  const injected = await ensureContentScriptInjectedForMetadata(
    tabId,
    injectedTabIds,
    failedInjectionTabIds,
  );

  if (!injected) {
    return null;
  }

  await waitForContentScriptSettle();

  const metadata = await getTabMetadata(tabId, url);
  if (metadata) {
    metadataCache?.set(cacheKey, metadata);
  }
  return metadata;
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
  const snapshots = await withAutoSyncLock(snapshotTranslatedPageCandidateGroups);
  await refreshTranslatedPageCandidateGroupsFromSnapshots(snapshots);
}

async function snapshotTranslatedPageCandidateGroups(): Promise<Array<SingletonGroupSnapshot>> {
  if (!autoSyncState.enabled || autoSyncState.groups.size < 2) {
    return [];
  }

  return Array.from(autoSyncState.groups.entries())
    .filter(([, group]) => !group.isActive && getSingletonTabId(group) !== null)
    .slice(0, MAX_TRANSLATED_PAGE_INIT_REPROBE_GROUPS)
    .reverse()
    .flatMap(([groupKey, group]) => {
      const tabId = getSingletonTabId(group);

      if (tabId === null) {
        return [];
      }

      return {
        groupKey,
        tabId,
        url: group.tabUrls?.get(tabId) ?? null,
        matchKind: group.matchKind,
        matchConfidence: group.matchConfidence,
      };
    });
}

async function resolveSingletonSnapshots(
  snapshots: Array<SingletonGroupSnapshot>,
): Promise<Array<ResolvedSingletonGroupSnapshot>> {
  const resolvedSnapshots = await Promise.all(
    snapshots.map(async (snapshot) => {
      const url = snapshot.url ?? (await getTabUrl(snapshot.tabId));
      return url ? { ...snapshot, url } : null;
    }),
  );

  return resolvedSnapshots.filter(
    (snapshot): snapshot is ResolvedSingletonGroupSnapshot => snapshot !== null,
  );
}

function buildSnapshotGroup(snapshot: ResolvedSingletonGroupSnapshot): AutoSyncGroup {
  return {
    tabIds: new Set([snapshot.tabId]),
    isActive: false,
    matchKind: snapshot.matchKind,
    matchConfidence: snapshot.matchConfidence,
    tabUrls: new Map([[snapshot.tabId, snapshot.url]]),
  };
}

function cloneAutoSyncGroup(group: AutoSyncGroup): AutoSyncGroup {
  return {
    tabIds: new Set(group.tabIds),
    isActive: group.isActive,
    matchKind: group.matchKind,
    matchConfidence: group.matchConfidence,
    tabUrls: group.tabUrls ? new Map(group.tabUrls) : undefined,
  };
}

function cloneAutoSyncGroups(groups: Map<string, AutoSyncGroup>): Map<string, AutoSyncGroup> {
  return new Map(
    Array.from(groups.entries()).map(([groupKey, group]) => [groupKey, cloneAutoSyncGroup(group)]),
  );
}

function groupUrlStillMatches(group: AutoSyncGroup, tabId: number, expectedUrl: string): boolean {
  const storedUrl = group.tabUrls?.get(tabId);
  return storedUrl === undefined || storedUrl === expectedUrl;
}

async function refreshTranslatedPageCandidateGroupsFromSnapshots(
  snapshots: Array<SingletonGroupSnapshot>,
): Promise<void> {
  const resolvedSnapshots = await resolveSingletonSnapshots(snapshots);

  if (resolvedSnapshots.length < 2) {
    return;
  }

  const snapshotByGroupKey = new Map(
    resolvedSnapshots.map((snapshot) => [snapshot.groupKey, snapshot]),
  );
  const snapshotByTabId = new Map(resolvedSnapshots.map((snapshot) => [snapshot.tabId, snapshot]));
  const probeGroups = new Map(
    resolvedSnapshots.map((snapshot) => [snapshot.groupKey, buildSnapshotGroup(snapshot)]),
  );
  const injectedTabIds = new Set<number>();
  const failedInjectionTabIds = new Set<number>();
  const metadataCache = new Map<string, TranslatedPageMetadata>();

  let didMergeCandidate = false;

  for (const sourceSnapshot of resolvedSnapshots) {
    const candidate = await findTranslatedPageCandidateGroup({
      tabId: sourceSnapshot.tabId,
      url: sourceSnapshot.url,
      groups: probeGroups,
      maxGroupSize: MAX_AUTO_SYNC_GROUP_SIZE,
      getTabUrl: async (tabId) => snapshotByTabId.get(tabId)?.url ?? (await getTabUrl(tabId)),
      getMetadata: (metadataTabId, metadataUrl) =>
        getInjectedTabMetadata(
          metadataTabId,
          metadataUrl,
          injectedTabIds,
          failedInjectionTabIds,
          metadataCache,
        ),
    });

    if (!candidate || candidate.normalizedUrl === sourceSnapshot.groupKey) {
      continue;
    }

    const targetSnapshot = snapshotByGroupKey.get(candidate.normalizedUrl);
    if (!targetSnapshot) {
      continue;
    }

    const [latestSourceUrl, latestTargetUrl] = await Promise.all([
      getTabUrl(sourceSnapshot.tabId),
      getTabUrl(targetSnapshot.tabId),
    ]);

    if (latestSourceUrl !== sourceSnapshot.url || latestTargetUrl !== targetSnapshot.url) {
      continue;
    }

    const didMerge = await withAutoSyncLock(async () => {
      if (!autoSyncState.enabled) {
        return false;
      }

      const sourceGroup = autoSyncState.groups.get(sourceSnapshot.groupKey);
      const targetGroup = autoSyncState.groups.get(candidate.normalizedUrl);

      if (
        !sourceGroup ||
        !targetGroup ||
        sourceGroup.isActive ||
        targetGroup.isActive ||
        getSingletonTabId(sourceGroup) !== sourceSnapshot.tabId ||
        !targetGroup.tabIds.has(targetSnapshot.tabId) ||
        targetGroup.tabIds.has(sourceSnapshot.tabId) ||
        targetGroup.tabIds.size >= MAX_AUTO_SYNC_GROUP_SIZE ||
        !groupUrlStillMatches(sourceGroup, sourceSnapshot.tabId, sourceSnapshot.url) ||
        !groupUrlStillMatches(targetGroup, targetSnapshot.tabId, targetSnapshot.url)
      ) {
        return false;
      }

      removeTabFromAutoSyncGroup(sourceSnapshot.groupKey, sourceSnapshot.tabId);

      targetGroup.tabIds.add(sourceSnapshot.tabId);
      targetGroup.tabUrls ??= new Map();
      targetGroup.tabUrls.set(sourceSnapshot.tabId, sourceSnapshot.url);
      targetGroup.matchKind = candidate.matchKind;
      targetGroup.matchConfidence = candidate.matchConfidence;
      recomputeAutoSyncGroupMetadata(targetGroup);

      return true;
    });

    if (!didMerge) {
      continue;
    }

    didMergeCandidate = true;
    logger.info('[AUTO-SYNC] Refreshed translated page candidate group', {
      tabId: sourceSnapshot.tabId,
      sourceGroupKey: sourceSnapshot.groupKey,
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
  const preparation = await withAutoSyncLock(() =>
    prepareUpdateAutoSyncGroup(tabId, url, skipStartSync, skipBroadcast),
  );

  if (preparation.status === 'complete') {
    return preparation.result;
  }

  const shouldProbeCandidates = hasEligibleCandidateGroups(preparation.lookup);
  const candidate = shouldProbeCandidates
    ? await findTranslatedPageCandidateGroup({
        tabId,
        url,
        groups: preparation.lookup.groups,
        maxGroupSize: MAX_AUTO_SYNC_GROUP_SIZE,
        getTabUrl,
        getMetadata: getTabMetadata,
      })
    : null;

  const candidateApplyResolution = await resolveCandidateApplyState(
    preparation.lookup,
    candidate,
    shouldProbeCandidates,
  );

  if (candidateApplyResolution.status === 'source-stale') {
    logger.info('[AUTO-SYNC] Tab URL changed before translated candidate apply', {
      tabId,
      normalizedUrl: preparation.lookup.context.normalizedUrl,
    });
    return null;
  }

  if (candidate && !candidateApplyResolution.state) {
    logger.info('[AUTO-SYNC] Translated page candidate became stale before apply', {
      tabId,
      normalizedUrl: preparation.lookup.context.normalizedUrl,
      candidateUrl: candidate.normalizedUrl,
    });
  }

  return withAutoSyncLock(() =>
    applyUpdateAutoSyncGroup(preparation.lookup.context, candidateApplyResolution.state),
  );
}

/**
 * Prepare updateAutoSyncGroup while holding the mutex. If medium-confidence translated
 * metadata is needed, this only captures a stable group snapshot and releases the lock.
 */
async function prepareUpdateAutoSyncGroup(
  tabId: number,
  url: string,
  skipStartSync: boolean = false,
  skipBroadcast: boolean = false,
): Promise<UpdateAutoSyncGroupPreparation> {
  logger.info('[AUTO-SYNC] updateAutoSyncGroupInternal called', {
    tabId,
    url,
    skipStartSync,
    skipBroadcast,
  });

  if (!autoSyncState.enabled) {
    logger.info('[AUTO-SYNC] Auto-sync disabled, skipping update');
    return { status: 'complete', result: null };
  }

  const normalizedUrl = getAutoSyncPageKey(url);
  if (!normalizedUrl) {
    logger.info('[AUTO-SYNC] URL normalization returned null, skipping');
    return { status: 'complete', result: null };
  }

  const translatedSignature = buildTranslatedPageSignature(url);
  const context: UpdateAutoSyncGroupContext = {
    tabId,
    url,
    normalizedUrl,
    skipStartSync,
    skipBroadcast,
    matchKind: translatedSignature?.matchKind,
    matchConfidence: translatedSignature?.confidence,
  };

  if (isForbiddenUrl(url)) {
    logger.debug(`[AUTO-SYNC] URL is forbidden, skipping auto-sync`, { url, tabId });
    await removeTabFromAllAutoSyncGroups(tabId);
    return { status: 'complete', result: null };
  }

  if (isLocalDevelopmentServer(url)) {
    logger.debug(`[AUTO-SYNC] URL is local dev server, skipping auto-sync`, { url, tabId });
    await removeTabFromAllAutoSyncGroups(tabId);
    return { status: 'complete', result: null };
  }

  if (isUrlExcluded(url, autoSyncState.excludedUrls)) {
    logger.debug(`[AUTO-SYNC] URL excluded from auto-sync`, { url, tabId });
    await removeTabFromAllAutoSyncGroups(tabId);
    return { status: 'complete', result: null };
  }

  if (isTabManuallyOverridden(tabId)) {
    logger.debug(`[AUTO-SYNC] Tab ${tabId} is in manual sync, skipping auto-sync`);
    return { status: 'complete', result: null };
  }

  logger.info('[AUTO-SYNC] Removing tab from existing groups', { tabId });
  await removeTabFromAllAutoSyncGroups(tabId);

  const group = autoSyncState.groups.get(normalizedUrl);
  if (skipStartSync || group || autoSyncState.groups.size === 0) {
    const result = await applyUpdateAutoSyncGroup(context, null);
    return { status: 'complete', result };
  }

  return {
    status: 'lookup-candidate',
    lookup: {
      context,
      groups: cloneAutoSyncGroups(autoSyncState.groups),
    },
  };
}

async function resolveCandidateApplyState(
  lookup: UpdateCandidateLookup,
  candidate: CandidateLookupResult | null,
  shouldValidateSource: boolean,
): Promise<CandidateApplyResolution> {
  if (shouldValidateSource) {
    const latestSourceUrl = await getTabUrl(lookup.context.tabId);
    if (!latestSourceUrl || latestSourceUrl !== lookup.context.url) {
      return { status: 'source-stale' };
    }

    if (getAutoSyncPageKey(latestSourceUrl) !== lookup.context.normalizedUrl) {
      return { status: 'source-stale' };
    }
  }

  if (!candidate) {
    return { status: 'apply', state: null };
  }

  const targetSnapshot = getCandidateTargetSnapshot(lookup.groups, candidate.normalizedUrl);
  if (!targetSnapshot) {
    return { status: 'apply', state: null };
  }

  const latestTargetUrl = await getTabUrl(targetSnapshot.tabId);

  if (latestTargetUrl !== targetSnapshot.url) {
    return { status: 'apply', state: null };
  }

  return { status: 'apply', state: { candidate, targetSnapshot } };
}

function hasEligibleCandidateGroups(lookup: UpdateCandidateLookup): boolean {
  return Array.from(lookup.groups.values()).some(
    (group) =>
      !group.isActive &&
      !group.tabIds.has(lookup.context.tabId) &&
      group.tabIds.size > 0 &&
      group.tabIds.size < MAX_AUTO_SYNC_GROUP_SIZE,
  );
}

function getCandidateTargetSnapshot(
  groups: Map<string, AutoSyncGroup>,
  normalizedUrl: string,
): CandidateTargetSnapshot | null {
  const group = groups.get(normalizedUrl);
  if (!group) {
    return null;
  }

  const tabId = getRepresentativeTabId(group);
  if (tabId === null) {
    return null;
  }

  const url = group.tabUrls?.get(tabId);
  if (!url) {
    return null;
  }

  return { tabId, url };
}

function isCandidateApplyStateValid(state: CandidateApplyState, tabId: number): boolean {
  const targetGroup = autoSyncState.groups.get(state.candidate.normalizedUrl);

  return Boolean(
    targetGroup &&
    !targetGroup.isActive &&
    targetGroup.tabIds.has(state.targetSnapshot.tabId) &&
    !targetGroup.tabIds.has(tabId) &&
    targetGroup.tabIds.size < MAX_AUTO_SYNC_GROUP_SIZE &&
    groupUrlStillMatches(targetGroup, state.targetSnapshot.tabId, state.targetSnapshot.url),
  );
}

async function applyUpdateAutoSyncGroup(
  context: UpdateAutoSyncGroupContext,
  candidateApplyState: CandidateApplyState | null,
): Promise<string | null> {
  if (!autoSyncState.enabled) {
    logger.info('[AUTO-SYNC] Auto-sync disabled before apply, skipping update');
    return null;
  }

  if (getAutoSyncPageKey(context.url) !== context.normalizedUrl) {
    logger.info('[AUTO-SYNC] URL normalization changed before apply, skipping update');
    return null;
  }

  if (isForbiddenUrl(context.url)) {
    logger.debug(`[AUTO-SYNC] URL is forbidden before apply, skipping auto-sync`, {
      url: context.url,
      tabId: context.tabId,
    });
    await removeTabFromAllAutoSyncGroups(context.tabId);
    return null;
  }

  if (isLocalDevelopmentServer(context.url)) {
    logger.debug(`[AUTO-SYNC] URL is local dev server before apply, skipping auto-sync`, {
      url: context.url,
      tabId: context.tabId,
    });
    await removeTabFromAllAutoSyncGroups(context.tabId);
    return null;
  }

  if (isUrlExcluded(context.url, autoSyncState.excludedUrls)) {
    logger.debug(`[AUTO-SYNC] URL excluded from auto-sync before apply`, {
      url: context.url,
      tabId: context.tabId,
    });
    await removeTabFromAllAutoSyncGroups(context.tabId);
    return null;
  }

  if (isTabManuallyOverridden(context.tabId)) {
    logger.debug(`[AUTO-SYNC] Tab ${context.tabId} is in manual sync before apply`);
    return null;
  }

  await removeTabFromAllAutoSyncGroups(context.tabId);

  let groupKey = context.normalizedUrl;
  let group = autoSyncState.groups.get(groupKey);
  let matchKind = context.matchKind;
  let matchConfidence = context.matchConfidence;

  if (!context.skipStartSync && !group && candidateApplyState) {
    const targetGroup = autoSyncState.groups.get(candidateApplyState.candidate.normalizedUrl);

    if (targetGroup && isCandidateApplyStateValid(candidateApplyState, context.tabId)) {
      groupKey = candidateApplyState.candidate.normalizedUrl;
      group = targetGroup;
      matchKind = candidateApplyState.candidate.matchKind;
      matchConfidence = candidateApplyState.candidate.matchConfidence;
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

  if (group.tabIds.size >= MAX_AUTO_SYNC_GROUP_SIZE && !group.tabIds.has(context.tabId)) {
    logger.warn('[AUTO-SYNC] Group size limit reached, tab not added', {
      normalizedUrl: groupKey,
      currentSize: group.tabIds.size,
      maxSize: MAX_AUTO_SYNC_GROUP_SIZE,
      tabId: context.tabId,
    });
    return null;
  }

  if (!isNewGroup && matchKind && matchConfidence) {
    group.matchKind = matchKind;
    group.matchConfidence = matchConfidence;
  }

  group.tabIds.add(context.tabId);
  group.tabUrls ??= new Map();
  group.tabUrls.set(context.tabId, context.url);
  recomputeAutoSyncGroupMetadata(group);

  logger.info('[AUTO-SYNC] Tab added to group', {
    tabId: context.tabId,
    normalizedUrl: groupKey,
    groupSize: group.tabIds.size,
    groupTabIds: Array.from(group.tabIds),
    isNewGroup,
    isActive: group.isActive,
  });

  const shouldShowSuggestion = !context.skipStartSync && group.tabIds.size >= 2 && !group.isActive;
  logger.info('[AUTO-SYNC] Checking if should show suggestion', {
    skipStartSync: context.skipStartSync,
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
        tabId: context.tabId,
        normalizedUrl: groupKey,
      });
      await sendSuggestionToSingleTab(context.tabId, groupKey, group);
    } else {
      logger.info('[AUTO-SYNC] Showing suggestion for group', {
        normalizedUrl: groupKey,
        tabIds: Array.from(group.tabIds),
      });
      await showSyncSuggestion(groupKey);
    }
  }

  if (!context.skipBroadcast) {
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
