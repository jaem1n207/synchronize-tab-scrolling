import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { PluginOption } from 'vite';

import colorLog from '../log';
import ManifestParser from '../parsers/manifest-parser';

const __dirname = dirname(new URL(import.meta.url).pathname);
const buildDir = resolve(__dirname, '..', '..', 'build');
const staticDir = resolve(__dirname, '..', '..', 'static');

const createManifest = (
  manifest: chrome.runtime.ManifestV3 | browser._manifest.WebExtensionManifest
): PluginOption => {
  const createManifest = (to: string) => {
    if (!existsSync(to)) {
      mkdirSync(to);
    }
    const manifestPath = resolve(to, 'manifest.json');
    const firefoxManifestPath = resolve(to, 'manifest-firefox.json');

    writeFileSync(manifestPath, ManifestParser.convertManifestToString(manifest));
    writeFileSync(firefoxManifestPath, ManifestParser.convertManifestToString(manifest));

    colorLog(`Manifest file copy complete: ${manifestPath}`, 'success');
  };

  return {
    name: 'create-manifest',
    buildStart() {
      createManifest(staticDir);
    },
    buildEnd() {
      createManifest(buildDir);
    }
  };
};

export default createManifest;
