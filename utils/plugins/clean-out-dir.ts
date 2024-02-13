import type { PluginOption } from 'vite';

import { rootPath } from '../paths';
import { measureTime, removeFolder } from '../utils';

const cleanOutDir = async (...paths: string[]): Promise<PluginOption> => {
  return {
    name: 'clean-out-dir',
    apply: 'build',
    async buildStart() {
      await measureTime(removeFolder(rootPath(...paths)), 'Cleaned output directory');
    }
  };
};

export default cleanOutDir;
