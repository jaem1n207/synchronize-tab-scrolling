import { getPlatform } from '~/shared/lib/platform';
import type { Platform } from '~/shared/lib/platform';

export function usePlatform(): Platform {
  const platform = useMemo(() => getPlatform(), []);
  return platform;
}

export function useModifierKey(): { name: string; symbol: string } {
  const platform = usePlatform();
  return useMemo(() => {
    if (platform === 'macos') {
      return { name: 'Option', symbol: '⌥' };
    }
    return { name: 'Alt', symbol: 'Alt' };
  }, [platform]);
}
