/**
 * @type {import('semantic-release').GlobalConfig}
 */
export default {
  branches: ['main'],
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    '@semantic-release/changelog',
    // TEMP: Chrome v2.9.0 already uploaded and in review.
    // Replace semantic-release-chrome with zip-only to avoid ITEM_NOT_UPDATABLE error.
    // Restore after this release.
    // [
    //   'semantic-release-chrome',
    //   {
    //     distFolder: 'build/chrome',
    //     asset: 'synchronize-tab-scrolling-chrome.zip',
    //     extensionId: 'phceoocamipnafpgnchbfhkdlbleeafc',
    //   },
    // ],
    ['@semantic-release/npm', { npmPublish: false }],
    [
      '@semantic-release/github',
      {
        successComment: false,
        failComment: false,
        assets: [
          {
            path: 'synchronize-tab-scrolling-chrome.zip',
            label: 'Chrome/Edge Extension (zip)',
          },
          {
            path: 'synchronize-tab-scrolling-firefox.zip',
            label: 'Firefox Add-on (zip)',
          },
        ],
      },
    ],
    [
      'semantic-release-amo',
      {
        addonId: 'addon@synchronize-tab-scrolling.org',
        addonDirPath: 'build/firefox',
        addonZipPath: 'synchronize-tab-scrolling-firefox.zip',
        submitReleaseNotes: false,
        submitSource: true,
        approvalNotes:
          'Build from source: pnpm install && pnpm build-firefox. Output is in the extension/ directory.',
        compatibility: ['firefox'],
      },
    ],
    [
      '@semantic-release/exec',
      {
        prepareCmd:
          "node -e \"const m=require('./build/chrome/manifest.json');m.version='${nextRelease.version}';require('fs').writeFileSync('./build/chrome/manifest.json',JSON.stringify(m,null,2))\" && cd build/chrome && zip -r ../../synchronize-tab-scrolling-chrome.zip .",
        publishCmd: 'node scripts/publish-edge.mjs ${nextRelease.version}',
      },
    ],
    '@semantic-release/git',
  ],
};
