import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { snapshotExtensionArtifact, validateExtensionArtifact } from './build-extension-artifact';

const temporaryRoots: Array<string> = [];
const quickSyncCommand = {
  'quick-sync-start-or-add': {
    suggested_key: {
      default: 'Ctrl+Shift+Period',
      mac: 'Command+Shift+Period',
    },
    description: '__MSG_quickSyncCommandDescription__',
  },
};

async function createArtifactFixture(
  root: string,
  browser: 'chromium' | 'firefox',
): Promise<string> {
  const artifactDirectory = path.join(root, 'extension');
  const backgroundDirectory = path.join(artifactDirectory, 'dist', 'background');
  await mkdir(backgroundDirectory, { recursive: true });
  await mkdir(path.join(artifactDirectory, 'dist', 'contentScripts'), { recursive: true });
  await mkdir(path.join(artifactDirectory, 'dist', 'popup'), { recursive: true });
  await mkdir(path.join(artifactDirectory, '_locales', 'en'), { recursive: true });
  await mkdir(path.join(artifactDirectory, 'icons'), { recursive: true });

  const background =
    browser === 'chromium'
      ? { service_worker: './dist/background/index.mjs' }
      : { scripts: ['dist/background/index.mjs'], type: 'module' };
  await writeFile(
    path.join(artifactDirectory, 'manifest.json'),
    JSON.stringify({
      manifest_version: 3,
      background,
      commands: quickSyncCommand,
    }),
  );
  await writeFile(
    path.join(backgroundDirectory, 'index.mjs'),
    "browser.commands.onCommand.addListener(() => {}); const command = 'quick-sync-start-or-add';",
  );
  await writeFile(
    path.join(artifactDirectory, 'dist', 'contentScripts', 'index.global.js'),
    'content script',
  );
  await writeFile(path.join(artifactDirectory, 'dist', 'popup', 'index.html'), 'popup');
  await writeFile(
    path.join(artifactDirectory, '_locales', 'en', 'messages.json'),
    '{"quickSyncCommandDescription":{"message":"Quick Sync"}}',
  );
  await writeFile(path.join(artifactDirectory, 'icons', 'logo-16.png'), browser);
  return artifactDirectory;
}

afterEach(async () => {
  const roots = temporaryRoots.splice(0);
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

describe('extension build artifacts', () => {
  it('validates a loadable Chromium command runtime', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'scroll-sync-artifact-'));
    temporaryRoots.push(root);
    const artifactDirectory = await createArtifactFixture(root, 'chromium');

    await expect(validateExtensionArtifact(artifactDirectory, 'chromium')).resolves.toEqual({
      backgroundEntry: 'dist/background/index.mjs',
      browser: 'chromium',
    });
  });

  it('rejects a Chromium artifact without the command listener registration seam', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'scroll-sync-artifact-'));
    temporaryRoots.push(root);
    const artifactDirectory = await createArtifactFixture(root, 'chromium');
    await writeFile(
      path.join(artifactDirectory, 'dist', 'background', 'index.mjs'),
      "const command = 'quick-sync-start-or-add';",
    );

    await expect(validateExtensionArtifact(artifactDirectory, 'chromium')).rejects.toThrow(
      'commands.onCommand listener',
    );
  });

  it('validates the Firefox background scripts contract', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'scroll-sync-artifact-'));
    temporaryRoots.push(root);
    const artifactDirectory = await createArtifactFixture(root, 'firefox');

    await expect(validateExtensionArtifact(artifactDirectory, 'firefox')).resolves.toEqual({
      backgroundEntry: 'dist/background/index.mjs',
      browser: 'firefox',
    });
  });

  it('preserves the Chromium snapshot after staging is replaced by Firefox', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'scroll-sync-artifact-'));
    temporaryRoots.push(root);
    const stagingDirectory = await createArtifactFixture(root, 'chromium');
    const chromiumDirectory = path.join(root, 'build', 'chromium');
    const firefoxDirectory = path.join(root, 'build', 'firefox');

    await snapshotExtensionArtifact({
      browser: 'chromium',
      sourceDirectory: stagingDirectory,
      outputDirectory: chromiumDirectory,
    });
    await rm(stagingDirectory, { recursive: true, force: true });
    const firefoxStagingDirectory = await createArtifactFixture(root, 'firefox');
    await snapshotExtensionArtifact({
      browser: 'firefox',
      sourceDirectory: firefoxStagingDirectory,
      outputDirectory: firefoxDirectory,
    });

    const chromiumManifest = JSON.parse(
      await readFile(path.join(chromiumDirectory, 'manifest.json'), 'utf8'),
    );
    const firefoxManifest = JSON.parse(
      await readFile(path.join(firefoxDirectory, 'manifest.json'), 'utf8'),
    );
    expect(chromiumManifest.background).toEqual({
      service_worker: './dist/background/index.mjs',
    });
    expect(firefoxManifest.background).toEqual({
      scripts: ['dist/background/index.mjs'],
      type: 'module',
    });
    await expect(
      readFile(path.join(chromiumDirectory, 'icons', 'logo-16.png'), 'utf8'),
    ).resolves.toBe('chromium');
  });
});
