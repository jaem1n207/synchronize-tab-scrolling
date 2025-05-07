import browser from 'webextension-polyfill';

import type EnMessage from './_locales/en/messages.json';
import type KoMessage from './_locales/ko/messages.json';

type MessageKey = keyof typeof EnMessage | keyof typeof KoMessage;

export const getTranslation = (key: MessageKey): string => browser.i18n.getMessage(key);
