import type { ContextualHintShowMessage } from '~/shared/types/contextual-hints';
import type {
  AddTabToSyncMessage,
  AddTabToSyncResponseMessage,
  AutoSyncGroupUpdatedMessage,
  AutoSyncStatusChangedMessage,
  ConsumePendingUrlSyncContextualHintMessage,
  ConsumePendingUrlSyncContextualHintResponse,
  DismissAddTabToastMessage,
  DismissSyncSuggestionToastMessage,
  ElementMatchMessage,
  ExcludedDomainsChangedMessage,
  ManualScrollMessage,
  PanelPositionMessage,
  ReconnectManualSessionResponse,
  ScrollPingMessage,
  ScrollReconnectMessage,
  ScrollRequestReinjectMessage,
  ScrollSyncMessage,
  SavePendingUrlSyncContextualHintMessage,
  SavePendingUrlSyncContextualHintResponse,
  StartSyncContentMessage,
  StartSyncMessage,
  StartSyncResponse,
  StopSyncMessage,
  StopSyncResponse,
  SyncBaselineUpdateMessage,
  SyncStatusBroadcastMessage,
  SyncSuggestionDecisionResponse,
  SyncSuggestionMessage,
  SyncSuggestionResponseMessage,
  TranslatedPageMetadataRequestMessage,
  TranslatedPageMetadataResponseMessage,
  UrlSyncEnabledChangedMessage,
  UrlSyncMessage,
  UrlSyncModeChangedMessage,
} from '~/shared/types/messages';
import type {
  DismissQuickSyncRecentOutcomeMessage,
  DismissQuickSyncRecentOutcomeResponse,
  QuickSyncFeedbackMessage,
  QuickSyncFeedbackResponse,
} from '~/shared/types/quick-sync';
import type {
  ReconnectManualSessionMessage,
  SyncStatusRequestMessage,
  SyncStatusResponseMessage,
} from '~/shared/types/sync-session';

import type { AttributifyAttributes } from 'unocss/preset-attributify';
import type { ProtocolWithReturn } from 'webext-bridge';

declare module 'react' {
  type HTMLAttributes = Omit<AttributifyAttributes, 'size'>;
}

declare module 'webext-bridge' {
  export interface ProtocolMap {
    'scroll:start': ProtocolWithReturn<
      StartSyncMessage | StartSyncContentMessage,
      StartSyncResponse
    >;
    'scroll:stop': ProtocolWithReturn<StopSyncMessage, StopSyncResponse>;
    'scroll:sync': ProtocolWithReturn<ScrollSyncMessage, unknown>;
    'scroll:manual': ProtocolWithReturn<ManualScrollMessage, unknown>;
    'scroll:baseline-update': ProtocolWithReturn<SyncBaselineUpdateMessage, unknown>;
    'scroll:ping': ProtocolWithReturn<ScrollPingMessage, unknown>;
    'scroll:reconnect': ProtocolWithReturn<ScrollReconnectMessage, unknown>;
    'scroll:request-reinject': ProtocolWithReturn<ScrollRequestReinjectMessage, unknown>;
    'sync:status': SyncStatusBroadcastMessage;
    'sync:get-status': ProtocolWithReturn<SyncStatusRequestMessage, SyncStatusResponseMessage>;
    'sync:reconnect-session': ProtocolWithReturn<
      ReconnectManualSessionMessage,
      ReconnectManualSessionResponse
    >;
    'url:sync': ProtocolWithReturn<UrlSyncMessage, unknown>;
    'element:match': ElementMatchMessage;
    'panel:position': PanelPositionMessage;
    'sync:url-enabled-changed': ProtocolWithReturn<UrlSyncEnabledChangedMessage, unknown>;
    'sync:url-mode-changed': ProtocolWithReturn<UrlSyncModeChangedMessage, unknown>;
    'auto-sync:status-changed': ProtocolWithReturn<AutoSyncStatusChangedMessage, unknown>;
    'auto-sync:group-updated': AutoSyncGroupUpdatedMessage;
    'auto-sync:get-status': ProtocolWithReturn<Record<string, never>, unknown>;
    'sync-suggestion:show': ProtocolWithReturn<SyncSuggestionMessage, unknown>;
    'sync-suggestion:response': ProtocolWithReturn<
      SyncSuggestionResponseMessage,
      SyncSuggestionDecisionResponse
    >;
    'translated-page:get-metadata': ProtocolWithReturn<
      TranslatedPageMetadataRequestMessage,
      TranslatedPageMetadataResponseMessage
    >;
    'sync-suggestion:add-tab': ProtocolWithReturn<AddTabToSyncMessage, unknown>;
    'sync-suggestion:add-tab-response': ProtocolWithReturn<
      AddTabToSyncResponseMessage,
      SyncSuggestionDecisionResponse
    >;
    'sync-suggestion:dismiss-add-tab': DismissAddTabToastMessage;
    'sync-suggestion:dismiss': DismissSyncSuggestionToastMessage;
    'auto-sync:excluded-domains-changed': ExcludedDomainsChangedMessage;
    'auto-sync:get-excluded-domains': ProtocolWithReturn<
      Record<string, never>,
      { domains: Array<string> }
    >;
    'contextual-hint:show': ProtocolWithReturn<ContextualHintShowMessage, unknown>;
    'contextual-hint:save-pending-url-sync': ProtocolWithReturn<
      SavePendingUrlSyncContextualHintMessage,
      SavePendingUrlSyncContextualHintResponse
    >;
    'contextual-hint:consume-pending-url-sync': ProtocolWithReturn<
      ConsumePendingUrlSyncContextualHintMessage,
      ConsumePendingUrlSyncContextualHintResponse
    >;
    'quick-sync:feedback': ProtocolWithReturn<QuickSyncFeedbackMessage, QuickSyncFeedbackResponse>;
    'quick-sync:dismiss-recent-outcome': ProtocolWithReturn<
      DismissQuickSyncRecentOutcomeMessage,
      DismissQuickSyncRecentOutcomeResponse
    >;
  }
}

declare global {
  interface Document {
    /**
     * 비표준 기능을 사용합니다.
     * @see https://developer.mozilla.org/docs/Web/API/Document/startViewTransition
     */
    startViewTransition(updateCallback: () => Promise<void> | void): ViewTransition;
  }

  interface ViewTransition {
    finished: Promise<void>;
    ready: Promise<void>;
    updateCallbackDone: Promise<void>;
    skipTransition(): void;
  }
}
