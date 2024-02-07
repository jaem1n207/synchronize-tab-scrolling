import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

export const rootDir = dirname(createRequire(import.meta.url).resolve('../package.json'));
export const rootPath = (...paths: string[]) => join(rootDir, ...paths);

export const staticDir = rootPath('static');

export const PLATFORM = {
  CHROMIUM_MV2: 'chrome',
  CHROMIUM_MV3: 'chrome-mv3',
  FIREFOX_MV2: 'firefox'
} as const;
export type PLATFORM = (typeof PLATFORM)[keyof typeof PLATFORM];
export const getBuildDir = ({ debug, platform }: { debug: boolean; platform: PLATFORM }) =>
  join(rootPath('build'), debug ? 'debug' : 'release', platform);
