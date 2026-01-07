/**
 * Platform detection utility for cross-platform keyboard shortcut display
 */

export type Platform = 'macos' | 'windows' | 'linux' | 'unknown';

/**
 * Detects the user's operating system platform
 * Uses User-Agent Client Hints API (Chromium) with userAgent fallback (all browsers)
 * @returns Platform identifier
 */
export function getPlatform(): Platform {
  // Try modern User-Agent Client Hints API first (Chromium browsers)
  const { userAgentData } = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };

  if (userAgentData?.platform) {
    const platform = userAgentData.platform.toLowerCase();

    // User-Agent Client Hints provides standardized platform names
    const macPlatforms = ['macos', 'mac'];
    if (macPlatforms.includes(platform)) {
      return 'macos';
    }
    if (platform === 'windows') {
      return 'windows';
    }
    if (platform === 'linux') {
      return 'linux';
    }
  }

  // Fallback: parse userAgent string (works in all browsers including Firefox)
  const userAgent = navigator.userAgent.toLowerCase();

  // macOS/iOS detection - multiple indicators for accuracy
  const macIndicators = [
    'mac os x',
    'macintosh',
    'macintel',
    'macppc',
    'mac68k',
    'darwin',
    'iphone',
    'ipad',
    'ipod',
  ];
  if (macIndicators.some((indicator) => userAgent.includes(indicator))) {
    return 'macos';
  }

  // Windows detection - comprehensive pattern matching
  const windowsIndicators = ['windows', 'win64', 'win32', 'wince'];
  if (
    windowsIndicators.some((indicator) => userAgent.includes(indicator)) ||
    /windows nt \d+\.\d+/.test(userAgent)
  ) {
    return 'windows';
  }

  // Linux detection - multiple indicators, exclude Android and Chrome OS
  const linuxIndicators = ['linux', 'x11', 'ubuntu', 'debian', 'fedora', 'suse', 'gentoo', 'arch'];
  const linuxExclusions = ['android', 'cros'];

  if (
    linuxIndicators.some((indicator) => userAgent.includes(indicator)) &&
    !linuxExclusions.some((exclusion) => userAgent.includes(exclusion))
  ) {
    return 'linux';
  }

  return 'unknown';
}

/**
 * Checks if the current platform is macOS
 * @returns true if running on macOS
 */
export function isMac(): boolean {
  return getPlatform() === 'macos';
}

/**
 * Checks if the current platform is Windows
 * @returns true if running on Windows
 */
export function isWindows(): boolean {
  return getPlatform() === 'windows';
}

/**
 * Checks if the current platform is Linux
 * @returns true if running on Linux
 */
export function isLinux(): boolean {
  return getPlatform() === 'linux';
}
