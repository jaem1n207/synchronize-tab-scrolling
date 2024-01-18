import type { PluginOption } from 'vite';
import { resolve, dirname } from 'path';

const __dirname = dirname(new URL(import.meta.url).pathname);
const rootDir = resolve(__dirname, '..', '..');
const manifestFile = resolve(rootDir, 'manifest.ts');
const viteConfigFile = resolve(rootDir, 'vite.config.ts');

export default function watchRebuild(): PluginOption {
	return {
		name: 'watch-rebuild',
		async buildStart() {
			this.addWatchFile(manifestFile);
			this.addWatchFile(viteConfigFile);
		}
	};
}
