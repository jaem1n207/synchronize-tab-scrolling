// TODO: If it is supported to integrate Vite and Bun's native bundler settings,
// remove this file and make it a vite plugin so that it can be integrated into the vite settings.
import * as Bun from 'bun';

import colorLog from './utils/log';

/**
 *
 * @param {string} filePath
 * @param {import('bun').BuildConfig['naming']} naming
 */
const buildScript = async (filePath, naming) => {
  const file = Bun.file(filePath);
  const isFileExists = await file.exists();
  if (!isFileExists) {
    colorLog(`❌ File not found: ${filePath}`, 'error', true);
    process.exit(1);
  }

  try {
    await Bun.build({
      format: 'esm',
      target: 'browser',
      minify: true,
      outdir: './static',
      entrypoints: [filePath],
      naming
    });
    colorLog(`✅ ${naming} build success`, 'success', true);
  } catch (error) {
    colorLog(`❌ ${naming} build failed: ${error}`, 'error', true);
    process.exit(1);
  }
};

(async () => {
  await Promise.all([
    buildScript('./src/inject/content-script.inject.ts', 'content-script.js'),
    buildScript('./src/inject/background-script.inject.ts', 'background-script.js')
  ]);
})();
