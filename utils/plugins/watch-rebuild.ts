import { dirname, resolve } from 'path';
import type { PluginOption } from 'vite';

const __dirname = dirname(new URL(import.meta.url).pathname);
const rootDir = resolve(__dirname, '..', '..');
const manifestFile = resolve(rootDir, 'manifest.ts');
const viteConfigFile = resolve(rootDir, 'vite.config.ts');

const watchRebuild = (): PluginOption => {
	return {
		name: 'watch-rebuild',
		async buildStart() {
			this.addWatchFile(manifestFile);
			this.addWatchFile(viteConfigFile);
		}
	};
};

export default watchRebuild;
