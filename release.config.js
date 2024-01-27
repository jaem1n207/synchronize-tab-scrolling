/**
 * @type {import('semantic-release').GlobalConfig}
 */
export default {
	branches: ['main'],
	tagFormat: 'v2.0.1',
	plugins: [
		'@semantic-release/git',
		{
			assets: 'package.json',
			message: 'chore(release): ${nextRelease.version} [skip ci]\\n\\n${nextRelease.notes}'
		}
	]
};
