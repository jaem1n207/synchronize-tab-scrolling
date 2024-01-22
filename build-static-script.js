// TODO: Vite와 Bun의 번들러 설정을 통합할 수 있도록 지원되면,
// 이 파일을 제거하고 vite 플러그인으로 만들어 vite 설정에 통합할 수 있도록 한다.
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
