/** @type { import("eslint").Linter.Config } */
module.exports = {
	root: true,
	extends: [
		'eslint:recommended',
		'plugin:@typescript-eslint/recommended',
		'plugin:svelte/recommended',
		'prettier'
	],
	parser: '@typescript-eslint/parser',
	plugins: ['@typescript-eslint'],
	parserOptions: {
		sourceType: 'module',
		ecmaVersion: 2020,
		extraFileExtensions: ['.svelte']
	},
	env: {
		browser: true,
		es2017: true,
		node: true,
		webextensions: true
	},
	overrides: [
		{
			files: ['*.svelte'],
			parser: 'svelte-eslint-parser',
			parserOptions: {
				parser: '@typescript-eslint/parser'
			},
			rules: {
				'@typescript-eslint/no-unused-vars': [
					'error',
					{
						// In Svelte, $$Props and $$Events are special compile-time variables that are used to tell Typescript about the component's props and events.
						// To prevent ESLint from mistaking these variables for unused variables, add a rule to the ESLint settings to ignore them.
						varsIgnorePattern: '^\\$\\$[A-Z]',
						args: 'none',
						ignoreRestSiblings: true
					}
				]
			}
		}
	]
};
