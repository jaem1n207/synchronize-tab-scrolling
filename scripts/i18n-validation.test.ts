import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { SUPPORTED_EXTENSION_LOCALES, validateI18nTrees } from './i18n-validation';

const temporaryRoots: Array<string> = [];
const sampleMessage = {
  sample: {
    message: 'Value: $VALUE$',
    placeholders: { value: { content: '$1' } },
  },
};

async function writeMessages(
  root: string,
  tree: 'extension/_locales' | 'src/shared/i18n/_locales',
  locale: string,
  messages: object,
): Promise<void> {
  const directory = path.join(root, tree, locale);
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, 'messages.json'),
    `${JSON.stringify(messages, null, 2)}\n`,
    'utf8',
  );
}

async function createLocaleFixture(options?: {
  omit?: { tree: 'extension/_locales' | 'src/shared/i18n/_locales'; locale: string };
  mismatchKoreanPlaceholder?: boolean;
}): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'scroll-sync-i18n-'));
  temporaryRoots.push(root);

  const trees: ReadonlyArray<'extension/_locales' | 'src/shared/i18n/_locales'> = [
    'extension/_locales',
    'src/shared/i18n/_locales',
  ];

  for (const tree of trees) {
    for (const locale of SUPPORTED_EXTENSION_LOCALES) {
      if (options?.omit?.tree === tree && options.omit.locale === locale) {
        continue;
      }

      const messages =
        options?.mismatchKoreanPlaceholder && tree === 'src/shared/i18n/_locales' && locale === 'ko'
          ? {
              sample: {
                message: '값: $VALUE$',
                placeholders: { value: { content: '$2' } },
              },
            }
          : sampleMessage;
      await writeMessages(root, tree, locale, messages);
    }
  }

  await writeMessages(root, 'extension/_locales', 'zh', sampleMessage);
  return root;
}

afterEach(async () => {
  const roots = temporaryRoots.splice(0);
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

describe('validateI18nTrees', () => {
  it('requires the same nine locales in both trees', async () => {
    const root = await createLocaleFixture({
      omit: { tree: 'extension/_locales', locale: 'hi' },
    });
    const result = await validateI18nTrees(root);

    expect(result.errors).toContain('extension/_locales/hi/messages.json is missing');
    expect(SUPPORTED_EXTENSION_LOCALES).toEqual([
      'en',
      'ko',
      'ja',
      'fr',
      'es',
      'de',
      'zh_CN',
      'zh_TW',
      'hi',
    ]);
  });

  it('reports cross-tree placeholder content mismatches', async () => {
    const root = await createLocaleFixture({ mismatchKoreanPlaceholder: true });
    const result = await validateI18nTrees(root);

    expect(result.errors).toContain('ko: sample placeholder value differs between locale trees');
  });

  it('ignores the legacy extension-only zh locale', async () => {
    const root = await createLocaleFixture();
    const result = await validateI18nTrees(root);

    expect(result.errors).toEqual([]);
  });

  it('reports English key mismatches between the two locale trees', async () => {
    const root = await createLocaleFixture();
    await writeMessages(root, 'extension/_locales', 'en', {
      extensionOnly: { message: 'Extension only' },
    });

    const result = await validateI18nTrees(root);

    expect(result.errors).toContain('English locale keys differ between locale trees');
  });

  it('preserves empty-message validation for every supported locale file', async () => {
    const root = await createLocaleFixture();
    await writeMessages(root, 'src/shared/i18n/_locales', 'ja', {
      sample: { message: ' ' },
    });

    const result = await validateI18nTrees(root);

    expect(result.errors).toContain(
      'src/shared/i18n/_locales/ja/messages.json: sample has an empty message',
    );
  });

  it('requires the exact placeholder names for required messages in every locale file', async () => {
    const root = await createLocaleFixture();
    const result = await validateI18nTrees(root, {
      requiredMessages: { sample: ['value', 'other'] },
    });

    expect(result.errors).toContain(
      'extension/_locales/en/messages.json: sample placeholder names do not match required placeholders',
    );
    expect(result.errors).toContain(
      'src/shared/i18n/_locales/hi/messages.json: sample placeholder names do not match required placeholders',
    );
  });
});
