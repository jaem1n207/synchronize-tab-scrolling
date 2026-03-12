import { readFileSync } from 'node:fs';

import React from '@vitejs/plugin-react';
import UnoCSS from 'unocss/vite';
import AutoImport from 'unplugin-auto-import/vite';
import Icons from 'unplugin-icons/vite';
import { defineConfig, type Plugin } from 'vite';

import { r } from './scripts/utils';

interface StoreData {
  ratingValue: number;
  ratingCount: number;
  version: string;
  users: string;
}

interface StoreStats {
  updatedAt: string;
  chrome: StoreData;
  firefox: StoreData;
}

function injectStoreStats(): Plugin {
  return {
    name: 'inject-store-stats',
    transformIndexHtml(html) {
      let stats: StoreStats | null = null;
      try {
        const raw = readFileSync(r('src/landing/public/store-stats.json'), 'utf-8');
        stats = JSON.parse(raw) as StoreStats;
      } catch {
        console.warn(
          '[inject-store-stats] Could not read store-stats.json — using existing HTML values',
        );
        return html;
      }

      const chrome = stats.chrome;
      if (!chrome.ratingValue || !chrome.ratingCount) {
        return html;
      }

      return html.replace(
        /(<script type="application\/ld\+json">)([\s\S]*?SoftwareApplication[\s\S]*?)(<\/script>)/,
        (_match, openTag: string, jsonContent: string, closeTag: string) => {
          try {
            const jsonLd = JSON.parse(jsonContent);

            jsonLd.aggregateRating = {
              '@type': 'AggregateRating',
              ratingValue: String(chrome.ratingValue),
              ratingCount: String(chrome.ratingCount),
              bestRating: '5',
              worstRating: '1',
            };

            if (chrome.version) {
              jsonLd.softwareVersion = chrome.version;
            }

            const formatted = JSON.stringify(jsonLd, null, 8);
            return `${openTag}\n${' '.repeat(6)}${formatted}\n${' '.repeat(4)}${closeTag}`;
          } catch (e) {
            console.error('[inject-store-stats] Failed to parse JSON-LD:', e);
            return _match;
          }
        },
      );
    },
  };
}

export default defineConfig(({ command }) => ({
  root: r('src'),
  resolve: {
    alias: {
      '~/': `${r('src')}/`,
    },
  },
  define: {
    __DEV__: command === 'serve',
  },
  plugins: [
    UnoCSS(),
    React(),
    Icons({ compiler: 'jsx', jsx: 'react' }),
    AutoImport({
      imports: ['react'],
      dts: r('src/auto-imports.d.ts'),
    }),
    injectStoreStats(),
  ],
  publicDir: r('src/landing/public'),
  base: process.env.LANDING_BASE ?? '/',
  server: {
    port: 4173,
    open: true,
  },
  build: {
    outDir: r('dist-landing'),
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        main: r('src/landing/index.html'),
      },
    },
  },
}));
