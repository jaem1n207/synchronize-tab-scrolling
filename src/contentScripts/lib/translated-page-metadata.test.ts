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
      <link rel="alternate" hreflang="fr" href="" />
      <link rel="alternate" hreflang="es" href="   " />
      <link rel="alternate" hreflang="" href="https://example.com/empty-locale" />
      <link rel="alternate" hreflang="   " href="https://example.com/blank-locale" />
      <link rel="alternate" hreflang="de" href="https://example.com/de/erste-schritte" />
    `;

    expect(collectTranslatedPageMetadata('https://example.com/en/getting-started')).toMatchObject({
      alternateUrls: [{ hreflang: 'de', href: 'https://example.com/de/erste-schritte' }],
    });
  });

  it('ignores canonical links with empty or blank href', () => {
    document.head.innerHTML = `
      <link rel="canonical" href="" />
      <link rel="canonical" href="   " />
      <link rel="alternate" hreflang="ko" href="https://example.com/ko/start" />
    `;

    expect(collectTranslatedPageMetadata('https://example.com/en/getting-started')).toMatchObject({
      canonicalUrl: undefined,
      alternateUrls: [{ hreflang: 'ko', href: 'https://example.com/ko/start' }],
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
