import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

import createManifest from './utils/plugins/create-manifest';
import manifest from './manifest';
import watchRebuild from './utils/plugins/watch-rebuild';

const isDev = process.env.__DEV__ === 'true';

export default defineConfig({
	plugins: [
		sveltekit(),
		createManifest(manifest, {
			isDev
		}),
		watchRebuild()
	],
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}']
	}
});
