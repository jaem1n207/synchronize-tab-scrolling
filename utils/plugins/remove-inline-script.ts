import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import glob from 'tiny-glob';
import type { PluginOption } from 'vite';

import colorLog from '../log';

const __dirname = dirname(new URL(import.meta.url).pathname);
const buildDir = resolve(__dirname, '..', '..', 'build');

const hash = (value: string) => {
	let hash = 5381;
	let i = value.length;
	if (typeof value === 'string') {
		while (i) hash = (hash * 33) ^ value.charCodeAt(--i);
	} else {
		while (i) hash = (hash * 33) ^ value[--i];
	}
	return (hash >>> 0).toString(36);
};

/**
 * Manifest V3에서는 콘텐츠 보안 정책에 의해 인라인 스크립트를 허용하지 않음
 *
 * `@sveltejs/adapter-static` 어댑터가 생성한 파일의 `*.html` 파일의 인라인 스크립트를 따로 추출하는 과정을 거침
 */
const removeInlineScript = (): PluginOption => {
	const removeInlineScript = async (to: string) => {
		const scriptRegex = /<script>([\s\S]+)<\/script>/;
		const files = await glob('**/*.{html}', {
			cwd: to,
			dot: true,
			absolute: false,
			filesOnly: true
		});
		files
			.map((file) => join(to, file))
			.forEach((file) => {
				colorLog(`edit file: ${file}`, 'info', true);
				const f = readFileSync(file, { encoding: 'utf-8' });

				const script = f.match(scriptRegex);
				if (script && script[1]) {
					const inlineContent = script[1]
						.replace('__sveltekit', 'const __sveltekit')
						.replace('document.currentScript.parentElement', 'document.body.firstElementChild');
					const fn = `/script-${hash(inlineContent)}.js`;
					const newHtml = f.replace(scriptRegex, `<script type="module" src="${fn}"></script>`);
					writeFileSync(file, newHtml);
					writeFileSync(`${to}${fn}`, inlineContent);
					colorLog(`✅ Inline script extracted and saved at: ${to}${fn}`, 'success', true);
				}
			});
	};

	return {
		name: 'remove-inline-script',
		closeBundle() {
			removeInlineScript(buildDir);
		}
	};
};

export default removeInlineScript;
