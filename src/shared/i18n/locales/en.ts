import type { Translations } from '../types';

export const en: Translations = {
  appName: 'Synchronize Tab Scrolling',
  appDescription: 'Synchronize scroll positions across multiple browser tabs',

  tabSelection: {
    heading: 'Select Tabs to Sync',
    selectedCount: '{count} selected',
    noTabs: 'No tabs available',
    ineligibleTab: 'This tab cannot be synchronized',
  },

  syncControls: {
    startSync: 'Start Sync',
    stopSync: 'Stop Sync',
    resync: 'Resync',
    syncActive: 'Sync Active',
    syncInactive: 'Sync Inactive',
  },

  panel: {
    minimize: 'Minimize',
    maximize: 'Maximize',
    dragToMove: 'Drag to move',
  },

  linkedSites: {
    heading: 'Linked Tabs',
    currentTab: 'Current',
    switchToTab: 'Switch to this tab',
    noLinkedTabs: 'No tabs are currently linked',
  },

  connectionStatus: {
    connected: 'Connected',
    disconnected: 'Disconnected',
    error: 'Error',
  },

  errors: {
    loadTabsFailed: 'Failed to load tabs. Please refresh the extension.',
    startSyncFailed: 'Failed to start synchronization. Please try again.',
    stopSyncFailed: 'Warning: Failed to properly stop sync. Local state has been cleared.',
    switchTabFailed: 'Failed to switch to tab. The tab may have been closed.',
    minTabsRequired: 'Please select at least 2 tabs to synchronize.',
    tabClosedOrUnavailable: 'Tab is closed or unavailable',
  },

  success: {
    syncStarted: 'Successfully started synchronization for {count} tabs.',
    syncStopped: 'Synchronization stopped successfully.',
    tabSwitched: 'Switched to tab successfully.',
  },

  warnings: {
    stopSyncWarning: 'Are you sure you want to stop synchronization?',
  },

  ineligibilityReasons: {
    webStore: 'Web store pages cannot be synchronized due to security restrictions',
    googleServices: 'Google services pages have restrictions that prevent synchronization',
    browserInternal: 'Browser internal pages cannot be synchronized due to security restrictions',
    specialProtocol: 'Special protocol pages cannot be synchronized',
    securityRestriction: 'This page cannot be synchronized due to security restrictions',
  },

  features: {
    manualScrollMode: 'Hold Option/Alt to scroll individual tabs',
    elementBasedSync: 'Intelligent content matching using DOM structure',
    urlNavigationSync: 'Linked tabs navigate together',
    statePersistence: 'Your preferences are automatically saved',
  },
};
