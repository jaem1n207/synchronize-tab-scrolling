import { createWebExtensionPolyfillObj } from '../webextension-polyfill';

export const chromeApi = {
  getTabs: async (
    queryInfo: webExtension.tabs.QueryInfo = {}
  ): Promise<webExtension.tabs.Tab[]> => {
    const browser = createWebExtensionPolyfillObj();
    return browser.tabs.query(queryInfo);
  },
  getTabById: async (tabId: number): Promise<webExtension.tabs.Tab> => {
    const browser = createWebExtensionPolyfillObj();
    return browser.tabs.get(tabId);
  },
  getSyncTabIds: async (): Promise<number[]> => {
    const browser = createWebExtensionPolyfillObj();
    return await browser.runtime.sendMessage({ command: 'getSyncTabIds' });
  }
};

export const tabKeys = {
  all: [{ scope: 'tab' }] as const,
  lists: (query: webExtension.tabs.QueryInfo = {}) =>
    [...tabKeys.all, { type: 'list' }, query] as const,
  list: () => [...tabKeys.all, { type: 'list' }] as const,
  sync: () => [...tabKeys.all, { type: 'sync' }] as const
};

/**
 * Get the unique identifier of the selected tab.
 *
 * Extracts only the `tabId` from the `webExtension.tabs.Tab` object, as only the `tabId` is needed when inserting a script into a tab in the browser. (Don't use sessionId, index)
 *
 * @param {webExtension.tabs.Tab} tab - The `webExtension.tabs.Tab` object selected by the user
 */
export const getTabIdentifier = (tabId: webExtension.tabs.Tab['id']): number => {
  if (tabId == null) {
    throw new Error(
      `${tabId} tab does not have an id. Under some circumstances a Tab may not be assigned an ID, for example when querying foreign tabs using the sessions API, in which case a session ID may be present.`
    );
  }

  return tabId;
};
