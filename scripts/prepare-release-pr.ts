import { appendFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import semanticRelease from 'semantic-release';

import { r } from './utils';

interface PrepareReleaseFilesInput {
  cwd: string;
  notes: string;
  version: string;
}

const SEMANTIC_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function parsePackageMetadata(value: string): object {
  const parsed: unknown = JSON.parse(value);
  if (typeof parsed !== 'object' || parsed === null || !('version' in parsed)) {
    throw new Error('package.json must contain a version string');
  }
  if (typeof parsed.version !== 'string') {
    throw new Error('package.json must contain a version string');
  }
  return parsed;
}

function validateReleaseInput(version: string, notes: string): void {
  if (!SEMANTIC_VERSION_PATTERN.test(version)) {
    throw new Error(`Invalid release version: ${version}`);
  }
  if (!notes.includes(`[${version}](`)) {
    throw new Error(`Release notes must describe version ${version}`);
  }
}

export async function prepareReleaseFiles(input: PrepareReleaseFilesInput): Promise<void> {
  validateReleaseInput(input.version, input.notes);

  const packagePath = path.join(input.cwd, 'package.json');
  const changelogPath = path.join(input.cwd, 'CHANGELOG.md');
  const [packageSource, changelogSource] = await Promise.all([
    readFile(packagePath, 'utf8'),
    readFile(changelogPath, 'utf8'),
  ]);
  const packageMetadata = parsePackageMetadata(packageSource);

  if (changelogSource.includes(`[${input.version}](`)) {
    throw new Error(`CHANGELOG.md already contains release ${input.version}`);
  }

  const nextPackageSource =
    JSON.stringify({ ...packageMetadata, version: input.version }, null, 2) + '\n';
  const nextChangelogSource = `${input.notes.trim()}\n\n${changelogSource.trim()}\n`;

  await writeFile(packagePath, nextPackageSource);
  await writeFile(changelogPath, nextChangelogSource);
}

export async function prepareNextRelease(cwd: string): Promise<string> {
  const result = await semanticRelease(
    {
      branches: ['main'],
      ci: false,
      dryRun: true,
      plugins: [
        [
          '@semantic-release/commit-analyzer',
          {
            releaseRules: [{ scope: 'landing', release: false }],
          },
        ],
        '@semantic-release/release-notes-generator',
      ],
    },
    { cwd },
  );

  if (!result) {
    throw new Error('No releasable changes were found');
  }

  const notes = result.nextRelease.notes;
  if (typeof notes !== 'string') {
    throw new Error(`Release notes were not generated for ${result.nextRelease.version}`);
  }

  await prepareReleaseFiles({
    cwd,
    notes,
    version: result.nextRelease.version,
  });
  return result.nextRelease.version;
}

async function writeWorkflowOutput(version: string): Promise<void> {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath === undefined) {
    console.log(`Prepared release v${version}`);
    return;
  }
  await appendFile(outputPath, `version=${version}\nbranch=release/v${version}\n`);
}

const isDirectExecution =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  void prepareNextRelease(r())
    .then(writeWorkflowOutput)
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}
