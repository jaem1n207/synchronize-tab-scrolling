import type { FixupConfigArray } from '@eslint/compat';
import { fixupConfigRules } from '@eslint/compat';
import { FlatCompat } from '@eslint/eslintrc';
import jsEslint from '@eslint/js';
import importXPlugin from 'eslint-plugin-import-x';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import reactPlugin from 'eslint-plugin-react';
import globals from 'globals';
import tsEslint from 'typescript-eslint';

const compat = new FlatCompat();

export default tsEslint.config(
  // 기본 설정
  jsEslint.configs.recommended,
  ...tsEslint.configs.recommended,

  // JSX A11y, Import, Prettier 설정
  jsxA11y.flatConfigs.recommended,
  importXPlugin.flatConfigs.recommended,
  importXPlugin.flatConfigs.typescript,
  eslintPluginPrettierRecommended,

  // React Hooks 설정
  ...fixupConfigRules(compat.extends('plugin:react-hooks/recommended') as FixupConfigArray),

  // React 설정
  {
    files: ['**/*.{js,mjs,cjs,jsx,mjsx,ts,tsx,mtsx}'],
    ...reactPlugin.configs.flat.recommended,
    ...reactPlugin.configs.flat['jsx-runtime'],
  },

  // 무시할 파일 설정
  {
    ignores: ['**/build/**', '**/dist/**', '**/node_modules/**', 'eslint.config.js'],
  },

  // 전역 설정
  {
    files: ['**/*.{js,mjs,cjs,jsx,mjsx,ts,tsx,mtsx}'],
    languageOptions: {
      parser: tsEslint.parser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.es2020,
        ...globals.node,
        chrome: 'readonly',
      },
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      'react/react-in-jsx-scope': 'off',
      'import-x/no-unresolved': 'off',
      'import-x/no-named-as-default-member': 'off',
      '@typescript-eslint/consistent-type-imports': 'error',
      'react/prop-types': 'off',
      'react/jsx-sort-props': [
        'warn',
        {
          callbacksLast: true,
          shorthandFirst: true,
          reservedFirst: true,
        },
      ],
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
  },
);
