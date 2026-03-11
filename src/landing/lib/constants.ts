export const STORE_URLS = {
  chrome:
    'https://chromewebstore.google.com/detail/synchronize-tab-scrolling/phceoocamipnafpgnchbfhkdlbleeafc',
  edge: 'https://microsoftedge.microsoft.com/addons/detail/synchronize-tab-scrolling/jonclaakmpjodjggkadldgkapccdofnn',
  firefox: 'https://addons.mozilla.org/firefox/addon/synchronize-tab-scrolling',
  brave:
    'https://chromewebstore.google.com/detail/synchronize-tab-scrolling/phceoocamipnafpgnchbfhkdlbleeafc',
} as const;

export const GITHUB_REPO_URL = 'https://github.com/jaem1n207/synchronize-tab-scrolling';
export const DEMO_VIDEO_URL = 'https://youtu.be/cpLPy5OlJ8g';
export const SUPPORT_EMAIL = 'tech.jmtt@gmail.com';

export type BrowserKey = keyof typeof STORE_URLS;
