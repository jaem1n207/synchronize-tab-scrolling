import type { TranslatedPageMetadataResponseMessage } from '~/shared/types/messages';

export function collectTranslatedPageMetadata(url: string): TranslatedPageMetadataResponseMessage {
  const canonicalLink = document.querySelector<HTMLLinkElement>('link[rel~="canonical"][href]');
  const alternateLinks = Array.from(
    document.querySelectorAll<HTMLLinkElement>('link[rel~="alternate"][hreflang][href]'),
  );

  return {
    success: true,
    url,
    title: document.title,
    canonicalUrl: canonicalLink?.href,
    alternateUrls: alternateLinks.map((link) => ({
      hreflang: link.hreflang,
      href: link.href,
    })),
  };
}
