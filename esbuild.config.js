import { build } from 'esbuild';

(async () => {
	/**
	 * @type {import('esbuild').BuildOptions}
	 */
	const defaultBuildOptions = {
		format: 'iife',
		bundle: true,
		minify: true,
		platform: 'browser'
	};

	try {
		await Promise.all([
			build({
				...defaultBuildOptions,
				entryPoints: ['./src/inject-static/content-script.inject.ts'],
				outfile: './static/content-script.js'
			}),
			build({
				...defaultBuildOptions,
				entryPoints: ['./src/inject-static/background-script.inject.ts'],
				outfile: './static/background-script.js'
			})
		]);
	} catch (error) {
		console.error(error);
		process.exit(1);
	}
})();
