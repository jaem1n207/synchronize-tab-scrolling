import type { TranslationStrings } from './types';

const de: TranslationStrings = {
  header: {
    features: 'Funktionen',
    useCases: 'Anwendungsfälle',
    install: 'Installieren',
  },
  hero: {
    headline: 'Nie wieder den Überblick verlieren.',
    subheadline:
      'Einmal scrollen, überall synchron. Eine kostenlose Browser-Erweiterung, die Ihre Tabs gemeinsam scrollen lässt — ideal zum Vergleichen von Übersetzungen, Code oder Dokumenten nebeneinander.',
    enableSync: 'Synchronisation starten',
    syncing: 'Synchronisiert',
    scrollHint: 'Linkes Panel scrollen',
    scrollHintSynced: 'Beliebiges Panel scrollen',
    scrollHintAdjusting: '{modifier} gedrückt halten + scrollen zum individuellen Anpassen',
    manualOffset: 'Manueller Versatz',
    synced: 'Synchronisiert',
    notSynced: 'Nicht synchronisiert',
    adjusting: 'Wird angepasst',
    trustSignal: 'Kostenlos · Kein Konto · Open Source',
  },
  problem: {
    text: 'Sie scrollen nicht manuell in zwei Tabs. Sie erledigen Arbeit, die der Browser automatisch übernehmen sollte.',
  },
  howItWorks: {
    title: 'So funktioniert es',
    steps: [
      {
        title: 'Erweiterung installieren',
        description:
          'Mit einem Klick zum Browser hinzufügen. Funktioniert mit Chrome, Firefox, Edge und allen Chromium-basierten Browsern.',
      },
      {
        title: 'Tabs zum Synchronisieren auswählen',
        description:
          'Öffnen Sie das Erweiterungs-Popup und wählen Sie die Tabs aus, die Sie verknüpfen möchten.',
      },
      {
        title: 'Irgendwo scrollen',
        description:
          'In einem Tab scrollen — alle verknüpften Tabs folgen automatisch zur gleichen Position.',
      },
    ],
  },
  features: {
    title: 'Funktionen',
    items: [
      {
        title: 'Echtzeit-Scroll-Synchronisation',
        description:
          'In einem Tab scrollen, alle verknüpften Tabs bewegen sich sofort zur gleichen relativen Position.',
      },
      {
        title: 'Manuelle Positionsanpassung',
        description:
          '{modifier} beim Scrollen gedrückt halten, um einzelne Tabs anzupassen, ohne die Synchronisation zu unterbrechen.',
      },
      {
        title: 'Auto-Sync-Vorschlag',
        description:
          'Gleiche URL in mehreren Tabs geöffnet? Eine Benachrichtigung schlägt die Synchronisation mit einem Klick vor.',
      },
      {
        title: 'URL-Navigations-Sync',
        description:
          'Einen Link in einem Tab anklicken — alle verknüpften Tabs navigieren gemeinsam zur gleichen URL.',
      },
      {
        title: 'Domain-Ausschluss',
        description: 'Bestimmte Domains dauerhaft von Auto-Sync-Vorschlägen ausschließen.',
      },
      {
        title: 'Automatische Wiederverbindung',
        description:
          'Verbindung nach dem Ruhezustand verloren? Die Erweiterung verbindet sich neu und setzt die Synchronisation automatisch fort.',
      },
    ],
  },
  useCases: {
    title: 'Für wen ist das?',
    items: [
      {
        role: 'Übersetzer',
        description:
          'Original und Übersetzung nebeneinander vergleichen, ohne die Position zu verlieren.',
      },
      {
        role: 'Entwickler',
        description:
          'Code-Versionen vergleichen, Pull Requests reviewen oder Dokumentation neben dem Quellcode lesen.',
      },
      {
        role: 'Forscher',
        description: 'Mehrere Artikel oder Datenquellen gleichzeitig gegenüberstellen.',
      },
      {
        role: 'Studierende',
        description:
          'Lehrbücher und Notizen gemeinsam durcharbeiten, beide beim Lesen synchron halten.',
      },
    ],
  },
  trust: {
    title: 'Datenschutz zuerst. Immer.',
    badges: {
      noData: 'Keine Datenerfassung',
      noAnalytics: 'Keine Tracking-Cookies',
      offline: 'Funktioniert offline',
      openSource: 'Open Source',
      languages: '9 Sprachen',
      accessible: 'WCAG 2.1 AA',
    },
    browsers: 'Funktioniert in allen gängigen Browsern',
  },
  cta: {
    title: 'Bereit zum Synchronisieren?',
    subtitle: 'Dauerhaft kostenlos. In 3 Sekunden installiert.',
  },
  footer: {
    tagline: 'Einmal scrollen, überall synchron.',
    links: 'Links',
    support: 'Support',
    github: 'GitHub',
    reportBug: 'Fehler melden',
    email: 'E-Mail',
    license: 'Source-Available-Lizenz',
    madeBy: 'Erstellt von',
  },
  common: {
    addTo: 'Zu {browser} hinzufügen',
    alsoAvailableOn: 'Auch verfügbar für',
  },
};

export default de;
