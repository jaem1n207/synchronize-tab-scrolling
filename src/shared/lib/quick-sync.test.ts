import { describe, expect, it } from 'vitest';

import {
  getQuickSyncPortName,
  getQuickSyncRemainingSeconds,
  parseQuickSyncPortGeneration,
  toQuickSyncShortcutLabel,
} from './quick-sync';

describe('getQuickSyncRemainingSeconds', () => {
  it.each([
    { now: 1_000, expiresAt: 11_000, expected: 10 },
    { now: 1_001, expiresAt: 11_000, expected: 10 },
    { now: 10_000, expiresAt: 11_000, expected: 1 },
    { now: 11_000, expiresAt: 11_000, expected: null },
  ])('returns $expected for $now → $expiresAt', ({ now, expiresAt, expected }) => {
    expect(getQuickSyncRemainingSeconds(now, expiresAt)).toBe(expected);
  });
});

describe('toQuickSyncShortcutLabel', () => {
  it('formats the macOS browser assignment', () => {
    expect(toQuickSyncShortcutLabel('Command+Shift+Period', 'mac')).toBe('⌘ ⇧ .');
  });

  it('formats the Windows and Linux browser assignment', () => {
    expect(toQuickSyncShortcutLabel('Ctrl+Shift+Period', 'other')).toBe('Ctrl ⇧ .');
  });

  it('preserves browser tokens it does not recognize', () => {
    expect(toQuickSyncShortcutLabel('Alt+MediaPlayPause', 'other')).toBe('Alt MediaPlayPause');
  });
});

describe('Quick Sync Port names', () => {
  it('round-trips a safe generation', () => {
    expect(parseQuickSyncPortGeneration(getQuickSyncPortName(12))).toBe(12);
  });

  it.each([
    'quick-sync-candidate:',
    'quick-sync-candidate:-1',
    'quick-sync-candidate:1.5',
    'other:12',
  ])('rejects %s', (name) => {
    expect(parseQuickSyncPortGeneration(name)).toBeNull();
  });
});
