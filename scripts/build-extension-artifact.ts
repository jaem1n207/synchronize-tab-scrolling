import { access, cp, mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { r } from './utils';

export type ExtensionArtifactBrowser = 'chromium' | 'firefox';

interface SnapshotExtensionArtifactInput {
  browser: ExtensionArtifactBrowser;
  sourceDirectory: string;
  outputDirectory: string;
}

interface ManifestShape {
  background?: {
    service_worker?: string;
    scripts?: Array<string>;
  };
  commands?: Record<
    string,
    {
      suggested_key?: {
        default?: string;
        mac?: string;
      };
      description?: string;
    }
  >;
}

const REQUIRED_FILES = [
  'dist/contentScripts/index.global.js',
  'dist/popup/index.html',
  '_locales/en/messages.json',
  'icons/logo-16.png',
];

function normalizeExtensionPath(value: string): string {
  return value.replace(/^\.\//, '');
}

function parseManifest(value: string): ManifestShape {
  const parsed: unknown = JSON.parse(value);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Extension artifact manifest must be an object');
  }
  return parsed;
}

export async function validateExtensionArtifact(
  artifactDirectory: string,
  browser: ExtensionArtifactBrowser,
): Promise<{ backgroundEntry: string; browser: ExtensionArtifactBrowser }> {
  const manifestPath = path.join(artifactDirectory, 'manifest.json');
  const manifest = parseManifest(await readFile(manifestPath, 'utf8'));
  const backgroundEntry =
    browser === 'chromium'
      ? manifest.background?.service_worker
      : manifest.background?.scripts?.length === 1
        ? manifest.background.scripts[0]
        : undefined;
  if (typeof backgroundEntry !== 'string') {
    throw new Error(
      browser === 'chromium'
        ? 'Chromium artifact must define background.service_worker'
        : 'Firefox artifact must define exactly one background.scripts entry',
    );
  }

  const command = manifest.commands?.['quick-sync-start-or-add'];
  if (
    Object.keys(manifest.commands ?? {}).length !== 1 ||
    command?.suggested_key?.default !== 'Ctrl+Shift+Period' ||
    command.suggested_key.mac !== 'Command+Shift+Period' ||
    command.description !== '__MSG_quickSyncCommandDescription__'
  ) {
    throw new Error('Extension artifact must define the exact Quick Sync command');
  }

  const normalizedBackgroundEntry = normalizeExtensionPath(backgroundEntry);
  for (const relativePath of [normalizedBackgroundEntry, ...REQUIRED_FILES]) {
    await access(path.join(artifactDirectory, relativePath));
  }

  const backgroundSource = await readFile(
    path.join(artifactDirectory, normalizedBackgroundEntry),
    'utf8',
  );
  if (
    !backgroundSource.includes('commands.onCommand.addListener') ||
    !backgroundSource.includes('quick-sync-start-or-add')
  ) {
    throw new Error('Extension artifact background must register the commands.onCommand listener');
  }

  return { backgroundEntry: normalizedBackgroundEntry, browser };
}

export async function snapshotExtensionArtifact(
  input: SnapshotExtensionArtifactInput,
): Promise<void> {
  await validateExtensionArtifact(input.sourceDirectory, input.browser);
  await rm(input.outputDirectory, { recursive: true, force: true });
  await mkdir(path.dirname(input.outputDirectory), { recursive: true });
  await cp(input.sourceDirectory, input.outputDirectory, { recursive: true });
  await validateExtensionArtifact(input.outputDirectory, input.browser);
}

function readBrowserArgument(value: string | undefined): ExtensionArtifactBrowser {
  if (value === 'chromium' || value === 'firefox') {
    return value;
  }
  throw new Error('Usage: esno scripts/build-extension-artifact.ts <chromium|firefox>');
}

const isDirectExecution =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  const browser = readBrowserArgument(process.argv[2]);
  void snapshotExtensionArtifact({
    browser,
    sourceDirectory: r('extension'),
    outputDirectory: r('build', browser),
  }).catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
