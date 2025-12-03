/**
 * Validates that all locale JSON files have identical keys.
 * Run with: pnpm i18n:validate
 */

import path from 'path';

import fs from 'fs-extra';

const LOCALES_DIR = path.resolve(import.meta.dirname, '../src/shared/i18n/_locales');

interface MessageEntry {
  message?: string;
  placeholders?: Record<string, { content: string; example?: string }>;
}

interface LocaleContent {
  keys: Set<string>;
  emptyMessages: string[];
}

interface ValidationResult {
  isValid: boolean;
  missingKeys: Record<string, string[]>;
  extraKeys: Record<string, string[]>;
  emptyMessages: Record<string, string[]>;
}

async function getLocaleContent(locale: string): Promise<LocaleContent> {
  const filePath = path.join(LOCALES_DIR, locale, 'messages.json');
  const content: Record<string, MessageEntry> = await fs.readJson(filePath);

  const keys = new Set(Object.keys(content));
  const emptyMessages: string[] = [];

  for (const [key, entry] of Object.entries(content)) {
    if (!entry.message || entry.message.trim() === '') {
      emptyMessages.push(key);
    }
  }

  return { keys, emptyMessages };
}

async function validateLocales(): Promise<ValidationResult> {
  const locales = await fs.readdir(LOCALES_DIR);
  const localeContents: Record<string, LocaleContent> = {};

  // Read all locale files
  for (const locale of locales) {
    const stat = await fs.stat(path.join(LOCALES_DIR, locale));
    if (stat.isDirectory()) {
      localeContents[locale] = await getLocaleContent(locale);
    }
  }

  // Use English as the reference
  const referenceLocale = 'en';
  const referenceContent = localeContents[referenceLocale];

  if (!referenceContent) {
    throw new Error('English (en) locale not found!');
  }

  const missingKeys: Record<string, string[]> = {};
  const extraKeys: Record<string, string[]> = {};
  const emptyMessages: Record<string, string[]> = {};

  // Compare each locale against English
  for (const [locale, content] of Object.entries(localeContents)) {
    const missing: string[] = [];
    const extra: string[] = [];

    if (locale !== referenceLocale) {
      // Find missing keys (in en but not in locale)
      for (const key of referenceContent.keys) {
        if (!content.keys.has(key)) {
          missing.push(key);
        }
      }

      // Find extra keys (in locale but not in en)
      for (const key of content.keys) {
        if (!referenceContent.keys.has(key)) {
          extra.push(key);
        }
      }

      if (missing.length > 0) missingKeys[locale] = missing;
      if (extra.length > 0) extraKeys[locale] = extra;
    }

    // Check for empty messages in all locales (including en)
    if (content.emptyMessages.length > 0) {
      emptyMessages[locale] = content.emptyMessages;
    }
  }

  const isValid =
    Object.keys(missingKeys).length === 0 &&
    Object.keys(extraKeys).length === 0 &&
    Object.keys(emptyMessages).length === 0;

  return { isValid, missingKeys, extraKeys, emptyMessages };
}

async function main() {
  console.log('Validating i18n locale files...\n');

  try {
    const result = await validateLocales();

    if (result.isValid) {
      console.log(
        '\x1b[32m%s\x1b[0m',
        '✓ All locale files have identical keys and valid messages!',
      );
      process.exit(0);
    }

    console.log('\x1b[31m%s\x1b[0m', '✗ Locale validation failed!\n');

    if (Object.keys(result.missingKeys).length > 0) {
      console.log('\x1b[33m%s\x1b[0m', 'Missing keys (present in en but missing in):');
      for (const [locale, keys] of Object.entries(result.missingKeys)) {
        console.log(`  ${locale}:`);
        keys.forEach((key) => console.log(`    - ${key}`));
      }
      console.log();
    }

    if (Object.keys(result.extraKeys).length > 0) {
      console.log('\x1b[33m%s\x1b[0m', 'Extra keys (not in en but present in):');
      for (const [locale, keys] of Object.entries(result.extraKeys)) {
        console.log(`  ${locale}:`);
        keys.forEach((key) => console.log(`    - ${key}`));
      }
      console.log();
    }

    if (Object.keys(result.emptyMessages).length > 0) {
      console.log('\x1b[33m%s\x1b[0m', 'Empty or missing message values:');
      for (const [locale, keys] of Object.entries(result.emptyMessages)) {
        console.log(`  ${locale}:`);
        keys.forEach((key) => console.log(`    - ${key}`));
      }
    }

    process.exit(1);
  } catch (error) {
    console.error('\x1b[31m%s\x1b[0m', 'Error:', error);
    process.exit(1);
  }
}

main();
