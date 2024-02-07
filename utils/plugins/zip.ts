import JSZip from 'jszip';
import type { PluginOption } from 'vite';

import colorLog from '../log';
import { PLATFORM, rootPath } from '../paths';
import { getPaths, readFile, writeFile } from '../utils';

const zipInstance = new JSZip();

const zip = async ({
  debug,
  platforms,
  version
}: {
  debug: boolean;
  platforms: PLATFORM[];
  version: string;
}): Promise<PluginOption> => {
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
    if (debug) {
      colorLog('🛑 Skipping zip archive creation in debug mode', 'info', true);
      return;
    }

    const promises: Promise<void>[] = [];
    for (const platform of platforms) {
      // FIXME: 각 플랫폼별 폴더로 변경하고 getBuildDir 함수 사용하도록 수정하기
      const buildDir = rootPath('build');
      const format = platform === PLATFORM.FIREFOX_MV2 ? 'xpi' : 'zip';
      const dest = rootPath('build', `sync-tab-scroll-${platform}-v${version}.${format}`);
      promises.push(archiveDirectory({ dir: buildDir, dest }));
    }
    await Promise.all(promises);
    colorLog(
      `🎁 Zipped build files for ${platforms.map((p) => p.toLowerCase()).join(', ')}`,
      'success',
      true
    );
  };

  return {
    name: 'zip',
    async closeBundle() {
      await zip({ platforms, version });
    }
  };
};

export default zip;
