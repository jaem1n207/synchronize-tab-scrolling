import JSZip from 'jszip';
import type { PluginOption } from 'vite';

import colorLog from '../log';
import { PLATFORM, getDestDir, rootPath } from '../paths';
import { getPaths, measureTime, readFile, writeFile } from '../utils';

const zipInstance = new JSZip();

/**
 * It should always be placed **at the end** of the `vite.plugins` array so that it runs after everything else is done.
 */
const zip = async ({
  debug,
  platforms,
  version,
  delay = 1500
}: {
  debug: boolean;
  platforms: PLATFORM[];
  version: string;
  delay?: number;
}): Promise<PluginOption> => {
  const getExtensionFormat = (platform: PLATFORM) => {
    switch (platform) {
      case PLATFORM.FIREFOX_MV2:
        return 'xpi';
      default:
        return 'zip';
    }
  };

  const archiveFiles = async ({
    files,
    dir,
    dest
  }: {
    files: string[];
    dir: string;
    dest: string;
  }) => {
    for (const file of files) {
      const path = file.replace(dir, '');
      const content = await readFile(file);
      zipInstance.file(path, content);
    }
    const buffer = await zipInstance.generateAsync({ type: 'nodebuffer' });
    await writeFile(dest, buffer);
  };

  const archiveDirectory = async ({ dir, dest }: { dir: string; dest: string }) => {
    const files = await getPaths(`${dir}/**/*.*`);
    await archiveFiles({ files, dir, dest });
  };

  const zip = async ({ platforms, version }: { platforms: PLATFORM[]; version: string }) => {
    const promises = platforms.map(async (platform) => {
      const buildDir = getDestDir({ debug, platform });
      const format = getExtensionFormat(platform);
      const dest = rootPath('build/release', `sync-tab-scroll-${platform}-v${version}.${format}`);
      return archiveDirectory({ dir: buildDir, dest });
    });
    await Promise.all(promises);
  };

  return {
    name: 'zip',
    async closeBundle() {
      /**
       * This task, which compresses the generated output, should be executed
       * after both the `extract-inline-script` & `copy-to-platform-dirs` plugins have been executed at the end of bundle creation.
       * Unfortunately there's no hook to make it run after the `closeBundle` cycle, so wait one second before running it.
       */
      await Bun.sleep(delay);
      if (debug) {
        colorLog('🛑 Skipping zip archive creation in debug mode', 'info', true);
        return;
      }
      await measureTime(
        zip({ platforms, version }),
        `🎁 Zipped build files for ${platforms.map((p) => p.toLowerCase()).join(', ')}`
      );
    }
  };
};

export default zip;
