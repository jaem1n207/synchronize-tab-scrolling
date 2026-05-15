import { describe, expect, it, vi } from 'vitest';
import browser from 'webextension-polyfill';

import {
  formatTitleWithKoreanJosa,
  isKoreanUiLanguage,
  type KoreanJosaParticle,
} from './korean-josa';

vi.mock('webextension-polyfill', () => ({
  default: {
    i18n: {
      getUILanguage: vi.fn(() => 'ko'),
    },
  },
}));

describe('isKoreanUiLanguage', () => {
  it.each(['ko', 'ko-KR', 'ko_KR', 'KO-kr'])('detects Korean locale %s', (language) => {
    expect(isKoreanUiLanguage(language)).toBe(true);
  });

  it.each(['en', 'en-US', 'ja', 'zh_CN', ''])('rejects non-Korean locale %s', (language) => {
    expect(isKoreanUiLanguage(language)).toBe(false);
  });
});

describe('formatTitleWithKoreanJosa', () => {
  it('adds subject particle after a Korean title with batchim', () => {
    expect(formatTitleWithKoreanJosa('칫솔', '이/가', { quote: true, uiLanguage: 'ko' })).toBe(
      '"칫솔"이',
    );
  });

  it('adds subject particle after a Korean title without batchim', () => {
    expect(formatTitleWithKoreanJosa('샴푸', '이/가', { quote: true, uiLanguage: 'ko-KR' })).toBe(
      '"샴푸"가',
    );
  });

  it('adds object particle without quotes for popup aria labels', () => {
    expect(formatTitleWithKoreanJosa('칫솔', '을/를', { uiLanguage: 'ko' })).toBe('칫솔을');
    expect(formatTitleWithKoreanJosa('샴푸', '을/를', { uiLanguage: 'ko' })).toBe('샴푸를');
  });

  it('falls back to the browser UI language when uiLanguage is omitted', () => {
    expect(formatTitleWithKoreanJosa('칫솔', '이/가', { quote: true })).toBe('"칫솔"이');
    expect(browser.i18n.getUILanguage).toHaveBeenCalled();
  });

  it('returns the raw title for non-Korean UI languages', () => {
    expect(formatTitleWithKoreanJosa('칫솔', '이/가', { quote: true, uiLanguage: 'en' })).toBe(
      '칫솔',
    );
  });

  it('returns an empty title unchanged', () => {
    const particle: KoreanJosaParticle = '이/가';

    expect(formatTitleWithKoreanJosa('', particle, { quote: true, uiLanguage: 'ko' })).toBe('');
  });
});
