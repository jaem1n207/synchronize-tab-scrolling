import type { PluginOption } from 'vite';

import { rootPath } from '../paths';
import { mkDirIfMissing } from '../utils';

const ensureOutDir = async (...paths: string[]): Promise<PluginOption> => {
  return {
    name: 'ensure-out-dir',
    apply: 'build',
    async buildStart() {
      await mkDirIfMissing(rootPath(...paths));
    }
  };
};

export default ensureOutDir;
