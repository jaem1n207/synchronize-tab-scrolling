import { describe, expect, it, vi } from 'vitest';

import type { TranslatedPageMetadata } from '~/shared/lib/translated-page-url-utils';
import type { AutoSyncGroup } from '~/shared/types/auto-sync-state';

import { findTranslatedPageCandidateGroup } from './translated-page-candidates';

function createGroup(tabIds: Array<number>, isActive: boolean = false): AutoSyncGroup {
  return { tabIds: new Set(tabIds), isActive };
}

describe('findTranslatedPageCandidateGroup', () => {
  it('returns an inactive existing group when metadata alternates connect the pages', async () => {
    const groups = new Map<string, AutoSyncGroup>([
      ['https://example.com/getting-started', createGroup([1])],
    ]);

    const getTabUrl = vi.fn(async () => 'https://example.com/en/getting-started');
    const getMetadata = vi
      .fn<(_: number, url: string) => Promise<TranslatedPageMetadata | null>>()
      .mockResolvedValueOnce({
        url: 'https://example.com/tr/baslangic',
        alternateUrls: [{ hreflang: 'en', href: 'https://example.com/en/getting-started' }],
      })
      .mockResolvedValueOnce({
        url: 'https://example.com/en/getting-started',
        alternateUrls: [{ hreflang: 'tr', href: 'https://example.com/tr/baslangic' }],
      });

    await expect(
      findTranslatedPageCandidateGroup({
        tabId: 2,
        url: 'https://example.com/tr/baslangic',
        groups,
        getTabUrl,
        getMetadata,
      }),
    ).resolves.toEqual({
      normalizedUrl: 'https://example.com/getting-started',
      matchKind: 'possible-translation',
      matchConfidence: 'medium',
    });
  });

  it('returns an inactive existing group when metadata canonicals connect the pages', async () => {
    const groups = new Map<string, AutoSyncGroup>([
      ['https://example.com/getting-started', createGroup([1])],
    ]);

    const getTabUrl = vi.fn(async () => 'https://example.com/en/getting-started');
    const getMetadata = vi
      .fn<(_: number, url: string) => Promise<TranslatedPageMetadata | null>>()
      .mockResolvedValueOnce({
        url: 'https://example.com/tr/baslangic',
        canonicalUrl: 'https://example.com/docs/getting-started',
        alternateUrls: [],
      })
      .mockResolvedValueOnce({
        url: 'https://example.com/en/getting-started',
        canonicalUrl: 'https://example.com/docs/getting-started',
        alternateUrls: [],
      });

    await expect(
      findTranslatedPageCandidateGroup({
        tabId: 2,
        url: 'https://example.com/tr/baslangic',
        groups,
        getTabUrl,
        getMetadata,
      }),
    ).resolves.toEqual({
      normalizedUrl: 'https://example.com/getting-started',
      matchKind: 'possible-translation',
      matchConfidence: 'medium',
    });
  });

  it('returns null when source metadata is missing', async () => {
    await expect(
      findTranslatedPageCandidateGroup({
        tabId: 2,
        url: 'https://example.com/tr/blog',
        groups: new Map([['https://example.com/pricing', createGroup([1])]]),
        getTabUrl: vi.fn(async () => 'https://example.com/en/pricing'),
        getMetadata: vi.fn(async () => null),
      }),
    ).resolves.toBeNull();
  });

  it('returns null when metadata does not connect any inactive group', async () => {
    const getMetadata = vi
      .fn<(_: number, url: string) => Promise<TranslatedPageMetadata | null>>()
      .mockResolvedValueOnce({
        url: 'https://example.com/tr/blog',
        alternateUrls: [],
      })
      .mockResolvedValueOnce({
        url: 'https://example.com/en/pricing',
        alternateUrls: [],
      });

    await expect(
      findTranslatedPageCandidateGroup({
        tabId: 2,
        url: 'https://example.com/tr/blog',
        groups: new Map([['https://example.com/pricing', createGroup([1])]]),
        getTabUrl: vi.fn(async () => 'https://example.com/en/pricing'),
        getMetadata,
      }),
    ).resolves.toBeNull();
  });

  it('skips active groups, groups that already contain the tab, and failed tab URL lookups', async () => {
    const groups = new Map<string, AutoSyncGroup>([
      ['https://example.com/active', createGroup([1], true)],
      ['https://example.com/current', createGroup([2])],
      ['https://example.com/missing-tab', createGroup([3])],
      ['https://example.com/getting-started', createGroup([4])],
    ]);

    const getTabUrl = vi
      .fn<(_: number) => Promise<string | null>>()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('https://example.com/en/getting-started');
    const getMetadata = vi
      .fn<(_: number, url: string) => Promise<TranslatedPageMetadata | null>>()
      .mockResolvedValueOnce({
        url: 'https://example.com/tr/baslangic',
        alternateUrls: [{ hreflang: 'en', href: 'https://example.com/en/getting-started' }],
      })
      .mockResolvedValueOnce({
        url: 'https://example.com/en/getting-started',
        alternateUrls: [{ hreflang: 'tr', href: 'https://example.com/tr/baslangic' }],
      });

    await expect(
      findTranslatedPageCandidateGroup({
        tabId: 2,
        url: 'https://example.com/tr/baslangic',
        groups,
        getTabUrl,
        getMetadata,
      }),
    ).resolves.toMatchObject({
      normalizedUrl: 'https://example.com/getting-started',
    });
    expect(getTabUrl).toHaveBeenCalledTimes(2);
    expect(getTabUrl).toHaveBeenCalledWith(3);
    expect(getTabUrl).toHaveBeenCalledWith(4);
  });
});
