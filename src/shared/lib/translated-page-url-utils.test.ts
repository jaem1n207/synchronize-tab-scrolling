import { describe, expect, it } from 'vitest';

import {
  applyTranslatedPageLocaleSync,
  buildTranslatedPageSignature,
  getAutoSyncPageKey,
  isTranslatedPageMetadataMatch,
  resolveUrlSyncTarget,
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

  it('uses source identity query when target has no locale marker', () => {
    expect(
      applyTranslatedPageLocaleSync(
        'https://search.example.com/results?query=hello&page=2&utm_source=mail',
        'https://search.example.com/',
      ),
    ).toBe('https://search.example.com/results?page=2&query=hello');
  });

  it('does not copy locale-valued query carriers as identity query without target locale', () => {
    expect(
      applyTranslatedPageLocaleSync(
        'https://example.com/docs/search?lang=en&query=hello&hl=ko',
        'https://example.com/docs',
      ),
    ).toBe('https://example.com/docs/search?query=hello');
  });

  it('falls back to source URL when parsing fails', () => {
    expect(applyTranslatedPageLocaleSync('not-a-url', 'https://example.com/tr/docs')).toBe(
      'not-a-url',
    );
  });
});

describe('resolveUrlSyncTarget', () => {
  it('keeps existing behavior for follow-changed-tab mode', () => {
    expect(
      resolveUrlSyncTarget(
        'https://example.com/en/about?tab=pricing#plans',
        'https://staging.example.com/ko/home?view=compact#intro',
        'follow-changed-tab',
      ),
    ).toEqual({
      status: 'navigate',
      url: 'https://example.com/ko/about?tab=pricing#intro',
    });
  });

  it('syncs Naver-shaped source query parameters in follow-changed-tab mode', () => {
    expect(
      resolveUrlSyncTarget(
        'https://search.naver.com/search.naver?where=nexearch&sm=top_hty&fbm=0&ie=utf8&query=hello&ackey=0eid74s6',
        'https://www.naver.com/#home',
        'follow-changed-tab',
      ),
    ).toEqual({
      status: 'navigate',
      url: 'https://search.naver.com/search.naver?ackey=0eid74s6&fbm=0&ie=utf8&query=hello&sm=top_hty&where=nexearch#home',
    });
  });

  it('keeps target website for keep-each-tabs-website mode', () => {
    expect(
      resolveUrlSyncTarget(
        'https://example.com/en/about?tab=pricing#plans',
        'https://staging.example.com/ko/home?view=compact#intro',
        'keep-each-tabs-website',
      ),
    ).toEqual({
      status: 'navigate',
      url: 'https://staging.example.com/ko/about?tab=pricing#intro',
    });
  });

  it('keeps target website for same-host query locale pages', () => {
    expect(
      resolveUrlSyncTarget(
        'https://developer.chrome.com/blog/inside-browser-part3?hl=en&utm_source=mail',
        'https://developer.chrome.com/blog/inside-browser-part4?hl=ko#reading',
        'keep-each-tabs-website',
      ),
    ).toEqual({
      status: 'navigate',
      url: 'https://developer.chrome.com/blog/inside-browser-part3?hl=ko#reading',
    });
  });

  it('keeps target website for locale subdomain variants', () => {
    expect(
      resolveUrlSyncTarget(
        'https://en.example.com/docs/config?page=setup',
        'https://ko.example.com/docs/install#current',
        'keep-each-tabs-website',
      ),
    ).toEqual({
      status: 'navigate',
      url: 'https://ko.example.com/docs/config?page=setup#current',
    });
  });

  it('keeps target website for environment host variants', () => {
    expect(
      resolveUrlSyncTarget(
        'https://example.com/en/pricing?tab=teams',
        'https://staging.example.com/ko/home#current',
        'keep-each-tabs-website',
      ),
    ).toEqual({
      status: 'navigate',
      url: 'https://staging.example.com/ko/pricing?tab=teams#current',
    });
  });

  it('keeps target website for nested environment host variants', () => {
    expect(
      resolveUrlSyncTarget(
        'https://docs.example.com/en/pricing?tab=teams',
        'https://preview.docs.example.com/ko/home#current',
        'keep-each-tabs-website',
      ),
    ).toEqual({
      status: 'navigate',
      url: 'https://preview.docs.example.com/ko/pricing?tab=teams#current',
    });
  });

  it('blocks keep-each-tabs-website for unrelated translated article hosts', () => {
    expect(
      resolveUrlSyncTarget(
        'https://developer.chrome.com/blog/inside-browser-part3?hl=en',
        'https://d2.naver.com/helloworld/6204533',
        'keep-each-tabs-website',
      ),
    ).toEqual({
      status: 'blocked',
      reason: 'incompatible-site-boundary',
      notice: { key: 'urlSyncIncompatibleSiteNotice', severity: 'warning' },
    });
  });

  it('blocks keep-each-tabs-website for sibling product hosts', () => {
    expect(
      resolveUrlSyncTarget(
        'https://docs.example.com/en/install',
        'https://app.example.com/ko/home',
        'keep-each-tabs-website',
      ),
    ).toEqual({
      status: 'blocked',
      reason: 'incompatible-site-boundary',
      notice: { key: 'urlSyncIncompatibleSiteNotice', severity: 'warning' },
    });
  });

  it('blocks keep-each-tabs-website for shared-suffix hosted sites', () => {
    expect(
      resolveUrlSyncTarget(
        'https://one.github.io/en/docs',
        'https://two.github.io/ko/docs',
        'keep-each-tabs-website',
      ),
    ).toEqual({
      status: 'blocked',
      reason: 'incompatible-site-boundary',
      notice: { key: 'urlSyncIncompatibleSiteNotice', severity: 'warning' },
    });
  });

  it.each(['github.io', 'pages.dev', 'vercel.app', 'netlify.app'])(
    'blocks keep-each-tabs-website for locale-looking tenants on %s',
    (hostedSuffix) => {
      expect(
        resolveUrlSyncTarget(
          `https://en.${hostedSuffix}/docs/install`,
          `https://ko.${hostedSuffix}/docs/home`,
          'keep-each-tabs-website',
        ),
      ).toEqual({
        status: 'blocked',
        reason: 'incompatible-site-boundary',
        notice: { key: 'urlSyncIncompatibleSiteNotice', severity: 'warning' },
      });
    },
  );

  it('keeps locale subdomains compatible outside hosted public suffixes', () => {
    expect(
      resolveUrlSyncTarget(
        'https://en.example.com/docs/install',
        'https://ko.example.com/docs/home',
        'keep-each-tabs-website',
      ),
    ).toEqual({
      status: 'navigate',
      url: 'https://ko.example.com/docs/install',
    });
  });

  it('keeps follow-changed-tab behavior for unrelated hosts', () => {
    expect(
      resolveUrlSyncTarget(
        'https://developer.chrome.com/blog/inside-browser-part3?hl=en',
        'https://d2.naver.com/helloworld/6204533#target',
        'follow-changed-tab',
      ),
    ).toEqual({
      status: 'navigate',
      url: 'https://developer.chrome.com/blog/inside-browser-part3#target',
    });
  });

  it('preserves target port in keep-each-tabs-website mode', () => {
    expect(
      resolveUrlSyncTarget(
        'http://localhost/en/about',
        'http://localhost:5173/ko/home',
        'keep-each-tabs-website',
      ),
    ).toEqual({
      status: 'navigate',
      url: 'http://localhost:5173/ko/about',
    });
  });

  it('uses the target website without adding a locale when the target has no locale marker', () => {
    expect(
      resolveUrlSyncTarget(
        'https://example.com/en/about?tab=pricing&utm_source=mail#plans',
        'https://staging.example.com/home?view=compact#intro',
        'keep-each-tabs-website',
      ),
    ).toEqual({
      status: 'navigate',
      url: 'https://staging.example.com/en/about?tab=pricing#intro',
    });
  });

  it('preserves target query locale in keep-each-tabs-website mode', () => {
    expect(
      resolveUrlSyncTarget(
        'https://example.com/docs/about?page=pricing&lang=en&utm_source=mail',
        'https://staging.example.com/docs/home?lang=ko#intro',
        'keep-each-tabs-website',
      ),
    ).toEqual({
      status: 'navigate',
      url: 'https://staging.example.com/docs/about?page=pricing&lang=ko#intro',
    });
  });

  it('preserves target subdomain locale in keep-each-tabs-website mode', () => {
    expect(
      resolveUrlSyncTarget(
        'https://en.example.com/docs/about?page=pricing',
        'https://ko.staging.example.com/docs/home#intro',
        'keep-each-tabs-website',
      ),
    ).toEqual({
      status: 'navigate',
      url: 'https://ko.staging.example.com/docs/about?page=pricing#intro',
    });
  });

  it('blocks keep-each-tabs-website when the source URL is invalid', () => {
    expect(
      resolveUrlSyncTarget(
        'not-a-url',
        'https://staging.example.com/ko/home',
        'keep-each-tabs-website',
      ),
    ).toEqual({
      status: 'blocked',
      reason: 'invalid-source-url',
      notice: { key: 'urlSyncKeepWebsiteBlockedNotice', severity: 'warning' },
    });
  });

  it('blocks keep-each-tabs-website when the target URL is invalid', () => {
    expect(
      resolveUrlSyncTarget(
        'https://example.com/en/about',
        'chrome://extensions',
        'keep-each-tabs-website',
      ),
    ).toEqual({
      status: 'blocked',
      reason: 'invalid-target-url',
      notice: { key: 'urlSyncKeepWebsiteBlockedNotice', severity: 'warning' },
    });
  });
});
