export const chromeApi = {
	getTabs: async (query: chrome.tabs.QueryInfo = {}): Promise<chrome.tabs.Tab[]> => {
		return new Promise<chrome.tabs.Tab[]>((resolve) => {
			chrome.tabs.query(query, resolve);
		});
	},
	getActiveTabs: async (): Promise<chrome.tabs.Tab[] | null> => {
		return (await chromeApi.getTabs({ active: true, currentWindow: true })).filter(
			(tab) => tab.url !== 'chrome://newtab/'
		);
	}
};

export const tabKeys = {
	all: [{ scope: 'tab' }] as const,
	activeLists: () => [...tabKeys.all, { type: 'activeList' }] as const,
	activeList: (query: chrome.tabs.QueryInfo = {}) =>
		[...tabKeys.all, { type: 'activeList', query }] as const,
	details: () => [...tabKeys.all, { type: 'detail' }] as const,
	detail: (id: number) => [...tabKeys.all, { type: 'detail', id }] as const
};
