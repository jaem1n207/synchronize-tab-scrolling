import { describe, expect, it } from 'vitest';

import {
  applyTranslatedPageLocaleSync,
  buildTranslatedPageSignature,
  getAutoSyncPageKey,
  isTranslatedPageMetadataMatch,
  type TranslatedPageMetadata,
} from './translated-page-url-utils';

describe('buildTranslatedPageSignature', () => {
  it('builds the same canonical key for path locale variants', () => {
    expect(getAutoSyncPageKey('https://example.com/en/docs/install')).toBe(
      'https://example.com/docs/install',
    );
    expect(getAutoSyncPageKey('https://example.com/tr/docs/install')).toBe(
      'https://example.com/docs/install',
    );
  });

  it('builds the same canonical key for query locale variants while preserving identity query', () => {
    expect(getAutoSyncPageKey('https://example.com/docs/install?lang=en&page=setup')).toBe(
      'https://example.com/docs/install?page=setup',
    );
    expect(getAutoSyncPageKey('https://example.com/docs/install?lang=tr&page=setup')).toBe(
      'https://example.com/docs/install?page=setup',
    );
  });

  it('keeps different identity query values separate', () => {
    expect(getAutoSyncPageKey('https://example.com/docs/install?lang=en&page=setup')).not.toBe(
      getAutoSyncPageKey('https://example.com/docs/install?lang=tr&page=config'),
    );
  });

  it('builds the same canonical key for subdomain locale variants', () => {
    expect(getAutoSyncPageKey('https://en.example.com/docs/install')).toBe(
      'https://example.com/docs/install',
    );
    expect(getAutoSyncPageKey('https://tr.example.com/docs/install')).toBe(
      'https://example.com/docs/install',
    );
  });

  it('removes tracking query params from canonical keys', () => {
    expect(
      getAutoSyncPageKey('https://example.com/en/docs/install?utm_source=mail&gclid=abc'),
    ).toBe('https://example.com/docs/install');
  });

  it('falls back to same-url keys without locale carriers', () => {
    const signature = buildTranslatedPageSignature('https://example.com/docs/install?x=1#top');

    expect(signature).toEqual({
      canonicalKey: 'https://example.com/docs/install',
      confidence: 'low',
      matchKind: 'same-url',
    });
  });

  it('returns null for unsupported protocols and invalid URLs', () => {
    expect(buildTranslatedPageSignature('ftp://example.com/en/docs/install')).toBeNull();
    expect(buildTranslatedPageSignature('not-a-url')).toBeNull();
    expect(getAutoSyncPageKey('chrome://extensions')).toBeNull();
  });
});

describe('isTranslatedPageMetadataMatch', () => {
  it('returns true when pages point to each other via alternate hreflang URLs', () => {
    const first: TranslatedPageMetadata = {
      url: 'https://example.com/en/docs/install',
      alternateUrls: [{ hreflang: 'tr', href: 'https://example.com/tr/docs/install' }],
    };
    const second: TranslatedPageMetadata = {
      url: 'https://example.com/tr/docs/install',
      alternateUrls: [{ hreflang: 'en', href: 'https://example.com/en/docs/install' }],
    };

    expect(isTranslatedPageMetadataMatch(first, second)).toBe(true);
  });

  it('returns false for unrelated metadata', () => {
    const first: TranslatedPageMetadata = {
      url: 'https://example.com/en/docs/install',
      canonicalUrl: 'https://example.com/en/docs/install',
      alternateUrls: [{ hreflang: 'tr', href: 'https://example.com/tr/docs/install' }],
    };
    const second: TranslatedPageMetadata = {
      url: 'https://example.org/tr/docs/config',
      canonicalUrl: 'https://example.org/tr/docs/config',
      alternateUrls: [{ hreflang: 'en', href: 'https://example.org/en/docs/config' }],
    };

    expect(isTranslatedPageMetadataMatch(first, second)).toBe(false);
  });
});

describe('applyTranslatedPageLocaleSync', () => {
  it('preserves target path locale', () => {
    expect(
      applyTranslatedPageLocaleSync(
        'https://example.com/en/docs/install',
        'https://example.com/tr/docs/current#target',
      ),
    ).toBe('https://example.com/tr/docs/install#target');
  });

  it('adds target path locale when source has no locale carrier', () => {
    expect(
      applyTranslatedPageLocaleSync(
        'https://example.com/docs/install',
        'https://example.com/tr/docs/current#section',
      ),
    ).toBe('https://example.com/tr/docs/install#section');
  });

  it('preserves target query locale', () => {
    expect(
      applyTranslatedPageLocaleSync(
        'https://example.com/docs/install?lang=en',
        'https://example.com/docs/current?lang=tr#target',
      ),
    ).toBe('https://example.com/docs/install?lang=tr#target');
  });

  it('adds target query locale when source has no locale carrier', () => {
    expect(
      applyTranslatedPageLocaleSync(
        'https://example.com/docs/install?page=config',
        'https://example.com/docs/current?lang=tr#section',
      ),
    ).toBe('https://example.com/docs/install?page=config&lang=tr#section');
  });

  it('uses source identity query and target locale query for query-identity pages', () => {
    expect(
      applyTranslatedPageLocaleSync(
        'https://example.com/docs?page=config&lang=en&utm_source=mail',
        'https://example.com/docs?page=install&lang=tr#current',
      ),
    ).toBe('https://example.com/docs?page=config&lang=tr#current');
  });

  it('preserves target subdomain locale', () => {
    expect(
      applyTranslatedPageLocaleSync(
        'https://en.example.com/docs/install',
        'https://tr.example.com/docs/current#target',
      ),
    ).toBe('https://tr.example.com/docs/install#target');
  });

  it('adds target subdomain locale when source has no locale carrier', () => {
    expect(
      applyTranslatedPageLocaleSync(
        'https://example.com/docs/install',
        'https://tr.example.com/docs/current#section',
      ),
    ).toBe('https://tr.example.com/docs/install#section');
  });

  it('uses target carrier when source and target carriers differ', () => {
    expect(
      applyTranslatedPageLocaleSync(
        'https://example.com/docs/install?lang=en&page=setup',
        'https://example.com/tr/docs/current#target',
      ),
    ).toBe('https://example.com/tr/docs/install#target');
  });

  it('falls back to source URL when parsing fails', () => {
    expect(applyTranslatedPageLocaleSync('not-a-url', 'https://example.com/tr/docs')).toBe(
      'not-a-url',
    );
  });
});
