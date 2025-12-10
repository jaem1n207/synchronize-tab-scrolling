/* eslint-disable no-useless-escape */
import fs from 'fs-extra';

import { isDev, isFirefox, port, r } from '../scripts/utils';

import type PkgType from '../package.json';
import type { Manifest } from 'webextension-polyfill';

export async function getManifest(): Promise<Manifest.WebExtensionManifest> {
  const pkg = (await fs.readJSON(r('package.json'))) as typeof PkgType;
  const pkgName = pkg.displayName || pkg.name;

  // update this file to update this manifest.json
  const manifest: Manifest.WebExtensionManifest = {
    manifest_version: 3,
    name: isDev ? `(Debug) ${pkgName}` : pkgName,
    version: isDev ? '0.0.1' : pkg.version,
    description: pkg.description,
    default_locale: 'en',
    action: {
      default_icon: './icons/logo-512.png',
      default_popup: './dist/popup/index.html',
    },
    background: isFirefox
      ? {
          scripts: ['dist/background/index.mjs'],
          type: 'module',
        }
      : {
          service_worker: './dist/background/index.mjs',
        },
    icons: {
      16: './icons/logo-512.png',
      48: './icons/logo-512.png',
      128: './icons/logo-512.png',
    },
    permissions: ['tabs', 'storage', 'activeTab', 'scripting'],
    host_permissions: ['*://*/*'],
    content_scripts: [
      {
        matches: ['<all_urls>'],
        js: ['dist/contentScripts/index.global.js'],
      },
    ],
    web_accessible_resources: [
      {
        resources: ['dist/contentScripts/synchronize-tab-scrolling.css', 'dist/sidebar/index.html'],
        matches: ['<all_urls>'],
      },
    ],
    content_security_policy: {
      extension_pages: isDev
        ? `script-src \'self\' http://localhost:${port}; object-src \'self\'`
        : `script-src \'self\'; object-src \'self\'`,
    },
  };

  if (isFirefox) {
    manifest.browser_specific_settings = {
      gecko: {
        id: 'addon@localhost',
        strict_min_version: '91.0',
      },
    };
  }

  return manifest;
}
