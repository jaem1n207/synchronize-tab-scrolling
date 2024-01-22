import { sveltekit } from '@sveltejs/kit/vite';
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

import manifest from './manifest';
import createManifest from './utils/plugins/create-manifest';
import watchRebuild from './utils/plugins/watch-rebuild';
import removeInlineScript from './utils/plugins/remove-inline-script';

// 번들링에서 제외할 파일 경로
const injectStaticDir = 'src/inject-static';
const injectFilesPattern = /\.inject\.ts$/;

const filesPathToExclude = readdirSync(injectStaticDir)
	.filter((filename) => injectFilesPattern.test(filename))
	.map((filename) => fileURLToPath(new URL(join(injectStaticDir, filename), import.meta.url)));

export default defineConfig({
	plugins: [sveltekit(), createManifest(manifest), removeInlineScript(), watchRebuild()],
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
