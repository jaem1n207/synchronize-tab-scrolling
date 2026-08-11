import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const SUPPORTED_EXTENSION_LOCALES: ReadonlyArray<string> = [
  'en',
  'ko',
  'ja',
  'fr',
  'es',
  'de',
  'zh_CN',
  'zh_TW',
  'hi',
];

export const QUICK_SYNC_REQUIRED_MESSAGES: Readonly<Record<string, ReadonlyArray<string>>> = {
  quickSyncCommandDescription: [],
  quickSyncCandidateSelectedTitle: [],
  quickSyncCandidateInstruction: ['remainingSeconds'],
  quickSyncSameCandidateTitle: [],
  quickSyncConnectingTitle: [],
  quickSyncSecondTabRetryInstruction: ['remainingSeconds'],
  quickSyncStartSucceededTitle: ['tabCount'],
  quickSyncAddSucceededTitle: ['tabCount'],
  quickSyncAlreadyIncludedTitle: ['tabCount'],
  quickSyncSecondTabFailedTitle: [],
  quickSyncAddFailedTitle: [],
  quickSyncExistingTabsContinue: ['tabCount'],
  quickSyncUnsupportedTab: [],
  quickSyncCandidateExpiredAnnouncement: [],
  activeSyncHeading: [],
  activeSyncSummary: ['tabCount'],
  activeSyncAddInstruction: ['shortcutLabel'],
  activeSyncTabsHeading: [],
  activeSyncEditNotice: [],
  currentTabLocation: [],
  otherSyncedTab: [],
  currentWindowLocation: [],
  otherWindowLocation: [],
  reassignQuickSyncShortcut: [],
  quickSyncShortcutUnassigned: [],
  quickSyncShortcutUnavailable: [],
  activeSyncTabUnavailable: [],
  quickSyncShortcutAssignedSummary: ['shortcutLabel'],
  quickSyncShortcutSettingsFallbackChromium: ['settingsUrl'],
  quickSyncShortcutSettingsFallbackFirefox: [],
  manualSyncStateUnavailable: [],
  retryStatusCheck: [],
  syncCleanupIncomplete: [],
  quickSyncShortcutHeading: [],
  autoSyncRecoveryDegraded: [],
  autoSyncReplacementFailed: [],
};

export interface I18nValidationResult {
  errors: Array<string>;
}

export interface I18nValidationOptions {
  requiredMessages?: Readonly<Record<string, ReadonlyArray<string>>>;
}

interface LocaleTree {
  relativePath: 'extension/_locales' | 'src/shared/i18n/_locales';
}

interface MessageEntry {
  placeholderContents: Map<string, string | undefined>;
}

interface LocaleFile {
  entries: Map<string, MessageEntry>;
  relativeFilePath: string;
}

const LOCALE_TREES: ReadonlyArray<LocaleTree> = [
  { relativePath: 'extension/_locales' },
  { relativePath: 'src/shared/i18n/_locales' },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sorted(values: Iterable<string>): Array<string> {
  return Array.from(values).sort();
}

function haveSameValues(first: Iterable<string>, second: Iterable<string>): boolean {
  const firstValues = sorted(first);
  const secondValues = sorted(second);

  return (
    firstValues.length === secondValues.length &&
    firstValues.every((value, index) => value === secondValues[index])
  );
}

function getMessageEntry(
  value: unknown,
  key: string,
  relativeFilePath: string,
  errors: Array<string>,
): MessageEntry {
  const placeholderContents = new Map<string, string | undefined>();

  if (!isRecord(value)) {
    errors.push(`${relativeFilePath}: ${key} is not a message object`);
    return { placeholderContents };
  }

  if (typeof value.message !== 'string' || value.message.trim() === '') {
    errors.push(`${relativeFilePath}: ${key} has an empty message`);
  }

  if (value.placeholders === undefined) {
    return { placeholderContents };
  }

  if (!isRecord(value.placeholders)) {
    errors.push(`${relativeFilePath}: ${key} has invalid placeholders`);
    return { placeholderContents };
  }

  for (const [placeholderName, placeholder] of Object.entries(value.placeholders)) {
    if (!isRecord(placeholder) || typeof placeholder.content !== 'string') {
      errors.push(`${relativeFilePath}: ${key} placeholder ${placeholderName} has invalid content`);
      placeholderContents.set(placeholderName, undefined);
      continue;
    }

    placeholderContents.set(placeholderName, placeholder.content);
  }

  return { placeholderContents };
}

async function readLocaleFile(
  repositoryRoot: string,
  tree: LocaleTree,
  locale: string,
  errors: Array<string>,
): Promise<LocaleFile | undefined> {
  const relativeFilePath = path.join(tree.relativePath, locale, 'messages.json');
  let rawContent: string;

  try {
    rawContent = await readFile(path.join(repositoryRoot, relativeFilePath), 'utf8');
  } catch (error) {
    if (isRecord(error) && error.code === 'ENOENT') {
      errors.push(`${relativeFilePath} is missing`);
    } else {
      errors.push(`${relativeFilePath} could not be read`);
    }
    return undefined;
  }

  let parsedContent: unknown;
  try {
    parsedContent = JSON.parse(rawContent);
  } catch {
    errors.push(`${relativeFilePath} contains invalid JSON`);
    return undefined;
  }

  if (!isRecord(parsedContent)) {
    errors.push(`${relativeFilePath} does not contain a message object`);
    return undefined;
  }

  const entries = new Map<string, MessageEntry>();
  for (const [key, value] of Object.entries(parsedContent)) {
    entries.set(key, getMessageEntry(value, key, relativeFilePath, errors));
  }

  return { entries, relativeFilePath };
}

function validateEnglishParity(
  localeFile: LocaleFile,
  englishFile: LocaleFile,
  errors: Array<string>,
): void {
  for (const key of sorted(englishFile.entries.keys())) {
    if (!localeFile.entries.has(key)) {
      errors.push(`${localeFile.relativeFilePath}: missing key ${key} from English locale`);
    }
  }

  for (const key of sorted(localeFile.entries.keys())) {
    if (!englishFile.entries.has(key)) {
      errors.push(`${localeFile.relativeFilePath}: extra key ${key} not in English locale`);
    }
  }
}

function validateCrossTreeEnglishParity(
  extensionEnglish: LocaleFile,
  sharedEnglish: LocaleFile,
  errors: Array<string>,
): void {
  for (const key of sorted(extensionEnglish.entries.keys())) {
    if (!sharedEnglish.entries.has(key)) {
      errors.push(
        `${sharedEnglish.relativeFilePath}: missing key ${key} from extension English locale`,
      );
    }
  }

  for (const key of sorted(sharedEnglish.entries.keys())) {
    if (!extensionEnglish.entries.has(key)) {
      errors.push(
        `${extensionEnglish.relativeFilePath}: missing key ${key} from shared English locale`,
      );
    }
  }
}

function validateCrossTreePlaceholders(
  locale: string,
  extensionFile: LocaleFile,
  sharedFile: LocaleFile,
  errors: Array<string>,
): void {
  const matchingKeys = sorted(extensionFile.entries.keys()).filter((key) =>
    sharedFile.entries.has(key),
  );

  for (const key of matchingKeys) {
    const extensionEntry = extensionFile.entries.get(key);
    const sharedEntry = sharedFile.entries.get(key);

    if (!extensionEntry || !sharedEntry) {
      continue;
    }

    if (
      !haveSameValues(
        extensionEntry.placeholderContents.keys(),
        sharedEntry.placeholderContents.keys(),
      )
    ) {
      errors.push(`${locale}: ${key} placeholder names differ between locale trees`);
    }

    const sharedPlaceholderNames = new Set(sharedEntry.placeholderContents.keys());
    for (const placeholderName of sorted(extensionEntry.placeholderContents.keys())) {
      if (!sharedPlaceholderNames.has(placeholderName)) {
        continue;
      }

      if (
        extensionEntry.placeholderContents.get(placeholderName) !==
        sharedEntry.placeholderContents.get(placeholderName)
      ) {
        errors.push(
          `${locale}: ${key} placeholder ${placeholderName} differs between locale trees`,
        );
      }
    }
  }
}

function validateRequiredMessages(
  localeFile: LocaleFile,
  requiredMessages: Readonly<Record<string, ReadonlyArray<string>>>,
  errors: Array<string>,
): void {
  for (const [key, requiredPlaceholderNames] of Object.entries(requiredMessages)) {
    const entry = localeFile.entries.get(key);
    if (!entry) {
      errors.push(`${localeFile.relativeFilePath}: required message ${key} is missing`);
      continue;
    }

    if (!haveSameValues(entry.placeholderContents.keys(), requiredPlaceholderNames)) {
      errors.push(
        `${localeFile.relativeFilePath}: ${key} placeholder names do not match required placeholders`,
      );
    }
  }
}

export async function validateI18nTrees(
  repositoryRoot: string,
  options?: I18nValidationOptions,
): Promise<I18nValidationResult> {
  const errors: Array<string> = [];
  const localeFiles = new Map<string, Map<string, LocaleFile | undefined>>();

  for (const tree of LOCALE_TREES) {
    const filesForTree = new Map<string, LocaleFile | undefined>();
    localeFiles.set(tree.relativePath, filesForTree);

    for (const locale of SUPPORTED_EXTENSION_LOCALES) {
      filesForTree.set(locale, await readLocaleFile(repositoryRoot, tree, locale, errors));
    }
  }

  for (const tree of LOCALE_TREES) {
    const filesForTree = localeFiles.get(tree.relativePath);
    const englishFile = filesForTree?.get('en');
    if (!filesForTree || !englishFile) {
      continue;
    }

    for (const locale of SUPPORTED_EXTENSION_LOCALES) {
      if (locale === 'en') {
        continue;
      }

      const localeFile = filesForTree.get(locale);
      if (localeFile) {
        validateEnglishParity(localeFile, englishFile, errors);
      }
    }
  }

  const extensionFiles = localeFiles.get('extension/_locales');
  const sharedFiles = localeFiles.get('src/shared/i18n/_locales');
  const extensionEnglish = extensionFiles?.get('en');
  const sharedEnglish = sharedFiles?.get('en');

  if (extensionEnglish && sharedEnglish) {
    validateCrossTreeEnglishParity(extensionEnglish, sharedEnglish, errors);
  }

  if (extensionFiles && sharedFiles) {
    for (const locale of SUPPORTED_EXTENSION_LOCALES) {
      const extensionFile = extensionFiles.get(locale);
      const sharedFile = sharedFiles.get(locale);
      if (extensionFile && sharedFile) {
        validateCrossTreePlaceholders(locale, extensionFile, sharedFile, errors);
      }
    }
  }

  if (options?.requiredMessages) {
    for (const tree of LOCALE_TREES) {
      const filesForTree = localeFiles.get(tree.relativePath);
      if (!filesForTree) {
        continue;
      }

      for (const locale of SUPPORTED_EXTENSION_LOCALES) {
        const localeFile = filesForTree.get(locale);
        if (localeFile) {
          validateRequiredMessages(localeFile, options.requiredMessages, errors);
        }
      }
    }
  }

  return { errors };
}
