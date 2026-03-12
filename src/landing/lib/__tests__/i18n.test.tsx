/// <reference types="vitest/globals" />

import { fireEvent, render, screen } from '~/landing/__tests__/test-utils';
import { SUPPORTED_LOCALES, useLocale, useTranslation, type Locale } from '~/landing/lib/i18n';
import de from '~/landing/lib/translations/de';
import en from '~/landing/lib/translations/en';
import id from '~/landing/lib/translations/id';
import itTranslation from '~/landing/lib/translations/it';
import ko from '~/landing/lib/translations/ko';
import pl from '~/landing/lib/translations/pl';
import ru from '~/landing/lib/translations/ru';
import tr from '~/landing/lib/translations/tr';
import viTranslation from '~/landing/lib/translations/vi';
import zhTW from '~/landing/lib/translations/zh_TW';

const expectedTranslations: Record<Locale, string> = {
  en: en.header.install,
  ko: ko.header.install,
  de: de.header.install,
  ru: ru.header.install,
  it: itTranslation.header.install,
  vi: viTranslation.header.install,
  id: id.header.install,
  pl: pl.header.install,
  tr: tr.header.install,
  zh_TW: zhTW.header.install,
};

function LocaleProbe() {
  const { locale, setLocale } = useLocale();
  const t = useTranslation();

  return (
    <div>
      <p data-testid="locale">{locale}</p>
      <p data-testid="install-label">{t.header.install}</p>
      {SUPPORTED_LOCALES.map((nextLocale) => (
        <button key={nextLocale} type="button" onClick={() => setLocale(nextLocale)}>
          set-{nextLocale}
        </button>
      ))}
    </div>
  );
}

function setNavigatorLanguage(value: string) {
  Object.defineProperty(window.navigator, 'language', {
    value,
    configurable: true,
  });
}

afterEach(() => {
  Object.defineProperty(window.navigator, 'language', {
    value: 'en-US',
    configurable: true,
  });
  document.documentElement.lang = 'en';
});

describe('resolveInitialLocale behavior through LocaleProvider', () => {
  it('uses stored locale when localStorage has a valid value', () => {
    localStorage.setItem('landing-locale', 'ru');
    setNavigatorLanguage('de-DE');

    render(<LocaleProbe />);

    expect(screen.getByTestId('locale')).toHaveTextContent('ru');
  });

  it('uses zh_TW for traditional Chinese browser locales', () => {
    setNavigatorLanguage('zh-Hant-TW');

    render(<LocaleProbe />);

    expect(screen.getByTestId('locale')).toHaveTextContent('zh_TW');
  });

  it('uses language prefix when supported', () => {
    setNavigatorLanguage('de-DE');

    render(<LocaleProbe />);

    expect(screen.getByTestId('locale')).toHaveTextContent('de');
  });

  it('falls back to en for invalid storage and unsupported browser locale', () => {
    localStorage.setItem('landing-locale', 'xx');
    setNavigatorLanguage('fr-FR');

    render(<LocaleProbe />);

    expect(screen.getByTestId('locale')).toHaveTextContent('en');
  });
});

describe('LocaleProvider and useTranslation', () => {
  it('renders children with initial locale translation', () => {
    localStorage.setItem('landing-locale', 'ko');

    render(<LocaleProbe />);

    expect(screen.getByTestId('locale')).toHaveTextContent('ko');
    expect(screen.getByTestId('install-label')).toHaveTextContent(ko.header.install);
  });

  it('returns correct translations for all locales via useTranslation', () => {
    render(<LocaleProbe />);

    for (const locale of SUPPORTED_LOCALES) {
      fireEvent.click(screen.getByRole('button', { name: `set-${locale}` }));
      expect(screen.getByTestId('locale')).toHaveTextContent(locale);
      expect(screen.getByTestId('install-label')).toHaveTextContent(expectedTranslations[locale]);
    }
  });

  it('setLocale updates localStorage and document language', () => {
    render(<LocaleProbe />);

    fireEvent.click(screen.getByRole('button', { name: 'set-ko' }));

    expect(localStorage.setItem).toHaveBeenCalledWith('landing-locale', 'ko');
    expect(document.documentElement.lang).toBe('ko');

    fireEvent.click(screen.getByRole('button', { name: 'set-zh_TW' }));

    expect(localStorage.setItem).toHaveBeenCalledWith('landing-locale', 'zh_TW');
    expect(document.documentElement.lang).toBe('zh-TW');
  });
});
