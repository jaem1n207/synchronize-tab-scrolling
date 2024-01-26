/**
 * @type {import('@types/semantic-release').GlobalConfig}
 */
export default {
	branches: ['main'],
	repositoryUrl: 'https://github.com/jaem1n207/synchronize-tab-scrolling.git',
	tagFormat: 'v${version}',
	plugins: [
		[
			'@semantic-release/commit-analyzer',
			{
				preset: 'conventionalcommits'
			}
		],
		[
			'@semantic-release/release-notes-generator',
			{
				preset: 'conventionalcommits'
			}
		],
		[
			'@semantic-release/changelog',
			{
				changelogFile: 'CHANGELOG.md'
			}
		],
		[
			'@semantic-release/npm',
			{
				npmPublish: false
			}
		],
		[
			'@semantic-release/github',
			{
				assets: ['CHANGELOG.md']
			}
		],
		[
			'@semantic-release/git',
			{
				assets: ['package.json', 'CHANGELOG.md'],
				message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}'
			}
		]
	]
};
