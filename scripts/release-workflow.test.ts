import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const repositoryRoot = path.resolve(import.meta.dirname, '..');

async function readRepositoryFile(relativePath: string): Promise<string> {
  return readFile(path.join(repositoryRoot, relativePath), 'utf8');
}

async function readOptionalRepositoryFile(relativePath: string): Promise<string> {
  return readRepositoryFile(relativePath).catch(() => '');
}

describe('release workflow boundaries', () => {
  it('publishes only a package version that does not already have a tag', async () => {
    const workflow = await readRepositoryFile('.github/workflows/release.yml');

    expect(workflow).toContain('group: extension-release');
    expect(workflow).toContain('cancel-in-progress: false');
    expect(workflow).toContain('name: Check release version');
    expect(workflow).toContain('refs/tags/v${version}');
    expect(workflow).toContain("if: needs.check-release.outputs.should-release == 'true'");
  });

  it('prepares release files before granting the App token branch and PR access', async () => {
    const workflow = await readRepositoryFile('.github/workflows/prepare-release-pr.yml');
    const installIndex = workflow.indexOf('pnpm install --frozen-lockfile');
    const tokenIndex = workflow.indexOf('Generate release app token');
    const prepareIndex = workflow.indexOf('Prepare release files');
    const pullRequestIndex = workflow.indexOf('Create release pull request');

    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('persist-credentials: false');
    expect(workflow).toContain('permission-contents: write');
    expect(workflow).toContain('permission-pull-requests: write');
    expect(installIndex).toBeGreaterThan(-1);
    expect(tokenIndex).toBeGreaterThan(installIndex);
    expect(prepareIndex).toBeGreaterThan(tokenIndex);
    expect(pullRequestIndex).toBeGreaterThan(prepareIndex);
  });

  it('does not let semantic-release commit directly to main', async () => {
    const releaseConfig = await readRepositoryFile('release.config.js');

    expect(releaseConfig).toContain('verifyReleaseCmd');
    expect(releaseConfig).toContain('scripts/prepare-release-pr.ts --verify');
    expect(releaseConfig).not.toContain("'@semantic-release/git'");
    expect(releaseConfig).not.toContain("'@semantic-release/changelog'");
  });

  it('keeps Edge publishing outside the semantic-release transaction', async () => {
    const [releaseConfig, workflow] = await Promise.all([
      readRepositoryFile('release.config.js'),
      readRepositoryFile('.github/workflows/release.yml'),
    ]);
    const releaseIndex = workflow.indexOf('pnpm exec semantic-release');
    const edgeIndex = workflow.indexOf('name: Publish Edge Add-ons');

    expect(releaseConfig).not.toContain('publishCmd');
    expect(workflow).toContain('continue-on-error: true');
    expect(releaseIndex).toBeGreaterThan(-1);
    expect(edgeIndex).toBeGreaterThan(releaseIndex);
  });

  it('can retry Edge publishing from an existing GitHub release asset', async () => {
    const workflow = await readOptionalRepositoryFile('.github/workflows/publish-edge-release.yml');

    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('description: Released semantic version');
    expect(workflow).toContain('gh release download');
    expect(workflow).toContain('synchronize-tab-scrolling-chrome.zip');
    expect(workflow).toContain('node scripts/publish-edge.mjs');
  });
});
