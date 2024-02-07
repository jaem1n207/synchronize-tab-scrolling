import type { PluginOption } from 'vite';

import { rootPath } from '../paths';
import { removeFolder } from '../utils';

const cleanOutDir = async (...paths: string[]): Promise<PluginOption> => {
  return {
    name: 'clean-out-dir',
    apply: 'build',
    async buildStart() {
      await removeFolder(rootPath(...paths));
    }
  };
};

export default cleanOutDir;
