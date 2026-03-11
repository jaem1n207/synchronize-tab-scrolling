import type { TranslationStrings } from './types';

const pl: TranslationStrings = {
  header: {
    features: 'Funkcje',
    useCases: 'Zastosowania',
    install: 'Zainstaluj',
  },
  hero: {
    headline: 'Nie trać miejsca w tekście.',
    subheadline:
      'Przewiń raz, zsynchronizuj wszędzie. Bezpłatne rozszerzenie przeglądarki, które utrzymuje karty przewijane razem — idealne do porównywania tłumaczeń, kodu lub dokumentów obok siebie.',
    enableSync: 'Włącz synchronizację',
    syncing: 'Synchronizowanie',
    scrollHint: 'Przewiń lewy panel',
    scrollHintSynced: 'Przewiń dowolny panel',
    scrollHintAdjusting: 'Przytrzymaj {modifier} + przewiń, aby dostosować indywidualnie',
    manualOffset: 'Ręczne przesunięcie',
    synced: 'Zsynchronizowano',
    notSynced: 'Nie zsynchronizowano',
    adjusting: 'Dostosowywanie',
    trustSignal: 'Bezpłatne · Bez konta · Otwarte źródło',
  },
  problem: {
    text: 'Nie przewijasz ręcznie dwóch kart. Wykonujesz pracę, którą przeglądarka powinna obsługiwać automatycznie.',
  },
  howItWorks: {
    title: 'Jak to działa',
    steps: [
      {
        title: 'Zainstaluj rozszerzenie',
        description:
          'Dodaj do przeglądarki jednym kliknięciem. Działa z Chrome, Firefox, Edge i wszystkimi przeglądarkami opartymi na Chromium.',
      },
      {
        title: 'Wybierz karty do synchronizacji',
        description: 'Otwórz wyskakujące okno rozszerzenia i wybierz karty, które chcesz połączyć.',
      },
      {
        title: 'Przewijaj gdziekolwiek',
        description:
          'Przewiń w jednej karcie — wszystkie połączone karty automatycznie podążają do tej samej pozycji.',
      },
    ],
  },
  features: {
    title: 'Funkcje',
    items: [
      {
        title: 'Synchronizacja przewijania w czasie rzeczywistym',
        description:
          'Przewiń w jednej karcie, wszystkie połączone karty natychmiast przesuwają się do tej samej względnej pozycji.',
      },
      {
        title: 'Ręczne dostosowanie pozycji',
        description:
          'Przytrzymaj {modifier} podczas przewijania, aby dostosować poszczególne karty bez przerywania synchronizacji.',
      },
      {
        title: 'Sugestia automatycznej synchronizacji',
        description:
          'Otwarto ten sam URL w kilku kartach? Powiadomienie sugeruje synchronizację jednym kliknięciem.',
      },
      {
        title: 'Synchronizacja nawigacji URL',
        description:
          'Kliknij link w jednej karcie — wszystkie połączone karty razem przechodzą do tego samego URL.',
      },
      {
        title: 'Wykluczanie domen',
        description: 'Trwale wyklucz określone domeny z sugestii automatycznej synchronizacji.',
      },
      {
        title: 'Automatyczne ponowne połączenie',
        description:
          'Utracono połączenie po uśpieniu? Rozszerzenie automatycznie łączy się ponownie i wznawia synchronizację.',
      },
    ],
  },
  useCases: {
    title: 'Dla kogo to jest?',
    items: [
      {
        role: 'Tłumacze',
        description: 'Porównuj oryginał i tłumaczenie obok siebie, nie tracąc miejsca w tekście.',
      },
      {
        role: 'Programiści',
        description:
          'Porównuj wersje kodu, przeglądaj pull requesty lub czytaj dokumentację obok kodu źródłowego.',
      },
      {
        role: 'Badacze',
        description: 'Porównuj wiele artykułów lub źródeł danych jednocześnie.',
      },
      {
        role: 'Studenci',
        description:
          'Ucz się z podręczników i notatek razem, utrzymując oba zsynchronizowane podczas czytania.',
      },
    ],
  },
  trust: {
    title: 'Prywatność na pierwszym miejscu. Zawsze.',
    badges: {
      noData: 'Brak zbierania danych',
      noAnalytics: 'Brak ciasteczek śledzących',
      offline: 'Działa offline',
      openSource: 'Otwarte źródło',
      languages: '9 języków',
      accessible: 'WCAG 2.1 AA',
    },
    browsers: 'Działa we wszystkich głównych przeglądarkach',
  },
  cta: {
    title: 'Gotowy do synchronizacji?',
    subtitle: 'Bezpłatne na zawsze. Instalacja w 3 sekundy.',
  },
  footer: {
    tagline: 'Przewiń raz, zsynchronizuj wszędzie.',
    links: 'Linki',
    support: 'Wsparcie',
    github: 'GitHub',
    reportBug: 'Zgłoś błąd',
    email: 'E-mail',
    license: 'Licencja Source Available',
    madeBy: 'Stworzone przez',
  },
  common: {
    addTo: 'Dodaj do {browser}',
    alsoAvailableOn: 'Dostępne również na',
  },
};

export default pl;
