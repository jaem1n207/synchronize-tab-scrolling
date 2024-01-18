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
	description: '__MSG_extDescription__',
	action: {
		default_title: '__MSG_extName__',
		default_icon: {
			'16': 'icons/icon-16.png',
			'48': 'icons/icon-48.png'
		},
		default_popup: 'popup.html'
	},
	icons: {
		'16': 'icons/icon-16.png',
		'48': 'icons/icon-48.png',
		'128': 'icons/icon-128.png'
	}
	// background: {
	// 	service_worker: 'src/pages/background/index.js',
	// 	type: 'module'
	// },
	// content_scripts: [
	// 	{
	// 		matches: ['http://*/*', 'https://*/*', '<all_urls>'],
	// 		js: ['src/pages/content/index.js']
	// 	}
	// ]
};

export default manifest;
