/**
 * @type {import('semantic-release').GlobalConfig}
 */
export default {
  branches: ['main'],
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    '@semantic-release/changelog',
    ['@semantic-release/npm', { npmPublish: false }],
    [
      '@semantic-release/github',
      {
        // PR/이슈에 릴리스 코멘트 추가 비활성화
        successComment: false,
        failComment: false,
      },
    ],
    '@semantic-release/git',
  ],
};
