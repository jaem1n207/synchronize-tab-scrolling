import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { prepareReleaseFiles } from './prepare-release-pr';

const temporaryRoots: Array<string> = [];

afterEach(async () => {
  const roots = temporaryRoots.splice(0);
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

async function createReleaseFixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'scroll-sync-release-pr-'));
  temporaryRoots.push(root);
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'synchronize-tab-scrolling', version: '2.14.2' }, null, 2) + '\n',
  );
  await writeFile(path.join(root, 'CHANGELOG.md'), '## [2.14.2](compare-link)\n\nPrevious notes\n');
  return root;
}

describe('release PR preparation', () => {
  it('updates the package version and prepends generated release notes', async () => {
    const root = await createReleaseFixture();

    await prepareReleaseFiles({
      cwd: root,
      version: '2.15.0',
      notes: '## [2.15.0](next-link)\n\n### Features\n\n* add Quick Sync',
    });

    await expect(readFile(path.join(root, 'package.json'), 'utf8')).resolves.toBe(
      JSON.stringify({ name: 'synchronize-tab-scrolling', version: '2.15.0' }, null, 2) + '\n',
    );
    await expect(readFile(path.join(root, 'CHANGELOG.md'), 'utf8')).resolves.toBe(
      [
        '## [2.15.0](next-link)',
        '',
        '### Features',
        '',
        '* add Quick Sync',
        '',
        '## [2.14.2](compare-link)',
        '',
        'Previous notes',
        '',
      ].join('\n'),
    );
  });

  it('rejects an already prepared changelog version', async () => {
    const root = await createReleaseFixture();
    await writeFile(
      path.join(root, 'CHANGELOG.md'),
      '## [2.15.0](next-link)\n\nExisting release notes\n',
    );

    await expect(
      prepareReleaseFiles({
        cwd: root,
        version: '2.15.0',
        notes: '## [2.15.0](next-link)\n\nDuplicate release notes',
      }),
    ).rejects.toThrow('CHANGELOG.md already contains release 2.15.0');
  });

  it('rejects malformed package metadata before writing files', async () => {
    const root = await createReleaseFixture();
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'missing-version' }));

    await expect(
      prepareReleaseFiles({
        cwd: root,
        version: '2.15.0',
        notes: '## [2.15.0](next-link)\n\nRelease notes',
      }),
    ).rejects.toThrow('package.json must contain a version string');
  });
});
