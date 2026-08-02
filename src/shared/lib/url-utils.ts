/**
 * 제한된 URL 패턴들을 관리하는 유틸리티
 * 브라우저 보안 정책에 의해 콘텐츠 스크립트 주입이 불가능한 URL들
 */

interface UrlRule {
  hostname: string;
  pathPrefix?: string;
}

// Google 서비스 URL 목록
const GOOGLE_SERVICES = [
  { hostname: 'accounts.google.com' },
  { hostname: 'analytics.google.com' },
  { hostname: 'search.google.com', pathPrefix: '/search-console' },
  { hostname: 'docs.google.com' },
  { hostname: 'drive.google.com' },
  { hostname: 'mail.google.com' },
  { hostname: 'sheets.google.com' },
  { hostname: 'slides.google.com' },
  { hostname: 'calendar.google.com' },
  { hostname: 'meet.google.com' },
  { hostname: 'photos.google.com' },
  { hostname: 'myaccount.google.com' },
  { hostname: 'play.google.com' },
  { hostname: 'console.cloud.google.com' },
  { hostname: 'console.developers.google.com' },
  { hostname: 'developers.google.com' },
  { hostname: 'support.google.com' },
  { hostname: 'workspace.google.com' },
  { hostname: 'one.google.com' },
  { hostname: 'admin.google.com' },
] satisfies Array<UrlRule>;

const CHROME_WEB_STORE_RULES = [
  { hostname: 'chromewebstore.google.com' },
  { hostname: 'chrome.google.com', pathPrefix: '/webstore' },
] satisfies Array<UrlRule>;

// 브라우저별 제한된 URL 패턴
const BROWSER_RESTRICTED_PATTERNS = {
  // Chrome 제한 패턴
  chrome: [
    'chrome://',
    'chrome-extension://',
    'chrome-search://',
    'devtools://',
    'view-source:',
    'data:',
    'blob:',
    'filesystem:',
  ],
  // Firefox 제한 패턴
  firefox: [
    'about:',
    'moz-extension://',
    'resource://',
    'chrome://',
    'jar:',
    'view-source:',
    'data:',
    'blob:',
    'filesystem:',
    'moz-safe-about:',
    'moz-icon:',
  ],
  // Edge 제한 패턴
  edge: [
    'edge://',
    'extension://',
    'ms-browser-extension://',
    'devtools://',
    'view-source:',
    'data:',
    'blob:',
    'filesystem:',
    'https://microsoftedge.microsoft.com/addons',
  ],
} as const;

const FILE_PROTOCOL = 'file:';

const UNSUPPORTED_SPECIAL_PROTOCOLS = [
  'about:',
  'ftp:',
  'javascript:',
  'vbscript:',
  'ws:',
  'wss:',
  'data:',
  'blob:',
  'filesystem:',
  'view-source:',
];

// 특수 도메인 패턴 (콘텐츠 스크립트 주입이 제한되거나 작동하지 않는 도메인)
const SPECIAL_DOMAINS = [
  'figma.com',
  'www.figma.com',
  'notion.so',
  'www.notion.so',
  'music.youtube.com',
];

// 특수 경로 패턴 (도메인 + 경로 조합으로 제한해야 하는 패턴)
// 같은 도메인에서 특정 경로만 제한해야 할 때 사용
const SPECIAL_PATH_PATTERNS = [
  { domainSuffix: 'atlassian.net', pathPrefix: '/jira' },
  { domainSuffix: 'atlassian.net', pathPrefix: '/wiki' },
];

// 검색 엔진 패턴 (스크롤 동기화가 무의미한 검색 결과 페이지)
const SEARCH_ENGINE_PATTERNS: Array<{ domain: string; pathPrefix?: string }> = [
  { domain: 'google.com', pathPrefix: '/search' },
  { domain: 'www.google.com', pathPrefix: '/search' },
  { domain: 'search.naver.com' },
  { domain: 'bing.com', pathPrefix: '/search' },
  { domain: 'www.bing.com', pathPrefix: '/search' },
  { domain: 'duckduckgo.com' },
  { domain: 'www.duckduckgo.com' },
  { domain: 'search.yahoo.com' },
  { domain: 'www.baidu.com', pathPrefix: '/s' },
  { domain: 'search.daum.net' },
];

// PDF 뷰어 경로 패턴
const PDF_VIEWER_PATH_PATTERNS = ['/pdf', '/viewer', '/pdfviewer'];

// 인증/로그인 페이지 도메인 접두사
const AUTH_DOMAIN_PREFIXES = [
  'accounts.',
  'login.',
  'auth.',
  'signin.',
  'signup.',
  'sso.',
  'id.',
  'oauth.',
];

// 인증/로그인 페이지 경로 패턴
const AUTH_PATH_PATTERNS = [
  '/login',
  '/signin',
  '/signup',
  '/sign-in',
  '/sign-up',
  '/auth',
  '/oauth',
  '/sso',
  '/register',
  '/authenticate',
];

/**
 * URL 파싱
 */
function parseUrl(url: string | null | undefined): URL | null {
  if (!url) return null;

  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function matchesUrlRule(url: URL, rule: UrlRule): boolean {
  if (url.hostname !== rule.hostname) {
    return false;
  }

  if (!rule.pathPrefix) {
    return true;
  }

  return url.pathname === rule.pathPrefix || url.pathname.startsWith(`${rule.pathPrefix}/`);
}

function isEdgeAddonStoreUrl(url: URL): boolean {
  return matchesUrlRule(url, {
    hostname: 'microsoftedge.microsoft.com',
    pathPrefix: '/addons',
  });
}

function isFirefoxAddonStoreUrl(url: URL): boolean {
  return url.hostname === 'addons.mozilla.org';
}

export function isBrowserStoreUrl(url: string | null | undefined): boolean {
  const parsedUrl = parseUrl(url);
  if (!parsedUrl) {
    return false;
  }

  return (
    CHROME_WEB_STORE_RULES.some((rule) => matchesUrlRule(parsedUrl, rule)) ||
    isEdgeAddonStoreUrl(parsedUrl) ||
    isFirefoxAddonStoreUrl(parsedUrl)
  );
}

export function isFileUrl(url: string | null | undefined): boolean {
  return parseUrl(url)?.protocol === FILE_PROTOCOL;
}

export function isPdfUrl(url: string | null | undefined): boolean {
  const parsedUrl = parseUrl(url);
  return parsedUrl ? parsedUrl.pathname.toLowerCase().endsWith('.pdf') : false;
}

function isUnsupportedLocalDocumentUrl(url: string | null | undefined): boolean {
  const parsedUrl = parseUrl(url);
  if (!parsedUrl) return false;

  const pathname = parsedUrl.pathname.toLowerCase();
  if (pathname.endsWith('.pdf')) {
    return true;
  }

  if (parsedUrl.protocol !== FILE_PROTOCOL) {
    return false;
  }

  return pathname.endsWith('.doc') || pathname.endsWith('.docx');
}

export function isUnsupportedSpecialScheme(url: string | null | undefined): boolean {
  const parsedUrl = parseUrl(url);
  return parsedUrl ? UNSUPPORTED_SPECIAL_PROTOCOLS.includes(parsedUrl.protocol) : false;
}

/**
 * 브라우저 타입 감지
 */
export function detectBrowserType(): 'chrome' | 'firefox' | 'edge' | 'unknown' {
  const userAgent = navigator.userAgent.toLowerCase();

  if (userAgent.includes('edg/')) {
    return 'edge';
  } else if (userAgent.includes('firefox')) {
    return 'firefox';
  } else if (userAgent.includes('chrome')) {
    return 'chrome';
  }

  return 'unknown';
}

/**
 * URL이 제한된 패턴인지 확인
 */
export function isForbiddenUrl(url: string | null | undefined): boolean {
  if (!url) return true;

  const normalizedUrl = url.toLowerCase();
  const browserType = detectBrowserType();

  // 공통 제한 프로토콜 확인
  if (isUnsupportedSpecialScheme(normalizedUrl)) {
    return true;
  }

  // 브라우저별 제한 패턴 확인
  if (browserType !== 'unknown') {
    const browserPatterns = BROWSER_RESTRICTED_PATTERNS[browserType];
    if (browserPatterns.some((pattern) => normalizedUrl.startsWith(pattern))) {
      return true;
    }
  }

  // 특수 도메인 및 경로 패턴 확인
  try {
    const urlObj = new URL(normalizedUrl);

    // Google 서비스 확인
    if (
      GOOGLE_SERVICES.some((service) => matchesUrlRule(urlObj, service)) ||
      CHROME_WEB_STORE_RULES.some((rule) => matchesUrlRule(urlObj, rule))
    ) {
      return true;
    }

    if (isUnsupportedLocalDocumentUrl(normalizedUrl)) {
      return true;
    }

    if (urlObj.protocol === FILE_PROTOCOL) {
      return false;
    }

    // 특수 도메인 확인
    if (SPECIAL_DOMAINS.includes(urlObj.hostname)) {
      return true;
    }

    // 특수 경로 패턴 확인 (JIRA, Confluence 등)
    for (const pattern of SPECIAL_PATH_PATTERNS) {
      if (
        (urlObj.hostname === pattern.domainSuffix ||
          urlObj.hostname.endsWith(`.${pattern.domainSuffix}`)) &&
        urlObj.pathname.startsWith(pattern.pathPrefix)
      ) {
        return true;
      }
    }

    // 검색 엔진 확인
    for (const pattern of SEARCH_ENGINE_PATTERNS) {
      if (urlObj.hostname === pattern.domain || urlObj.hostname.endsWith('.' + pattern.domain)) {
        // pathPrefix가 지정된 경우 경로도 확인
        if (pattern.pathPrefix) {
          if (urlObj.pathname.startsWith(pattern.pathPrefix)) {
            return true;
          }
        } else {
          // pathPrefix가 없으면 도메인만으로 차단
          return true;
        }
      }
    }

    // PDF 뷰어 경로 확인
    if (PDF_VIEWER_PATH_PATTERNS.some((pattern) => urlObj.pathname.startsWith(pattern))) {
      return true;
    }

    // 인증/로그인 페이지 도메인 접두사 확인
    if (AUTH_DOMAIN_PREFIXES.some((prefix) => urlObj.hostname.startsWith(prefix))) {
      return true;
    }

    // 인증/로그인 페이지 경로 패턴 확인
    if (AUTH_PATH_PATTERNS.some((pattern) => urlObj.pathname.startsWith(pattern))) {
      return true;
    }

    if (browserType === 'edge' && isEdgeAddonStoreUrl(urlObj)) {
      return true;
    }

    if (browserType === 'firefox' && isFirefoxAddonStoreUrl(urlObj)) {
      return true;
    }
  } catch {
    // URL 파싱 실패 시 제한된 것으로 간주
    return true;
  }

  return false;
}
