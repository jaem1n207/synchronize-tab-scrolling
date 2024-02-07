import * as esbuild from 'esbuild';
import type { PluginOption } from 'vite';

import colorLog from '../log';
import { fileExists } from '../utils';

const bundleExtensionScript = async (): Promise<PluginOption> => {
  const buildScript = async (entryPoint: string, entryNames: string) => {
    if (!(await fileExists(entryPoint))) {
      process.exit(1);
    }

    try {
      await esbuild.build({
        entryPoints: [entryPoint],
        platform: 'browser',
        outfile: `./static/${entryNames}`,
        minify: true,
        bundle: true,
        sourcemap: false,
        splitting: false,
        target: ['es2018', 'firefox57']
      });
    } catch (error) {
      colorLog(`🚨 ${error}`, 'error', true);
      process.exit(1);
    }
  };

  return {
    name: 'bundle-extension-script',
    apply: 'build',
    async buildStart() {
      await Promise.all([
        buildScript('./src/inject/content-script.inject.ts', 'content-script.js'),
        buildScript('./src/inject/background-script.inject.ts', 'background-script.js')
      ]);
      colorLog('📦 Extension scripts bundled successfully', 'success', true);
    }
  };
};

export default bundleExtensionScript;
