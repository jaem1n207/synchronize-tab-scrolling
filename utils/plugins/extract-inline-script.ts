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

	while (i) {
		hash = (hash * 33) ^ value.charCodeAt(--i);
	}

	return (hash >>> 0).toString(36);
};

const transformContent = (content: string) => {
	return content
		.replace('__sveltekit', 'const __sveltekit')
		.replace('document.currentScript.parentElement', 'document.body.firstElementChild');
};

/**
 * 인라인 스크립트를 추출합니다.
 *
 * @param to 추출할 파일 경로
 * @param scriptRegex 추출할 스크립트 정규식
 * @param getFilename 추출한 스크립트 파일명을 반환하는 함수
 * @param getScriptTag 추출한 스크립트 태그를 반환하는 함수
 */
const extractScript = async (
	to: string,
	scriptRegex: RegExp,
	getFilename: (hash: string) => string,
	getScriptTag: (filename: string) => string
) => {
	const files = await glob('**/*.{html}', {
		cwd: to,
		dot: true,
		absolute: false,
		filesOnly: true
	});

	for (const file of files.map((file) => join(to, file))) {
		colorLog(`edit file: ${file}`, 'info', true);

		const f = readFileSync(file, { encoding: 'utf-8' });
		const scriptMatch = f.match(scriptRegex);

		if (scriptMatch) {
			let inlineContent = scriptMatch[1];
			inlineContent = transformContent(inlineContent);
			const scriptHash = hash(inlineContent);
			const scriptFilename = getFilename(scriptHash);
			const scriptTag = getScriptTag(scriptFilename);
			const newHtml = f.replace(scriptRegex, scriptTag);

			writeFileSync(file, newHtml);
			writeFileSync(`${to}${scriptFilename}`, inlineContent);

			colorLog(`✅ Script extracted and saved at: ${to}${scriptFilename}`, 'success', true);
		}
	}
};

/**
 * Manifest V3에서는 콘텐츠 보안 정책에 의해 인라인 스크립트를 허용하지 않습니다.
 *
 * `@sveltejs/adapter-static` 어댑터가 생성한 파일의 `*.html` 파일의 인라인 스크립트를
 * `*.{hash}.js` 파일로 추출하고, 추출한 스크립트를 `*.html` 파일에 삽입합니다.
 */
const extractInlineScript = (): PluginOption => {
	return {
		name: 'extract-inline-script',
		closeBundle() {
			extractScript(
				buildDir,
				/<script nonce="%sveltekit.nonce%">([\s\S]*?)<\/script>/,
				(hash) => `/color-scheme-script.${hash}.js`,
				(filename) => `<script nonce="%sveltekit.nonce%" src='${filename}'></script>`
			);
			extractScript(
				buildDir,
				/<script>([\s\S]+)<\/script>/,
				(hash) => `/script-${hash}.js`,
				(filename) => `<script type="module" src="${filename}"></script>`
			);
		}
	};
};

export default extractInlineScript;
