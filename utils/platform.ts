// https://github.com/darkreader/darkreader/blob/main/src/utils/platform.ts

declare const __CHROMIUM_MV3__: boolean;
declare const __FIREFOX_MV2__: boolean;

interface UserAgentData {
  brands: Array<{
    brand: string;
    version: string;
  }>;
  mobile: boolean;
  platform: string;
}

declare global {
  interface NavigatorID {
    userAgentData: UserAgentData;
  }
}

const isNavigatorDefined = typeof navigator !== 'undefined';
const userAgent = isNavigatorDefined
  ? navigator.userAgentData && Array.isArray(navigator.userAgentData.brands)
    ? navigator.userAgentData.brands
        .map((brand) => `${brand.brand.toLowerCase()} ${brand.version}`)
        .join(' ')
    : navigator.userAgent.toLowerCase()
  : 'some useragent';

const platform = isNavigatorDefined
  ? navigator.userAgentData && typeof navigator.userAgentData.platform === 'string'
    ? navigator.userAgentData.platform.toLowerCase()
    : navigator.platform.toLowerCase()
  : 'some platform';

export const isChromium =
  __CHROMIUM_MV3__ ||
  (!__FIREFOX_MV2__ && (userAgent.includes('chrome') || userAgent.includes('chromium')));
export const isFirefox =
  __FIREFOX_MV2__ ||
  (!__CHROMIUM_MV3__ &&
    (userAgent.includes('firefox') ||
      userAgent.includes('thunderbird') ||
      userAgent.includes('librewolf')));
export const isVivaldi = __CHROMIUM_MV3__ && !__FIREFOX_MV2__ && userAgent.includes('vivaldi');
export const isYaBrowser = __CHROMIUM_MV3__ && !__FIREFOX_MV2__ && userAgent.includes('yabrowser');
export const isOpera =
  __CHROMIUM_MV3__ &&
  !__FIREFOX_MV2__ &&
  (userAgent.includes('opr') || userAgent.includes('opera'));
export const isEdge = __CHROMIUM_MV3__ && !__FIREFOX_MV2__ && userAgent.includes('edg');
export const isSafari =
  !__CHROMIUM_MV3__ && !__FIREFOX_MV2__ && userAgent.includes('safari') && !isChromium;
export const isWindows = platform.startsWith('win');
export const isMacOS = platform.startsWith('mac');
export const isMobile =
  isNavigatorDefined && navigator.userAgentData
    ? navigator.userAgentData.mobile
    : userAgent.includes('mobile');

export const chromiumVersion = (() => {
  const m = userAgent.match(/chrom(?:e|ium)(?:\/| )([^ ]+)/);
  if (m && m[1]) {
    return m[1];
  }
  return '';
})();

export const firefoxVersion = (() => {
  const m = userAgent.match(/(?:firefox|librewolf)(?:\/| )([^ ]+)/);
  if (m && m[1]) {
    return m[1];
  }
  return '';
})();
