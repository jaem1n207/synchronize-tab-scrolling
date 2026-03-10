import browser from 'webextension-polyfill';

import type EnMessage from './_locales/en/messages.json';

/**
 * Message key type derived from the English locale (source of truth).
 * All other locales must have identical keys, enforced by `pnpm i18n:validate`.
 */
type MessageKey = keyof typeof EnMessage;

/**
 * Get translated message with optional substitutions for placeholders.
 * Substitutions map to $1, $2, $3... in placeholder content definitions.
 *
 * @example
 * // messages.json: { "greeting": { "message": "Hello $NAME$", "placeholders": { "name": { "content": "$1" } } } }
 * t('greeting', ['World']) // "Hello World"
 */
export const t = (key: MessageKey, substitutions?: string | string[]): string =>
  browser.i18n.getMessage(key, substitutions);
