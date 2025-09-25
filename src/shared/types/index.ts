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
}

export interface SyncState {
  groups: SyncGroup[];
  activeGroupId: string | null;
}

// Message types for webext-bridge
export interface Messages {
  // Background -> Content Script
  'sync-started': (data: { group: SyncGroup }) => void;
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

export function isRestrictedUrl(url: string): { restricted: boolean; reason?: string } {
  if (!url) return { restricted: true, reason: 'No URL provided' };

  for (const pattern of RESTRICTED_URL_PATTERNS) {
    if (pattern.test(url)) {
      let reason = 'Restricted URL';
      if (url.startsWith('chrome://') || url.startsWith('edge://') || url.startsWith('about:')) {
        reason = 'Browser internal pages cannot be accessed';
      } else if (url.startsWith('view-source:')) {
        reason = 'View source pages cannot be synchronized';
      } else if (url.includes('chrome.google.com/webstore') || url.includes('addons.mozilla.org')) {
        reason = 'Extension store pages are restricted';
      } else if (url.includes('google.com')) {
        reason = 'Google services have security restrictions';
      }
      return { restricted: true, reason };
    }
  }

  return { restricted: false };
}
