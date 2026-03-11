import React from '@vitejs/plugin-react';
import UnoCSS from 'unocss/vite';
import AutoImport from 'unplugin-auto-import/vite';
import Icons from 'unplugin-icons/vite';
import { defineConfig } from 'vite';

import { r } from './scripts/utils';

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
