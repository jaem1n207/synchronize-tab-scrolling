/**
 * 제한된 URL 패턴들을 관리하는 유틸리티
 * 브라우저 보안 정책에 의해 콘텐츠 스크립트 주입이 불가능한 URL들
 */

// Google 서비스 URL 목록
const GOOGLE_SERVICES = [
  'https://accounts.google.com',
  'https://analytics.google.com',
  'https://search.google.com/search-console',
  'https://chromewebstore.google.com',
  'https://chrome.google.com/webstore',
  'https://docs.google.com',
  'https://drive.google.com',
  'https://mail.google.com',
  'https://sheets.google.com',
  'https://slides.google.com',
  'https://calendar.google.com',
  'https://meet.google.com',
  'https://photos.google.com',
  'https://myaccount.google.com',
  'https://play.google.com',
  'https://console.cloud.google.com',
  'https://console.developers.google.com',
  'https://developers.google.com',
  'https://support.google.com',
  'https://workspace.google.com',
  'https://one.google.com',
  'https://admin.google.com',
];

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

// 공통 제한 패턴
const COMMON_RESTRICTED_PATTERNS = [
  'file://',
  'ftp://',
  'javascript:',
  'vbscript:',
  'ws://',
  'wss://',
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

  // Google 서비스 확인
  if (GOOGLE_SERVICES.some((service) => normalizedUrl.startsWith(service))) {
    return true;
  }

  // 공통 제한 패턴 확인
  if (COMMON_RESTRICTED_PATTERNS.some((pattern) => normalizedUrl.startsWith(pattern))) {
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

    // 특수 도메인 확인
    if (SPECIAL_DOMAINS.includes(urlObj.hostname)) {
      return true;
    }

    // 특수 경로 패턴 확인 (JIRA, Confluence 등)
    for (const pattern of SPECIAL_PATH_PATTERNS) {
      if (
        urlObj.hostname.endsWith(pattern.domainSuffix) &&
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

    // PDF 파일 직접 접근 확인
    if (urlObj.pathname.endsWith('.pdf')) {
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
  } catch {
    // URL 파싱 실패 시 제한된 것으로 간주
    return true;
  }

  // 추가 Edge 스토어 확인
  if (browserType === 'edge' && normalizedUrl.includes('microsoftedge.microsoft.com/addons')) {
    return true;
  }

  // Firefox 애드온 스토어 확인
  if (browserType === 'firefox' && normalizedUrl.includes('addons.mozilla.org')) {
    return true;
  }

  return false;
}

/**
 * URL에서 도메인 추출
 */
export function extractDomain(url: string): string | null {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return null;
  }
}

/**
 * 두 URL이 같은 사이트인지 확인 (URL 동기화 기능용)
 */
export function isSameSite(url1: string, url2: string): boolean {
  try {
    const urlObj1 = new URL(url1);
    const urlObj2 = new URL(url2);

    // 프로토콜과 호스트가 같은지 확인
    if (urlObj1.protocol !== urlObj2.protocol) return false;

    // 서브도메인을 고려한 도메인 비교
    const domain1Parts = urlObj1.hostname.split('.');
    const domain2Parts = urlObj2.hostname.split('.');

    // 최소 2개 이상의 파트가 있어야 함 (예: example.com)
    if (domain1Parts.length < 2 || domain2Parts.length < 2) {
      return urlObj1.hostname === urlObj2.hostname;
    }

    // 메인 도메인 비교 (마지막 2개 파트)
    const mainDomain1 = domain1Parts.slice(-2).join('.');
    const mainDomain2 = domain2Parts.slice(-2).join('.');

    return mainDomain1 === mainDomain2;
  } catch {
    return false;
  }
}

/**
 * URL 동기화를 위한 경로 병합
 */
export function mergeUrlPath(baseUrl: string, newPath: string, newSearch?: string): string {
  try {
    const urlObj = new URL(baseUrl);
    urlObj.pathname = newPath;
    if (newSearch) {
      urlObj.search = newSearch;
    }
    return urlObj.toString();
  } catch {
    return baseUrl;
  }
}
