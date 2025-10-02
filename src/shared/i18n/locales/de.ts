import type { Translations } from '../types';

export const de: Translations = {
  appName: 'Tab-Scroll-Synchronisation',
  appDescription: 'Synchronisieren Sie Scrollpositionen über mehrere Browser-Tabs hinweg',

  tabSelection: {
    heading: 'Tabs zum Synchronisieren auswählen',
    selectedCount: '{count} ausgewählt',
    noTabs: 'Keine Tabs verfügbar',
    ineligibleTab: 'Dieser Tab kann nicht synchronisiert werden',
  },

  syncControls: {
    startSync: 'Synchronisation starten',
    stopSync: 'Synchronisation stoppen',
    resync: 'Neu synchronisieren',
    syncActive: 'Synchronisation aktiv',
    syncInactive: 'Synchronisation inaktiv',
  },

  panel: {
    minimize: 'Minimieren',
    maximize: 'Maximieren',
    dragToMove: 'Zum Verschieben ziehen',
  },

  linkedSites: {
    heading: 'Verknüpfte Tabs',
    currentTab: 'Aktuell',
    switchToTab: 'Zu diesem Tab wechseln',
    noLinkedTabs: 'Derzeit sind keine Tabs verknüpft',
  },

  connectionStatus: {
    connected: 'Verbunden',
    disconnected: 'Getrennt',
    error: 'Fehler',
  },

  errors: {
    loadTabsFailed: 'Tabs konnten nicht geladen werden. Bitte aktualisieren Sie die Erweiterung.',
    startSyncFailed: 'Synchronisation konnte nicht gestartet werden. Bitte versuchen Sie es erneut.',
    stopSyncFailed:
      'Warnung: Synchronisation konnte nicht ordnungsgemäß gestoppt werden. Lokaler Status wurde gelöscht.',
    switchTabFailed: 'Tab-Wechsel fehlgeschlagen. Der Tab wurde möglicherweise geschlossen.',
    minTabsRequired: 'Bitte wählen Sie mindestens 2 Tabs zum Synchronisieren aus.',
    tabClosedOrUnavailable: 'Tab ist geschlossen oder nicht verfügbar',
  },

  success: {
    syncStarted: 'Synchronisation für {count} Tabs erfolgreich gestartet.',
    syncStopped: 'Synchronisation erfolgreich gestoppt.',
    tabSwitched: 'Tab erfolgreich gewechselt.',
  },

  warnings: {
    stopSyncWarning: 'Möchten Sie die Synchronisation wirklich stoppen?',
  },

  ineligibilityReasons: {
    webStore:
      'Webstore-Seiten können aufgrund von Sicherheitsbeschränkungen nicht synchronisiert werden',
    googleServices:
      'Google-Dienste-Seiten haben Einschränkungen, die eine Synchronisierung verhindern',
    browserInternal:
      'Browser-interne Seiten können aufgrund von Sicherheitsbeschränkungen nicht synchronisiert werden',
    specialProtocol: 'Spezielle Protokollseiten können nicht synchronisiert werden',
    securityRestriction:
      'Diese Seite kann aufgrund von Sicherheitsbeschränkungen nicht synchronisiert werden',
  },

  features: {
    manualScrollMode: 'Halten Sie Option/Alt gedrückt, um einzelne Tabs zu scrollen',
    elementBasedSync: 'Intelligente Inhaltsabgleichung mithilfe der DOM-Struktur',
    urlNavigationSync: 'Verknüpfte Tabs navigieren gemeinsam',
    statePersistence: 'Ihre Einstellungen werden automatisch gespeichert',
  },
};
