const CHROME_STORE_URL =
  'https://chromewebstore.google.com/detail/synchronize-tab-scrolling/phceoocamipnafpgnchbfhkdlbleeafc';

export const STORE_URLS = {
  chrome: CHROME_STORE_URL,
  edge: 'https://microsoftedge.microsoft.com/addons/detail/synchronize-tab-scrolling/jonclaakmpjodjggkadldgkapccdofnn',
  firefox: 'https://addons.mozilla.org/firefox/addon/synchronize-tab-scrolling',
  brave: CHROME_STORE_URL,
  arc: CHROME_STORE_URL,
  dia: CHROME_STORE_URL,
} as const;

export const GITHUB_REPO_URL = 'https://github.com/jaem1n207/synchronize-tab-scrolling';
export const DEMO_VIDEO_URL = 'https://youtu.be/cpLPy5OlJ8g';
export const SUPPORT_EMAIL = 'tech.jmtt@gmail.com';

export type BrowserKey = keyof typeof STORE_URLS;
