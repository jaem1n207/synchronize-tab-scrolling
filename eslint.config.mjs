// @ts-check

import eslint from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import jsxA11yPlugin from 'eslint-plugin-jsx-a11y';
import prettierPlugin from 'eslint-plugin-prettier';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['node_modules', '**/dist/**'],
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  importPlugin.flatConfigs.recommended,
  jsxA11yPlugin.flatConfigs.recommended,
  reactPlugin.configs.recommended,
  reactPlugin.configs.flat['jsx-runtime'],
  reactHooksPlugin.configs.recommended,
  prettierPlugin.configs,
);

// {
//   "root": true,
//   "parser": "@typescript-eslint/parser",
//   "plugins": ["@typescript-eslint", "react"],
//   "extends": [
//     "eslint:recommended",
//     "plugin:@typescript-eslint/recommended",
//     "plugin:react/recommended",
//     "plugin:react-hooks/recommended",
//     "plugin:vitest/recommended",
//     "prettier"
//   ],
//   "parserOptions": {
//     "ecmaFeatures": {
//       "jsx": true
//     }
//   },
//   "settings": {
//     "react": {
//       "version": "detect"
//     }
//   },
//   "env": {
//     "node": true,
//     "browser": true,
//     "es6": true,
//     // Don't use `webextensions` because it enables the browser global.
//     // We want to use globalThis.browser instead:
//     // ref: https://github.com/mozilla/webextension-polyfill/pull/351
//     "webextensions": false
//   },
//   "rules": {
//     "react-hooks/exhaustive-deps": "error",
//     "react/react-in-jsx-scope": "off",
//     "react/jsx-uses-react": "off",
//     "react/no-unknown-property": "off",
//     "@typescript-eslint/no-explicit-any": "off"
//   }
// }
