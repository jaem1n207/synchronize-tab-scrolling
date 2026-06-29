import { describe, expect, it } from 'vitest';

import {
  CONTEXTUAL_HINT_REGISTRY,
  getContextualHintShortcutLabel,
  getManualAdjustmentHintDecision,
  isContextualHintId,
} from './contextual-hints';

describe('contextual hints', () => {
  it('defines every contextual hint with a stable surface', () => {
    expect(CONTEXTUAL_HINT_REGISTRY['manual-scroll-adjustment']).toMatchObject({
      id: 'manual-scroll-adjustment',
      surface: 'webpage-overlay',
      dismissible: true,
    });
    expect(CONTEXTUAL_HINT_REGISTRY['page-change-synced']).toMatchObject({
      id: 'page-change-synced',
      surface: 'webpage-overlay',
      dismissible: true,
    });
    expect(CONTEXTUAL_HINT_REGISTRY['add-tab-to-sync']).toMatchObject({
      id: 'add-tab-to-sync',
      surface: 'existing-toast',
      dismissible: true,
    });
  });

  it('validates known hint ids', () => {
    expect(isContextualHintId('manual-scroll-adjustment')).toBe(true);
    expect(isContextualHintId('page-change-synced')).toBe(true);
    expect(isContextualHintId('unknown-hint')).toBe(false);
    expect(isContextualHintId('toString')).toBe(false);
    expect(isContextualHintId('constructor')).toBe(false);
  });

  it('shows manual hint when scrollable heights cross the relaxed ratio and pixel thresholds', () => {
    const decision = getManualAdjustmentHintDecision([
      { tabId: 1, scrollHeight: 2000, clientHeight: 1000, scrollableHeight: 1000 },
      { tabId: 2, scrollHeight: 2120, clientHeight: 1000, scrollableHeight: 1120 },
    ]);

    expect(decision).toEqual({
      shouldShow: true,
      largestScrollableHeight: 1120,
      smallestScrollableHeight: 1000,
      absoluteDifference: 120,
      ratio: 1.12,
    });
  });

  it('skips manual hint when only ratio threshold passes', () => {
    expect(
      getManualAdjustmentHintDecision([
        { tabId: 1, scrollHeight: 1050, clientHeight: 1000, scrollableHeight: 50 },
        { tabId: 2, scrollHeight: 1056, clientHeight: 1000, scrollableHeight: 56 },
      ]).shouldShow,
    ).toBe(false);
  });

  it('skips manual hint when only pixel threshold passes', () => {
    expect(
      getManualAdjustmentHintDecision([
        { tabId: 1, scrollHeight: 3000, clientHeight: 1000, scrollableHeight: 2000 },
        { tabId: 2, scrollHeight: 3100, clientHeight: 1000, scrollableHeight: 2100 },
      ]).shouldShow,
    ).toBe(false);
  });

  it('ignores zero-height tabs before evaluating the threshold', () => {
    expect(
      getManualAdjustmentHintDecision([
        { tabId: 1, scrollHeight: 1000, clientHeight: 1000, scrollableHeight: 0 },
        { tabId: 2, scrollHeight: 2600, clientHeight: 1000, scrollableHeight: 1600 },
      ]).shouldShow,
    ).toBe(false);
  });

  it('returns OS-specific manual shortcut labels', () => {
    expect(getContextualHintShortcutLabel('macos')).toBe('⌥ Option');
    expect(getContextualHintShortcutLabel('windows')).toBe('Alt');
    expect(getContextualHintShortcutLabel('linux')).toBe('Alt');
    expect(getContextualHintShortcutLabel('unknown')).toBe('Alt 또는 Option');
  });
});
