import { createContext } from 'react';

import type { ReactNode } from 'react';

import en from './translations/en';
import ko from './translations/ko';

export type Locale = 'en' | 'ko';

import type { TranslationStrings } from './translations/types';
export type { TranslationStrings };

const translations: Record<Locale, TranslationStrings> = { en, ko };

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: 'en',
  setLocale: () => {},
});

function resolveInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'en';

  const stored = localStorage.getItem('landing-locale');
  if (stored === 'ko' || stored === 'en') return stored;

  const browserLang = navigator.language;
  if (browserLang.startsWith('ko')) return 'ko';

  return 'en';
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(resolveInitialLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    localStorage.setItem('landing-locale', next);
    document.documentElement.lang = next;
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);

  return <LocaleContext value={value}>{children}</LocaleContext>;
}

export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext);
}

export function useTranslation(): TranslationStrings {
  const { locale } = useLocale();
  return translations[locale];
}
