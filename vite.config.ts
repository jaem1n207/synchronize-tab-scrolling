import { sveltekit } from '@sveltejs/kit/vite';
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

import manifest from './manifest';
import createManifest from './utils/plugins/create-manifest';
import extractInlineScript from './utils/plugins/extract-inline-script';
import watchRebuild from './utils/plugins/watch-rebuild';

// file path to exclude from bundling
const injectStaticDir = 'src/inject-static';
const injectFilesPattern = /\.inject\.ts$/;

const filesPathToExclude = readdirSync(injectStaticDir)
	.filter((filename) => injectFilesPattern.test(filename))
	.map((filename) => fileURLToPath(new URL(join(injectStaticDir, filename), import.meta.url)));

export default defineConfig({
	plugins: [sveltekit(), createManifest(manifest), extractInlineScript(), watchRebuild()],
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}']
	},
	resolve: {
		alias: {
			$lib: resolve('./src/lib')
		}
	},
	build: {
		rollupOptions: {
			external: [...filesPathToExclude]
		}
	}
});
