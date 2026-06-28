import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

import {
  analyzePrivacyLoggingSource,
  formatPrivacyLoggingViolation,
  type PrivacyLoggingViolation,
} from './privacy-logging-rules';

const DEFAULT_ROOT = 'src';
const VALID_EXTENSIONS = new Set(['.ts', '.tsx']);

function getScanRoot(): string {
  const rootIndex = process.argv.indexOf('--root');
  if (rootIndex === -1) {
    return DEFAULT_ROOT;
  }

  const root = process.argv[rootIndex + 1];
  if (!root) {
    throw new Error('--root requires a directory path');
  }

  return root;
}

function hasSupportedExtension(filePath: string): boolean {
  return [...VALID_EXTENSIONS].some((extension) => filePath.endsWith(extension));
}

async function collectSourceFiles(directory: string): Promise<Array<string>> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: Array<string> = [];

  for (const entry of entries) {
    const fullPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') {
        continue;
      }

      files.push(...(await collectSourceFiles(fullPath)));
      continue;
    }

    if (entry.isFile() && hasSupportedExtension(fullPath)) {
      files.push(fullPath);
    }
  }

  return files;
}

async function main() {
  const root = getScanRoot();
  const files = await collectSourceFiles(root);
  const violations: Array<PrivacyLoggingViolation> = [];

  for (const filePath of files) {
    const sourceText = await readFile(filePath, 'utf8');
    const relativePath = relative(process.cwd(), filePath);
    violations.push(...analyzePrivacyLoggingSource(relativePath, sourceText));
  }

  if (violations.length === 0) {
    console.log(`Privacy logging validation passed for ${files.length} files.`);
    return;
  }

  console.error(`Privacy logging validation failed with ${violations.length} issue(s):`);
  for (const violation of violations) {
    console.error(formatPrivacyLoggingViolation(violation));
  }

  process.exitCode = 1;
}

main().catch((error) => {
  console.error('Privacy logging validation failed unexpectedly:');
  console.error(error);
  process.exitCode = 1;
});
