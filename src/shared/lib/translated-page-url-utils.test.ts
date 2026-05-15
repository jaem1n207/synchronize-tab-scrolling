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

  it('keeps www and apex hosts separate for same-url keys', () => {
    expect(getAutoSyncPageKey('https://www.example.com/docs')).toBe('https://www.example.com/docs');
    expect(getAutoSyncPageKey('https://example.com/docs')).toBe('https://example.com/docs');
    expect(getAutoSyncPageKey('https://www.example.com/docs')).not.toBe(
      getAutoSyncPageKey('https://example.com/docs'),
    );
  });

  it('preserves host identity when canonicalizing path locale variants', () => {
    expect(getAutoSyncPageKey('https://www.example.com/en/docs/install')).toBe(
      'https://www.example.com/docs/install',
    );
    expect(getAutoSyncPageKey('https://www.example.com/tr/docs/install')).toBe(
      'https://www.example.com/docs/install',
    );
    expect(getAutoSyncPageKey('https://www.example.com/en/docs/install')).not.toBe(
      getAutoSyncPageKey('https://example.com/en/docs/install'),
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

  it('keeps non-locale language values distinct on path locale pages', () => {
    expect(getAutoSyncPageKey('https://example.com/en/docs?language=typescript')).toBe(
      'https://example.com/docs?language=typescript',
    );
    expect(getAutoSyncPageKey('https://example.com/tr/docs?language=python')).toBe(
      'https://example.com/docs?language=python',
    );
    expect(getAutoSyncPageKey('https://example.com/en/docs?language=typescript')).not.toBe(
      getAutoSyncPageKey('https://example.com/tr/docs?language=python'),
    );
  });

  it('still removes locale-valued query carriers from path locale pages', () => {
    expect(getAutoSyncPageKey('https://example.com/en/docs?lang=en&page=setup')).toBe(
      'https://example.com/docs?page=setup',
    );
    expect(getAutoSyncPageKey('https://example.com/tr/docs?lang=tr&page=setup')).toBe(
      'https://example.com/docs?page=setup',
    );
  });

  it('keeps different identity query values separate', () => {
    expect(getAutoSyncPageKey('https://example.com/docs/install?lang=en&page=setup')).not.toBe(
      getAutoSyncPageKey('https://example.com/docs/install?lang=tr&page=config'),
    );
  });

  it('keeps different identity query values separate without locale carriers', () => {
    expect(getAutoSyncPageKey('https://example.com/docs/install?page=setup')).toBe(
      'https://example.com/docs/install?page=setup',
    );
    expect(getAutoSyncPageKey('https://example.com/docs/install?page=setup')).not.toBe(
      getAutoSyncPageKey('https://example.com/docs/install?page=config'),
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

  it('preserves www base host when matching subdomain locale variants', () => {
    expect(getAutoSyncPageKey('https://en.www.example.com/docs/install')).toBe(
      'https://www.example.com/docs/install',
    );
    expect(getAutoSyncPageKey('https://tr.www.example.com/docs/install')).toBe(
      'https://www.example.com/docs/install',
    );
    expect(getAutoSyncPageKey('https://en.www.example.com/docs/install')).not.toBe(
      getAutoSyncPageKey('https://en.example.com/docs/install'),
    );
  });

  it('removes tracking query params from canonical keys', () => {
    expect(
      getAutoSyncPageKey('https://example.com/en/docs/install?utm_source=mail&gclid=abc'),
    ).toBe('https://example.com/docs/install');
  });

  it('falls back to same-url keys without locale carriers while preserving identity query', () => {
    const signature = buildTranslatedPageSignature(
      'https://example.com/docs/install?x=1&utm_source=mail#top',
    );

    expect(signature).toEqual({
      canonicalKey: 'https://example.com/docs/install?x=1',
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

  it('returns false when translated page URLs match but metadata has no alternates or canonicals', () => {
    const first: TranslatedPageMetadata = {
      url: 'https://example.com/en/docs/install',
      alternateUrls: [],
    };
    const second: TranslatedPageMetadata = {
      url: 'https://example.com/tr/docs/install',
      alternateUrls: [],
    };

    expect(isTranslatedPageMetadataMatch(first, second)).toBe(false);
  });

  it('returns false when alternates list a different locale than the compared page', () => {
    const first: TranslatedPageMetadata = {
      url: 'https://example.com/en/docs/install',
      alternateUrls: [{ hreflang: 'tr', href: 'https://example.com/tr/docs/install' }],
    };
    const second: TranslatedPageMetadata = {
      url: 'https://example.com/de/docs/install',
      alternateUrls: [],
    };

    expect(isTranslatedPageMetadataMatch(first, second)).toBe(false);
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

  it('uses source identity query when preserving target path locale', () => {
    expect(
      applyTranslatedPageLocaleSync(
        'https://example.com/en/docs?page=config&utm_source=mail',
        'https://example.com/tr/docs?page=install#section',
      ),
    ).toBe('https://example.com/tr/docs?page=config#section');
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

  it('uses source identity query when preserving target subdomain locale', () => {
    expect(
      applyTranslatedPageLocaleSync(
        'https://en.example.com/docs?page=config&utm_source=mail',
        'https://tr.example.com/docs?page=install#section',
      ),
    ).toBe('https://tr.example.com/docs?page=config#section');
  });

  it('uses target carrier when source and target carriers differ', () => {
    expect(
      applyTranslatedPageLocaleSync(
        'https://example.com/docs/install?lang=en&page=setup',
        'https://example.com/tr/docs/current#target',
      ),
    ).toBe('https://example.com/tr/docs/install?page=setup#target');
  });

  it('falls back to source URL when parsing fails', () => {
    expect(applyTranslatedPageLocaleSync('not-a-url', 'https://example.com/tr/docs')).toBe(
      'not-a-url',
    );
  });
});
