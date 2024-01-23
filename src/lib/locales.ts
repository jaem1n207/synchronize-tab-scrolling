import { browser } from '$app/environment';
import type EnMessage from '../../static/_locales/en/messages.json';
import type KoMessage from '../../static/_locales/ko/messages.json';

type MessageKey = keyof typeof EnMessage | keyof typeof KoMessage;

export const getLocalMessage = (messageName: MessageKey): string => {
	if (browser) {
		return chrome.i18n.getMessage(messageName);
	}
	return '';
};
