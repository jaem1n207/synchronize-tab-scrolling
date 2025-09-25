import browser from 'webextension-polyfill';

import de from './locales/de.json';
import en from './locales/en.json';
import fr from './locales/fr.json';
import hi from './locales/hi.json';
import ko from './locales/ko.json';
import zh from './locales/zh.json';

type Translations = typeof en;
type NestedKeyOf<ObjectType extends object> = {
  [Key in keyof ObjectType & string]: ObjectType[Key] extends object
    ? `${Key}` | `${Key}.${NestedKeyOf<ObjectType[Key]>}`
    : `${Key}`;
}[keyof ObjectType & string];

export type TranslationKey = NestedKeyOf<Translations>;

const translations: Record<string, Translations> = {
  en,
  ko,
  zh,
  'zh-CN': zh,
  'zh-TW': zh,
  fr,
  de,
  hi,
};

class I18n {
  private locale: string;
  private fallbackLocale = 'en';
  private currentTranslations: Translations;

  constructor() {
    // Get browser locale
    const browserLocale = this.detectLocale();
    this.locale = this.normalizeLocale(browserLocale);
    this.currentTranslations = translations[this.locale] || translations[this.fallbackLocale];
  }

  private detectLocale(): string {
    // Try to get locale from browser API
    if (browser?.i18n?.getUILanguage) {
      return browser.i18n.getUILanguage();
    }

    // Fallback to navigator
    if (typeof navigator !== 'undefined') {
      return navigator.language || 'en';
    }

    return 'en';
  }

  private normalizeLocale(locale: string): string {
    // Handle language codes like en-US -> en
    const lang = locale.split('-')[0].toLowerCase();

    // Check if we have translations for this language
    if (translations[lang]) {
      return lang;
    }

    // Check for full locale match (e.g., zh-CN)
    if (translations[locale]) {
      return locale;
    }

    // Special handling for Chinese variants
    if (locale.startsWith('zh')) {
      return locale.includes('TW') || locale.includes('HK') ? 'zh-TW' : 'zh-CN';
    }

    return this.fallbackLocale;
  }

  public setLocale(locale: string): void {
    const normalized = this.normalizeLocale(locale);
    if (translations[normalized]) {
      this.locale = normalized;
      this.currentTranslations = translations[normalized];
    }
  }

  public getLocale(): string {
    return this.locale;
  }

  public t(key: TranslationKey, params?: Record<string, string | number>): string {
    const keys = key.split('.');
    let value: unknown = this.currentTranslations;

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = (value as Record<string, unknown>)[k];
      } else {
        // Fallback to English if key not found
        value = this.getFromFallback(keys);
        break;
      }
    }

    if (typeof value !== 'string') {
      console.warn(`Translation key not found: ${key}`);
      return key;
    }

    // Replace placeholders like {{count}}
    if (params) {
      return value.replace(/\{\{(\w+)\}\}/g, (match, param) => {
        return params[param]?.toString() || match;
      });
    }

    return value;
  }

  private getFromFallback(keys: string[]): string {
    let value: unknown = translations[this.fallbackLocale];

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = (value as Record<string, unknown>)[k];
      } else {
        return keys.join('.');
      }
    }

    return typeof value === 'string' ? value : keys.join('.');
  }

  public getSupportedLocales(): string[] {
    return Object.keys(translations);
  }

  // Check if current locale is RTL
  public isRTL(): boolean {
    // Arabic, Hebrew, Persian, Urdu are RTL
    // Hindi uses Devanagari script which is LTR
    return false; // None of our supported languages are RTL
  }
}

// Create singleton instance
export const i18n = new I18n();

// Export convenience function
export const t = (key: TranslationKey, params?: Record<string, string | number>): string => {
  return i18n.t(key, params);
};
