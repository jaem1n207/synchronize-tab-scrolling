import { globby } from 'globby';
import { copyFile as _copyFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { PluginOption } from 'vite';

import { PLATFORM, getDestDir, rootPath } from '../paths';
import { measureTime, mkDirIfMissing, removeFolder } from '../utils';

const buildDir = 'build';

const getPaths = async (patterns: string | string[]) => {
  return await globby(patterns);
};

const copyFile = async (src: string, dest: string) => {
  await mkDirIfMissing(dest);
  await _copyFile(src, dest);
};

const copyEntries = [
  '_locales/**/messages.json',
  'app/**/*.*',
  'icons/**/*.png',
  '*.js',
  'index.html'
];

const getCwdPath = (path: string) => path.substring(buildDir.length + 1);

const copyEntry = async (
  path: string,
  { debug, platform }: { debug: boolean; platform: PLATFORM }
) => {
  const cwdPath = getCwdPath(path);
  const destDir = getDestDir({ debug, platform });
  const src = `${buildDir}/${cwdPath}`;
  const dest = `${destDir}/${cwdPath}`;
  await copyFile(src, dest);
};

const copyToPlatformDirsPlugin = async ({
  debug,
  platforms,
  delay = 1000
}: {
  debug: boolean;
  platforms: PLATFORM[];
  delay?: number;
}): Promise<PluginOption> => {
  const copy = async () => {
    const promises = copyEntries.flatMap(async (entry) => {
      const files = await getPaths(`${buildDir}/${entry}`);
      return files.flatMap((file) =>
        platforms.map((platform) => copyEntry(file, { debug, platform }))
      );
    });
    await Promise.all(promises);
  };

  const cleanBuildFolder = async () => {
    const buildDir = rootPath('build');
    const items = await readdir(buildDir);

    for (const item of items) {
      // Remove all folders except the 'release' and 'debug' folders
      if (item !== 'release' && item !== 'debug') {
        const itemPath = path.join(buildDir, item);
        await removeFolder(itemPath);
      }
    }
  };

  return {
    name: 'copy-to-platform-dirs',
    async closeBundle() {
      /**
       * This task, which compresses the generated output, should be executed
       * after the `extract-inline-script` plugin is executed at the end of bundle creation.
       * Unfortunately there's no hook to make it run after the `closeBundle` cycle, so wait one second before running it.
       */
      await Bun.sleep(delay);

      await measureTime(
        copy(),
        '📦 Copied build files to platform directories, excluding the release folder'
      );

      await cleanBuildFolder();
    }
  };
};

export default copyToPlatformDirsPlugin;
