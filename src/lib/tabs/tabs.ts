export const chromeApi = {
	getTabs: async (query: chrome.tabs.QueryInfo = {}): Promise<chrome.tabs.Tab[]> => {
		const tabs = await chrome.tabs.query(query);
		return tabs.filter((tab) => tab.url !== 'chrome://newtab/');
	}
};

export const tabKeys = {
	all: [{ scope: 'tab' }] as const,
	lists: (query: chrome.tabs.QueryInfo = {}) => [...tabKeys.all, { type: 'list' }, query] as const,
	list: () => [...tabKeys.all, { type: 'list' }] as const,
	details: () => [...tabKeys.all, { type: 'detail' }] as const,
	detail: (id: number) => [...tabKeys.all, { type: 'detail', id }] as const
};
