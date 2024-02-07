import { globby } from 'globby';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { PluginOption } from 'vite';

import { PLATFORM, getBuildDir, rootPath } from '../paths';
import { mkDirIfMissing, readFile, writeFile } from '../utils';

const copyToPlatformDirsPlugin = async ({
  debug,
  platforms
}: {
  debug: boolean;
  platforms: PLATFORM[];
}): Promise<PluginOption> => {
  const copyFilesToPlatformDir = async (platform: PLATFORM) => {
    const buildDir = rootPath('build');
    const targetDir = getBuildDir({ debug, platform });

    // Define patterns for all files and folders except the 'build/release' folder
    const patterns = [`${buildDir}/**/*`, `!${buildDir}/release/**/*`];

    const paths = await globby(patterns);

    for (const srcPath of paths) {
      const relativePath = path.relative(buildDir, srcPath);
      const destPath = path.join(targetDir, relativePath);

      // For files, destPath is the file path, so to get the folder path, use '...' to get the folder path.
      await mkDirIfMissing(path.join(destPath, '..'));

      const data = await readFile(srcPath);
      await writeFile(destPath, data);
    }
  };

  const cleanBuildFolder = async () => {
    const buildDir = rootPath('build');
    const items = await fs.readdir(buildDir);

    for (const item of items) {
      // Remove everything except the 'release' folder
      if (item !== 'release') {
        const itemPath = path.join(buildDir, item);
        await fs.rm(itemPath, { recursive: true, force: true });
      }
    }
  };

  return {
    name: 'copy-to-platform-dirs',
    async closeBundle() {
      const promises: Promise<void>[] = [];
      for (const platform of platforms) {
        promises.push(copyFilesToPlatformDir(platform));
      }
      await Promise.all(promises);

      await cleanBuildFolder();

      console.log('📦 Copied build files to platform directories, excluding the release folder');
    }
  };
};

export default copyToPlatformDirsPlugin;
