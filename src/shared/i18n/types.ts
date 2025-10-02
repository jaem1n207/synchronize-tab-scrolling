/**
 * Supported locale codes
 */
export type Locale = 'en' | 'ko' | 'zh' | 'fr' | 'de' | 'hi';

/**
 * Translation keys for the application
 */
export interface Translations {
  // App metadata
  appName: string;
  appDescription: string;

  // Tab selection
  tabSelection: {
    heading: string;
    selectedCount: string;
    noTabs: string;
    ineligibleTab: string;
  };

  // Sync controls
  syncControls: {
    startSync: string;
    stopSync: string;
    resync: string;
    syncActive: string;
    syncInactive: string;
  };

  // Panel controls
  panel: {
    minimize: string;
    maximize: string;
    dragToMove: string;
  };

  // Linked sites
  linkedSites: {
    heading: string;
    currentTab: string;
    switchToTab: string;
    noLinkedTabs: string;
  };

  // Connection status
  connectionStatus: {
    connected: string;
    disconnected: string;
    error: string;
  };

  // Error messages
  errors: {
    loadTabsFailed: string;
    startSyncFailed: string;
    stopSyncFailed: string;
    switchTabFailed: string;
    minTabsRequired: string;
    tabClosedOrUnavailable: string;
  };

  // Success messages
  success: {
    syncStarted: string;
    syncStopped: string;
    tabSwitched: string;
  };

  // Warning messages
  warnings: {
    stopSyncWarning: string;
  };

  // Tab ineligibility reasons
  ineligibilityReasons: {
    webStore: string;
    googleServices: string;
    browserInternal: string;
    specialProtocol: string;
    securityRestriction: string;
  };

  // Advanced features
  features: {
    manualScrollMode: string;
    elementBasedSync: string;
    urlNavigationSync: string;
    statePersistence: string;
  };
}

/**
 * Locale metadata
 */
export interface LocaleInfo {
  code: Locale;
  name: string;
  nativeName: string;
  direction: 'ltr' | 'rtl';
}
