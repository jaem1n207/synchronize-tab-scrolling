// https://github.com/darkreader/darkreader/blob/main/src/utils/platform.ts

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

export const isChromium = userAgent.includes('chrome') || userAgent.includes('chromium');
export const isFirefox =
  userAgent.includes('firefox') ||
  userAgent.includes('thunderbird') ||
  userAgent.includes('librewolf');
export const isVivaldi = isChromium && userAgent.includes('vivaldi');
export const isYaBrowser = isChromium && userAgent.includes('yabrowser');
export const isOpera = isChromium && (userAgent.includes('opr') || userAgent.includes('opera'));
export const isEdge = isChromium && userAgent.includes('edg');
export const isSafari = !isChromium && userAgent.includes('safari');
export const isWindows = platform.startsWith('win');
export const isMacOS = platform.startsWith('mac');
export const isMobile =
  isNavigatorDefined && navigator.userAgentData
    ? navigator.userAgentData.mobile
    : userAgent.includes('mobile');

export const firefoxVersion = (() => {
  const m = userAgent.match(/(?:firefox|librewolf)(?:\/| )([^ ]+)/);
  if (m && m[1]) {
    return m[1];
  }
  return '';
})();
