import { getPlatform, type Platform } from './platform';

import type {
  ContextualHintDefinition,
  ContextualHintId,
  ContextualHintScrollMetrics,
  ManualAdjustmentHintDecision,
} from '../types/contextual-hints';

export const MANUAL_HINT_MIN_SCROLLABLE_RATIO = 1.1;
export const MANUAL_HINT_MIN_SCROLLABLE_DELTA_PX = 100;

export const CONTEXTUAL_HINT_REGISTRY: Record<ContextualHintId, ContextualHintDefinition> = {
  'start-minimum-tabs': {
    id: 'start-minimum-tabs',
    surface: 'popup-inline',
    dismissible: false,
  },
  'manual-scroll-adjustment': {
    id: 'manual-scroll-adjustment',
    surface: 'webpage-overlay',
    dismissible: true,
  },
  'page-change-synced': {
    id: 'page-change-synced',
    surface: 'webpage-overlay',
    dismissible: true,
  },
  'keep-website-path-synced': {
    id: 'keep-website-path-synced',
    surface: 'webpage-overlay',
    dismissible: true,
  },
  'sync-suggestion': {
    id: 'sync-suggestion',
    surface: 'existing-toast',
    dismissible: true,
  },
  'add-tab-to-sync': {
    id: 'add-tab-to-sync',
    surface: 'existing-toast',
    dismissible: true,
  },
  'floating-panel': {
    id: 'floating-panel',
    surface: 'floating-panel-inline',
    dismissible: true,
  },
};

export function isContextualHintId(value: unknown): value is ContextualHintId {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(CONTEXTUAL_HINT_REGISTRY, value)
  );
}

export function getContextualHintShortcutLabel(platform: Platform = getPlatform()): string {
  if (platform === 'macos') {
    return '⌥ Option';
  }

  if (platform === 'windows' || platform === 'linux') {
    return 'Alt';
  }

  return 'Alt 또는 Option';
}

export function getManualAdjustmentHintDecision(
  metrics: ReadonlyArray<ContextualHintScrollMetrics>,
): ManualAdjustmentHintDecision {
  const scrollableHeights = metrics
    .map((metric) => metric.scrollableHeight)
    .filter((height) => Number.isFinite(height) && height > 0)
    .sort((first, second) => first - second);

  if (scrollableHeights.length < 2) {
    return {
      shouldShow: false,
      largestScrollableHeight: 0,
      smallestScrollableHeight: 0,
      absoluteDifference: 0,
      ratio: 0,
    };
  }

  const smallestScrollableHeight = scrollableHeights[0];
  const largestScrollableHeight = scrollableHeights[scrollableHeights.length - 1];
  const absoluteDifference = largestScrollableHeight - smallestScrollableHeight;
  const ratio = largestScrollableHeight / smallestScrollableHeight;

  return {
    shouldShow:
      ratio >= MANUAL_HINT_MIN_SCROLLABLE_RATIO &&
      absoluteDifference >= MANUAL_HINT_MIN_SCROLLABLE_DELTA_PX,
    largestScrollableHeight,
    smallestScrollableHeight,
    absoluteDifference,
    ratio,
  };
}
