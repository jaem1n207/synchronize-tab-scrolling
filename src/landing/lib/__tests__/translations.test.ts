/// <reference types="vitest/globals" />

import de from '~/landing/lib/translations/de';
import en from '~/landing/lib/translations/en';
import id from '~/landing/lib/translations/id';
import itTranslation from '~/landing/lib/translations/it';
import ko from '~/landing/lib/translations/ko';
import pl from '~/landing/lib/translations/pl';
import ru from '~/landing/lib/translations/ru';
import tr from '~/landing/lib/translations/tr';
import type { TranslationStrings } from '~/landing/lib/translations/types';
import viTranslation from '~/landing/lib/translations/vi';
import zhTW from '~/landing/lib/translations/zh_TW';

const localeTranslations: Record<string, TranslationStrings> = {
  en,
  ko,
  de,
  ru,
  it: itTranslation,
  vi: viTranslation,
  id,
  pl,
  tr,
  zh_TW: zhTW,
};

function collectObjectPaths(value: unknown, prefix = ''): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => collectObjectPaths(entry, `${prefix}[${index}]`));
  }

  if (!value || typeof value !== 'object') {
    return [prefix];
  }

  return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) => {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    return collectObjectPaths(entry, nextPrefix);
  });
}

function collectStringValues(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectStringValues(entry));
  }

  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap((entry) =>
      collectStringValues(entry),
    );
  }

  return [];
}

describe('landing translations', () => {
  it('keeps identical translation structure across all locales', () => {
    const baselinePaths = collectObjectPaths(en).sort();

    for (const [locale, translation] of Object.entries(localeTranslations)) {
      const currentPaths = collectObjectPaths(translation).sort();
      expect(currentPaths, `${locale} structure mismatch`).toEqual(baselinePaths);
    }
  });

  it('keeps required array lengths for all locales', () => {
    for (const [locale, translation] of Object.entries(localeTranslations)) {
      expect(translation.howItWorks.steps, `${locale} howItWorks.steps length`).toHaveLength(3);
      expect(translation.features.items, `${locale} features.items length`).toHaveLength(6);
      expect(translation.useCases.items, `${locale} useCases.items length`).toHaveLength(4);
    }
  });

  it('does not contain empty string values in any locale', () => {
    for (const [locale, translation] of Object.entries(localeTranslations)) {
      const values = collectStringValues(translation);
      expect(values.length, `${locale} has no string values`).toBeGreaterThan(0);

      for (const text of values) {
        expect(text.trim(), `${locale} contains empty string`).not.toBe('');
      }
    }
  });
});
