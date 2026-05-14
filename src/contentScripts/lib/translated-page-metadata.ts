import type { TranslatedPageMetadataResponseMessage } from '~/shared/types/messages';

export function collectTranslatedPageMetadata(url: string): TranslatedPageMetadataResponseMessage {
  const canonicalLink = Array.from(
    document.querySelectorAll<HTMLLinkElement>('link[rel~="canonical"]'),
  ).find((link) => link.getAttribute('href')?.trim());
  const alternateLinks = Array.from(
    document.querySelectorAll<HTMLLinkElement>('link[rel~="alternate"]'),
  ).filter((link) => link.getAttribute('hreflang')?.trim() && link.getAttribute('href')?.trim());

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
