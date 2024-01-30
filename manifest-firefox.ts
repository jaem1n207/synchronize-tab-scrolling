import packageJson from './package.json';

const manifest: browser._manifest.WebExtensionManifest = {
  browser_specific_settings: {
    gecko: {
      id: 'addon@synchronize-tab-scrolling.org',
      strict_min_version: '54.0'
    }
  },
  manifest_version: 2,
  name: '__MSG_extName__',
  default_locale: 'en',
  version: packageJson.version,
  permissions: ['scripting', 'storage', 'tabs', '*://*/*'],
  content_security_policy: "script-src 'self'; object-src 'self'",
  icons: {
    '16': 'icons/logo-16.png',
    '48': 'icons/logo-48.png',
    '128': 'icons/logo-128.png',
    '256': 'icons/logo-256.png',
    '512': 'icons/logo-512.png'
  },
  background: {
    scripts: ['background-script.js']
  },
  content_scripts: [
    {
      matches: ['*://*/*'],
      js: ['content-script.js']
    }
  ],
  browser_action: {
    default_title: '__MSG_extName__',
    default_icon: {
      '16': 'icons/logo-16.png',
      '32': 'icons/logo-32.png',
      '48': 'icons/logo-48.png',
      '72': 'icons/logo-72.png'
    },
    default_popup: 'index.html'
  }
};

export default manifest;
