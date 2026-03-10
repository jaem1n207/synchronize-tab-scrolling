import { describe, expect, it } from 'vitest';

import { isModifierKey } from './use-keyboard-shortcuts';

import type { KeyboardShortcut } from './use-keyboard-shortcuts';

function matchesShortcut(event: Partial<KeyboardEvent>, shortcut: KeyboardShortcut): boolean {
  if (shortcut.enabled === false) {
    return false;
  }

  let modMatch = true;
  if (shortcut.mod !== undefined) {
    modMatch = Boolean(event.ctrlKey) || Boolean(event.metaKey);
  } else {
    const ctrlMatch = shortcut.ctrl === undefined || event.ctrlKey === shortcut.ctrl;
    const metaMatch = shortcut.meta === undefined || event.metaKey === shortcut.meta;
    modMatch = ctrlMatch && metaMatch;
  }

  const shiftMatch = shortcut.shift === undefined || event.shiftKey === shortcut.shift;
  const altMatch = shortcut.alt === undefined || event.altKey === shortcut.alt;
  const keyMatch = (event.key || '').toLowerCase() === shortcut.key.toLowerCase();

  return modMatch && shiftMatch && altMatch && keyMatch;
}

describe('isModifierKey', () => {
  it('returns true when metaKey is pressed', () => {
    expect(isModifierKey({ metaKey: true, ctrlKey: false } as KeyboardEvent)).toBe(true);
  });

  it('returns true when ctrlKey is pressed', () => {
    expect(isModifierKey({ metaKey: false, ctrlKey: true } as KeyboardEvent)).toBe(true);
  });

  it('returns true when both metaKey and ctrlKey are pressed', () => {
    expect(isModifierKey({ metaKey: true, ctrlKey: true } as KeyboardEvent)).toBe(true);
  });

  it('returns false when neither modifier is pressed', () => {
    expect(isModifierKey({ metaKey: false, ctrlKey: false } as KeyboardEvent)).toBe(false);
  });
});

describe('shortcut matching logic', () => {
  const noop = () => {};

  describe('basic key matching', () => {
    it('matches exact key', () => {
      const shortcut: KeyboardShortcut = { key: 'a', handler: noop };
      expect(matchesShortcut({ key: 'a' }, shortcut)).toBe(true);
    });

    it('matches case-insensitively', () => {
      const shortcut: KeyboardShortcut = { key: 'A', handler: noop };
      expect(matchesShortcut({ key: 'a' }, shortcut)).toBe(true);
    });

    it('does not match different key', () => {
      const shortcut: KeyboardShortcut = { key: 'a', handler: noop };
      expect(matchesShortcut({ key: 'b' }, shortcut)).toBe(false);
    });
  });

  describe('mod modifier (Ctrl OR Cmd)', () => {
    it('matches when ctrlKey is pressed', () => {
      const shortcut: KeyboardShortcut = { key: 's', mod: true, handler: noop };
      expect(matchesShortcut({ key: 's', ctrlKey: true, metaKey: false }, shortcut)).toBe(true);
    });

    it('matches when metaKey is pressed', () => {
      const shortcut: KeyboardShortcut = { key: 's', mod: true, handler: noop };
      expect(matchesShortcut({ key: 's', ctrlKey: false, metaKey: true }, shortcut)).toBe(true);
    });

    it('does not match when no modifier is pressed', () => {
      const shortcut: KeyboardShortcut = { key: 's', mod: true, handler: noop };
      expect(matchesShortcut({ key: 's', ctrlKey: false, metaKey: false }, shortcut)).toBe(false);
    });
  });

  describe('specific modifier keys', () => {
    it('matches Ctrl requirement', () => {
      const shortcut: KeyboardShortcut = { key: 'c', ctrl: true, handler: noop };
      expect(matchesShortcut({ key: 'c', ctrlKey: true }, shortcut)).toBe(true);
    });

    it('rejects when Ctrl required but not pressed', () => {
      const shortcut: KeyboardShortcut = { key: 'c', ctrl: true, handler: noop };
      expect(matchesShortcut({ key: 'c', ctrlKey: false }, shortcut)).toBe(false);
    });

    it('matches Shift requirement', () => {
      const shortcut: KeyboardShortcut = { key: 'a', shift: true, handler: noop };
      expect(matchesShortcut({ key: 'a', shiftKey: true }, shortcut)).toBe(true);
    });

    it('rejects when Shift required but not pressed', () => {
      const shortcut: KeyboardShortcut = { key: 'a', shift: true, handler: noop };
      expect(matchesShortcut({ key: 'a', shiftKey: false }, shortcut)).toBe(false);
    });

    it('matches Alt requirement', () => {
      const shortcut: KeyboardShortcut = { key: 'x', alt: true, handler: noop };
      expect(matchesShortcut({ key: 'x', altKey: true }, shortcut)).toBe(true);
    });

    it('rejects when Alt required but not pressed', () => {
      const shortcut: KeyboardShortcut = { key: 'x', alt: true, handler: noop };
      expect(matchesShortcut({ key: 'x', altKey: false }, shortcut)).toBe(false);
    });

    it('matches Meta requirement', () => {
      const shortcut: KeyboardShortcut = { key: 'k', meta: true, handler: noop };
      expect(matchesShortcut({ key: 'k', metaKey: true }, shortcut)).toBe(true);
    });
  });

  describe('combined modifiers', () => {
    it('matches Ctrl+Shift+key', () => {
      const shortcut: KeyboardShortcut = {
        key: 'p',
        ctrl: true,
        shift: true,
        handler: noop,
      };
      expect(matchesShortcut({ key: 'p', ctrlKey: true, shiftKey: true }, shortcut)).toBe(true);
    });

    it('rejects Ctrl+Shift+key when only Ctrl is pressed', () => {
      const shortcut: KeyboardShortcut = {
        key: 'p',
        ctrl: true,
        shift: true,
        handler: noop,
      };
      expect(matchesShortcut({ key: 'p', ctrlKey: true, shiftKey: false }, shortcut)).toBe(false);
    });

    it('matches mod+alt+key (Ctrl+Alt or Cmd+Alt)', () => {
      const shortcut: KeyboardShortcut = { key: 'd', mod: true, alt: true, handler: noop };
      expect(matchesShortcut({ key: 'd', ctrlKey: true, altKey: true }, shortcut)).toBe(true);
    });
  });

  describe('enabled/disabled', () => {
    it('does not match when explicitly disabled', () => {
      const shortcut: KeyboardShortcut = { key: 'a', enabled: false, handler: noop };
      expect(matchesShortcut({ key: 'a' }, shortcut)).toBe(false);
    });

    it('matches when enabled is true', () => {
      const shortcut: KeyboardShortcut = { key: 'a', enabled: true, handler: noop };
      expect(matchesShortcut({ key: 'a' }, shortcut)).toBe(true);
    });

    it('matches when enabled is undefined (default enabled)', () => {
      const shortcut: KeyboardShortcut = { key: 'a', handler: noop };
      expect(matchesShortcut({ key: 'a' }, shortcut)).toBe(true);
    });
  });

  describe('undefined modifiers are ignored', () => {
    it('matches regardless of ctrlKey when ctrl is undefined', () => {
      const shortcut: KeyboardShortcut = { key: 'a', handler: noop };
      expect(matchesShortcut({ key: 'a', ctrlKey: true }, shortcut)).toBe(true);
      expect(matchesShortcut({ key: 'a', ctrlKey: false }, shortcut)).toBe(true);
    });

    it('matches regardless of shiftKey when shift is undefined', () => {
      const shortcut: KeyboardShortcut = { key: 'a', handler: noop };
      expect(matchesShortcut({ key: 'a', shiftKey: true }, shortcut)).toBe(true);
      expect(matchesShortcut({ key: 'a', shiftKey: false }, shortcut)).toBe(true);
    });

    it('matches regardless of altKey when alt is undefined', () => {
      const shortcut: KeyboardShortcut = { key: 'a', handler: noop };
      expect(matchesShortcut({ key: 'a', altKey: true }, shortcut)).toBe(true);
      expect(matchesShortcut({ key: 'a', altKey: false }, shortcut)).toBe(true);
    });
  });
});
