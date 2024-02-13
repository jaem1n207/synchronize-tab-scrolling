import fs from 'node:fs/promises';
import path from 'node:path';

import colorLog from './log';

export const getPaths = async (patterns: string | string[]) => {
  const { globby } = await import('globby');
  return await globby(patterns);
};

export const readFile = async (src: string, encoding: BufferEncoding = 'utf-8') => {
  return await fs.readFile(src, { encoding });
};

export const fileExists = async (src: string) => {
  try {
    await fs.access(src, fs.constants.R_OK);
    return true;
  } catch (error) {
    return false;
  }
};

export const pathExists = async (dest: string) => {
  try {
    await fs.access(dest);
    return true;
  } catch (error) {
    return false;
  }
};

export const mkDirIfMissing = async (dest: string) => {
  const dirName = path.dirname(dest);
  if (await pathExists(dirName)) {
    return;
  }

  try {
    await fs.mkdir(dirName, { recursive: true });
  } catch (error) {
    colorLog(`Failed to create directory ${dirName}`, 'error');
  }
};

export const removeFolder = async (dir: string) => {
  try {
    if (await pathExists(dir)) {
      await fs.rm(dir, { recursive: true });
    }
  } catch (error) {
    colorLog(`Failed to remove directory ${dir}`, 'error');
  }
};

export const writeFile = async (
  dest: string,
  data: Parameters<typeof fs.writeFile>[1],
  encoding: BufferEncoding = 'utf8'
) => {
  await mkDirIfMissing(dest);
  await fs.writeFile(dest, data, encoding);
};

export const writeJSON = async (
  dest: string,
  content: string | browser._manifest.WebExtensionManifest,
  space = 2
) => {
  const string = JSON.stringify(content, null, space);
  await writeFile(dest, string);
};

export const copyFile = async (src: string, dest: string) => {
  await mkDirIfMissing(dest);
  await fs.copyFile(src, dest);
};

export const measureTime = async (
  promise: Promise<void> | Promise<[void, void]> | Promise<void[]>,
  message: string
) => {
  const start = Date.now();
  await promise;
  const end = Date.now();
  colorLog(`${message} (${(end - start).toFixed(0)}ms)`, 'info', true);
};
