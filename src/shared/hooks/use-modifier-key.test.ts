import { describe, expect, it } from 'vitest';

import type { Platform } from '../lib/platform';

function getModifierKeys(platform: Platform) {
  return {
    modKey: platform === 'macos' ? '⌘' : 'Ctrl',
    shiftKey: '⇧',
    altKey: platform === 'macos' ? '⌥' : 'Alt',
    controlKey: platform === 'macos' ? '⌃' : 'Ctrl',
  };
}

describe('modifier key mapping logic', () => {
  describe('macOS', () => {
    it('returns macOS-specific modifier symbols', () => {
      const keys = getModifierKeys('macos');
      expect(keys.modKey).toBe('⌘');
      expect(keys.shiftKey).toBe('⇧');
      expect(keys.altKey).toBe('⌥');
      expect(keys.controlKey).toBe('⌃');
    });
  });

  describe('Windows', () => {
    it('returns Windows-specific modifier names', () => {
      const keys = getModifierKeys('windows');
      expect(keys.modKey).toBe('Ctrl');
      expect(keys.shiftKey).toBe('⇧');
      expect(keys.altKey).toBe('Alt');
      expect(keys.controlKey).toBe('Ctrl');
    });
  });

  describe('Linux', () => {
    it('returns Linux modifier names (same as Windows)', () => {
      const keys = getModifierKeys('linux');
      expect(keys.modKey).toBe('Ctrl');
      expect(keys.shiftKey).toBe('⇧');
      expect(keys.altKey).toBe('Alt');
      expect(keys.controlKey).toBe('Ctrl');
    });
  });

  describe('unknown platform', () => {
    it('returns non-macOS modifier names', () => {
      const keys = getModifierKeys('unknown');
      expect(keys.modKey).toBe('Ctrl');
      expect(keys.altKey).toBe('Alt');
      expect(keys.controlKey).toBe('Ctrl');
    });
  });

  describe('shift key is platform-independent', () => {
    it('always returns ⇧ for shift regardless of platform', () => {
      const platforms: Platform[] = ['macos', 'windows', 'linux', 'unknown'];
      for (const platform of platforms) {
        expect(getModifierKeys(platform).shiftKey).toBe('⇧');
      }
    });
  });

  describe('macOS is the only platform with distinct symbols', () => {
    it('non-macOS platforms all return the same values', () => {
      const nonMacPlatforms: Platform[] = ['windows', 'linux', 'unknown'];
      const firstResult = getModifierKeys(nonMacPlatforms[0]);

      for (const platform of nonMacPlatforms.slice(1)) {
        expect(getModifierKeys(platform)).toEqual(firstResult);
      }
    });

    it('macOS differs from non-macOS for modKey, altKey, and controlKey', () => {
      const macKeys = getModifierKeys('macos');
      const winKeys = getModifierKeys('windows');

      expect(macKeys.modKey).not.toBe(winKeys.modKey);
      expect(macKeys.altKey).not.toBe(winKeys.altKey);
      expect(macKeys.controlKey).not.toBe(winKeys.controlKey);
    });
  });
});
