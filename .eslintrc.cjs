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
    node: true,
    // Since `globalThis` an ES2020 feature, need to enable es2020
    // ref: https://github.com/eslint/eslint/blob/183e3006841c29efdd245c45a72e6cefac86ae35/conf/environments.js#L58-L81
    es2020: true,
    // Don't use `webextensions` because it enables the browser global.
    // We want to use globalThis.browser instead:
    // ref: https://github.com/mozilla/webextension-polyfill/pull/351
    webextensions: false
  },
  globals: {
    globalThis: true
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
