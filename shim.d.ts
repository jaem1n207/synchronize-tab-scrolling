import type { AttributifyAttributes } from 'unocss/preset-attributify';
import type { ProtocolWithReturn } from 'webext-bridge';

declare module 'react' {
  type HTMLAttributes = Omit<AttributifyAttributes, 'size'>;
}

declare module 'webext-bridge' {
  export interface ProtocolMap {
    // 기존 예제 프로토콜
    'tab-prev': { title: string | undefined };
    'get-current-tab': ProtocolWithReturn<{ tabId: number }, { title?: string }>;

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
  }
}

declare global {
  interface Document {
    /**
     * 비표준 기능을 사용합니다.
     * @see https://developer.mozilla.org/docs/Web/API/Document/startViewTransition
     */
    startViewTransition?: (callback: () => void) => void;
  }
}
