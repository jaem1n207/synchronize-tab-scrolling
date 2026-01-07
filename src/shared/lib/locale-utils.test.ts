import { describe, expect, it } from 'vitest';

import { extractLocaleFromPath, applyLocalePreservingSync } from './locale-utils';

describe('extractLocaleFromPath', () => {
  it('should extract base locale codes', () => {
    expect(extractLocaleFromPath('/fr/docs/install')).toBe('fr');
    expect(extractLocaleFromPath('/en/api/users')).toBe('en');
    expect(extractLocaleFromPath('/zh/guide')).toBe('zh');
    expect(extractLocaleFromPath('/ko/reference')).toBe('ko');
  });

  it('should extract regional locale codes', () => {
    expect(extractLocaleFromPath('/en-US/docs/install')).toBe('en-US');
    expect(extractLocaleFromPath('/zh-CN/api/users')).toBe('zh-CN');
    expect(extractLocaleFromPath('/pt-BR/guide')).toBe('pt-BR');
    expect(extractLocaleFromPath('/fr-CA/reference')).toBe('fr-CA');
  });

  it('should return null for paths without locale', () => {
    expect(extractLocaleFromPath('/docs/install')).toBeNull();
    expect(extractLocaleFromPath('/api/users')).toBeNull();
    expect(extractLocaleFromPath('/guide/getting-started')).toBeNull();
  });

  it('should not match partial locale strings', () => {
    expect(extractLocaleFromPath('/french/docs')).toBeNull();
    expect(extractLocaleFromPath('/english/guide')).toBeNull();
    expect(extractLocaleFromPath('/korean/api')).toBeNull();
  });

  it('should find locale at different positions', () => {
    expect(extractLocaleFromPath('/docs/fr/install')).toBe('fr');
    expect(extractLocaleFromPath('/api/en-US/users')).toBe('en-US');
  });

  it('should handle root paths with locale', () => {
    expect(extractLocaleFromPath('/fr/')).toBe('fr');
    expect(extractLocaleFromPath('/en-US/')).toBe('en-US');
  });
});

describe('applyLocalePreservingSync', () => {
  it('should preserve target locale when both URLs have locales', () => {
    const result = applyLocalePreservingSync(
      'https://example.com/fr/docs/install',
      'https://example.com/en-US/docs/next',
    );
    expect(result).toBe('https://example.com/en-US/docs/install');
  });

  it('should preserve target locale with regional codes', () => {
    const result = applyLocalePreservingSync(
      'https://example.com/zh-CN/api/users',
      'https://example.com/en-US/api/data',
    );
    expect(result).toBe('https://example.com/en-US/api/users');
  });

  it('should preserve query parameters from target', () => {
    const result = applyLocalePreservingSync(
      'https://example.com/fr/docs/install',
      'https://example.com/en-US/docs/next?foo=bar&baz=qux',
    );
    expect(result).toBe('https://example.com/en-US/docs/install?foo=bar&baz=qux');
  });

  it('should preserve hash fragment from target', () => {
    const result = applyLocalePreservingSync(
      'https://example.com/fr/docs/install',
      'https://example.com/en-US/docs/next#section-1',
    );
    expect(result).toBe('https://example.com/en-US/docs/install#section-1');
  });

  it('should preserve both query and hash from target', () => {
    const result = applyLocalePreservingSync(
      'https://example.com/fr/docs/install',
      'https://example.com/en-US/docs/next?foo=bar#section',
    );
    expect(result).toBe('https://example.com/en-US/docs/install?foo=bar#section');
  });

  it('should use source URL when only source has locale', () => {
    const result = applyLocalePreservingSync(
      'https://example.com/fr/docs/install',
      'https://example.com/docs/next',
    );
    expect(result).toBe('https://example.com/fr/docs/install');
  });

  it('should use source pathname when only target has locale', () => {
    const result = applyLocalePreservingSync(
      'https://example.com/docs/install',
      'https://example.com/en-US/docs/next',
    );
    expect(result).toBe('https://example.com/docs/install');
  });

  it('should use source pathname when neither has locale', () => {
    const result = applyLocalePreservingSync(
      'https://example.com/docs/install',
      'https://example.com/docs/next?foo=bar',
    );
    expect(result).toBe('https://example.com/docs/install?foo=bar');
  });

  it('should handle multiple path segments', () => {
    const result = applyLocalePreservingSync(
      'https://example.com/fr/api/v2/users/123',
      'https://example.com/en-US/api/v1/data/456',
    );
    expect(result).toBe('https://example.com/en-US/api/v2/users/123');
  });

  it('should handle root paths with locales', () => {
    const result = applyLocalePreservingSync(
      'https://example.com/fr/',
      'https://example.com/en-US/',
    );
    // URL constructor normalizes trailing slashes
    expect(result).toBe('https://example.com/en-US');
  });

  it('should handle different domains (cross-domain sync)', () => {
    const result = applyLocalePreservingSync(
      'https://staging.example.com/fr/docs/install',
      'https://production.example.com/en-US/docs/next',
    );
    expect(result).toBe('https://staging.example.com/en-US/docs/install');
  });

  it('should handle the generaltranslation.com example from the issue', () => {
    const result = applyLocalePreservingSync(
      'https://generaltranslation.com/fr/docs/next',
      'https://generaltranslation.com/en-US/docs/next',
    );
    expect(result).toBe('https://generaltranslation.com/en-US/docs/next');
  });

  it('should preserve target locale when source changes path deeply', () => {
    const result = applyLocalePreservingSync(
      'https://generaltranslation.com/zh/docs/install/advanced',
      'https://generaltranslation.com/en-US/docs/next',
    );
    expect(result).toBe('https://generaltranslation.com/en-US/docs/install/advanced');
  });

  it('should fallback to source URL on invalid URLs', () => {
    const result = applyLocalePreservingSync('invalid-url', 'https://example.com/en-US/docs');
    expect(result).toBe('invalid-url');
  });
});
