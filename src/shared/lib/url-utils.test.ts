import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

import { detectBrowserType, isForbiddenUrl } from './url-utils';

describe('detectBrowserType', () => {
  const originalUserAgent = navigator.userAgent;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'userAgent', {
      value: originalUserAgent,
      configurable: true,
    });
  });

  it('should detect Chrome browser', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      configurable: true,
    });
    expect(detectBrowserType()).toBe('chrome');
  });

  it('should detect Firefox browser', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
      configurable: true,
    });
    expect(detectBrowserType()).toBe('firefox');
  });

  it('should detect Edge browser', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
      configurable: true,
    });
    expect(detectBrowserType()).toBe('edge');
  });

  it('should return unknown for unrecognized user agent', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Unknown Browser 1.0',
      configurable: true,
    });
    expect(detectBrowserType()).toBe('unknown');
  });

  it('should be case-insensitive', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 CHROME Safari/537.36',
      configurable: true,
    });
    expect(detectBrowserType()).toBe('chrome');
  });

  it('should prioritize Edge over Chrome when both strings present', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 Chrome/120.0 Edg/120.0.0.0',
      configurable: true,
    });
    expect(detectBrowserType()).toBe('edge');
  });
});

describe('isForbiddenUrl', () => {
  const originalUserAgent = navigator.userAgent;

  beforeEach(() => {
    Object.defineProperty(navigator, 'userAgent', {
      value:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'userAgent', {
      value: originalUserAgent,
      configurable: true,
    });
  });

  describe('null/undefined/empty input', () => {
    it('should return true for null', () => {
      expect(isForbiddenUrl(null)).toBe(true);
    });

    it('should return true for undefined', () => {
      expect(isForbiddenUrl(undefined)).toBe(true);
    });

    it('should return true for empty string', () => {
      expect(isForbiddenUrl('')).toBe(true);
    });
  });

  describe('Google services', () => {
    it('should forbid Google Docs', () => {
      expect(isForbiddenUrl('https://docs.google.com')).toBe(true);
      expect(isForbiddenUrl('https://docs.google.com/document/d/123')).toBe(true);
    });

    it('should forbid Google Drive', () => {
      expect(isForbiddenUrl('https://drive.google.com')).toBe(true);
      expect(isForbiddenUrl('https://drive.google.com/drive/folders/123')).toBe(true);
    });

    it('should forbid Google Mail', () => {
      expect(isForbiddenUrl('https://mail.google.com')).toBe(true);
      expect(isForbiddenUrl('https://mail.google.com/mail/u/0')).toBe(true);
    });

    it('should forbid Google Sheets', () => {
      expect(isForbiddenUrl('https://sheets.google.com')).toBe(true);
    });

    it('should forbid Google Slides', () => {
      expect(isForbiddenUrl('https://slides.google.com')).toBe(true);
    });

    it('should forbid Google Calendar', () => {
      expect(isForbiddenUrl('https://calendar.google.com')).toBe(true);
    });

    it('should forbid Google Meet', () => {
      expect(isForbiddenUrl('https://meet.google.com')).toBe(true);
    });

    it('should forbid Google Photos', () => {
      expect(isForbiddenUrl('https://photos.google.com')).toBe(true);
    });

    it('should forbid Google Accounts', () => {
      expect(isForbiddenUrl('https://accounts.google.com')).toBe(true);
    });

    it('should forbid Google Cloud Console', () => {
      expect(isForbiddenUrl('https://console.cloud.google.com')).toBe(true);
    });

    it('should forbid Chrome Web Store', () => {
      expect(isForbiddenUrl('https://chromewebstore.google.com')).toBe(true);
      expect(isForbiddenUrl('https://chrome.google.com/webstore')).toBe(true);
    });

    it('should be case-insensitive for Google services', () => {
      expect(isForbiddenUrl('HTTPS://DOCS.GOOGLE.COM')).toBe(true);
      expect(isForbiddenUrl('https://MAIL.GOOGLE.COM')).toBe(true);
    });
  });

  describe('restricted protocols', () => {
    it('should forbid chrome:// protocol', () => {
      expect(isForbiddenUrl('chrome://settings')).toBe(true);
      expect(isForbiddenUrl('chrome://extensions')).toBe(true);
    });

    it('should forbid chrome-extension:// protocol', () => {
      expect(isForbiddenUrl('chrome-extension://abc123/popup.html')).toBe(true);
    });

    it('should forbid data: protocol', () => {
      expect(isForbiddenUrl('data:text/html,<h1>Test</h1>')).toBe(true);
    });

    it('should forbid blob: protocol', () => {
      expect(isForbiddenUrl('blob:https://example.com/abc123')).toBe(true);
    });

    it('should forbid file:// protocol', () => {
      expect(isForbiddenUrl('file:///Users/test/document.html')).toBe(true);
    });

    it('should forbid javascript: protocol', () => {
      expect(isForbiddenUrl('javascript:alert("test")')).toBe(true);
    });

    it('should forbid about: protocol (Firefox)', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
        configurable: true,
      });
      expect(isForbiddenUrl('about:blank')).toBe(true);
      expect(isForbiddenUrl('about:home')).toBe(true);
    });

    it('should forbid edge:// protocol (Edge)', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
        configurable: true,
      });
      expect(isForbiddenUrl('edge://settings')).toBe(true);
    });
  });

  describe('special domains', () => {
    it('should forbid Figma', () => {
      expect(isForbiddenUrl('https://figma.com')).toBe(true);
      expect(isForbiddenUrl('https://www.figma.com')).toBe(true);
      expect(isForbiddenUrl('https://figma.com/file/abc123')).toBe(true);
    });

    it('should forbid Notion', () => {
      expect(isForbiddenUrl('https://notion.so')).toBe(true);
      expect(isForbiddenUrl('https://www.notion.so')).toBe(true);
      expect(isForbiddenUrl('https://notion.so/workspace/page')).toBe(true);
    });

    it('should forbid YouTube Music', () => {
      expect(isForbiddenUrl('https://music.youtube.com')).toBe(true);
      expect(isForbiddenUrl('https://music.youtube.com/browse/artist/abc123')).toBe(true);
    });
  });

  describe('search engines', () => {
    it('should forbid Google Search', () => {
      expect(isForbiddenUrl('https://google.com/search?q=test')).toBe(true);
      expect(isForbiddenUrl('https://www.google.com/search?q=test')).toBe(true);
    });

    it('should allow Google homepage without /search', () => {
      expect(isForbiddenUrl('https://google.com')).toBe(false);
      expect(isForbiddenUrl('https://www.google.com')).toBe(false);
    });

    it('should forbid Bing Search', () => {
      expect(isForbiddenUrl('https://bing.com/search?q=test')).toBe(true);
      expect(isForbiddenUrl('https://www.bing.com/search?q=test')).toBe(true);
    });

    it('should forbid DuckDuckGo', () => {
      expect(isForbiddenUrl('https://duckduckgo.com')).toBe(true);
      expect(isForbiddenUrl('https://www.duckduckgo.com')).toBe(true);
    });

    it('should forbid Naver Search', () => {
      expect(isForbiddenUrl('https://search.naver.com')).toBe(true);
      expect(isForbiddenUrl('https://search.naver.com/search.naver?query=test')).toBe(true);
    });

    it('should forbid Baidu Search', () => {
      expect(isForbiddenUrl('https://www.baidu.com/s?wd=test')).toBe(true);
    });

    it('should forbid Yahoo Search', () => {
      expect(isForbiddenUrl('https://search.yahoo.com')).toBe(true);
    });

    it('should forbid Daum Search', () => {
      expect(isForbiddenUrl('https://search.daum.net')).toBe(true);
    });
  });

  describe('PDF files and viewers', () => {
    it('should forbid direct PDF file access', () => {
      expect(isForbiddenUrl('https://example.com/document.pdf')).toBe(true);
      expect(isForbiddenUrl('https://example.com/path/to/file.pdf')).toBe(true);
    });

    it('should forbid PDF viewer paths', () => {
      expect(isForbiddenUrl('https://example.com/pdf')).toBe(true);
      expect(isForbiddenUrl('https://example.com/pdf/viewer')).toBe(true);
      expect(isForbiddenUrl('https://example.com/viewer')).toBe(true);
      expect(isForbiddenUrl('https://example.com/pdfviewer')).toBe(true);
    });

    it('should allow non-PDF files', () => {
      expect(isForbiddenUrl('https://example.com/document.docx')).toBe(false);
      expect(isForbiddenUrl('https://example.com/image.png')).toBe(false);
    });
  });

  describe('authentication/login pages', () => {
    it('should forbid login path', () => {
      expect(isForbiddenUrl('https://example.com/login')).toBe(true);
      expect(isForbiddenUrl('https://example.com/login?redirect=/home')).toBe(true);
    });

    it('should forbid signin path', () => {
      expect(isForbiddenUrl('https://example.com/signin')).toBe(true);
      expect(isForbiddenUrl('https://example.com/sign-in')).toBe(true);
    });

    it('should forbid signup path', () => {
      expect(isForbiddenUrl('https://example.com/signup')).toBe(true);
      expect(isForbiddenUrl('https://example.com/sign-up')).toBe(true);
    });

    it('should forbid auth domain prefixes', () => {
      expect(isForbiddenUrl('https://accounts.example.com')).toBe(true);
      expect(isForbiddenUrl('https://login.example.com')).toBe(true);
      expect(isForbiddenUrl('https://auth.example.com')).toBe(true);
      expect(isForbiddenUrl('https://signin.example.com')).toBe(true);
      expect(isForbiddenUrl('https://signup.example.com')).toBe(true);
      expect(isForbiddenUrl('https://sso.example.com')).toBe(true);
      expect(isForbiddenUrl('https://id.example.com')).toBe(true);
      expect(isForbiddenUrl('https://oauth.example.com')).toBe(true);
    });

    it('should forbid other auth paths', () => {
      expect(isForbiddenUrl('https://example.com/auth')).toBe(true);
      expect(isForbiddenUrl('https://example.com/oauth')).toBe(true);
      expect(isForbiddenUrl('https://example.com/sso')).toBe(true);
      expect(isForbiddenUrl('https://example.com/register')).toBe(true);
      expect(isForbiddenUrl('https://example.com/authenticate')).toBe(true);
    });
  });

  describe('special path patterns', () => {
    it('should forbid JIRA paths', () => {
      expect(isForbiddenUrl('https://example.atlassian.net/jira')).toBe(true);
      expect(isForbiddenUrl('https://example.atlassian.net/jira/browse/PROJ-123')).toBe(true);
    });

    it('should forbid Confluence paths', () => {
      expect(isForbiddenUrl('https://example.atlassian.net/wiki')).toBe(true);
      expect(isForbiddenUrl('https://example.atlassian.net/wiki/spaces/PROJ')).toBe(true);
    });
  });

  describe('browser-specific addon stores', () => {
    it('should forbid Firefox addon store', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
        configurable: true,
      });
      expect(isForbiddenUrl('https://addons.mozilla.org')).toBe(true);
      expect(isForbiddenUrl('https://addons.mozilla.org/firefox/addon/test')).toBe(true);
    });

    it('should forbid Edge addon store', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
        configurable: true,
      });
      expect(isForbiddenUrl('https://microsoftedge.microsoft.com/addons')).toBe(true);
    });
  });

  describe('normal URLs', () => {
    it('should allow normal HTTPS URLs', () => {
      expect(isForbiddenUrl('https://example.com')).toBe(false);
      expect(isForbiddenUrl('https://example.com/page')).toBe(false);
      expect(isForbiddenUrl('https://example.com/page?query=value')).toBe(false);
      expect(isForbiddenUrl('https://example.com/page#section')).toBe(false);
    });

    it('should allow normal HTTP URLs', () => {
      expect(isForbiddenUrl('http://example.com')).toBe(false);
      expect(isForbiddenUrl('http://example.com/page')).toBe(false);
    });

    it('should allow subdomains', () => {
      expect(isForbiddenUrl('https://subdomain.example.com')).toBe(false);
      expect(isForbiddenUrl('https://api.example.com/v1/users')).toBe(false);
    });

    it('should allow complex paths', () => {
      expect(isForbiddenUrl('https://example.com/api/v1/users/123/profile')).toBe(false);
    });
  });

  describe('invalid URLs', () => {
    it('should return true for invalid URL format', () => {
      expect(isForbiddenUrl('not a url')).toBe(true);
      expect(isForbiddenUrl('ht!tp://invalid')).toBe(true);
      expect(isForbiddenUrl('://missing-protocol')).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle URLs with ports', () => {
      expect(isForbiddenUrl('https://example.com:8080')).toBe(false);
      expect(isForbiddenUrl('http://localhost:3000')).toBe(false);
    });

    it('should handle URLs with authentication', () => {
      expect(isForbiddenUrl('https://user:pass@example.com')).toBe(false);
    });

    it('should handle URLs with complex query strings', () => {
      expect(isForbiddenUrl('https://example.com?a=1&b=2&c=3')).toBe(false);
    });

    it('should handle URLs with fragments', () => {
      expect(isForbiddenUrl('https://example.com#section-1')).toBe(false);
    });

    it('should be case-insensitive for domain matching', () => {
      expect(isForbiddenUrl('HTTPS://EXAMPLE.COM/LOGIN')).toBe(true);
      expect(isForbiddenUrl('https://EXAMPLE.COM/SIGNIN')).toBe(true);
    });

    it('should handle trailing slashes', () => {
      expect(isForbiddenUrl('https://docs.google.com/')).toBe(true);
      expect(isForbiddenUrl('https://example.com/login/')).toBe(true);
    });
  });
});
