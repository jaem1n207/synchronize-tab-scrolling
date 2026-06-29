export type ContextualHintId =
  | 'start-minimum-tabs'
  | 'manual-scroll-adjustment'
  | 'page-change-synced'
  | 'keep-website-path-synced'
  | 'sync-suggestion'
  | 'add-tab-to-sync'
  | 'floating-panel';

export type ContextualHintSurface =
  | 'popup-inline'
  | 'webpage-overlay'
  | 'floating-panel-inline'
  | 'existing-toast';

export type ContextualHintAction = 'dismiss-temporary' | 'hide-permanently' | 'open-settings';

export interface ContextualHintDefinition {
  id: ContextualHintId;
  surface: ContextualHintSurface;
  dismissible: boolean;
}

export interface ContextualHintScrollMetrics {
  tabId: number;
  scrollHeight: number;
  clientHeight: number;
  scrollableHeight: number;
}

export interface ManualAdjustmentHintDecision {
  shouldShow: boolean;
  largestScrollableHeight: number;
  smallestScrollableHeight: number;
  absoluteDifference: number;
  ratio: number;
}

export interface ContextualHintShowMessage {
  hintId: ContextualHintId;
  surface: 'webpage-overlay' | 'floating-panel-inline';
  source: 'sync-start' | 'url-sync' | 'panel-open';
}

export interface ContextualHintActionMessage {
  hintId: ContextualHintId;
  action: ContextualHintAction;
}
