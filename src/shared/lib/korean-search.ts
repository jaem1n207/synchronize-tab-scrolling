import { getChoseong } from 'es-hangul';

/**
 * Check if a string contains only Korean chosung (initial consonants)
 * Chosung range: ㄱ-ㅎ (U+3131 - U+314E)
 */
function isChosungOnly(str: string): boolean {
  const CHOSUNG_REGEX = /^[ㄱ-ㅎ\s]+$/;
  return CHOSUNG_REGEX.test(str);
}

/**
 * Enhanced Korean text matching with chosung (initial consonant) search support
 *
 * Examples:
 * - matchesKoreanSearch('구글 크롬', 'ㄱㄱㅋㄹ') → true (chosung match)
 * - matchesKoreanSearch('구글', 'ㄱㄱ') → true (chosung match)
 * - matchesKoreanSearch('구글', '구') → true (regular substring match)
 * - matchesKoreanSearch('Google', 'goo') → true (case-insensitive match)
 *
 * @param text - The text to search in (e.g., tab title or URL)
 * @param query - The search query
 * @returns true if the query matches the text
 */
export function matchesKoreanSearch(text: string, query: string): boolean {
  // Empty query matches everything
  if (!query || query.trim() === '') {
    return true;
  }

  const normalizedQuery = query.trim();
  const normalizedText = text.trim();

  // Check if query is chosung-only (e.g., "ㄱㄱ")
  if (isChosungOnly(normalizedQuery)) {
    // Extract chosung from the text and compare
    const textChosung = getChoseong(normalizedText);
    // Remove spaces from both for more flexible matching
    const queryWithoutSpaces = normalizedQuery.replace(/\s/g, '');
    const chosungWithoutSpaces = textChosung.replace(/\s/g, '');

    // Check if the text's chosung contains the query chosung
    return chosungWithoutSpaces.includes(queryWithoutSpaces);
  }

  // Regular case-insensitive substring matching
  return normalizedText.toLowerCase().includes(normalizedQuery.toLowerCase());
}
