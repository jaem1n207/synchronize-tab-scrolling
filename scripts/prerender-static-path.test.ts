import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveStaticFilePath } from './prerender-static-path';

const ROOT_DIRECTORY = join(process.cwd(), 'dist-landing');

describe('resolveStaticFilePath', () => {
  it('resolves landing root and asset requests inside the build directory', () => {
    expect(resolveStaticFilePath(ROOT_DIRECTORY, '/', '/')).toBe(
      join(ROOT_DIRECTORY, 'landing', 'index.html'),
    );
    expect(resolveStaticFilePath(ROOT_DIRECTORY, '/assets/main.js?v=1', '/')).toBe(
      join(ROOT_DIRECTORY, 'assets', 'main.js'),
    );
  });

  it('strips the configured landing base before resolving an asset', () => {
    expect(
      resolveStaticFilePath(
        ROOT_DIRECTORY,
        '/synchronize-tab-scrolling/assets/main.js',
        '/synchronize-tab-scrolling/',
      ),
    ).toBe(join(ROOT_DIRECTORY, 'assets', 'main.js'));
  });

  it.each([
    '/../package.json',
    '/assets/../../package.json',
    '/%2e%2e/package.json',
    '/assets/%2e%2e/%2e%2e/package.json',
    '/assets/%5c..%5c..%5cpackage.json',
  ])('rejects traversal outside the build directory: %s', (requestTarget) => {
    expect(resolveStaticFilePath(ROOT_DIRECTORY, requestTarget, '/')).toBeNull();
  });

  it('rejects malformed percent encoding', () => {
    expect(resolveStaticFilePath(ROOT_DIRECTORY, '/assets/%E0%A4%A', '/')).toBeNull();
  });
});
