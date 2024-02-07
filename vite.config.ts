import { sveltekit } from '@sveltejs/kit/vite';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

import packageJson from './package.json';
import { PLATFORM } from './utils/paths';
import bundleExtensionScript from './utils/plugins/bundle-extension-script';
import cleanOutDir from './utils/plugins/clean-out-dir';
import copyToPlatformDirsPlugin from './utils/plugins/copy-to-platform-dirs';
import createManifests from './utils/plugins/create-manifests';
import ensureOutDir from './utils/plugins/ensure-out-dir';
import watchRebuild from './utils/plugins/watch-rebuild';
import zip from './utils/plugins/zip';
import extractInlineScript from './utils/plugins/extract-inline-script';

const OUT_DIR = 'build';

export default defineConfig(async () => {
  const isDebug = import.meta.env.__WATCH__ === 'true';

  return {
    plugins: [
      sveltekit(),
      await cleanOutDir(OUT_DIR),
      await ensureOutDir(OUT_DIR),
      watchRebuild(),
      await bundleExtensionScript(),
      await createManifests({
        debug: isDebug,
        platforms: Object.values(PLATFORM)
      }),
      await extractInlineScript(),
      copyToPlatformDirsPlugin(),
      await zip({
        debug: isDebug,
        platforms: Object.values(PLATFORM),
        version: packageJson.version
      })
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
      // outDir: OUT_DIR,
      chunkSizeWarningLimit: 600,
      target: ['es2018', 'firefox57']
    }
  };
});
