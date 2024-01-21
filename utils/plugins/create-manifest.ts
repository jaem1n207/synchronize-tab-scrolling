import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { PluginOption } from 'vite';

import colorLog from '../log';
import ManifestParser from '../parsers/manifest-parser';

const __dirname = dirname(new URL(import.meta.url).pathname);
const buildDir = resolve(__dirname, '..', '..', 'build');
const staticDir = resolve(__dirname, '..', '..', 'static');

export default function createManifest(manifest: chrome.runtime.ManifestV3): PluginOption {
	function createManifest(to: string) {
		if (!existsSync(to)) {
			mkdirSync(to);
		}
		const manifestPath = resolve(to, 'manifest.json');

		writeFileSync(manifestPath, ManifestParser.convertManifestToString(manifest));

		colorLog(`Manifest file copy complete: ${manifestPath}`, 'success');
	}

	return {
		name: 'create-manifest',
		buildStart() {
			createManifest(staticDir);
		},
		buildEnd() {
			createManifest(buildDir);
		}
	};
}
