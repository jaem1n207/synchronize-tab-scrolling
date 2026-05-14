export type LocaleSource = 'path' | 'query' | 'subdomain';
export type TranslatedPageConfidence = 'high' | 'medium' | 'low';
export type AutoSyncSuggestionMatchKind = 'same-url' | 'translated-page' | 'possible-translation';

export interface LocaleDescriptor {
  value: string;
  source: LocaleSource;
  key?: string;
  index?: number;
}

export interface TranslatedPageSignature {
  canonicalKey: string;
  locale?: LocaleDescriptor;
  confidence: TranslatedPageConfidence;
  matchKind: AutoSyncSuggestionMatchKind;
}

export interface TranslatedPageAlternateLink {
  hreflang: string;
  href: string;
}

export interface TranslatedPageMetadata {
  url: string;
  title?: string;
  canonicalUrl?: string;
  alternateUrls: Array<TranslatedPageAlternateLink>;
}

const LOCALE_QUERY_KEYS = new Set(['lang', 'locale', 'hl', 'language', 'lng', 'ui', 'culture']);
const TRACKING_QUERY_KEYS = new Set(['ref', 'source', 'fbclid', 'gclid']);

// prettier-ignore
const BASE_LOCALE_CODES = new Set([
  'af', 'ar', 'az', 'be', 'bg', 'bs', 'ca', 'cs', 'cy', 'da',
  'de', 'dv', 'el', 'en', 'eo', 'es', 'et', 'eu', 'fa', 'fi',
  'fo', 'fr', 'gl', 'gu', 'he', 'hi', 'hr', 'hu', 'hy', 'id',
  'is', 'it', 'ja', 'ka', 'kk', 'kn', 'ko', 'kok', 'ky', 'lt',
  'lv', 'mi', 'mk', 'mn', 'mr', 'ms', 'mt', 'nb', 'nl', 'nn',
  'ns', 'pa', 'pl', 'ps', 'pt', 'qu', 'ro', 'ru', 'sa', 'se',
  'sk', 'sl', 'sq', 'sr', 'sv', 'sw', 'syr', 'ta', 'te', 'th',
  'tl', 'tn', 'tr', 'tt', 'ts', 'uk', 'ur', 'uz', 'vi', 'xh',
  'zh', 'zu',
]);

const REGIONAL_LOCALE_PATTERN = /^[a-z]{2,3}[-_][a-z]{2}$/i;

interface IdentityQueryParam {
  key: string;
  value: string;
}

function parseHttpUrl(url: string): URL | null {
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return null;
    }
    return parsedUrl;
  } catch {
    return null;
  }
}

function isLocaleValue(value: string): boolean {
  const normalizedValue = value.toLowerCase();
  return BASE_LOCALE_CODES.has(normalizedValue) || REGIONAL_LOCALE_PATTERN.test(value);
}

function stripWww(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, '');
}

function getHostnameWithoutLocale(hostname: string, locale?: LocaleDescriptor): string {
  const normalizedHostname = stripWww(hostname);

  if (locale?.source !== 'subdomain') {
    return normalizedHostname;
  }

  const labels = normalizedHostname.split('.');
  return labels.slice(1).join('.');
}

function getHostWithPort(hostname: string, port: string): string {
  return port ? `${hostname}:${port}` : hostname;
}

function isNoiseQueryParam(key: string): boolean {
  const normalizedKey = key.toLowerCase();
  return (
    normalizedKey.startsWith('utm_') ||
    TRACKING_QUERY_KEYS.has(normalizedKey) ||
    LOCALE_QUERY_KEYS.has(normalizedKey)
  );
}

function getIdentityQueryParams(searchParams: URLSearchParams): Array<IdentityQueryParam> {
  const params: Array<IdentityQueryParam> = [];

  searchParams.forEach((value, key) => {
    if (!isNoiseQueryParam(key)) {
      params.push({ key, value });
    }
  });

  return params.sort((first, second) => {
    const keyComparison = first.key.localeCompare(second.key);
    if (keyComparison !== 0) {
      return keyComparison;
    }
    return first.value.localeCompare(second.value);
  });
}

function stringifyQueryParams(params: Array<IdentityQueryParam>): string {
  if (params.length === 0) {
    return '';
  }

  const searchParams = new URLSearchParams();
  params.forEach(({ key, value }) => {
    searchParams.append(key, value);
  });

  return searchParams.toString();
}

function getPathSegments(pathname: string): Array<string> {
  return pathname.split('/').filter(Boolean);
}

function getPathLocale(pathname: string): LocaleDescriptor | undefined {
  const segments = getPathSegments(pathname);
  const index = segments.findIndex((segment) => isLocaleValue(segment));

  if (index === -1) {
    return undefined;
  }

  return {
    value: segments[index],
    source: 'path',
    index,
  };
}

function removePathLocale(pathname: string, locale?: LocaleDescriptor): string {
  if (locale?.source !== 'path') {
    return pathname;
  }

  const segments = getPathSegments(pathname);
  const filteredSegments = segments.filter((_, index) => index !== locale.index);

  if (filteredSegments.length === 0) {
    return '/';
  }

  return `/${filteredSegments.join('/')}`;
}

function insertPathLocale(pathname: string, locale: LocaleDescriptor): string {
  const segments = getPathSegments(pathname);
  const insertIndex =
    locale.index !== undefined && locale.index >= 0 && locale.index <= segments.length
      ? locale.index
      : 0;

  segments.splice(insertIndex, 0, locale.value);

  return `/${segments.join('/')}`;
}

function getQueryLocale(searchParams: URLSearchParams): LocaleDescriptor | undefined {
  for (const [key, value] of searchParams.entries()) {
    if (LOCALE_QUERY_KEYS.has(key.toLowerCase()) && isLocaleValue(value)) {
      return {
        value,
        source: 'query',
        key,
      };
    }
  }

  return undefined;
}

function getSubdomainLocale(hostname: string): LocaleDescriptor | undefined {
  const labels = stripWww(hostname).split('.');
  const firstLabel = labels[0];

  if (labels.length < 3 || !isLocaleValue(firstLabel)) {
    return undefined;
  }

  return {
    value: firstLabel,
    source: 'subdomain',
  };
}

function getLocaleDescriptor(url: URL): LocaleDescriptor | undefined {
  return (
    getPathLocale(url.pathname) ??
    getQueryLocale(url.searchParams) ??
    getSubdomainLocale(url.hostname)
  );
}

function buildCanonicalKey(url: URL, locale?: LocaleDescriptor): string {
  const hostname = getHostnameWithoutLocale(url.hostname, locale);
  const host = getHostWithPort(hostname, url.port);
  const pathname = removePathLocale(url.pathname, locale);

  if (!locale) {
    return `${url.protocol}//${host}${pathname}`;
  }

  const identityQuery = stringifyQueryParams(getIdentityQueryParams(url.searchParams));
  const search = identityQuery ? `?${identityQuery}` : '';

  return `${url.protocol}//${host}${pathname}${search}`;
}

function getPageKeyCandidates(metadata: TranslatedPageMetadata): Set<string> {
  const candidates = new Set<string>();
  const pageKey = getAutoSyncPageKey(metadata.url);

  if (pageKey) {
    candidates.add(pageKey);
  }

  if (metadata.canonicalUrl) {
    const canonicalKey = getAutoSyncPageKey(metadata.canonicalUrl);
    if (canonicalKey) {
      candidates.add(canonicalKey);
    }
  }

  return candidates;
}

function hasSharedCandidate(first: Set<string>, second: Set<string>): boolean {
  for (const candidate of first) {
    if (second.has(candidate)) {
      return true;
    }
  }

  return false;
}

function getAlternateKeys(metadata: TranslatedPageMetadata): Set<string> {
  const keys = new Set<string>();

  metadata.alternateUrls.forEach(({ href }) => {
    const key = getAutoSyncPageKey(href);
    if (key) {
      keys.add(key);
    }
  });

  return keys;
}

function buildUrlFromParts(
  protocol: string,
  hostname: string,
  port: string,
  pathname: string,
  search: string,
  hash: string,
): string {
  const url = new URL(`${protocol}//${getHostWithPort(hostname, port)}`);
  url.pathname = pathname;
  url.search = search;
  url.hash = hash;

  return url.toString();
}

function buildTargetQuerySearch(source: URL, targetLocale: LocaleDescriptor): string {
  const searchParams = new URLSearchParams();

  getIdentityQueryParams(source.searchParams).forEach(({ key, value }) => {
    searchParams.append(key, value);
  });

  if (targetLocale.key) {
    searchParams.append(targetLocale.key, targetLocale.value);
  }

  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : '';
}

function buildPathLocaleUrl(
  source: URL,
  sourceLocale: LocaleDescriptor,
  target: URL,
  targetLocale: LocaleDescriptor,
): string {
  const sourcePathname = removePathLocale(source.pathname, sourceLocale);
  const pathname = insertPathLocale(sourcePathname, targetLocale);
  const hostname = getHostnameWithoutLocale(source.hostname, sourceLocale);

  return buildUrlFromParts(
    source.protocol,
    hostname,
    source.port,
    pathname,
    target.search,
    target.hash,
  );
}

function buildQueryLocaleUrl(
  source: URL,
  sourceLocale: LocaleDescriptor,
  target: URL,
  targetLocale: LocaleDescriptor,
): string {
  const pathname = removePathLocale(source.pathname, sourceLocale);
  const hostname = getHostnameWithoutLocale(source.hostname, sourceLocale);
  const search = buildTargetQuerySearch(source, targetLocale);

  return buildUrlFromParts(source.protocol, hostname, source.port, pathname, search, target.hash);
}

function buildSubdomainLocaleUrl(
  source: URL,
  sourceLocale: LocaleDescriptor,
  target: URL,
  targetLocale: LocaleDescriptor,
): string {
  const pathname = removePathLocale(source.pathname, sourceLocale);
  const baseHostname = getHostnameWithoutLocale(source.hostname, sourceLocale);
  const hostname = `${targetLocale.value.toLowerCase()}.${baseHostname}`;

  return buildUrlFromParts(
    source.protocol,
    hostname,
    source.port,
    pathname,
    target.search,
    target.hash,
  );
}

export function buildTranslatedPageSignature(url: string): TranslatedPageSignature | null {
  const parsedUrl = parseHttpUrl(url);

  if (!parsedUrl) {
    return null;
  }

  const locale = getLocaleDescriptor(parsedUrl);

  if (!locale) {
    return {
      canonicalKey: buildCanonicalKey(parsedUrl),
      confidence: 'low',
      matchKind: 'same-url',
    };
  }

  return {
    canonicalKey: buildCanonicalKey(parsedUrl, locale),
    locale,
    confidence: 'high',
    matchKind: 'translated-page',
  };
}

export function getAutoSyncPageKey(url: string): string | null {
  return buildTranslatedPageSignature(url)?.canonicalKey ?? null;
}

export function isTranslatedPageMetadataMatch(
  first: TranslatedPageMetadata,
  second: TranslatedPageMetadata,
): boolean {
  const firstCandidates = getPageKeyCandidates(first);
  const secondCandidates = getPageKeyCandidates(second);

  if (hasSharedCandidate(firstCandidates, secondCandidates)) {
    return true;
  }

  const firstAlternates = getAlternateKeys(first);
  const secondAlternates = getAlternateKeys(second);

  return (
    hasSharedCandidate(firstAlternates, secondCandidates) ||
    hasSharedCandidate(secondAlternates, firstCandidates)
  );
}

export function applyTranslatedPageLocaleSync(sourceUrl: string, targetUrl: string): string {
  const source = parseHttpUrl(sourceUrl);
  const target = parseHttpUrl(targetUrl);

  if (!source || !target) {
    return sourceUrl;
  }

  const sourceLocale = getLocaleDescriptor(source);
  const targetLocale = getLocaleDescriptor(target);

  if (sourceLocale && !targetLocale) {
    return sourceUrl;
  }

  if (!sourceLocale || !targetLocale) {
    return buildUrlFromParts(
      source.protocol,
      source.hostname,
      source.port,
      source.pathname,
      target.search,
      target.hash,
    );
  }

  if (targetLocale.source === 'path') {
    return buildPathLocaleUrl(source, sourceLocale, target, targetLocale);
  }

  if (targetLocale.source === 'query') {
    return buildQueryLocaleUrl(source, sourceLocale, target, targetLocale);
  }

  return buildSubdomainLocaleUrl(source, sourceLocale, target, targetLocale);
}
