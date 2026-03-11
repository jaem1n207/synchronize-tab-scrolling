interface StepTranslation {
  title: string;
  description: string;
}

interface FeatureTranslation {
  title: string;
  description: string;
}

interface UseCaseTranslation {
  role: string;
  description: string;
}

export interface TranslationStrings {
  header: {
    features: string;
    useCases: string;
    install: string;
  };
  hero: {
    headline: string;
    subheadline: string;
    enableSync: string;
    syncing: string;
    scrollHint: string;
    scrollHintSynced: string;
    scrollHintAdjusting: string;
    synced: string;
    notSynced: string;
    adjusting: string;
    trustSignal: string;
  };
  problem: {
    text: string;
  };
  howItWorks: {
    title: string;
    steps: [StepTranslation, StepTranslation, StepTranslation];
  };
  features: {
    title: string;
    items: [
      FeatureTranslation,
      FeatureTranslation,
      FeatureTranslation,
      FeatureTranslation,
      FeatureTranslation,
      FeatureTranslation,
    ];
  };
  useCases: {
    title: string;
    items: [UseCaseTranslation, UseCaseTranslation, UseCaseTranslation, UseCaseTranslation];
  };
  trust: {
    title: string;
    badges: {
      noData: string;
      noAnalytics: string;
      offline: string;
      openSource: string;
      languages: string;
      accessible: string;
    };
    browsers: string;
  };
  cta: {
    title: string;
    subtitle: string;
  };
  footer: {
    tagline: string;
    links: string;
    support: string;
    github: string;
    reportBug: string;
    email: string;
    license: string;
    madeBy: string;
  };
  common: {
    addTo: string;
    alsoAvailableOn: string;
  };
}
