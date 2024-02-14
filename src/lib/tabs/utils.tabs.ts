/**
 * Polyfill for the `chrome.tabs.query` function to work across different browsers.
 * This function checks the environment and uses the appropriate version of the query function.
 * It can be extended in the future to support other browsers like Edge, Brave, Opera, etc.
 */
const queryTabsPolyfill = async (queryInfo: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]> => {
  // Check if the browser is Chrome (or a Chromium-based browser that supports Promises in the tabs API)
  if (
    typeof globalThis.browser === 'undefined' ||
    Object.getPrototypeOf(globalThis.browser) !== Object.prototype
  ) {
    // Use the Promise-based API available in Chrome (MV3)
    return chrome.tabs.query(queryInfo);
  } else {
    // Use the callback-based API for browsers like Firefox
    return new Promise((resolve, reject) => {
      chrome.tabs.query(queryInfo, (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(result);
        }
      });
    });
  }
};

export const chromeApi = {
  getTabs: async (query: chrome.tabs.QueryInfo = {}): Promise<chrome.tabs.Tab[]> => {
    const tabs = await queryTabsPolyfill(query);

    return tabs;
  },
  getTabById: async (tabId: number): Promise<chrome.tabs.Tab> => {
    const tab = await chrome.tabs.get(tabId);

    return tab;
  },
  getSyncTabIds: async (): Promise<number[]> => {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ command: 'getSyncTabIds' }, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });
  }
};

export const tabKeys = {
  all: [{ scope: 'tab' }] as const,
  lists: (query: chrome.tabs.QueryInfo = {}) => [...tabKeys.all, { type: 'list' }, query] as const,
  list: () => [...tabKeys.all, { type: 'list' }] as const,
  sync: () => [...tabKeys.all, { type: 'sync' }] as const
};

/**
 * Get the unique identifier of the selected tab.
 *
 * Extracts only the `tabId` from the `chrome.tabs.Tab` object, as only the `tabId` is needed when inserting a script into a tab in the browser. (Don't use sessionId, index)
 *
 * @param {chrome.tabs.Tab} tab - The `chrome.tabs.Tab` object selected by the user
 */
export const getTabIdentifier = (tabId: chrome.tabs.Tab['id']): number => {
  if (tabId == null) {
    throw new Error(
      `${tabId} tab does not have an id. Under some circumstances a Tab may not be assigned an ID, for example when querying foreign tabs using the sessions API, in which case a session ID may be present.`
    );
  }

  return tabId;
};
