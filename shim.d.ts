import type { JsonValue } from 'type-fest';
import type { AttributifyAttributes } from 'unocss/preset-attributify';
import type { ProtocolWithReturn } from 'webext-bridge';

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

declare module 'react' {
  type HTMLAttributes = Omit<AttributifyAttributes, 'size'>;
}

declare module 'webext-bridge' {
  export interface ProtocolMap {
    'scroll:start': ProtocolWithReturn<StartSyncMessage, JsonValue>;
    'scroll:stop': ProtocolWithReturn<StopSyncMessage, JsonValue>;
    'scroll:sync': ProtocolWithReturn<ScrollSyncMessage, JsonValue>;
    'scroll:manual': ProtocolWithReturn<ManualScrollMessage, JsonValue>;
    'scroll:baseline-update': SyncBaselineUpdateMessage;
    'scroll:ping': ProtocolWithReturn<ScrollPingMessage, JsonValue>;
    'scroll:reconnect': ProtocolWithReturn<ScrollReconnectMessage, JsonValue>;
    'scroll:request-reinject': ProtocolWithReturn<ScrollRequestReinjectMessage, JsonValue>;
    'sync:status': SyncStatusBroadcastMessage;
    'url:sync': ProtocolWithReturn<UrlSyncMessage, JsonValue>;
    'element:match': ElementMatchMessage;
    'panel:position': PanelPositionMessage;
    'sync:url-enabled-changed': ProtocolWithReturn<UrlSyncEnabledChangedMessage, JsonValue>;
    'auto-sync:status-changed': ProtocolWithReturn<AutoSyncStatusChangedMessage, JsonValue>;
    'auto-sync:group-updated': AutoSyncGroupUpdatedMessage;
    'auto-sync:get-status': ProtocolWithReturn<JsonValue, JsonValue>;
    'sync-suggestion:show': ProtocolWithReturn<SyncSuggestionMessage, JsonValue>;
    'sync-suggestion:response': ProtocolWithReturn<SyncSuggestionResponseMessage, JsonValue>;
    'sync-suggestion:add-tab': ProtocolWithReturn<AddTabToSyncMessage, JsonValue>;
    'sync-suggestion:add-tab-response': ProtocolWithReturn<AddTabToSyncResponseMessage, JsonValue>;
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
