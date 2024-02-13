import { resolve } from 'node:path';
import type { PluginOption } from 'vite';

import { PLATFORM, getDestDir } from '../paths';
import { measureTime, writeJSON } from '../utils';

/**
 * Chrome or Mozilla manifest file
 */
type Manifest = chrome.runtime.ManifestV3 | browser._manifest.WebExtensionManifest;

const validateManifest = (manifest: Manifest) => {
  if (!manifest.name) {
    throw new Error('Manifest must have a name');
  }
  if (!manifest.version) {
    throw new Error('Manifest must have a version');
  }
};

const patchManifest = async ({ debug, platform }: { debug: boolean; platform: PLATFORM }) => {
  const manifest = await import('../../manifest').then((m) => m.default);
  const patched: Manifest = { ...manifest };

  if (platform === 'chrome-mv3') {
    patched.manifest_version = 3;
    patched.minimum_chrome_version = '88';
    patched.permissions = ['scripting', 'storage', 'tabs'];
    patched.host_permissions = ['*://*/*'];
    patched.background = {
      service_worker: 'background-script.js',
      type: 'module'
    };
    patched.action = {
      default_title: '__MSG_extName__',
      default_icon: {
        '16': 'icons/logo-16.png',
        '32': 'icons/logo-32.png',
        '48': 'icons/logo-48.png',
        '72': 'icons/logo-72.png',
        '128': 'icons/logo-128.png'
      },
      default_popup: 'index.html'
    };
    patched.browser_action = undefined;
    patched.content_security_policy = undefined;
  }
  if (platform === 'firefox') {
    patched.browser_specific_settings = {
      gecko: {
        id: 'addon@synchronize-tab-scrolling.org',
        strict_min_version: '57.0'
      }
    };
  }
  if (debug) {
    patched.name = `(Debug) Synchronize Tab Scrolling`;
    patched.version = '1';
  }

  validateManifest(patched);

  return patched;
};

const createManifests = async ({
  debug,
  platforms
}: {
  debug: boolean;
  platforms: PLATFORM[];
}): Promise<PluginOption> => {
  return {
    name: 'create-manifests',
    async closeBundle() {
      const promises = platforms.map(async (platform) => {
        const manifest = await patchManifest({ debug, platform });
        const buildDir = getDestDir({ debug, platform });
        return writeJSON(resolve(buildDir, 'manifest.json'), manifest);
      });
      await measureTime(Promise.all(promises), `📦 Created manifests for ${platforms.join(', ')}`);
    }
  };
};

export default createManifests;
