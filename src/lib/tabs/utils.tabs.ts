export const chromeApi = {
	getTabs: async (query: chrome.tabs.QueryInfo = {}): Promise<chrome.tabs.Tab[]> => {
		const tabs = await chrome.tabs.query({
			...query,
			// chrome://*/* 페이지에서는 스크립트를 삽입할 수 없습니다.
			url: ['http://*/*', 'https://*/*']
		});
		return tabs;
	},
	// `createQuery` 함수를 사용하지 않습니다.
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
 * 선택된 탭의 고유 식별자를 가져옵니다.
 *
 * 브라우저 탭에 스크립트를 삽입할 때 `tabId`만 필요하므로 `chrome.tabs.Tab` 객체에서 `tabId`만 추출합니다. (sessionId, index는 활용하지 않습니다)
 *
 * @param {chrome.tabs.Tab} tab - 사용자가 선택한 탭 객체
 */
export const getTabIdentifier = (tabId: chrome.tabs.Tab['id']): number => {
	if (tabId == null) {
		throw new Error(
			`${tabId} tab does not have an id. Under some circumstances a Tab may not be assigned an ID, for example when querying foreign tabs using the sessions API, in which case a session ID may be present.`
		);
	}

	return tabId;
};
