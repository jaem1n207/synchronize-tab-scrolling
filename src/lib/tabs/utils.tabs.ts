export const chromeApi = {
	getTabs: async (query: chrome.tabs.QueryInfo = {}): Promise<chrome.tabs.Tab[]> => {
		const tabs = await chrome.tabs.query({
			...query,
			// can use the `chrome.scripting` API to inject JavaScript and CSS into websites.
			// However, can't inject scripts into pages like 'chrome://*/*',
			// so only get information from tabs that match the URL pattern specify.
			url: ['http://*/*', 'https://*/*']
		});

		return tabs;
	},
	// Do not use the `createQuery` function.
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
