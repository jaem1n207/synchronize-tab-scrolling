import type { TranslationStrings } from './types';

const it: TranslationStrings = {
  header: {
    features: 'Funzionalità',
    useCases: "Casi d'uso",
    install: 'Installa',
  },
  hero: {
    headline: 'Non perdere mai il segno.',
    subheadline:
      "Scorri una volta, sincronizza ovunque. Un'estensione browser gratuita che mantiene le tue schede sincronizzate — perfetta per confrontare traduzioni, codice o documenti affiancati.",
    enableSync: 'Attiva sincronizzazione',
    syncing: 'Sincronizzazione',
    scrollHint: 'Scorri il pannello sinistro',
    scrollHintSynced: 'Scorri qualsiasi pannello',
    scrollHintAdjusting: 'Tieni premuto {modifier} + scorri per regolare singolarmente',
    manualOffset: 'Offset manuale',
    synced: 'Sincronizzato',
    notSynced: 'Non sincronizzato',
    adjusting: 'Regolazione',
    trustSignal: 'Gratuito · Nessun account · Open source',
  },
  problem: {
    text: 'Non stai solo scorrendo manualmente due schede. Stai facendo un lavoro che il browser dovrebbe gestire automaticamente.',
  },
  howItWorks: {
    title: 'Come funziona',
    steps: [
      {
        title: "Installa l'estensione",
        description:
          'Aggiungila al browser con un clic. Funziona con Chrome, Firefox, Edge e tutti i browser basati su Chromium.',
      },
      {
        title: 'Seleziona le schede da sincronizzare',
        description: "Apri il popup dell'estensione e scegli le schede che vuoi collegare.",
      },
      {
        title: 'Scorri ovunque',
        description:
          'Scorri in una scheda — tutte le schede collegate seguono automaticamente alla stessa posizione.',
      },
    ],
  },
  features: {
    title: 'Funzionalità',
    items: [
      {
        title: 'Sincronizzazione scroll in tempo reale',
        description:
          'Scorri in una scheda, tutte le schede collegate si spostano istantaneamente alla stessa posizione relativa.',
      },
      {
        title: 'Regolazione manuale della posizione',
        description:
          'Tieni premuto {modifier} mentre scorri per regolare singole schede senza interrompere la sincronizzazione.',
      },
      {
        title: 'Suggerimento di sincronizzazione automatica',
        description:
          'Hai aperto lo stesso URL in più schede? Una notifica suggerisce la sincronizzazione con un clic.',
      },
      {
        title: 'Sincronizzazione navigazione URL',
        description:
          'Clicca un link in una scheda — tutte le schede collegate navigano insieme allo stesso URL.',
      },
      {
        title: 'Esclusione domini',
        description:
          'Escludi permanentemente domini specifici dai suggerimenti di sincronizzazione automatica.',
      },
      {
        title: 'Riconnessione automatica',
        description:
          "Connessione persa dopo la sospensione? L'estensione si riconnette e riprende la sincronizzazione automaticamente.",
      },
    ],
  },
  useCases: {
    title: 'Per chi è?',
    items: [
      {
        role: 'Traduttori',
        description: 'Confronta originale e traduzione affiancati senza perdere il segno.',
      },
      {
        role: 'Sviluppatori',
        description:
          'Confronta versioni di codice, revisiona pull request o leggi la documentazione accanto al codice sorgente.',
      },
      {
        role: 'Ricercatori',
        description: 'Incrocia più articoli o fonti di dati contemporaneamente.',
      },
      {
        role: 'Studenti',
        description:
          'Studia libri di testo e appunti insieme, mantenendoli sincronizzati durante la lettura.',
      },
    ],
  },
  trust: {
    title: 'Privacy prima di tutto. Sempre.',
    badges: {
      noData: 'Nessuna raccolta dati',
      noAnalytics: 'Nessun cookie di tracciamento',
      offline: 'Funziona offline',
      openSource: 'Open source',
      languages: '9 lingue',
      accessible: 'WCAG 2.1 AA',
    },
    browsers: 'Funziona su tutti i principali browser',
  },
  cta: {
    title: 'Pronto a sincronizzare?',
    subtitle: 'Gratuito per sempre. Installazione in 3 secondi.',
  },
  footer: {
    tagline: 'Scorri una volta, sincronizza ovunque.',
    links: 'Link',
    support: 'Supporto',
    github: 'GitHub',
    reportBug: 'Segnala un bug',
    email: 'Email',
    license: 'Licenza Source Available',
    madeBy: 'Creato da',
  },
  common: {
    addTo: 'Aggiungi a {browser}',
    alsoAvailableOn: 'Disponibile anche su',
  },
};

export default it;
