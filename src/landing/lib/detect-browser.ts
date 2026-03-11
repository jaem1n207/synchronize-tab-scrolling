export type BrowserName = 'chrome' | 'firefox' | 'edge' | 'brave' | 'safari' | 'unknown';

let cachedBrowser: BrowserName | undefined;

export function detectBrowser(): BrowserName {
  if (cachedBrowser) return cachedBrowser;
  if (typeof navigator === 'undefined') return 'unknown';

  const ua = navigator.userAgent;

  if (ua.includes('Edg/')) {
    cachedBrowser = 'edge';
  } else if (ua.includes('Firefox')) {
    cachedBrowser = 'firefox';
  } else if (ua.includes('Safari') && !ua.includes('Chrome')) {
    cachedBrowser = 'safari';
  } else if (ua.includes('Chrome')) {
    cachedBrowser = 'chrome';
  } else {
    cachedBrowser = 'unknown';
  }

  return cachedBrowser;
}
