import type { FixupConfigArray } from '@eslint/compat';
import { fixupConfigRules } from '@eslint/compat';
import { FlatCompat } from '@eslint/eslintrc';
import jsEslint from '@eslint/js';
import importPlugin from 'eslint-plugin-import';
import importXPlugin from 'eslint-plugin-import-x';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import playwrightPlugin from 'eslint-plugin-playwright';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import reactPlugin from 'eslint-plugin-react';
import globals from 'globals';
import tsEslint from 'typescript-eslint';

const compat = new FlatCompat();

export default tsEslint.config(
  // 기본 설정
  jsEslint.configs.recommended,
  ...tsEslint.configs.recommended,

  // JSX A11y, Import-X, Prettier 설정
  jsxA11y.flatConfigs.recommended,
  importXPlugin.flatConfigs.recommended,
  importXPlugin.flatConfigs.typescript,
  eslintPluginPrettierRecommended,

  // React Hooks 설정
  ...fixupConfigRules(compat.extends('plugin:react-hooks/recommended') as FixupConfigArray),

  // unplugin-auto-import ESLint 설정 추가
  // 이 설정은 unplugin-auto-import 플러그인의 `eslintrc: { enabled: true }` 옵션에 의해
  // 생성된 '.eslintrc-auto-import.json' 파일을 확장합니다.
  // 해당 파일이 'src' 디렉토리에 생성되도록 vite.config.mts에서 설정해야 합니다.
  ...fixupConfigRules(compat.extends('./src/.eslintrc-auto-import.json') as FixupConfigArray),

  // React 설정 통합
  {
    files: ['**/*.{js,mjs,cjs,jsx,mjsx,ts,tsx,mtsx}'],
    ...reactPlugin.configs.flat.recommended,
    ...reactPlugin.configs.flat['jsx-runtime'],
    rules: {
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react/jsx-sort-props': [
        'warn',
        {
          callbacksLast: true,
          shorthandFirst: true,
          reservedFirst: true,
        },
      ],
      'react/jsx-filename-extension': ['warn', { extensions: ['.jsx', '.tsx'] }],
      'react/jsx-curly-brace-presence': ['warn', { props: 'never', children: 'never' }],
      'import-x/no-unresolved': 'off',
      'import-x/no-named-as-default-member': 'off',
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-undef': 'off', // unplugin-auto-import 문서 권장 사항: TypeScript가 이미 이 검사를 수행합니다.
    },
  },

  {
    files: ['**/*.{js,mjs,cjs,jsx,mjsx,ts,tsx,mtsx}'],
    plugins: {
      import: importPlugin,
    },
    settings: {
      'import/resolver': {
        typescript: {},
      },
    },
    rules: {
      ...importPlugin.configs.recommended.rules,
      'import/order': [
        'error',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            'parent',
            'sibling',
            'index',
            'object',
            'type',
          ],
          'newlines-between': 'always',
          alphabetize: {
            order: 'asc',
            caseInsensitive: true,
          },
          pathGroups: [
            {
              pattern: 'react',
              group: 'external',
              position: 'before',
            },
            {
              pattern: '@/**',
              group: 'internal',
              position: 'before',
            },
          ],
          pathGroupsExcludedImportTypes: ['react'],
        },
      ],
      'import/prefer-default-export': 'off',
      'import/no-default-export': 'off',
    },
  },

  // Playwright 테스트 설정 (기존 eslint.config.js 참고)
  {
    files: ['**/*.spec.{ts,js}', 'e2e/**/*.{ts,js}', 'tests/**/*.{ts,js}'],
    plugins: {
      playwright: playwrightPlugin,
    },
    rules: {
      ...playwrightPlugin.configs.recommended.rules,
    },
  },

  // 무시할 파일 설정
  {
    ignores: ['**/build/**', '**/dist/**', '**/node_modules/**', 'eslint.config.ts'],
  },

  // 전역 설정 (React 관련 규칙 제거)
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
      // React 관련 규칙은 React 설정 블록으로 이동
      'import-x/no-unresolved': 'off',
      'import-x/no-named-as-default-member': 'off',
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-undef': 'off', // unplugin-auto-import 문서 권장 사항: TypeScript가 이미 이 검사를 수행합니다.
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
  },
);
