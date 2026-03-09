import type {
  AddTabToSyncMessage,
  AddTabToSyncResponseMessage,
  AutoSyncGroupUpdatedMessage,
  AutoSyncStatusChangedMessage,
  DismissAddTabToastMessage,
  DismissSyncSuggestionToastMessage,
  ElementMatchMessage,
  ManualScrollMessage,
  PanelPositionMessage,
  ScrollPingMessage,
  ScrollReconnectMessage,
  ScrollRequestReinjectMessage,
  ScrollSyncMessage,
  StartSyncMessage,
  StopSyncMessage,
  SyncBaselineUpdateMessage,
  SyncStatusBroadcastMessage,
  SyncSuggestionMessage,
  SyncSuggestionResponseMessage,
  UrlSyncEnabledChangedMessage,
  UrlSyncMessage,
} from '~/shared/types/messages';

import type { AttributifyAttributes } from 'unocss/preset-attributify';
import type { ProtocolWithReturn } from 'webext-bridge';

declare module 'react' {
  type HTMLAttributes = Omit<AttributifyAttributes, 'size'>;
}

declare module 'webext-bridge' {
  export interface ProtocolMap {
    'scroll:start': ProtocolWithReturn<StartSyncMessage, unknown>;
    'scroll:stop': ProtocolWithReturn<StopSyncMessage, unknown>;
    'scroll:sync': ProtocolWithReturn<ScrollSyncMessage, unknown>;
    'scroll:manual': ProtocolWithReturn<ManualScrollMessage, unknown>;
    'scroll:baseline-update': SyncBaselineUpdateMessage;
    'scroll:ping': ProtocolWithReturn<ScrollPingMessage, unknown>;
    'scroll:reconnect': ProtocolWithReturn<ScrollReconnectMessage, unknown>;
    'scroll:request-reinject': ProtocolWithReturn<ScrollRequestReinjectMessage, unknown>;
    'sync:status': SyncStatusBroadcastMessage;
    'url:sync': ProtocolWithReturn<UrlSyncMessage, unknown>;
    'element:match': ElementMatchMessage;
    'panel:position': PanelPositionMessage;
    'sync:url-enabled-changed': ProtocolWithReturn<UrlSyncEnabledChangedMessage, unknown>;
    'auto-sync:status-changed': ProtocolWithReturn<AutoSyncStatusChangedMessage, unknown>;
    'auto-sync:group-updated': AutoSyncGroupUpdatedMessage;
    'auto-sync:get-status': ProtocolWithReturn<Record<string, never>, unknown>;
    'sync-suggestion:show': ProtocolWithReturn<SyncSuggestionMessage, unknown>;
    'sync-suggestion:response': ProtocolWithReturn<SyncSuggestionResponseMessage, unknown>;
    'sync-suggestion:add-tab': ProtocolWithReturn<AddTabToSyncMessage, unknown>;
    'sync-suggestion:add-tab-response': ProtocolWithReturn<AddTabToSyncResponseMessage, unknown>;
    'sync-suggestion:dismiss-add-tab': DismissAddTabToastMessage;
    'sync-suggestion:dismiss': DismissSyncSuggestionToastMessage;
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
