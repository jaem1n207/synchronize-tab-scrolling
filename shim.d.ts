import type { ContextualHintShowMessage } from '~/shared/types/contextual-hints';
import type {
  AddTabToSyncMessage,
  AddTabToSyncResponseMessage,
  AutoStartSyncContentMessage,
  AutoSyncGroupUpdatedMessage,
  AutoSyncStatusChangedMessage,
  ConsumePendingUrlSyncContextualHintMessage,
  ConsumePendingUrlSyncContextualHintResponse,
  ContentRuntimeDegradedMessage,
  ContentRuntimeDegradedResponse,
  DismissAddTabToastMessage,
  DismissSyncSuggestionToastMessage,
  ElementMatchMessage,
  ExcludedDomainsChangedMessage,
  ManualScrollMessage,
  ManualStartSyncContentMessage,
  PanelPositionMessage,
  ReconnectManualSessionResponse,
  RuntimeRelayResponse,
  ScrollPingMessage,
  ScrollReconnectMessage,
  ScrollRequestReinjectMessage,
  ScrollSyncMessage,
  SavePendingUrlSyncContextualHintMessage,
  SavePendingUrlSyncContextualHintResponse,
  StartSyncBackgroundResponse,
  StartSyncContentResponse,
  StartSyncMessage,
  StopSyncMessage,
  StopSyncResponse,
  SyncBaselineUpdateMessage,
  SyncSuggestionDecisionResponse,
  SyncSuggestionMessage,
  SyncSuggestionResponseMessage,
  TranslatedPageMetadataRequestMessage,
  TranslatedPageMetadataResponseMessage,
  UrlSyncEnabledChangedMessage,
  UrlSyncMessage,
  UrlSyncModeChangedMessage,
  UrlSyncResponse,
} from '~/shared/types/messages';
import type {
  DismissQuickSyncRecentOutcomeMessage,
  DismissQuickSyncRecentOutcomeResponse,
  QuickSyncFeedbackMessage,
  QuickSyncFeedbackResponse,
} from '~/shared/types/quick-sync';
import type {
  ContentSyncStatusRequestMessage,
  PopupSyncStatusRequestMessage,
  ReconnectManualSessionMessage,
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
      StartSyncMessage | ManualStartSyncContentMessage | AutoStartSyncContentMessage,
      StartSyncContentResponse | StartSyncBackgroundResponse
    >;
    'scroll:stop': ProtocolWithReturn<StopSyncMessage, StopSyncResponse>;
    'scroll:sync': ProtocolWithReturn<ScrollSyncMessage, RuntimeRelayResponse>;
    'scroll:manual': ProtocolWithReturn<ManualScrollMessage, RuntimeRelayResponse>;
    'scroll:baseline-update': ProtocolWithReturn<SyncBaselineUpdateMessage, unknown>;
    'scroll:ping': ProtocolWithReturn<ScrollPingMessage, unknown>;
    'scroll:reconnect': ProtocolWithReturn<ScrollReconnectMessage, unknown>;
    'scroll:request-reinject': ProtocolWithReturn<ScrollRequestReinjectMessage, unknown>;
    'sync:get-status': ProtocolWithReturn<
      PopupSyncStatusRequestMessage | ContentSyncStatusRequestMessage,
      SyncStatusResponseMessage
    >;
    'sync:reconnect-session': ProtocolWithReturn<
      ReconnectManualSessionMessage,
      ReconnectManualSessionResponse
    >;
    'url:sync': ProtocolWithReturn<UrlSyncMessage, UrlSyncResponse>;
    'sync:runtime-degraded': ProtocolWithReturn<
      ContentRuntimeDegradedMessage,
      ContentRuntimeDegradedResponse
    >;
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
