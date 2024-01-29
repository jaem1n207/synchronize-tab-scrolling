import packageJson from './package.json';

/**
 * After changing, please reload the extension at `chrome://extensions`
 */
const manifest: chrome.runtime.ManifestV3 = {
  manifest_version: 3,
  name: '__MSG_extName__',
  default_locale: 'en',
  version: packageJson.version,
  permissions: ['scripting', 'storage', 'tabs'],
  host_permissions: ['*://*/*'],
  action: {
    default_title: '__MSG_extName__',
    default_icon: {
      '16': 'icons/logo-16.png',
      '32': 'icons/logo-32.png',
      '48': 'icons/logo-48.png',
      '72': 'icons/logo-72.png'
    },
    default_popup: 'index.html'
  },
  icons: {
    '16': 'icons/logo-16.png',
    '48': 'icons/logo-48.png',
    '128': 'icons/logo-128.png',
    '256': 'icons/logo-256.png',
    '512': 'icons/logo-512.png'
  },
  background: {
    service_worker: 'background-script.js',
    type: 'module'
  },
  content_scripts: [
    {
      matches: ['*://*/*'],
      js: ['content-script.js']
    }
  ]
};

export default manifest;
