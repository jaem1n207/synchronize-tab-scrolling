import type { Translations } from '../types';

export const fr: Translations = {
  appName: 'Synchronisation du défilement des onglets',
  appDescription: 'Synchronisez les positions de défilement entre plusieurs onglets du navigateur',

  tabSelection: {
    heading: 'Sélectionner les onglets à synchroniser',
    selectedCount: '{count} sélectionné(s)',
    noTabs: 'Aucun onglet disponible',
    ineligibleTab: 'Cet onglet ne peut pas être synchronisé',
  },

  syncControls: {
    startSync: 'Démarrer la synchronisation',
    stopSync: 'Arrêter la synchronisation',
    resync: 'Resynchroniser',
    syncActive: 'Synchronisation active',
    syncInactive: 'Synchronisation inactive',
  },

  panel: {
    minimize: 'Réduire',
    maximize: 'Agrandir',
    dragToMove: 'Glisser pour déplacer',
  },

  linkedSites: {
    heading: 'Onglets liés',
    currentTab: 'Actuel',
    switchToTab: 'Basculer vers cet onglet',
    noLinkedTabs: 'Aucun onglet lié actuellement',
  },

  connectionStatus: {
    connected: 'Connecté',
    disconnected: 'Déconnecté',
    error: 'Erreur',
  },

  errors: {
    loadTabsFailed: "Échec du chargement des onglets. Veuillez actualiser l'extension.",
    startSyncFailed: 'Échec du démarrage de la synchronisation. Veuillez réessayer.',
    stopSyncFailed:
      "Avertissement : Échec de l'arrêt correct de la synchronisation. L'état local a été effacé.",
    switchTabFailed: "Échec du basculement vers l'onglet. L'onglet a peut-être été fermé.",
    minTabsRequired: 'Veuillez sélectionner au moins 2 onglets à synchroniser.',
    tabClosedOrUnavailable: "L'onglet est fermé ou non disponible",
  },

  success: {
    syncStarted: 'Synchronisation démarrée avec succès pour {count} onglets.',
    syncStopped: 'Synchronisation arrêtée avec succès.',
    tabSwitched: "Basculement vers l'onglet réussi.",
  },

  warnings: {
    stopSyncWarning: 'Êtes-vous sûr de vouloir arrêter la synchronisation ?',
  },

  ineligibilityReasons: {
    webStore:
      'Les pages des boutiques en ligne ne peuvent pas être synchronisées en raison de restrictions de sécurité',
    googleServices:
      'Les pages des services Google ont des restrictions qui empêchent la synchronisation',
    browserInternal:
      'Les pages internes du navigateur ne peuvent pas être synchronisées en raison de restrictions de sécurité',
    specialProtocol: 'Les pages de protocole spécial ne peuvent pas être synchronisées',
    securityRestriction:
      'Cette page ne peut pas être synchronisée en raison de restrictions de sécurité',
  },

  features: {
    manualScrollMode: 'Maintenez Option/Alt pour faire défiler des onglets individuels',
    elementBasedSync: 'Correspondance intelligente du contenu utilisant la structure DOM',
    urlNavigationSync: 'Les onglets liés naviguent ensemble',
    statePersistence: 'Vos préférences sont automatiquement enregistrées',
  },
};
