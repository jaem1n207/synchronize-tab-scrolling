import { dirname, resolve } from 'path';
import type { PluginOption } from 'vite';

const SUPPORTED_LANGUAGES = ['en', 'ko'] as const;

const __dirname = dirname(new URL(import.meta.url).pathname);
const rootDir = resolve(__dirname, '..', '..');
const manifestFile = resolve(rootDir, 'manifest.ts');
const viteConfigFile = resolve(rootDir, 'vite.config.ts');
const localeDir = resolve(rootDir, 'static', '_locales');
const messagesFile = (locale: string) => resolve(localeDir, locale, 'messages.json');

const watchRebuild = (): PluginOption => {
	return {
		name: 'watch-rebuild',
		async buildStart() {
			this.addWatchFile(manifestFile);
			this.addWatchFile(viteConfigFile);
			for (const locale of SUPPORTED_LANGUAGES) {
				this.addWatchFile(messagesFile(locale));
			}
		}
	};
};

export default watchRebuild;
