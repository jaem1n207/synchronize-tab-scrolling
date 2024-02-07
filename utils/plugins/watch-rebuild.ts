import { resolve } from 'node:path';
import type { PluginOption } from 'vite';
import { rootPath } from '../paths';

const SUPPORTED_LANGUAGES = ['en', 'ko'] as const;

const manifestFile = rootPath('manifest.ts');
const viteConfigFile = rootPath('vite.config.ts');
const localeDir = rootPath('static', '_locales');
const messagesFile = (locale: string) => resolve(localeDir, locale, 'messages.json');

const watchRebuild = (): PluginOption => {
  return {
    name: 'watch-rebuild',
    buildStart() {
      this.addWatchFile(manifestFile);
      this.addWatchFile(viteConfigFile);
      for (const locale of SUPPORTED_LANGUAGES) {
        this.addWatchFile(messagesFile(locale));
      }
    }
  };
};

export default watchRebuild;
