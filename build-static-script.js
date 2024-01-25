// TODO: If it is supported to integrate Vite and Bun's native bundler settings,
// remove this file and make it a vite plugin so that it can be integrated into the vite settings.
import { build } from 'bun';

import colorLog from './utils/log';

(async () => {
	/**
	 * @type {import('bun').BuildConfig}
	 */
	const defaultBuildOptions = {
		format: 'esm',
		target: 'browser',
		minify: true,
		outdir: './static'
	};

	try {
		await Promise.all([
			build({
				...defaultBuildOptions,
				entrypoints: ['./src/inject-static/content-script.inject.ts'],
				naming: 'content-script.js'
			}),
			build({
				...defaultBuildOptions,
				entrypoints: ['./src/inject-static/background-script.inject.ts'],
				naming: 'background-script.js'
			})
		]);
		colorLog('✅ Injection script build success', 'success', true);
	} catch (error) {
		colorLog(`Injection script build failed: ${error}`, 'error', true);
		process.exit(1);
	}
})();
