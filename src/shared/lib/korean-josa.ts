import { josa } from 'es-hangul';
import browser from 'webextension-polyfill';

export type KoreanJosaParticle =
  | '이/가'
  | '을/를'
  | '은/는'
  | '으로/로'
  | '와/과'
  | '이나/나'
  | '이란/란'
  | '아/야'
  | '이랑/랑'
  | '이에요/예요'
  | '으로서/로서'
  | '으로써/로써'
  | '으로부터/로부터'
  | '이라/라';

interface KoreanJosaOptions {
  quote?: boolean;
  uiLanguage?: string;
}

export function isKoreanUiLanguage(uiLanguage: string): boolean {
  const normalizedLanguage = uiLanguage.toLowerCase().replace('_', '-');

  return normalizedLanguage === 'ko' || normalizedLanguage.startsWith('ko-');
}

export function formatTitleWithKoreanJosa(
  title: string,
  particle: KoreanJosaParticle,
  options: KoreanJosaOptions = {},
): string {
  if (title.length === 0) {
    return title;
  }

  const uiLanguage = options.uiLanguage ?? browser.i18n.getUILanguage();

  if (!isKoreanUiLanguage(uiLanguage)) {
    return title;
  }

  const titleText = options.quote ? `"${title}"` : title;

  return josa(titleText, particle);
}
