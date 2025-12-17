import type { AttributifyAttributes } from 'unocss/preset-attributify';
import type { ProtocolWithReturn } from 'webext-bridge';

declare module 'react' {
  type HTMLAttributes = Omit<AttributifyAttributes, 'size'>;
}

declare module 'webext-bridge' {
  export interface ProtocolMap {
    // 스크롤 동기화 프로토콜
    SCROLL_UPDATE: {
      scrollPosition: {
        scrollTop: number;
        scrollHeight: number;
        clientHeight: number;
        scrollPercentage: number;
        timestamp: number;
        sections?: Array<{
          id: string;
          type: 'heading' | 'paragraph' | 'section';
          level?: 1 | 2 | 3 | 4 | 5 | 6;
          text: string;
          position: number;
          height: number;
        }>;
      };
      tabId: number;
      syncGroupId: string;
    };

    START_SYNC: ProtocolWithReturn<
      {
        tabIds: number[];
        options: {
          urlSyncEnabled: boolean;
          keyboardModifier: 'alt' | 'ctrl' | 'shift' | null;
          smoothScroll: boolean;
          contentMatching: boolean;
        };
        syncGroupId?: string;
        currentTabId?: number;
      },
      {
        success: boolean;
        groupId?: string;
      }
    >;

    STOP_SYNC: ProtocolWithReturn<
      {
        syncGroupId: string;
      },
      {
        success: boolean;
      }
    >;

    GET_SYNC_STATUS: ProtocolWithReturn<
      undefined,
      {
        groups: Array<{
          id: string;
          tabIds: number[];
          createdAt: number;
          isActive: boolean;
          options: {
            urlSyncEnabled: boolean;
            keyboardModifier: 'alt' | 'ctrl' | 'shift' | null;
            smoothScroll: boolean;
            contentMatching: boolean;
          };
        }>;
        activeTabs: number[];
      }
    >;

    GET_SCROLL_POSITION: ProtocolWithReturn<
      {
        tabId?: number;
      },
      {
        scrollTop: number;
        scrollHeight: number;
        clientHeight: number;
        scrollPercentage: number;
        timestamp: number;
        sections?: Array<{
          id: string;
          type: 'heading' | 'paragraph' | 'section';
          level?: 1 | 2 | 3 | 4 | 5 | 6;
          text: string;
          position: number;
          height: number;
        }>;
      }
    >;

    SET_SCROLL_POSITION: {
      position: {
        scrollTop: number;
        scrollHeight: number;
        clientHeight: number;
        scrollPercentage: number;
        timestamp: number;
        sections?: Array<{
          id: string;
          type: 'heading' | 'paragraph' | 'section';
          level?: 1 | 2 | 3 | 4 | 5 | 6;
          text: string;
          position: number;
          height: number;
        }>;
      };
      smooth: boolean;
      tabId: number;
    };

    CONTENT_ANALYSIS: {
      sections: Array<{
        id: string;
        type: 'heading' | 'paragraph' | 'section';
        level?: 1 | 2 | 3 | 4 | 5 | 6;
        text: string;
        position: number;
        height: number;
      }>;
      tabId: number;
    };

    URL_CHANGED: {
      tabId: number;
      oldUrl: string;
      newUrl: string;
      syncGroupId: string;
    };

    TAB_ACTIVATED: {
      tabId: number;
    };

    // Legacy scroll sync protocols
    'scroll:start': ProtocolWithReturn<
      {
        tabIds: number[];
        mode: string;
        currentTabId: number;
        isAutoSync?: boolean;
      },
      {
        success: boolean;
        connectedTabs: number[];
        connectionResults: Record<number, { success: boolean; error?: string }>;
        error?: string;
      }
    >;

    'scroll:stop': ProtocolWithReturn<
      {
        tabIds?: number[];
        isAutoSync?: boolean;
      },
      {
        success: boolean;
      }
    >;

    'scroll:sync': ProtocolWithReturn<
      {
        scrollTop: number;
        scrollHeight: number;
        clientHeight: number;
        sourceTabId: number;
        mode: string;
        timestamp: number;
      },
      {
        success: boolean;
      }
    >;

    'scroll:manual': ProtocolWithReturn<
      {
        tabId: number;
        enabled: boolean;
      },
      {
        success: boolean;
      }
    >;

    'scroll:ping': ProtocolWithReturn<
      {
        tabId: number;
        timestamp: number;
      },
      {
        success: boolean;
        timestamp: number;
        tabId: number;
        isSyncActive?: boolean;
      }
    >;

    'scroll:reconnect': ProtocolWithReturn<
      {
        tabId: number;
        timestamp: number;
      },
      {
        success: boolean;
        reason?: string;
      }
    >;

    'scroll:request-reinject': ProtocolWithReturn<
      {
        tabId: number;
      },
      {
        success: boolean;
        reason?: string;
      }
    >;

    'sync:status': {
      linkedTabs: Array<{
        id: number;
        title: string;
        url: string;
        favIconUrl?: string;
        eligible: boolean;
      }>;
      connectionStatuses: Record<number, 'connected' | 'disconnected' | 'error'>;
      currentTabId: number;
    };

    'sync:get-status': ProtocolWithReturn<
      Record<string, never>,
      {
        success: boolean;
        isActive: boolean;
        linkedTabs: Array<{
          id: number;
          title: string;
          url: string;
          favIconUrl?: string;
          eligible: boolean;
        }>;
        connectedTabs?: number[];
        connectionStatuses: Record<number, 'connected' | 'disconnected' | 'error'>;
        currentTabId?: number;
      }
    >;

    'url:sync': ProtocolWithReturn<
      {
        url: string;
        sourceTabId: number;
      },
      {
        success: boolean;
      }
    >;

    'sync:url-enabled-changed': ProtocolWithReturn<
      {
        enabled: boolean;
      },
      {
        success: boolean;
      }
    >;

    'auto-sync:status-changed': ProtocolWithReturn<
      {
        enabled: boolean;
      },
      {
        success: boolean;
        enabled: boolean;
      }
    >;

    'auto-sync:get-status': ProtocolWithReturn<
      undefined,
      {
        success: boolean;
        enabled: boolean;
        groups: Array<{
          normalizedUrl: string;
          tabIds: number[];
          isActive: boolean;
        }>;
      }
    >;

    'auto-sync:get-detailed-status': ProtocolWithReturn<
      Record<string, never>,
      {
        success: boolean;
        enabled: boolean;
        activeGroupCount: number;
        totalSyncedTabs: number;
        potentialSyncTabs: number;
        currentTabGroup?: {
          normalizedUrl: string;
          tabCount: number;
          isActive: boolean;
        };
      }
    >;

    'auto-sync:group-updated': {
      groups: Array<{
        normalizedUrl: string;
        tabIds: number[];
        isActive: boolean;
      }>;
    };

    'sync-suggestion:show': ProtocolWithReturn<
      {
        normalizedUrl: string;
        tabCount: number;
        tabIds: number[];
        tabTitles: string[];
      },
      {
        success: boolean;
      }
    >;

    'sync-suggestion:response': ProtocolWithReturn<
      {
        normalizedUrl: string;
        accepted: boolean;
      },
      {
        success: boolean;
      }
    >;

    'sync-suggestion:add-tab': ProtocolWithReturn<
      {
        tabId: number;
        tabTitle: string;
        hasManualOffsets: boolean;
        normalizedUrl: string;
      },
      {
        success: boolean;
      }
    >;

    'sync-suggestion:add-tab-response': ProtocolWithReturn<
      {
        tabId: number;
        accepted: boolean;
      },
      {
        success: boolean;
        error?: string;
      }
    >;

    'sync-suggestion:dismiss': {
      normalizedUrl: string;
    };

    'sync-suggestion:dismiss-add-tab': {
      tabId: number;
    };

    ping: Record<string, never>;
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
