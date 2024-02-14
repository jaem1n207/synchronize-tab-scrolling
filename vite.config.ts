import { sveltekit } from '@sveltejs/kit/vite';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

import packageJson from './package.json';
import { PLATFORM } from './utils/paths';
import bundleExtensionScript from './utils/plugins/bundle-extension-script';
import cleanOutDir from './utils/plugins/clean-out-dir';
import copyToPlatformDirs from './utils/plugins/copy-to-platform-dirs';
import createManifests from './utils/plugins/create-manifests';
import ensureOutDir from './utils/plugins/ensure-out-dir';
import extractInlineScript from './utils/plugins/extract-inline-script';
import watchRebuild from './utils/plugins/watch-rebuild';
import zip from './utils/plugins/zip';

const OUT_DIR = 'build';

export default defineConfig(async () => {
  const debug = import.meta.env.__WATCH__ === 'true';
  const platforms = Object.values(PLATFORM);

  return {
    plugins: [
      sveltekit(),
      // ---- buildStart ---
      await cleanOutDir(OUT_DIR),
      await ensureOutDir(OUT_DIR),
      watchRebuild(),
      // ---- generateBundle ---
      await bundleExtensionScript(),
      // ---- closeBundle ---
      await createManifests({ debug, platforms }),
      await extractInlineScript(),
      await copyToPlatformDirs({ debug, platforms, delay: 1000 }),
      await zip({ debug, platforms, version: packageJson.version, delay: 1500 })
    ],
    test: {
      include: ['src/**/*.{test,spec}.{js,ts}']
    },
    resolve: {
      alias: {
        $lib: resolve('./src/lib')
      }
    },
    build: {
      chunkSizeWarningLimit: 600,
      target: ['es2018', 'firefox57']
    }
  };
});
