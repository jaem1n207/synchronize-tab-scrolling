import type { PluginOption } from 'vite';

import { rootPath } from '../paths';
import { measureTime, mkDirIfMissing } from '../utils';

const ensureOutDir = async (...paths: string[]): Promise<PluginOption> => {
  return {
    name: 'ensure-out-dir',
    apply: 'build',
    async buildStart() {
      await measureTime(mkDirIfMissing(rootPath(...paths)), 'Created output directory');
    }
  };
};

export default ensureOutDir;
