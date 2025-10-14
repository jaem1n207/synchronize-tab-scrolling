import { useEffect, useCallback } from 'react';

export interface KeyboardShortcut {
  key: string;
  /** Use Ctrl on Windows/Linux OR Cmd on macOS */
  mod?: boolean;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  handler: (event: KeyboardEvent) => void;
  preventDefault?: boolean;
  enabled?: boolean;
}

/**
 * Custom hook for registering keyboard shortcuts
 * @param shortcuts - Array of keyboard shortcut configurations
 * @param dependencies - Dependencies for the effect
 */
export function useKeyboardShortcuts(
  shortcuts: Array<KeyboardShortcut>,
  dependencies: Array<unknown> = [],
): void {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      for (const shortcut of shortcuts) {
        // Skip if disabled
        if (shortcut.enabled === false) {
          continue;
        }

        // Check modifier key match
        let modMatch = true;
        if (shortcut.mod !== undefined) {
          // mod means Ctrl OR Cmd (depending on platform)
          modMatch = event.ctrlKey || event.metaKey;
        } else {
          // Check specific modifiers
          const ctrlMatch = shortcut.ctrl === undefined || event.ctrlKey === shortcut.ctrl;
          const metaMatch = shortcut.meta === undefined || event.metaKey === shortcut.meta;
          modMatch = ctrlMatch && metaMatch;
        }

        const shiftMatch = shortcut.shift === undefined || event.shiftKey === shortcut.shift;
        const altMatch = shortcut.alt === undefined || event.altKey === shortcut.alt;
        const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase();

        if (modMatch && shiftMatch && altMatch && keyMatch) {
          if (shortcut.preventDefault !== false) {
            event.preventDefault();
            event.stopPropagation();
          }
          shortcut.handler(event);
          return;
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shortcuts, ...dependencies],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

/**
 * Helper to check if Cmd (Mac) or Ctrl (Windows/Linux) is pressed
 */
export function isModifierKey(event: KeyboardEvent): boolean {
  return event.metaKey || event.ctrlKey;
}
