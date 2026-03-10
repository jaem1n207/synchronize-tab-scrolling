import { describe, expect, it } from 'vitest';

import type { TabInfo } from '~/popup/types';

import {
  calculateTabSimilarity,
  sortTabsBySimilarity,
  sortTabsWithDomainGrouping,
  sortTabsByRecentVisits,
  filterTabsBySameDomain,
} from './tab-similarity';

const createTab = (overrides: Partial<TabInfo> = {}): TabInfo => ({
  id: 1,
  title: 'Test Tab',
  url: 'https://example.com',
  eligible: true,
  ...overrides,
});

describe('calculateTabSimilarity', () => {
  it('should return 100 for same domain', () => {
    const ref = createTab({ url: 'https://example.com/docs', title: 'Docs' });
    const compare = createTab({ url: 'https://example.com/api', title: 'API' });
    const score = calculateTabSimilarity(ref, compare);
    expect(score).toBe(100);
  });

  it('should add points for common path segments', () => {
    const ref = createTab({ url: 'https://example.com/docs/api/users', title: 'Users' });
    const compare = createTab({ url: 'https://example.com/docs/api/posts', title: 'Posts' });
    const score = calculateTabSimilarity(ref, compare);
    expect(score).toBe(100 + 20);
  });

  it('should stop counting at first path mismatch', () => {
    const ref = createTab({ url: 'https://example.com/docs/api/users', title: 'Users' });
    const compare = createTab({ url: 'https://example.com/docs/other/posts', title: 'Posts' });
    const score = calculateTabSimilarity(ref, compare);
    expect(score).toBe(100 + 10);
  });

  it('should return 0 for different domains', () => {
    const ref = createTab({ url: 'https://example.com', title: 'Example' });
    const compare = createTab({ url: 'https://other.com', title: 'Other' });
    const score = calculateTabSimilarity(ref, compare);
    expect(score).toBe(0);
  });

  it('should add points for common title words', () => {
    const ref = createTab({ url: 'https://different1.com', title: 'React Hooks Documentation' });
    const compare = createTab({ url: 'https://different2.com', title: 'React Hooks Guide' });
    const score = calculateTabSimilarity(ref, compare);
    expect(score).toBe(10);
  });

  it('should ignore short words in title matching', () => {
    const ref = createTab({ url: 'https://different1.com', title: 'The React API' });
    const compare = createTab({ url: 'https://different2.com', title: 'The React Guide' });
    const score = calculateTabSimilarity(ref, compare);
    expect(score).toBe(10);
  });

  it('should be case-insensitive for title matching', () => {
    const ref = createTab({ url: 'https://different1.com', title: 'REACT DOCUMENTATION' });
    const compare = createTab({ url: 'https://different2.com', title: 'react documentation' });
    const score = calculateTabSimilarity(ref, compare);
    expect(score).toBe(10);
  });

  it('should handle invalid URLs gracefully', () => {
    const ref = createTab({ url: 'not-a-url', title: 'Test' });
    const compare = createTab({ url: 'also-not-a-url', title: 'Other' });
    const score = calculateTabSimilarity(ref, compare);
    expect(score).toBe(0);
  });

  it('should handle mixed valid and invalid URLs', () => {
    const ref = createTab({ url: 'https://example.com', title: 'Test' });
    const compare = createTab({ url: 'invalid-url', title: 'Test' });
    const score = calculateTabSimilarity(ref, compare);
    expect(score).toBe(5);
  });

  it('should combine domain and title scores', () => {
    const ref = createTab({
      url: 'https://example.com/docs',
      title: 'React Documentation',
    });
    const compare = createTab({
      url: 'https://example.com/api',
      title: 'React API Reference',
    });
    const score = calculateTabSimilarity(ref, compare);
    expect(score).toBe(105);
  });

  it('should handle empty titles', () => {
    const ref = createTab({ url: 'https://example.com', title: '' });
    const compare = createTab({ url: 'https://example.com', title: '' });
    const score = calculateTabSimilarity(ref, compare);
    expect(score).toBe(100);
  });

  it('should handle tabs with only short words in title', () => {
    const ref = createTab({ url: 'https://example.com', title: 'a is it' });
    const compare = createTab({ url: 'https://example.com', title: 'a is it' });
    const score = calculateTabSimilarity(ref, compare);
    expect(score).toBe(100);
  });
});

describe('sortTabsBySimilarity', () => {
  it('should place reference tab first', () => {
    const tabs = [
      createTab({ id: 1, url: 'https://example.com' }),
      createTab({ id: 2, url: 'https://other.com' }),
      createTab({ id: 3, url: 'https://example.com/docs' }),
    ];
    const sorted = sortTabsBySimilarity(tabs, 1);
    expect(sorted[0].id).toBe(1);
  });

  it('should sort other tabs by similarity descending', () => {
    const tabs = [
      createTab({ id: 1, url: 'https://example.com/docs' }),
      createTab({ id: 2, url: 'https://other.com' }),
      createTab({ id: 3, url: 'https://example.com/api' }),
    ];
    const sorted = sortTabsBySimilarity(tabs, 1);
    expect(sorted[0].id).toBe(1); // Reference
    expect(sorted[1].id).toBe(3); // Same domain as reference
    expect(sorted[2].id).toBe(2); // Different domain
  });

  it('should return original order when no reference tab ID provided', () => {
    const tabs = [createTab({ id: 1 }), createTab({ id: 2 }), createTab({ id: 3 })];
    const sorted = sortTabsBySimilarity(tabs);
    expect(sorted).toEqual(tabs);
  });

  it('should return original order when reference tab not found', () => {
    const tabs = [createTab({ id: 1 }), createTab({ id: 2 }), createTab({ id: 3 })];
    const sorted = sortTabsBySimilarity(tabs, 999);
    expect(sorted).toEqual(tabs);
  });

  it('should handle single tab', () => {
    const tabs = [createTab({ id: 1 })];
    const sorted = sortTabsBySimilarity(tabs, 1);
    expect(sorted).toEqual(tabs);
  });

  it('should not modify original array', () => {
    const tabs = [
      createTab({ id: 1, url: 'https://example.com' }),
      createTab({ id: 2, url: 'https://other.com' }),
    ];
    const original = [...tabs];
    sortTabsBySimilarity(tabs, 1);
    expect(tabs).toEqual(original);
  });
});

describe('sortTabsWithDomainGrouping', () => {
  it('should place reference tab first', () => {
    const tabs = [
      createTab({ id: 1, url: 'https://example.com' }),
      createTab({ id: 2, url: 'https://other.com' }),
    ];
    const sorted = sortTabsWithDomainGrouping(tabs, 1);
    expect(sorted[0].id).toBe(1);
  });

  it('should group tabs by domain', () => {
    const tabs = [
      createTab({ id: 1, url: 'https://example.com/docs' }),
      createTab({ id: 2, url: 'https://other.com' }),
      createTab({ id: 3, url: 'https://example.com/api' }),
      createTab({ id: 4, url: 'https://another.com' }),
    ];
    const sorted = sortTabsWithDomainGrouping(tabs, 1);
    expect(sorted[0].id).toBe(1); // Reference
    expect(sorted[1].id).toBe(3); // Same domain as reference
    expect(sorted[2].url).toContain('other.com'); // Different domain
    expect(sorted[3].url).toContain('another.com'); // Different domain
  });

  it('should sort tabs within domain group by similarity', () => {
    const tabs = [
      createTab({ id: 1, url: 'https://example.com/docs/api' }),
      createTab({ id: 2, url: 'https://example.com/docs/hooks' }),
      createTab({ id: 3, url: 'https://example.com/guide' }),
    ];
    const sorted = sortTabsWithDomainGrouping(tabs, 1);
    expect(sorted[0].id).toBe(1); // Reference
    expect(sorted[1].id).toBe(2); // More similar (same /docs path)
    expect(sorted[2].id).toBe(3); // Less similar
  });

  it('should sort domain groups by similarity', () => {
    const tabs = [
      createTab({ id: 1, url: 'https://example.com/docs' }),
      createTab({ id: 2, url: 'https://example.com/docs/api' }),
      createTab({ id: 3, url: 'https://other.com' }),
      createTab({ id: 4, url: 'https://another.com/docs' }),
    ];
    const sorted = sortTabsWithDomainGrouping(tabs, 1);
    expect(sorted[0].id).toBe(1); // Reference
    // example.com group should come before other.com and another.com
    const exampleComIndices = sorted
      .slice(1)
      .map((tab, idx) => (tab.url.includes('example.com') ? idx + 1 : -1))
      .filter((idx) => idx !== -1);
    const otherComIndex = sorted.findIndex((tab) => tab.url.includes('other.com'));
    expect(exampleComIndices[exampleComIndices.length - 1]).toBeLessThan(otherComIndex);
  });

  it('should return original order when no reference tab ID provided', () => {
    const tabs = [createTab({ id: 1 }), createTab({ id: 2 }), createTab({ id: 3 })];
    const sorted = sortTabsWithDomainGrouping(tabs);
    expect(sorted).toEqual(tabs);
  });

  it('should return original order when reference tab not found', () => {
    const tabs = [createTab({ id: 1 }), createTab({ id: 2 }), createTab({ id: 3 })];
    const sorted = sortTabsWithDomainGrouping(tabs, 999);
    expect(sorted).toEqual(tabs);
  });

  it('should handle invalid URLs in domain grouping', () => {
    const tabs = [
      createTab({ id: 1, url: 'https://example.com' }),
      createTab({ id: 2, url: 'invalid-url' }),
      createTab({ id: 3, url: 'https://example.com/docs' }),
    ];
    const sorted = sortTabsWithDomainGrouping(tabs, 1);
    expect(sorted[0].id).toBe(1); // Reference
    expect(sorted.length).toBe(3); // No crash
  });
});

describe('sortTabsByRecentVisits', () => {
  it('should sort by lastAccessed descending', () => {
    const tabs = [
      createTab({ id: 1, lastAccessed: 1000 }),
      createTab({ id: 2, lastAccessed: 3000 }),
      createTab({ id: 3, lastAccessed: 2000 }),
    ];
    const sorted = sortTabsByRecentVisits(tabs);
    expect(sorted[0].id).toBe(2); // 3000
    expect(sorted[1].id).toBe(3); // 2000
    expect(sorted[2].id).toBe(1); // 1000
  });

  it('should place tabs without lastAccessed at the end', () => {
    const tabs = [
      createTab({ id: 1, lastAccessed: 2000 }),
      createTab({ id: 2 }), // No lastAccessed
      createTab({ id: 3, lastAccessed: 1000 }),
    ];
    const sorted = sortTabsByRecentVisits(tabs);
    expect(sorted[0].id).toBe(1); // 2000
    expect(sorted[1].id).toBe(3); // 1000
    expect(sorted[2].id).toBe(2); // No lastAccessed
  });

  it('should handle all tabs without lastAccessed', () => {
    const tabs = [createTab({ id: 1 }), createTab({ id: 2 }), createTab({ id: 3 })];
    const sorted = sortTabsByRecentVisits(tabs);
    expect(sorted.length).toBe(3); // No crash
  });

  it('should not modify original array', () => {
    const tabs = [
      createTab({ id: 1, lastAccessed: 2000 }),
      createTab({ id: 2, lastAccessed: 1000 }),
    ];
    const original = [...tabs];
    sortTabsByRecentVisits(tabs);
    expect(tabs).toEqual(original);
  });

  it('should handle single tab', () => {
    const tabs = [createTab({ id: 1, lastAccessed: 1000 })];
    const sorted = sortTabsByRecentVisits(tabs);
    expect(sorted).toEqual(tabs);
  });

  it('should handle tabs with same lastAccessed', () => {
    const tabs = [
      createTab({ id: 1, lastAccessed: 1000 }),
      createTab({ id: 2, lastAccessed: 1000 }),
      createTab({ id: 3, lastAccessed: 1000 }),
    ];
    const sorted = sortTabsByRecentVisits(tabs);
    expect(sorted.length).toBe(3); // No crash
  });

  it('should handle zero and negative timestamps', () => {
    const tabs = [
      createTab({ id: 1, lastAccessed: 0 }),
      createTab({ id: 2, lastAccessed: -1000 }),
      createTab({ id: 3, lastAccessed: 1000 }),
    ];
    const sorted = sortTabsByRecentVisits(tabs);
    expect(sorted[0].id).toBe(3); // 1000
    expect(sorted[1].id).toBe(1); // 0
    expect(sorted[2].id).toBe(2); // -1000
  });
});

describe('filterTabsBySameDomain', () => {
  it('should return only tabs matching reference domain', () => {
    const tabs = [
      createTab({ id: 1, url: 'https://example.com/docs' }),
      createTab({ id: 2, url: 'https://other.com' }),
      createTab({ id: 3, url: 'https://example.com/api' }),
    ];
    const filtered = filterTabsBySameDomain(tabs, 1);
    expect(filtered.length).toBe(2);
    expect(filtered.every((tab) => tab.url.includes('example.com'))).toBe(true);
  });

  it('should return all tabs when no reference tab ID provided', () => {
    const tabs = [
      createTab({ id: 1, url: 'https://example.com' }),
      createTab({ id: 2, url: 'https://other.com' }),
      createTab({ id: 3, url: 'https://another.com' }),
    ];
    const filtered = filterTabsBySameDomain(tabs);
    expect(filtered).toEqual(tabs);
  });

  it('should return all tabs when reference tab not found', () => {
    const tabs = [
      createTab({ id: 1, url: 'https://example.com' }),
      createTab({ id: 2, url: 'https://other.com' }),
    ];
    const filtered = filterTabsBySameDomain(tabs, 999);
    expect(filtered).toEqual(tabs);
  });

  it('should return all tabs when reference domain is invalid', () => {
    const tabs = [
      createTab({ id: 1, url: 'invalid-url' }),
      createTab({ id: 2, url: 'https://example.com' }),
    ];
    const filtered = filterTabsBySameDomain(tabs, 1);
    expect(filtered).toEqual(tabs);
  });

  it('should handle subdomains correctly', () => {
    const tabs = [
      createTab({ id: 1, url: 'https://docs.example.com' }),
      createTab({ id: 2, url: 'https://api.example.com' }),
      createTab({ id: 3, url: 'https://example.com' }),
      createTab({ id: 4, url: 'https://other.com' }),
    ];
    const filtered = filterTabsBySameDomain(tabs, 1);
    expect(filtered.length).toBe(1); // Only docs.example.com matches
    expect(filtered[0].id).toBe(1);
  });

  it('should treat different ports as same domain', () => {
    const tabs = [
      createTab({ id: 1, url: 'https://example.com:8080' }),
      createTab({ id: 2, url: 'https://example.com:9090' }),
      createTab({ id: 3, url: 'https://example.com' }),
      createTab({ id: 4, url: 'https://other.com' }),
    ];
    const filtered = filterTabsBySameDomain(tabs, 1);
    expect(filtered.length).toBe(3);
    expect(filtered.every((tab) => tab.url.includes('example.com'))).toBe(true);
  });

  it('should handle case-insensitive domain matching', () => {
    const tabs = [
      createTab({ id: 1, url: 'https://Example.COM/docs' }),
      createTab({ id: 2, url: 'https://example.com/api' }),
      createTab({ id: 3, url: 'https://OTHER.COM' }),
    ];
    const filtered = filterTabsBySameDomain(tabs, 1);
    expect(filtered.length).toBe(2); // Both example.com variants
  });

  it('should not modify original array', () => {
    const tabs = [
      createTab({ id: 1, url: 'https://example.com' }),
      createTab({ id: 2, url: 'https://other.com' }),
    ];
    const original = [...tabs];
    filterTabsBySameDomain(tabs, 1);
    expect(tabs).toEqual(original);
  });

  it('should handle empty tab list', () => {
    const filtered = filterTabsBySameDomain([], 1);
    expect(filtered).toEqual([]);
  });

  it('should handle single tab', () => {
    const tabs = [createTab({ id: 1, url: 'https://example.com' })];
    const filtered = filterTabsBySameDomain(tabs, 1);
    expect(filtered).toEqual(tabs);
  });
});
