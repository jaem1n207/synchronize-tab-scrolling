import { createContext } from 'react';
import type { ReactNode } from 'react';

import de from './translations/de';
import en from './translations/en';
import id from './translations/id';
import it from './translations/it';
import ko from './translations/ko';
import pl from './translations/pl';
import ru from './translations/ru';
import tr from './translations/tr';
import vi from './translations/vi';
import zhTW from './translations/zh_TW';

export type Locale = 'en' | 'ko' | 'de' | 'ru' | 'it' | 'vi' | 'id' | 'pl' | 'tr' | 'zh_TW';

import type { TranslationStrings } from './translations/types';
export type { TranslationStrings };

const translations: Record<Locale, TranslationStrings> = {
  en,
  ko,
  de,
  ru,
  it,
  vi,
  id,
  pl,
  tr,
  zh_TW: zhTW,
};

export const SUPPORTED_LOCALES: Locale[] = [
  'en',
  'ko',
  'de',
  'ru',
  'it',
  'vi',
  'id',
  'pl',
  'tr',
  'zh_TW',
];

export const LOCALE_DISPLAY_NAMES: Record<Locale, string> = {
  en: 'English',
  ko: '한국어',
  de: 'Deutsch',
  ru: 'Русский',
  it: 'Italiano',
  vi: 'Tiếng Việt',
  id: 'Bahasa Indonesia',
  pl: 'Polski',
  tr: 'Türkçe',
  zh_TW: '繁體中文',
};

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: 'en',
  setLocale: () => {},
});

function isValidLocale(value: string): value is Locale {
  return SUPPORTED_LOCALES.includes(value as Locale);
}

function resolveInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'en';

  const stored = localStorage.getItem('landing-locale');
  if (stored && isValidLocale(stored)) return stored;

  const browserLang = navigator.language;

  if (
    browserLang.startsWith('zh') &&
    (browserLang.includes('TW') || browserLang.includes('Hant'))
  ) {
    return 'zh_TW';
  }

  const langPrefix = browserLang.split('-')[0];
  if (langPrefix && isValidLocale(langPrefix)) return langPrefix;

  return 'en';
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(resolveInitialLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    localStorage.setItem('landing-locale', next);
    document.documentElement.lang = next === 'zh_TW' ? 'zh-TW' : next;
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale === 'zh_TW' ? 'zh-TW' : locale;
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
