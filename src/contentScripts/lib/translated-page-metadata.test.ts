import { afterEach, describe, expect, it } from 'vitest';

import { collectTranslatedPageMetadata } from './translated-page-metadata';

describe('collectTranslatedPageMetadata', () => {
  afterEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    document.title = '';
  });

  it('collects canonical and alternate hreflang links', () => {
    document.head.innerHTML = `
      <link rel="canonical" href="https://example.com/en/getting-started" />
      <link rel="alternate" hreflang="tr" href="https://example.com/tr/baslangic" />
      <link rel="alternate" hreflang="de" href="https://example.com/de/erste-schritte" />
    `;
    document.title = 'Getting Started';

    expect(collectTranslatedPageMetadata('https://example.com/en/getting-started')).toEqual({
      success: true,
      url: 'https://example.com/en/getting-started',
      title: 'Getting Started',
      canonicalUrl: 'https://example.com/en/getting-started',
      alternateUrls: [
        { hreflang: 'tr', href: 'https://example.com/tr/baslangic' },
        { hreflang: 'de', href: 'https://example.com/de/erste-schritte' },
      ],
    });
  });

  it('ignores alternate links without hreflang or href', () => {
    document.head.innerHTML = `
      <link rel="alternate" href="https://example.com/tr/baslangic" />
      <link rel="alternate" hreflang="tr" />
      <link rel="alternate" hreflang="de" href="https://example.com/de/erste-schritte" />
    `;

    expect(collectTranslatedPageMetadata('https://example.com/en/getting-started')).toMatchObject({
      alternateUrls: [{ hreflang: 'de', href: 'https://example.com/de/erste-schritte' }],
    });
  });

  it('returns undefined canonical URL when no canonical link exists', () => {
    document.head.innerHTML = `
      <link rel="alternate" hreflang="ko" href="https://example.com/ko/start" />
    `;

    expect(collectTranslatedPageMetadata('https://example.com/en/getting-started')).toMatchObject({
      canonicalUrl: undefined,
      alternateUrls: [{ hreflang: 'ko', href: 'https://example.com/ko/start' }],
    });
  });
});
