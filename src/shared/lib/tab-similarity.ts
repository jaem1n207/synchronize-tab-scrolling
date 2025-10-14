import type { TabInfo } from '~/popup/types';

/**
 * Calculate similarity score between two tabs based on URL and title
 *
 * Higher score means more similar/related tabs
 *
 * Scoring algorithm:
 * - Same domain: +100 (most important indicator)
 * - Common URL path segments: +10 per segment
 * - Common title words (>2 chars): +5 per word
 *
 * @param referenceTab - The reference tab (usually current tab)
 * @param compareTab - The tab to compare against
 * @returns Similarity score (higher = more similar)
 */
export function calculateTabSimilarity(referenceTab: TabInfo, compareTab: TabInfo): number {
  let score = 0;

  try {
    const refUrl = new URL(referenceTab.url);
    const compareUrl = new URL(compareTab.url);

    // 1. Domain similarity (most important)
    if (refUrl.hostname === compareUrl.hostname) {
      score += 100;

      // 2. URL path similarity (only if same domain)
      const refPath = refUrl.pathname.split('/').filter(Boolean);
      const comparePath = compareUrl.pathname.split('/').filter(Boolean);

      // Count common path segments from the start (prefix matching)
      let commonSegments = 0;
      const minLength = Math.min(refPath.length, comparePath.length);

      for (let i = 0; i < minLength; i++) {
        if (refPath[i] === comparePath[i]) {
          commonSegments++;
        } else {
          break; // Stop at first mismatch
        }
      }

      score += commonSegments * 10;
    }
  } catch {
    // Invalid URL, skip URL-based scoring
  }

  // 3. Title similarity
  try {
    const refWords = new Set(
      referenceTab.title
        .toLowerCase()
        .split(/\s+/)
        .filter((word) => word.length > 2), // Ignore short words like "a", "is", etc.
    );

    const compareWords = compareTab.title
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length > 2);

    const commonWords = compareWords.filter((word) => refWords.has(word));
    score += commonWords.length * 5;
  } catch {
    // Title parsing failed, skip title-based scoring
  }

  return score;
}

/**
 * Extract domain from URL
 *
 * @param url - The URL string
 * @returns Domain (hostname) or empty string if invalid
 */
function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/**
 * Sort tabs by similarity to a reference tab (usually current tab)
 *
 * The reference tab will be placed first, followed by other tabs
 * sorted by descending similarity score
 *
 * @param tabs - Array of tabs to sort
 * @param referenceTabId - ID of the reference tab
 * @returns Sorted array with reference tab first, then by similarity
 */
export function sortTabsBySimilarity(
  tabs: Array<TabInfo>,
  referenceTabId?: number,
): Array<TabInfo> {
  // If no reference tab, return as-is
  if (!referenceTabId) {
    return tabs;
  }

  // Find reference tab
  const referenceTab = tabs.find((tab) => tab.id === referenceTabId);
  if (!referenceTab) {
    return tabs;
  }

  // Separate reference tab from others
  const otherTabs = tabs.filter((tab) => tab.id !== referenceTabId);

  // Calculate similarity and sort
  const sortedOthers = otherTabs
    .map((tab) => ({
      tab,
      similarity: calculateTabSimilarity(referenceTab, tab),
    }))
    .sort((a, b) => b.similarity - a.similarity) // Descending order
    .map((item) => item.tab);

  // Return reference tab first, then sorted others
  return [referenceTab, ...sortedOthers];
}

/**
 * Sort tabs with domain-based grouping for better visual organization
 *
 * Algorithm:
 * 1. Place current tab at the top
 * 2. Group remaining tabs by domain
 * 3. Sort tabs within each domain group by URL path (alphabetically)
 * 4. Sort domain groups by similarity to current tab
 * 5. Flatten the result
 *
 * This creates a more intuitive organization where related tabs (same domain)
 * are grouped together, making it easier to scan and find related content.
 *
 * Example result:
 * - github.com/react-devtools (current)
 * - github.com/react/issues
 * - github.com/react/pulls
 * - react.dev/docs/hooks
 * - react.dev/docs/state
 * - vue.org/guide
 *
 * @param tabs - Array of tabs to sort
 * @param referenceTabId - ID of the reference tab (usually current tab)
 * @returns Sorted array with domain-based grouping
 */
export function sortTabsWithDomainGrouping(
  tabs: Array<TabInfo>,
  referenceTabId?: number,
): Array<TabInfo> {
  // If no reference tab, return as-is
  if (!referenceTabId) {
    return tabs;
  }

  // Find reference tab
  const referenceTab = tabs.find((tab) => tab.id === referenceTabId);
  if (!referenceTab) {
    return tabs;
  }

  // Separate reference tab from others
  const otherTabs = tabs.filter((tab) => tab.id !== referenceTabId);

  // Group tabs by domain
  const domainGroups = new Map<string, Array<TabInfo>>();

  for (const tab of otherTabs) {
    const domain = extractDomain(tab.url);
    if (!domainGroups.has(domain)) {
      domainGroups.set(domain, []);
    }
    domainGroups.get(domain)!.push(tab);
  }

  // Sort tabs within each domain group by URL path
  for (const domainTabs of domainGroups.values()) {
    domainTabs.sort((a, b) => {
      try {
        const pathA = new URL(a.url).pathname;
        const pathB = new URL(b.url).pathname;
        return pathA.localeCompare(pathB);
      } catch {
        // If URL parsing fails, maintain original order
        return 0;
      }
    });
  }

  // Sort domain groups by similarity to reference tab
  // Use the first tab in each group as the representative for similarity calculation
  const sortedGroups = Array.from(domainGroups.entries())
    .map(([domain, domainTabs]) => ({
      domain,
      tabs: domainTabs,
      similarity: calculateTabSimilarity(referenceTab, domainTabs[0]),
    }))
    .sort((a, b) => b.similarity - a.similarity);

  // Flatten: reference tab first, then sorted domain groups
  const result: Array<TabInfo> = [referenceTab];

  for (const group of sortedGroups) {
    result.push(...group.tabs);
  }

  return result;
}
