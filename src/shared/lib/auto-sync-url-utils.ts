/**
 * Pure URL utility functions for the auto-sync feature.
 *
 * These functions handle URL normalization, exclusion pattern matching,
 * and local development server detection — used by the background script
 * to determine which tabs should be grouped for automatic scroll sync.
 */

/**
 * Normalize a URL for auto-sync group matching.
 *
 * Strips query strings, fragments, and default ports (80/443) so that
 * tabs pointing to the same page are grouped together regardless of
 * minor URL differences.
 *
 * @param url - Raw URL string to normalize
 * @returns Normalized URL (protocol + host + path) or `null` for non-HTTP URLs or invalid input
 *
 * @example
 * normalizeUrlForAutoSync('https://example.com/page?q=1#section')
 * // => 'https://example.com/page'
 *
 * normalizeUrlForAutoSync('http://localhost:3000/app')
 * // => 'http://localhost:3000/app'
 *
 * normalizeUrlForAutoSync('chrome://extensions')
 * // => null
 */
export function normalizeUrlForAutoSync(url: string): string | null {
  try {
    const parsed = new URL(url);

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return null;
    }

    let normalizedHost = parsed.hostname;
    if (parsed.port) {
      const isDefaultPort =
        (parsed.protocol === 'http:' && parsed.port === '80') ||
        (parsed.protocol === 'https:' && parsed.port === '443');
      if (!isDefaultPort) {
        normalizedHost = `${parsed.hostname}:${parsed.port}`;
      }
    }

    return `${parsed.protocol}//${normalizedHost}${parsed.pathname}`;
  } catch {
    return null;
  }
}

/**
 * Check whether a URL matches any of the given exclusion patterns.
 *
 * Patterns use simplified glob syntax where `*` matches any characters
 * and `/` is escaped for regex matching.
 *
 * @param url - URL string to test
 * @param patterns - Array of glob-like exclusion patterns
 * @returns `true` if the URL matches at least one pattern
 *
 * @example
 * isUrlExcluded('https://example.com/admin', ['*admin*'])
 * // => true
 *
 * isUrlExcluded('https://example.com/page', ['*admin*'])
 * // => false
 */
export function isUrlExcluded(url: string, patterns: Array<string>): boolean {
  return patterns.some((pattern) => {
    try {
      const regex = new RegExp(pattern.replace(/\*/g, '.*').replace(/\//g, '\\/'));
      return regex.test(url);
    } catch {
      return false;
    }
  });
}

/**
 * Detect whether a URL points to a local development server.
 *
 * Local servers are excluded from auto-sync suggestions (but not from
 * manual sync) because developers frequently reload them, which would
 * trigger unwanted sync suggestion popups.
 *
 * @param url - URL string to check
 * @returns `true` if the hostname is localhost, 127.0.0.1, 0.0.0.0, or IPv6 loopback
 *
 * @example
 * isLocalDevelopmentServer('http://localhost:3000/app')
 * // => true
 *
 * isLocalDevelopmentServer('https://example.com')
 * // => false
 */
export function isLocalDevelopmentServer(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname.endsWith('.localhost') ||
      hostname === '[::1]'
    );
  } catch {
    return false;
  }
}
