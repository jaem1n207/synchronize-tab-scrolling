import { describe, expect, it } from 'vitest';

import { matchesKoreanSearch } from './korean-search';

describe('matchesKoreanSearch', () => {
  it('should match exact Korean text', () => {
    expect(matchesKoreanSearch('가나다', '가나다')).toBe(true);
    expect(matchesKoreanSearch('구글', '구글')).toBe(true);
    expect(matchesKoreanSearch('크롬', '크롬')).toBe(true);
  });

  it('should match partial Korean text', () => {
    expect(matchesKoreanSearch('가나다라', '가나')).toBe(true);
    expect(matchesKoreanSearch('구글 크롬', '구글')).toBe(true);
    expect(matchesKoreanSearch('한국어 검색', '한국')).toBe(true);
  });

  it('should match Korean chosung (initial consonants)', () => {
    expect(matchesKoreanSearch('구글', 'ㄱㄱ')).toBe(true);
    expect(matchesKoreanSearch('구글 크롬', 'ㄱㄱㅋㄹ')).toBe(true);
    expect(matchesKoreanSearch('한국어', 'ㅎㄱㅇ')).toBe(true);
  });

  it('should match partial chosung', () => {
    expect(matchesKoreanSearch('구글 크롬', 'ㄱㄱ')).toBe(true);
    expect(matchesKoreanSearch('한국어 검색', 'ㅎㄱ')).toBe(true);
  });

  it('should match Korean jamo partial matching', () => {
    expect(matchesKoreanSearch('구글', '국')).toBe(true);
    expect(matchesKoreanSearch('한국', '한')).toBe(true);
  });

  it('should match case-insensitive English text', () => {
    expect(matchesKoreanSearch('Hello', 'hello')).toBe(true);
    expect(matchesKoreanSearch('Google', 'goo')).toBe(true);
    expect(matchesKoreanSearch('CHROME', 'chrome')).toBe(true);
  });

  it('should match partial English text', () => {
    expect(matchesKoreanSearch('Hello World', 'Hello')).toBe(true);
    expect(matchesKoreanSearch('Google Chrome', 'Chrome')).toBe(true);
  });

  it('should return false when no match', () => {
    expect(matchesKoreanSearch('가나다', '라마바')).toBe(false);
    expect(matchesKoreanSearch('Hello', 'xyz')).toBe(false);
    expect(matchesKoreanSearch('구글', 'ㄴㄷ')).toBe(false);
  });

  it('should match empty query', () => {
    expect(matchesKoreanSearch('가나다', '')).toBe(true);
    expect(matchesKoreanSearch('Hello', '')).toBe(true);
    expect(matchesKoreanSearch('', '')).toBe(true);
  });

  it('should match whitespace-only query', () => {
    expect(matchesKoreanSearch('가나다', '   ')).toBe(true);
    expect(matchesKoreanSearch('Hello', '  ')).toBe(true);
  });

  it('should handle empty text', () => {
    expect(matchesKoreanSearch('', 'query')).toBe(false);
    expect(matchesKoreanSearch('', '')).toBe(true);
  });

  it('should match mixed Korean and English text', () => {
    expect(matchesKoreanSearch('구글 Google', '구글')).toBe(true);
    expect(matchesKoreanSearch('구글 Google', 'Google')).toBe(true);
    expect(matchesKoreanSearch('한국어 English', 'ㅎㄱ')).toBe(true);
  });

  it('should handle special characters', () => {
    expect(matchesKoreanSearch('가-나-다', '가-나')).toBe(true);
    expect(matchesKoreanSearch('Hello@World', 'hello@')).toBe(true);
    expect(matchesKoreanSearch('구글(Google)', '구글')).toBe(true);
  });

  it('should trim whitespace from query and text', () => {
    expect(matchesKoreanSearch('  가나다  ', '  가나  ')).toBe(true);
    expect(matchesKoreanSearch('  Hello  ', '  hello  ')).toBe(true);
  });

  it('should handle chosung with spaces', () => {
    expect(matchesKoreanSearch('구 글', 'ㄱ ㄱ')).toBe(true);
    expect(matchesKoreanSearch('한 국 어', 'ㅎ ㄱ')).toBe(true);
  });

  it('should match case-insensitive with mixed case', () => {
    expect(matchesKoreanSearch('HeLLo WoRLd', 'hello')).toBe(true);
    expect(matchesKoreanSearch('GoOgLe ChRoMe', 'chrome')).toBe(true);
  });

  it('should not match when query is longer than text', () => {
    expect(matchesKoreanSearch('가나', '가나다라')).toBe(false);
    expect(matchesKoreanSearch('Hi', 'Hello')).toBe(false);
  });

  it('should handle numbers in text', () => {
    expect(matchesKoreanSearch('가나다123', '가나')).toBe(true);
    expect(matchesKoreanSearch('Hello123', 'hello')).toBe(true);
  });

  it('should handle Korean text with numbers', () => {
    expect(matchesKoreanSearch('구글2024', '구글')).toBe(true);
    expect(matchesKoreanSearch('한국어123', 'ㅎㄱ')).toBe(true);
  });

  it('should match single character Korean text', () => {
    expect(matchesKoreanSearch('가', '가')).toBe(true);
    expect(matchesKoreanSearch('나다라', '나')).toBe(true);
  });

  it('should match single character English text', () => {
    expect(matchesKoreanSearch('a', 'a')).toBe(true);
    expect(matchesKoreanSearch('hello', 'h')).toBe(true);
  });

  it('should match single chosung character', () => {
    expect(matchesKoreanSearch('가나다', 'ㄱ')).toBe(true);
    expect(matchesKoreanSearch('구글', 'ㄱ')).toBe(true);
  });
});
