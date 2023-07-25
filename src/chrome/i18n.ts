import type EnMessage from "../../public/_locales/en/messages.json";
import type KoMessage from "../../public/_locales/ko/messages.json";

type MessageKey = keyof typeof EnMessage | keyof typeof KoMessage;

export const t = (key: MessageKey) => chrome.i18n.getMessage(key);
