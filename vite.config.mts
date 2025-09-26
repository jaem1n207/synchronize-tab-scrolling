/// <reference types="vitest" />

import { sentryVitePlugin } from '@sentry/vite-plugin';
import React from '@vitejs/plugin-react';
import UnoCSS from 'unocss/vite';
import AutoImport from 'unplugin-auto-import/vite';
import Icons from 'unplugin-icons/vite';
import type { UserConfig } from 'vite';
import { defineConfig } from 'vite';

import packageJson from './package.json';
import { isDev, port, r } from './scripts/utils';

export const sharedConfig: UserConfig = {
  root: r('src'),
  resolve: {
    alias: {
      '~/': `${r('src')}/`,
    },
  },
  define: {
    __DEV__: isDev,
    __NAME__: JSON.stringify(packageJson.name),
  },
  plugins: [
    // https://github.com/antfu/unplugin-icons
    // https://github.com/unocss/unocss
    UnoCSS(),
    React(),
    Icons({ compiler: 'jsx', jsx: 'react' }),
    AutoImport({
      imports: ['react'],
      dts: r('src/auto-imports.d.ts'),
    }),
    // rewrite assets to use relative path
    {
      name: 'assets-rewrite',
      enforce: 'post',
      apply: 'build',
      transformIndexHtml(html, { path }) {
        // Fix paths - popup is in /dist/popup/, assets are in /dist/assets/
        // So from popup, we need to go up one level (..) to reach /dist/, then into assets/
        if (path.includes('popup')) {
          html = html.replace(/"\/dist\/assets\//g, '"../assets/');
          html = html.replace(/"\/dist\/themeSync\.js"/g, '"../themeSync.js"');
        } else if (path.includes('options')) {
          html = html.replace(/"\/dist\/assets\//g, '"../assets/');
          html = html.replace(/"\/dist\/themeSync\.js"/g, '"../themeSync.js"');
        }

        // Add themeSync script if not already present
        if (!html.includes('themeSync.js')) {
          html = html.replace(
            '</head>',
            '<script type="module" crossorigin src="../themeSync.js"></script></head>',
          );
        }

        return html;
      },
    },
    sentryVitePlugin({
      authToken: process.env.SENTRY_AUTH_TOKEN,
      org: 'jaemin',
      project: 'synchronize-tab-scrolling',
      sourcemaps: {
        assets: ['./extension/dist/**'],
        filesToDeleteAfterUpload: ['./extension/dist/**/*.map'],
      },
      release: {
        name: `synchronize-tab-scrolling@${packageJson.version}`,
      },
      telemetry: false,
    }),
  ],
  optimizeDeps: {
    include: ['react', 'webextension-polyfill'],
  },
};

export default defineConfig(({ command }) => ({
  ...sharedConfig,
  base: command === 'serve' ? `http://localhost:${port}/` : '/dist/',
  server: {
    port,
    hmr: {
      host: 'localhost',
    },
    origin: `http://localhost:${port}`,
  },
  build: {
    watch: isDev ? {} : undefined,
    outDir: r('extension/dist'),
    emptyOutDir: false,
    sourcemap: isDev ? 'inline' : true,
    // https://developer.chrome.com/docs/webstore/program_policies/#:~:text=Code%20Readability%20Requirements
    terserOptions: {
      mangle: false,
    },
    rollupOptions: {
      input: {
        options: r('src/options/index.html'),
        popup: r('src/popup/index.html'),
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
  },
}));
