import { describe, expect, it } from 'vitest';

import {
  normalizeUrlForAutoSync,
  isUrlExcluded,
  isLocalDevelopmentServer,
  extractDomainFromUrl,
  normalizeDomain,
} from './auto-sync-url-utils';

describe('normalizeUrlForAutoSync', () => {
  describe('basic HTTP/HTTPS normalization', () => {
    it('should normalize HTTPS URL with query string and fragment', () => {
      expect(normalizeUrlForAutoSync('https://example.com/page?q=1#section')).toBe(
        'https://example.com/page',
      );
    });

    it('should normalize HTTP URL with query string and fragment', () => {
      expect(normalizeUrlForAutoSync('http://example.com/page?q=1#section')).toBe(
        'http://example.com/page',
      );
    });

    it('should preserve pathname without query or fragment', () => {
      expect(normalizeUrlForAutoSync('https://example.com/page')).toBe('https://example.com/page');
    });
  });

  describe('default port stripping', () => {
    it('should strip default port 80 for HTTP', () => {
      expect(normalizeUrlForAutoSync('http://example.com:80/page')).toBe('http://example.com/page');
    });

    it('should strip default port 443 for HTTPS', () => {
      expect(normalizeUrlForAutoSync('https://example.com:443/page')).toBe(
        'https://example.com/page',
      );
    });
  });

  describe('non-default port preservation', () => {
    it('should preserve non-default port 3000 for HTTP', () => {
      expect(normalizeUrlForAutoSync('http://localhost:3000/app')).toBe(
        'http://localhost:3000/app',
      );
    });

    it('should preserve non-default port 8080 for HTTP', () => {
      expect(normalizeUrlForAutoSync('http://example.com:8080/page')).toBe(
        'http://example.com:8080/page',
      );
    });

    it('should preserve non-default port 8443 for HTTPS', () => {
      expect(normalizeUrlForAutoSync('https://example.com:8443/page')).toBe(
        'https://example.com:8443/page',
      );
    });

    it('should preserve non-default port 5000 for HTTPS', () => {
      expect(normalizeUrlForAutoSync('https://localhost:5000/api')).toBe(
        'https://localhost:5000/api',
      );
    });
  });

  describe('non-HTTP protocols', () => {
    it('should return null for chrome:// protocol', () => {
      expect(normalizeUrlForAutoSync('chrome://extensions')).toBeNull();
    });

    it('should return null for ftp:// protocol', () => {
      expect(normalizeUrlForAutoSync('ftp://files.example.com/document')).toBeNull();
    });

    it('should return null for file:// protocol', () => {
      expect(normalizeUrlForAutoSync('file:///Users/user/document.html')).toBeNull();
    });

    it('should return null for data: protocol', () => {
      expect(normalizeUrlForAutoSync('data:text/html,<h1>Test</h1>')).toBeNull();
    });

    it('should return null for about: protocol', () => {
      expect(normalizeUrlForAutoSync('about:blank')).toBeNull();
    });
  });

  describe('invalid URL strings', () => {
    it('should return null for empty string', () => {
      expect(normalizeUrlForAutoSync('')).toBeNull();
    });

    it('should return null for malformed URL', () => {
      expect(normalizeUrlForAutoSync('not a valid url')).toBeNull();
    });

    it('should return null for URL with only protocol', () => {
      expect(normalizeUrlForAutoSync('https://')).toBeNull();
    });

    it('should return null for URL with invalid characters', () => {
      expect(normalizeUrlForAutoSync('https://exam ple.com/page')).toBeNull();
    });
  });

  describe('trailing slash handling', () => {
    it('should preserve trailing slash in pathname', () => {
      expect(normalizeUrlForAutoSync('https://example.com/page/')).toBe(
        'https://example.com/page/',
      );
    });

    it('should preserve root path without trailing slash', () => {
      expect(normalizeUrlForAutoSync('https://example.com')).toBe('https://example.com/');
    });

    it('should preserve root path with trailing slash', () => {
      expect(normalizeUrlForAutoSync('https://example.com/')).toBe('https://example.com/');
    });
  });

  describe('complex URLs', () => {
    it('should handle URLs with multiple path segments', () => {
      expect(normalizeUrlForAutoSync('https://example.com/api/v1/users?id=123#top')).toBe(
        'https://example.com/api/v1/users',
      );
    });

    it('should handle URLs with subdomains', () => {
      expect(normalizeUrlForAutoSync('https://api.example.com/endpoint')).toBe(
        'https://api.example.com/endpoint',
      );
    });

    it('should handle URLs with multiple subdomains', () => {
      expect(normalizeUrlForAutoSync('https://sub.api.example.com/path')).toBe(
        'https://sub.api.example.com/path',
      );
    });
  });
});

describe('isUrlExcluded', () => {
  describe('exact match patterns', () => {
    it('should match exact URL pattern', () => {
      expect(isUrlExcluded('https://example.com/admin', ['https://example.com/admin'])).toBe(true);
    });

    it('should not match when URL does not match pattern', () => {
      expect(isUrlExcluded('https://example.com/page', ['https://example.com/admin'])).toBe(false);
    });

    it('should match multiple exact patterns', () => {
      expect(
        isUrlExcluded('https://example.com/admin', [
          'https://example.com/login',
          'https://example.com/admin',
        ]),
      ).toBe(true);
    });
  });

  describe('wildcard patterns', () => {
    it('should match wildcard pattern at start', () => {
      expect(isUrlExcluded('https://example.com/admin', ['*admin'])).toBe(true);
    });

    it('should match wildcard pattern at end', () => {
      expect(isUrlExcluded('https://example.com/admin', ['*admin*'])).toBe(true);
    });

    it('should match wildcard pattern in middle', () => {
      expect(isUrlExcluded('https://example.com/admin/panel', ['*admin*'])).toBe(true);
    });

    it('should match multiple wildcard patterns', () => {
      expect(isUrlExcluded('https://example.com/admin', ['*login*', '*admin*', '*settings*'])).toBe(
        true,
      );
    });

    it('should not match when wildcard pattern does not match', () => {
      expect(isUrlExcluded('https://example.com/page', ['*admin*'])).toBe(false);
    });

    it('should match wildcard pattern with domain', () => {
      expect(isUrlExcluded('https://example.com/admin', ['*example.com*'])).toBe(true);
    });
  });

  describe('multiple patterns', () => {
    it('should return true if at least one pattern matches', () => {
      expect(isUrlExcluded('https://example.com/admin', ['*login*', '*admin*', '*settings*'])).toBe(
        true,
      );
    });

    it('should return false if no patterns match', () => {
      expect(isUrlExcluded('https://example.com/page', ['*login*', '*admin*', '*settings*'])).toBe(
        false,
      );
    });
  });

  describe('empty patterns array', () => {
    it('should return false for empty patterns array', () => {
      expect(isUrlExcluded('https://example.com/admin', [])).toBe(false);
    });
  });

  describe('invalid regex patterns', () => {
    it('should return false for invalid regex pattern without throwing', () => {
      expect(isUrlExcluded('https://example.com/page', ['[invalid(regex'])).toBe(false);
    });

    it('should continue checking other patterns if one is invalid', () => {
      expect(isUrlExcluded('https://example.com/admin', ['[invalid(regex', '*admin*'])).toBe(true);
    });

    it('should handle multiple invalid patterns gracefully', () => {
      expect(isUrlExcluded('https://example.com/page', ['[invalid(regex', '(another[bad'])).toBe(
        false,
      );
    });
  });

  describe('special characters in patterns', () => {
    it('should handle forward slashes in patterns', () => {
      expect(isUrlExcluded('https://example.com/admin/panel', ['*/admin/*'])).toBe(true);
    });

    it('should escape forward slashes for regex matching', () => {
      expect(isUrlExcluded('https://example.com/api/v1/users', ['*/api/v1/*'])).toBe(true);
    });
  });
});

describe('normalizeDomain', () => {
  describe('www. prefix stripping', () => {
    it('should strip www. prefix', () => {
      expect(normalizeDomain('www.github.com')).toBe('github.com');
    });

    it('should strip www. prefix with mixed case', () => {
      expect(normalizeDomain('WWW.GitHub.COM')).toBe('github.com');
    });

    it('should not strip www from subdomain that starts with www but is not www.', () => {
      expect(normalizeDomain('www2.example.com')).toBe('www2.example.com');
    });
  });

  describe('domains without www. prefix', () => {
    it('should return domain unchanged (lowercased)', () => {
      expect(normalizeDomain('github.com')).toBe('github.com');
    });

    it('should lowercase the domain', () => {
      expect(normalizeDomain('GitHub.COM')).toBe('github.com');
    });

    it('should preserve subdomains', () => {
      expect(normalizeDomain('api.example.com')).toBe('api.example.com');
    });

    it('should preserve multiple subdomains', () => {
      expect(normalizeDomain('sub.api.example.com')).toBe('sub.api.example.com');
    });
  });

  describe('edge cases', () => {
    it('should handle empty string', () => {
      expect(normalizeDomain('')).toBe('');
    });

    it('should handle www. alone', () => {
      expect(normalizeDomain('www.')).toBe('');
    });

    it('should handle localhost', () => {
      expect(normalizeDomain('localhost')).toBe('localhost');
    });
  });
});

describe('extractDomainFromUrl', () => {
  describe('standard URLs', () => {
    it('should extract domain from HTTPS URL', () => {
      expect(extractDomainFromUrl('https://github.com/user/repo/pulls?q=1')).toBe('github.com');
    });

    it('should extract domain from HTTP URL', () => {
      expect(extractDomainFromUrl('http://example.com/page')).toBe('example.com');
    });

    it('should extract subdomain', () => {
      expect(extractDomainFromUrl('https://api.example.com/endpoint')).toBe('api.example.com');
    });

    it('should extract multiple subdomains', () => {
      expect(extractDomainFromUrl('https://sub.api.example.com/path')).toBe('sub.api.example.com');
    });

    it('should extract domain from normalized URL', () => {
      expect(extractDomainFromUrl('https://github.com/jaem1n207/repo/pulls')).toBe('github.com');
    });
  });

  describe('case insensitivity', () => {
    it('should return lowercase domain', () => {
      expect(extractDomainFromUrl('https://GitHub.COM/user/repo')).toBe('github.com');
    });

    it('should handle mixed case', () => {
      expect(extractDomainFromUrl('https://Api.Example.Com/path')).toBe('api.example.com');
    });
  });

  describe('non-HTTP protocols', () => {
    it('should return null for chrome:// protocol', () => {
      expect(extractDomainFromUrl('chrome://extensions')).toBeNull();
    });

    it('should return null for ftp:// protocol', () => {
      expect(extractDomainFromUrl('ftp://files.example.com/doc')).toBeNull();
    });

    it('should return null for about: protocol', () => {
      expect(extractDomainFromUrl('about:blank')).toBeNull();
    });
  });

  describe('invalid URLs', () => {
    it('should return null for empty string', () => {
      expect(extractDomainFromUrl('')).toBeNull();
    });

    it('should return null for malformed URL', () => {
      expect(extractDomainFromUrl('not a valid url')).toBeNull();
    });
  });

  describe('URLs with ports', () => {
    it('should extract hostname without port', () => {
      expect(extractDomainFromUrl('http://localhost:3000/app')).toBe('localhost');
    });

    it('should extract hostname from URL with non-default port', () => {
      expect(extractDomainFromUrl('https://example.com:8443/page')).toBe('example.com');
    });
  });

  describe('www. prefix stripping', () => {
    it('should strip www. prefix from domain', () => {
      expect(extractDomainFromUrl('https://www.github.com/user/repo')).toBe('github.com');
    });

    it('should strip www. prefix from domain with path and query', () => {
      expect(extractDomainFromUrl('https://www.example.com/page?q=1#section')).toBe('example.com');
    });

    it('should not strip www from non-www subdomain', () => {
      expect(extractDomainFromUrl('https://www2.example.com/page')).toBe('www2.example.com');
    });

    it('should strip www. with mixed case', () => {
      expect(extractDomainFromUrl('https://WWW.Example.COM/path')).toBe('example.com');
    });
  });
});

describe('isLocalDevelopmentServer', () => {
  describe('localhost detection', () => {
    it('should detect localhost', () => {
      expect(isLocalDevelopmentServer('http://localhost:3000/app')).toBe(true);
    });

    it('should detect localhost with HTTPS', () => {
      expect(isLocalDevelopmentServer('https://localhost:5000/api')).toBe(true);
    });

    it('should detect localhost without port', () => {
      expect(isLocalDevelopmentServer('http://localhost/page')).toBe(true);
    });

    it('should detect localhost with path', () => {
      expect(isLocalDevelopmentServer('http://localhost:3000/api/v1/users')).toBe(true);
    });
  });

  describe('127.0.0.1 detection', () => {
    it('should detect 127.0.0.1', () => {
      expect(isLocalDevelopmentServer('http://127.0.0.1:3000/app')).toBe(true);
    });

    it('should detect 127.0.0.1 with HTTPS', () => {
      expect(isLocalDevelopmentServer('https://127.0.0.1:8443/api')).toBe(true);
    });

    it('should detect 127.0.0.1 without port', () => {
      expect(isLocalDevelopmentServer('http://127.0.0.1/page')).toBe(true);
    });
  });

  describe('0.0.0.0 detection', () => {
    it('should detect 0.0.0.0', () => {
      expect(isLocalDevelopmentServer('http://0.0.0.0:3000/app')).toBe(true);
    });

    it('should detect 0.0.0.0 with HTTPS', () => {
      expect(isLocalDevelopmentServer('https://0.0.0.0:8443/api')).toBe(true);
    });
  });

  describe('subdomain.localhost detection', () => {
    it('should detect subdomain.localhost', () => {
      expect(isLocalDevelopmentServer('http://api.localhost:3000/endpoint')).toBe(true);
    });

    it('should detect multiple subdomains with localhost', () => {
      expect(isLocalDevelopmentServer('http://sub.api.localhost:3000/path')).toBe(true);
    });

    it('should detect subdomain.localhost with HTTPS', () => {
      expect(isLocalDevelopmentServer('https://dev.localhost:5000/app')).toBe(true);
    });
  });

  describe('IPv6 loopback detection', () => {
    it('should detect IPv6 loopback [::1]', () => {
      expect(isLocalDevelopmentServer('http://[::1]:3000/app')).toBe(true);
    });

    it('should detect IPv6 loopback with HTTPS', () => {
      expect(isLocalDevelopmentServer('https://[::1]:8443/api')).toBe(true);
    });

    it('should detect IPv6 loopback without port', () => {
      expect(isLocalDevelopmentServer('http://[::1]/page')).toBe(true);
    });
  });

  describe('regular domains return false', () => {
    it('should return false for example.com', () => {
      expect(isLocalDevelopmentServer('https://example.com')).toBe(false);
    });

    it('should return false for api.example.com', () => {
      expect(isLocalDevelopmentServer('https://api.example.com/endpoint')).toBe(false);
    });

    it('should return false for google.com', () => {
      expect(isLocalDevelopmentServer('https://google.com')).toBe(false);
    });

    it('should return false for github.com', () => {
      expect(isLocalDevelopmentServer('https://github.com/user/repo')).toBe(false);
    });
  });

  describe('invalid URL handling', () => {
    it('should return false for invalid URL', () => {
      expect(isLocalDevelopmentServer('not a valid url')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isLocalDevelopmentServer('')).toBe(false);
    });

    it('should return false for malformed URL', () => {
      expect(isLocalDevelopmentServer('http://')).toBe(false);
    });
  });

  describe('case insensitivity', () => {
    it('should handle uppercase localhost', () => {
      expect(isLocalDevelopmentServer('http://LOCALHOST:3000/app')).toBe(true);
    });

    it('should handle mixed case localhost', () => {
      expect(isLocalDevelopmentServer('http://LocalHost:3000/app')).toBe(true);
    });

    it('should handle uppercase IPv6 loopback', () => {
      expect(isLocalDevelopmentServer('http://[::1]:3000/app')).toBe(true);
    });
  });
});
