import type {
  AutoSyncSuggestionMatchKind,
  TranslatedPageConfidence,
  TranslatedPageMetadata,
} from '~/shared/lib/translated-page-url-utils';
import { isTranslatedPageMetadataMatch } from '~/shared/lib/translated-page-url-utils';
import type { AutoSyncGroup } from '~/shared/types/auto-sync-state';

interface CandidateLookupArgs {
  tabId: number;
  url: string;
  groups: Map<string, AutoSyncGroup>;
  getTabUrl: (tabId: number) => Promise<string | null>;
  getMetadata: (tabId: number, url: string) => Promise<TranslatedPageMetadata | null>;
}

interface CandidateLookupResult {
  normalizedUrl: string;
  matchKind: AutoSyncSuggestionMatchKind;
  matchConfidence: TranslatedPageConfidence;
}

async function getSafeTabUrl(
  tabId: number,
  getTabUrl: CandidateLookupArgs['getTabUrl'],
): Promise<string | null> {
  try {
    return await getTabUrl(tabId);
  } catch {
    return null;
  }
}

async function getSafeMetadata(
  tabId: number,
  url: string,
  getMetadata: CandidateLookupArgs['getMetadata'],
): Promise<TranslatedPageMetadata | null> {
  try {
    return await getMetadata(tabId, url);
  } catch {
    return null;
  }
}

function getRepresentativeTabId(group: AutoSyncGroup): number | null {
  const [representativeTabId] = Array.from(group.tabIds).sort((first, second) => first - second);
  return representativeTabId ?? null;
}

export async function findTranslatedPageCandidateGroup({
  tabId,
  url,
  groups,
  getTabUrl,
  getMetadata,
}: CandidateLookupArgs): Promise<CandidateLookupResult | null> {
  const eligibleGroups = Array.from(groups.entries()).filter(
    ([, group]) => !group.isActive && !group.tabIds.has(tabId) && group.tabIds.size > 0,
  );

  if (eligibleGroups.length === 0) {
    return null;
  }

  const sourceMetadata = await getSafeMetadata(tabId, url, getMetadata);
  if (!sourceMetadata) {
    return null;
  }

  for (const [normalizedUrl, group] of eligibleGroups) {
    const representativeTabId = getRepresentativeTabId(group);
    if (representativeTabId === null) {
      continue;
    }

    const candidateUrl = await getSafeTabUrl(representativeTabId, getTabUrl);
    if (!candidateUrl) {
      continue;
    }

    const candidateMetadata = await getSafeMetadata(representativeTabId, candidateUrl, getMetadata);
    if (!candidateMetadata) {
      continue;
    }

    if (isTranslatedPageMetadataMatch(sourceMetadata, candidateMetadata)) {
      return {
        normalizedUrl,
        matchKind: 'possible-translation',
        matchConfidence: 'medium',
      };
    }
  }

  return null;
}
