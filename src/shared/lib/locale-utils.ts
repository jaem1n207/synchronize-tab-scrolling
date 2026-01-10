/**
 * 로케일(언어 코드) 감지 및 URL 동기화 시 로케일 보존을 위한 유틸리티
 * 다국어 문서를 서로 다른 언어로 동시에 보면서 스크롤 동기화를 할 때
 * 각 탭의 언어 설정을 유지하면서 경로만 동기화하기 위한 기능 제공
 */

import { ExtensionLogger } from './logger';

const logger = new ExtensionLogger({ scope: 'locale-utils' });

// 2글자 기본 로케일 코드 (ISO 639-1)
// O(1) 조회를 위해 Set 사용
// prettier-ignore
const BASE_LOCALE_CODES = new Set([
  'af', 'ar', 'az', 'be', 'bg', 'bs', 'ca', 'cs', 'cy', 'da',
  'de', 'dv', 'el', 'en', 'eo', 'es', 'et', 'eu', 'fa', 'fi',
  'fo', 'fr', 'gl', 'gu', 'he', 'hi', 'hr', 'hu', 'hy', 'id',
  'is', 'it', 'ja', 'ka', 'kk', 'kn', 'ko', 'kok', 'ky', 'lt',
  'lv', 'mi', 'mk', 'mn', 'mr', 'ms', 'mt', 'nb', 'nl', 'nn',
  'ns', 'pa', 'pl', 'ps', 'pt', 'qu', 'ro', 'ru', 'sa', 'se',
  'sk', 'sl', 'sq', 'sr', 'sv', 'sw', 'syr', 'ta', 'te', 'th',
  'tl', 'tn', 'tr', 'tt', 'ts', 'uk', 'ur', 'uz', 'vi', 'xh',
  'zh', 'zu',
]);

// 지역 코드를 포함한 로케일 패턴 (예: en-US, zh-CN, pt-BR)
// 형식: 소문자 2글자 + 하이픈 + 대문자 2글자
const REGIONAL_LOCALE_PATTERN = /^[a-z]{2}-[A-Z]{2}$/;

/**
 * URL 경로에서 로케일 코드 추출
 * 경로의 각 세그먼트를 검사하여 첫 번째로 발견된 유효한 로케일 코드를 반환
 *
 * @param pathname URL의 pathname 부분 (예: "/fr/docs/install")
 * @returns 로케일 코드 또는 null (예: "fr", "en-US")
 *
 * @example
 * extractLocaleFromPath("/fr/docs/install") // "fr"
 * extractLocaleFromPath("/en-US/api/users") // "en-US"
 * extractLocaleFromPath("/docs/install") // null
 * extractLocaleFromPath("/french/guide") // null (부분 일치는 제외)
 */
export function extractLocaleFromPath(pathname: string): string | null {
  // 경로를 /로 분할하여 각 세그먼트를 검사
  const segments = pathname.split('/').filter(Boolean);

  for (const segment of segments) {
    const lowerSegment = segment.toLowerCase();

    // 기본 로케일 코드 확인 (O(1) Set 조회)
    if (BASE_LOCALE_CODES.has(lowerSegment)) {
      return lowerSegment;
    }

    // 지역 코드 패턴 확인 (예: en-US, zh-CN)
    if (REGIONAL_LOCALE_PATTERN.test(segment)) {
      return segment;
    }
  }

  return null;
}

/**
 * URL 경로에서 지정된 로케일 코드 제거
 * 로케일 세그먼트만 제거하고 나머지 경로 구조는 유지
 *
 * @param pathname URL의 pathname 부분
 * @param locale 제거할 로케일 코드
 * @returns 로케일이 제거된 경로
 *
 * @example
 * removeLocaleFromPath("/fr/docs/install", "fr") // "/docs/install"
 * removeLocaleFromPath("/docs/fr/install", "fr") // "/docs/install"
 * removeLocaleFromPath("/en-US/api/v2/users", "en-US") // "/api/v2/users"
 * removeLocaleFromPath("/fr/", "fr") // "/"
 */
export function removeLocaleFromPath(pathname: string, locale: string): string {
  const segments = pathname.split('/');
  const localeLower = locale.toLowerCase();

  // 로케일 세그먼트를 제외한 세그먼트들만 필터링
  // 대소문자 구분 없이 비교
  const filteredSegments = segments.filter((segment) => {
    if (!segment) return true; // 빈 세그먼트는 유지 (슬래시 보존용)
    return segment.toLowerCase() !== localeLower;
  });

  // 세그먼트를 다시 조합
  let result = filteredSegments.join('/');

  // 원본이 /로 시작했다면 결과도 /로 시작하도록 보장
  if (pathname.startsWith('/') && !result.startsWith('/')) {
    result = '/' + result;
  }

  // 경로가 완전히 비어있으면 /를 반환
  if (!result || result === '') {
    return '/';
  }

  return result;
}

/**
 * 경로에서 로케일의 위치(인덱스) 찾기
 *
 * @param pathname URL의 pathname
 * @param locale 찾을 로케일 코드
 * @returns 로케일의 세그먼트 인덱스 (0-based), 없으면 -1
 */
function findLocalePosition(pathname: string, locale: string): number {
  const segments = pathname.split('/').filter(Boolean);
  const localeLower = locale.toLowerCase();

  return segments.findIndex((segment) => segment.toLowerCase() === localeLower);
}

/**
 * 정규화된 경로에 로케일을 지정된 위치에 삽입
 *
 * @param normalizedPath 로케일이 제거된 경로
 * @param locale 삽입할 로케일 코드
 * @param position 삽입할 위치 (0-based), -1이면 첫 번째 위치
 * @returns 로케일이 삽입된 경로
 */
function insertLocaleAtPosition(normalizedPath: string, locale: string, position: number): string {
  const segments = normalizedPath.split('/').filter(Boolean);

  // 위치가 유효하지 않거나 -1이면 첫 번째 위치에 삽입
  const insertIndex = position >= 0 && position <= segments.length ? position : 0;

  // 로케일을 지정된 위치에 삽입
  segments.splice(insertIndex, 0, locale);

  // 경로 재구성 (항상 /로 시작)
  return '/' + segments.join('/');
}

/**
 * URL 동기화 시 대상 탭의 로케일을 보존하면서 경로 변경 적용
 *
 * 동작 방식:
 * 1. 소스와 대상 URL 모두 로케일 포함: 소스의 경로를 대상의 로케일로 변환
 * 2. 소스만 로케일 포함: 소스 URL 그대로 사용
 * 3. 대상만 로케일 포함 또는 둘 다 없음: 소스 경로 사용
 *
 * 모든 경우에 대상의 쿼리 파라미터와 해시는 보존됨
 *
 * @param sourceUrl 변경된 소스 탭의 URL
 * @param targetUrl 동기화 대상 탭의 현재 URL
 * @returns 로케일이 보존된 최종 URL
 *
 * @example
 * // 둘 다 로케일 포함: 대상 로케일 보존
 * applyLocalePreservingSync(
 *   "https://example.com/fr/docs/install",
 *   "https://example.com/en-US/docs/next?foo=bar#section"
 * )
 * // → "https://example.com/en-US/docs/install?foo=bar#section"
 *
 * @example
 * // 소스만 로케일: 소스 로케일 유지
 * applyLocalePreservingSync(
 *   "https://example.com/fr/docs/install",
 *   "https://example.com/docs/next"
 * )
 * // → "https://example.com/fr/docs/install"
 *
 * @example
 * // 로케일 없음: 기본 동작
 * applyLocalePreservingSync(
 *   "https://example.com/docs/install",
 *   "https://example.com/docs/next?foo=bar"
 * )
 * // → "https://example.com/docs/install?foo=bar"
 */
export function applyLocalePreservingSync(sourceUrl: string, targetUrl: string): string {
  try {
    const source = new URL(sourceUrl);
    const target = new URL(targetUrl);

    // 소스와 대상 경로에서 로케일 추출
    const sourceLocale = extractLocaleFromPath(source.pathname);
    const targetLocale = extractLocaleFromPath(target.pathname);

    let finalPathname: string;

    if (sourceLocale && targetLocale) {
      // 케이스 1: 둘 다 로케일 포함
      // 소스 경로에서 로케일 제거하여 정규화된 경로 얻기
      const normalizedPath = removeLocaleFromPath(source.pathname, sourceLocale);

      // 소스에서 로케일의 위치 찾기
      const localePosition = findLocalePosition(source.pathname, sourceLocale);

      // 대상 로케일을 같은 위치에 삽입
      finalPathname = insertLocaleAtPosition(normalizedPath, targetLocale, localePosition);
    } else if (sourceLocale && !targetLocale) {
      // 케이스 2: 소스만 로케일 포함
      // 소스의 경로를 그대로 사용 (소스 로케일 유지)
      finalPathname = source.pathname;
    } else {
      // 케이스 3: 대상만 로케일 포함 또는 둘 다 없음
      // 소스 경로를 그대로 사용
      finalPathname = source.pathname;
    }

    // 최종 URL 구성: 소스의 origin + 계산된 pathname + 대상의 query + 대상의 hash
    const finalUrl = `${source.origin}${finalPathname}${target.search}${target.hash}`;

    return finalUrl;
  } catch (error) {
    // URL 파싱 실패 시 소스 URL을 그대로 반환
    logger.warn('Failed to apply locale-preserving sync, using source URL', { error });
    return sourceUrl;
  }
}
