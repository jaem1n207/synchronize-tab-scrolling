import type { TranslationStrings } from './types';

const en: TranslationStrings = {
  header: {
    features: 'Features',
    useCases: 'Use Cases',
    install: 'Install',
  },
  hero: {
    headline: 'Stop losing your place.',
    subheadline:
      'Scroll once, sync everywhere. A free browser extension that keeps your tabs scrolling together — perfect for comparing translations, code, or documents side by side.',
    enableSync: 'Enable Sync',
    syncing: 'Syncing',
    scrollHint: 'Scroll the left panel',
    scrollHintSynced: 'Scroll either panel',
    scrollHintAdjusting: 'Hold {modifier} + scroll to adjust individually',
    manualOffset: 'Manual offset',
    synced: 'Synced',
    notSynced: 'Not synced',
    adjusting: 'Adjusting',
    trustSignal: 'Free · No account · Open source',
  },
  problem: {
    text: "You're not manually scrolling two tabs. You're doing work that browsers should handle automatically.",
  },
  howItWorks: {
    title: 'How it works',
    steps: [
      {
        title: 'Install the extension',
        description:
          'Add it to your browser in one click. Works with Chrome, Firefox, Edge, and all Chromium-based browsers.',
      },
      {
        title: 'Select tabs to sync',
        description: 'Open the extension popup, pick the tabs you want to link together.',
      },
      {
        title: 'Scroll anywhere',
        description:
          'Scroll in one tab — all linked tabs follow automatically to the same position.',
      },
    ],
  },
  features: {
    title: 'Features',
    items: [
      {
        title: 'Real-time scroll sync',
        description:
          'Scroll in one tab, all linked tabs move to the same relative position instantly.',
      },
      {
        title: 'Manual position adjustment',
        description:
          'Hold {modifier} while scrolling to adjust individual tabs without breaking sync.',
      },
      {
        title: 'Auto-sync suggestion',
        description:
          'Opens the same URL in multiple tabs? A toast suggests syncing with one click.',
      },
      {
        title: 'URL navigation sync',
        description: 'Click a link in one tab, all linked tabs navigate to the same URL together.',
      },
      {
        title: 'Domain exclusion',
        description: 'Permanently exclude specific domains from auto-sync suggestions.',
      },
      {
        title: 'Auto-reconnection',
        description:
          'Lost connection after sleep? The extension reconnects and resumes syncing automatically.',
      },
    ],
  },
  useCases: {
    title: 'Who is this for?',
    items: [
      {
        role: 'Translators',
        description:
          'Compare original and translated documents side by side without losing your place.',
      },
      {
        role: 'Developers',
        description:
          'Compare code versions, review pull requests, or read docs alongside source code.',
      },
      {
        role: 'Researchers',
        description: 'Cross-reference multiple papers or data sources simultaneously.',
      },
      {
        role: 'Students',
        description: 'Study textbooks and notes together, keeping both in sync as you read.',
      },
    ],
  },
  trust: {
    title: 'Privacy first. Always.',
    badges: {
      noData: 'No data collection',
      noAnalytics: 'No tracking cookies',
      offline: 'Works offline',
      openSource: 'Open source',
      languages: '9 languages',
      accessible: 'WCAG 2.1 AA',
    },
    browsers: 'Works on all major browsers',
  },
  cta: {
    title: 'Ready to sync?',
    subtitle: 'Free forever. Install in 3 seconds.',
  },
  footer: {
    tagline: 'Scroll once, sync everywhere.',
    links: 'Links',
    support: 'Support',
    github: 'GitHub',
    reportBug: 'Report a bug',
    email: 'Email',
    license: 'Source Available License',
    madeBy: 'Made by',
  },
  common: {
    addTo: 'Add to {browser}',
    alsoAvailableOn: 'Also available on',
  },
};

export default en;
