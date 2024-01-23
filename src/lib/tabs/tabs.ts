export const chromeApi = {
	getTabs: async (query: chrome.tabs.QueryInfo = {}): Promise<chrome.tabs.Tab[]> => {
		const tabs = await chrome.tabs.query(query);
		return tabs.filter((tab) => tab.url !== 'chrome://newtab/');
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
