// Tab related types
export interface SyncTab {
  id: number;
  title: string;
  url: string;
  favicon?: string;
  isEligible: boolean;
  ineligibilityReason?: string;
  windowId: number;
}

export interface SyncGroup {
  id: string;
  tabs: number[]; // tab ids
  isActive: boolean;
  syncMode: SyncMode;
  urlSync: boolean;
  createdAt: number;
}

export type SyncMode = 'ratio' | 'element';

export interface ScrollPosition {
  scrollTop: number;
  scrollLeft: number;
  scrollHeight: number;
  scrollWidth: number;
  clientHeight: number;
  clientWidth: number;
  timestamp: number;
  elementContext?: {
    signature: unknown;
    scrollTop: number;
    pageHeight: number;
  };
}

export interface SyncState {
  groups: SyncGroup[];
  activeGroupId: string | null;
}

// Message types for webext-bridge
export interface Messages {
  // Background -> Content Script
  'sync-started': (data: { group: SyncGroup; showControlPanel?: boolean }) => void;
  'sync-stopped': (data: { groupId: string }) => void;
  'apply-scroll': (data: { position: ScrollPosition; syncMode: SyncMode }) => void;
  'sync-mode-changed': (data: { mode: SyncMode }) => void;
  'tab-prev': (data: { title: string }) => void;

  // Popup/Content -> Background
  'get-tabs': () => SyncTab[];
  'create-sync-group': (data: {
    tabIds: number[];
    syncMode: SyncMode;
    urlSync: boolean;
  }) => SyncGroup;
  'stop-sync': (data: { groupId: string }) => void;
  'sync-scroll': (data: { groupId: string; position: ScrollPosition }) => void;
  'tab-eligibility-check': (data: { tabId: number }) => { eligible: boolean; reason?: string };
  'manual-adjust-mode': (data: { enabled: boolean }) => void;
  'update-sync-mode': (data: { groupId: string; mode: SyncMode }) => void;
  'toggle-url-sync': (data: { groupId: string; enabled: boolean }) => void;
  'get-sync-state': () => SyncState;
  'get-current-tab': () => { title?: string };
  'switch-tab': (data: { tabId: number }) => void;
  'get-tab-info': (data: { tabId: number }) => { id: number; title: string };
}

// Control panel states
export interface ControlPanelState {
  isMinimized: boolean;
  position: { x: number; y: number };
  isLinkedSitesExpanded: boolean;
}

// Restricted URL patterns
export const RESTRICTED_URL_PATTERNS = [
  /^chrome:\/\//,
  /^chrome-extension:\/\//,
  /^edge:\/\//,
  /^extension:\/\//,
  /^about:/,
  /^data:/,
  /^view-source:/,
  /^file:\/\//,
  // Web store restrictions
  /^https:\/\/chrome\.google\.com\/webstore/,
  /^https:\/\/microsoftedge\.microsoft\.com\/addons/,
  /^https:\/\/addons\.mozilla\.org/,
  // Google services restrictions
  /^https:\/\/drive\.google\.com/,
  /^https:\/\/mail\.google\.com/,
  /^https:\/\/docs\.google\.com/,
  /^https:\/\/sheets\.google\.com/,
  /^https:\/\/slides\.google\.com/,
];

export function isRestrictedUrl(url: string): { restricted: boolean; reasonKey?: string } {
  if (!url) return { restricted: true, reasonKey: 'restrictions.restricted' };

  for (const pattern of RESTRICTED_URL_PATTERNS) {
    if (pattern.test(url)) {
      let reasonKey = 'restrictions.restricted';
      if (url.startsWith('chrome://') || url.startsWith('edge://') || url.startsWith('about:')) {
        reasonKey = 'restrictions.browser';
      } else if (url.startsWith('view-source:')) {
        reasonKey = 'restrictions.viewSource';
      } else if (url.includes('chrome.google.com/webstore') || url.includes('addons.mozilla.org')) {
        reasonKey = 'restrictions.webStore';
      } else if (url.includes('google.com')) {
        reasonKey = 'restrictions.google';
      }
      return { restricted: true, reasonKey };
    }
  }

  return { restricted: false };
}
