import { useMemo } from 'react';

import { getPlatform } from '~/shared/lib/platform';

export interface ModifierKeys {
  /** Primary modifier key: ⌘ on macOS, Ctrl on Windows/Linux */
  modKey: string;
  /** Shift key symbol (same across all platforms) */
  shiftKey: string;
  /** Alt/Option key: ⌥ on macOS, Alt on Windows/Linux */
  altKey: string;
  /** Control key: ⌃ on macOS, Ctrl on Windows/Linux */
  controlKey: string;
}

/**
 * Custom hook that returns OS-appropriate keyboard modifier key symbols
 * for display in UI components.
 *
 * @returns Object containing platform-specific modifier key symbols
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { modKey } = useModifierKey();
 *   return <Kbd>{modKey}</Kbd>; // Shows ⌘ on Mac, Ctrl on Windows/Linux
 * }
 * ```
 */
export function useModifierKey(): ModifierKeys {
  return useMemo(() => {
    const platform = getPlatform();

    return {
      modKey: platform === 'macos' ? '⌘' : 'Ctrl',
      shiftKey: '⇧',
      altKey: platform === 'macos' ? '⌥' : 'Alt',
      controlKey: platform === 'macos' ? '⌃' : 'Ctrl',
    };
  }, []);
}
