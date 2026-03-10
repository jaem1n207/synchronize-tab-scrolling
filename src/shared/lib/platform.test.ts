import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getPlatform, isMac, isWindows, isLinux } from './platform';

function setUserAgentData(platform: string | undefined): void {
  Object.defineProperty(navigator, 'userAgentData', {
    value: platform ? { platform } : undefined,
    configurable: true,
    writable: true,
  });
}

function setUserAgent(ua: string): void {
  Object.defineProperty(navigator, 'userAgent', {
    value: ua,
    configurable: true,
    writable: true,
  });
}

describe('platform', () => {
  const originalUserAgent = navigator.userAgent;
  const originalUserAgentData = (navigator as Navigator & { userAgentData?: unknown })
    .userAgentData;

  afterEach(() => {
    Object.defineProperty(navigator, 'userAgent', {
      value: originalUserAgent,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(navigator, 'userAgentData', {
      value: originalUserAgentData,
      configurable: true,
      writable: true,
    });
  });

  describe('getPlatform', () => {
    describe('User-Agent Client Hints API (Chromium)', () => {
      it('returns macos for "macOS" platform hint', () => {
        setUserAgentData('macOS');
        expect(getPlatform()).toBe('macos');
      });

      it('returns macos for "Mac" platform hint', () => {
        setUserAgentData('Mac');
        expect(getPlatform()).toBe('macos');
      });

      it('returns windows for "Windows" platform hint', () => {
        setUserAgentData('Windows');
        expect(getPlatform()).toBe('windows');
      });

      it('returns linux for "Linux" platform hint', () => {
        setUserAgentData('Linux');
        expect(getPlatform()).toBe('linux');
      });

      it('falls through to userAgent for unrecognized platform hint', () => {
        setUserAgentData('ChromeOS');
        setUserAgent('Mozilla/5.0 (X11; CrOS x86_64) AppleWebKit/537.36');
        expect(getPlatform()).toBe('unknown');
      });
    });

    describe('userAgent fallback (all browsers)', () => {
      beforeEach(() => {
        setUserAgentData(undefined);
      });

      it('detects macOS from Mac OS X in userAgent', () => {
        setUserAgent(
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        );
        expect(getPlatform()).toBe('macos');
      });

      it('detects macOS from Macintosh in userAgent', () => {
        setUserAgent('Mozilla/5.0 (Macintosh; PPC Mac OS X) Gecko/20100101 Firefox/60.0');
        expect(getPlatform()).toBe('macos');
      });

      it('detects macOS from iPhone in userAgent', () => {
        setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15');
        expect(getPlatform()).toBe('macos');
      });

      it('detects macOS from iPad in userAgent', () => {
        setUserAgent('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15');
        expect(getPlatform()).toBe('macos');
      });

      it('detects Windows from Windows NT in userAgent', () => {
        setUserAgent(
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        );
        expect(getPlatform()).toBe('windows');
      });

      it('detects Windows from Win64 in userAgent', () => {
        setUserAgent('Mozilla/5.0 (Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0');
        expect(getPlatform()).toBe('windows');
      });

      it('detects Windows from Windows NT version pattern', () => {
        setUserAgent('Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 6.2)');
        expect(getPlatform()).toBe('windows');
      });

      it('detects Linux from Linux in userAgent', () => {
        setUserAgent(
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        );
        expect(getPlatform()).toBe('linux');
      });

      it('detects Linux from Ubuntu in userAgent', () => {
        setUserAgent('Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:120.0) Gecko/20100101');
        expect(getPlatform()).toBe('linux');
      });

      it('excludes Android from Linux detection', () => {
        setUserAgent(
          'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        );
        expect(getPlatform()).not.toBe('linux');
      });

      it('excludes Chrome OS from Linux detection', () => {
        setUserAgent(
          'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko)',
        );
        expect(getPlatform()).toBe('unknown');
      });

      it('returns unknown for unrecognizable userAgent', () => {
        setUserAgent('CustomBot/1.0');
        expect(getPlatform()).toBe('unknown');
      });

      it('returns unknown for empty userAgent', () => {
        setUserAgent('');
        expect(getPlatform()).toBe('unknown');
      });
    });

    describe('priority: userAgentData takes precedence over userAgent', () => {
      it('uses userAgentData even when userAgent suggests different platform', () => {
        setUserAgentData('Windows');
        setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
        expect(getPlatform()).toBe('windows');
      });
    });
  });

  describe('isMac', () => {
    it('returns true when platform is macos', () => {
      setUserAgentData('macOS');
      expect(isMac()).toBe(true);
    });

    it('returns false when platform is windows', () => {
      setUserAgentData('Windows');
      expect(isMac()).toBe(false);
    });

    it('returns false when platform is linux', () => {
      setUserAgentData('Linux');
      expect(isMac()).toBe(false);
    });
  });

  describe('isWindows', () => {
    it('returns true when platform is windows', () => {
      setUserAgentData('Windows');
      expect(isWindows()).toBe(true);
    });

    it('returns false when platform is macos', () => {
      setUserAgentData('macOS');
      expect(isWindows()).toBe(false);
    });
  });

  describe('isLinux', () => {
    it('returns true when platform is linux', () => {
      setUserAgentData('Linux');
      expect(isLinux()).toBe(true);
    });

    it('returns false when platform is macos', () => {
      setUserAgentData('macOS');
      expect(isLinux()).toBe(false);
    });
  });
});
