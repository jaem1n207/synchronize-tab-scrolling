/// <reference types="vitest/globals" />

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * Regression: On Windows displays, `--accent` (HSL 0 0% 96.1%) against the
 * popover/background surface (HSL 0 0% 100%) produced only ~3.9% lightness
 * delta, rendering cmdk's hover/keyboard-focus highlight imperceptible. Mac
 * Retina panels masked the issue. The theme tokens must keep a visible delta.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

const MIN_VISIBLE_LIGHTNESS_DELTA = 7;

const LIGHTNESS = /--([a-z-]+):\s*\d+(?:\.\d+)?\s+\d+(?:\.\d+)?%\s+(\d+(?:\.\d+)?)%/g;

function extractTokens(
  css: string,
  blockStart: RegExp,
  requiredTokens: string[],
): Record<string, number> {
  const global = new RegExp(
    blockStart.source,
    blockStart.flags.includes('g') ? blockStart.flags : `${blockStart.flags}g`,
  );
  let lastError: Error | null = null;

  for (const match of css.matchAll(global)) {
    const fromBlockStart = css.slice(match.index + match[0].length);
    const depth0End = findMatchingBrace(fromBlockStart);
    const block = fromBlockStart.slice(0, depth0End);

    const tokens: Record<string, number> = {};
    for (const tokenMatch of block.matchAll(LIGHTNESS)) {
      tokens[tokenMatch[1]] = Number(tokenMatch[2]);
    }

    if (requiredTokens.every((name) => name in tokens)) return tokens;
    lastError = new Error(`block at index ${match.index} missing ${requiredTokens.join('/')}`);
  }

  throw lastError ?? new Error(`no block matched: ${blockStart}`);
}

function findMatchingBrace(source: string): number {
  let depth = 1;
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new Error('unbalanced braces');
}

function assertDelta(label: string, token: number, surface: number, tokenName: string) {
  const delta = Math.abs(token - surface);
  expect(
    delta,
    `${label}: --${tokenName} (${token}%) vs surface (${surface}%) delta ${delta}% < ${MIN_VISIBLE_LIGHTNESS_DELTA}% — hover/selection invisible on low-contrast displays`,
  ).toBeGreaterThanOrEqual(MIN_VISIBLE_LIGHTNESS_DELTA);
}

// presetShadcn('neutral') baseline — popup inherits these from generated CSS,
// main.css only overrides --accent/--muted so we pin the surface value here.
const POPUP_LIGHT_BACKGROUND = 100;
const POPUP_DARK_BACKGROUND = 3.9;

describe('theme accent contrast (Windows hover/selection visibility)', () => {
  describe('popup (src/shared/styles/main.css)', () => {
    const css = readFileSync(resolve(REPO_ROOT, 'src/shared/styles/main.css'), 'utf8');

    it('overrides --accent and --muted on :root for light mode', () => {
      const tokens = extractTokens(css, /:root\s*\{/, ['accent', 'muted']);
      assertDelta('popup :root', tokens.accent, POPUP_LIGHT_BACKGROUND, 'accent');
      assertDelta('popup :root', tokens.muted, POPUP_LIGHT_BACKGROUND, 'muted');
    });

    it('overrides --accent and --muted on .dark for dark mode', () => {
      const tokens = extractTokens(css, /\.dark\s*\{/, ['accent', 'muted']);
      assertDelta('popup .dark', tokens.accent, POPUP_DARK_BACKGROUND, 'accent');
      assertDelta('popup .dark', tokens.muted, POPUP_DARK_BACKGROUND, 'muted');
    });
  });

  describe('content-script panel (src/contentScripts/panel.tsx)', () => {
    const source = readFileSync(resolve(REPO_ROOT, 'src/contentScripts/panel.tsx'), 'utf8');

    it('light theme block keeps --accent/--muted visible against --background', () => {
      const tokens = extractTokens(source, /\.light\s*\{/, ['accent', 'muted', 'background']);
      assertDelta('panel .light', tokens.accent, tokens.background, 'accent');
      assertDelta('panel .light', tokens.muted, tokens.background, 'muted');
    });

    it('dark theme block keeps --accent/--muted visible against --background', () => {
      const tokens = extractTokens(source, /\.dark\s*\{/, ['accent', 'muted', 'background']);
      assertDelta('panel .dark', tokens.accent, tokens.background, 'accent');
      assertDelta('panel .dark', tokens.muted, tokens.background, 'muted');
    });
  });

  describe('content-script suggestion-toast (src/contentScripts/suggestion-toast.tsx)', () => {
    const source = readFileSync(
      resolve(REPO_ROOT, 'src/contentScripts/suggestion-toast.tsx'),
      'utf8',
    );

    it('light theme block keeps --accent/--muted visible against --background', () => {
      const tokens = extractTokens(source, /\.light\s*\{/, ['accent', 'muted', 'background']);
      assertDelta('suggestion-toast .light', tokens.accent, tokens.background, 'accent');
      assertDelta('suggestion-toast .light', tokens.muted, tokens.background, 'muted');
    });

    it('dark theme block keeps --accent/--muted visible against --background', () => {
      const tokens = extractTokens(source, /\.dark\s*\{/, ['accent', 'muted', 'background']);
      assertDelta('suggestion-toast .dark', tokens.accent, tokens.background, 'accent');
      assertDelta('suggestion-toast .dark', tokens.muted, tokens.background, 'muted');
    });
  });
});
