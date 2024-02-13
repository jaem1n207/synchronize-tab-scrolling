import * as esbuild from 'esbuild';
import type { PluginOption } from 'vite';

import colorLog from '../log';
import { fileExists, measureTime } from '../utils';

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
    async generateBundle() {
      await measureTime(
        Promise.all([
          buildScript('./src/inject/content-script.inject.ts', 'content-script.js'),
          buildScript('./src/inject/background-script.inject.ts', 'background-script.js')
        ]),
        `\n📦 Extension scripts bundled successfully`
      );
    }
  };
};

export default bundleExtensionScript;
