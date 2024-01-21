chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	if (request.command === 'getSyncTabIds') {
		chrome.storage.sync.get(['syncTabIds'], (result) => {
			if (chrome.runtime.lastError) {
				// The maximum number of set, remove, or clear operations that can be performed each hour.
				// This is 1 every 2 seconds, a lower ceiling than the short term higher writes-per-minute limit.
				// Updates that would cause this limit to be exceeded fail immediately and set runtime.lastError.
				sendResponse(chrome.runtime.lastError);
			} else {
				sendResponse(result.syncTabIds || []);
			}
		});

		return true;
	}

	if (request.command === 'setSyncTabIds') {
		const { syncTabIds } = request.data;
		chrome.storage.sync.set({ syncTabIds }, () => {
			if (chrome.runtime.lastError) {
				sendResponse(chrome.runtime.lastError);
			} else {
				sendResponse();
			}
		});

		return true;
	}

	if (request.command === 'startSync') {
		const checkedTabIds: number[] = request.data || [];

		checkedTabIds.forEach((tabId) => {
			// `Uncaught (in promise) Error: Could not establish connection. Receiving end does not exist.`
			// This error means that the content script hasn't been injected into the tab when the chrome.tabs.sendMessage method is called from the background script.

			// Check if the tab exists and is available.
			chrome.tabs.get(tabId, () => {
				if (chrome.runtime.lastError) {
					console.error(`Error in chrome.tabs.get: ${chrome.runtime.lastError}`);
					return;
				}

				// Inject the content script to the tab
				chrome.scripting.executeScript(
					{
						target: { tabId },
						files: ['src/pages/content/index.js']
					},
					() => {
						// After successful injection, send the message
						if (chrome.runtime.lastError) {
							console.error(
								`Error in chrome.scripting.executeScript: ${chrome.runtime.lastError.message}`
							);
							return;
						}

						chrome.tabs.sendMessage(tabId, {
							command: 'startSyncTab',
							data: tabId
						});

						console.debug('Sent startSyncTab message to tab', tabId, 'with data', tabId);
					}
				);
			});
		});
	}

	if (request.command === 'stopSync') {
		const checkedTabIds: number[] = request.data || [];

		if (checkedTabIds.length) {
			checkedTabIds.forEach((tabId) => {
				chrome.tabs.sendMessage(tabId, {
					command: 'stopSyncTab',
					data: tabId
				});
			});
		}
	}

	if (request.command === 'syncScroll') {
		const senderTabId = sender.tab?.id;
		const { scrollYPercentage } = request.data;
		console.debug(
			'Received syncScroll message from tab',
			sender.tab?.id,
			'with data',
			request.data
		);

		if (!senderTabId) return;

		// FIXME: 크롬 버전 업그레이드에 따른 props 수정 필요
		// @ts-expect-error
		chrome.storage.sync.get(['syncTabIds'], (result: { syncTabIds: number[] }) => {
			if (chrome.runtime.lastError) {
				console.error(chrome.runtime.lastError);
			} else {
				const { syncTabIds } = result;

				if (!syncTabIds) return;

				if (syncTabIds.length && syncTabIds.includes(senderTabId)) {
					for (const tabId of syncTabIds) {
						// Prevent sending messages to the sender tab.
						if (tabId !== senderTabId) {
							console.debug('Sending syncScrollForTab message to tab', tabId);
							chrome.tabs.sendMessage(tabId, {
								command: 'syncScrollForTab',
								data: { scrollYPercentage }
							});
						}
					}
				}
			}
		});
	}
});

const stopSync = (tabId: number) => {
	chrome.storage.sync.get(['syncTabIds'], (result) => {
		if (chrome.runtime.lastError) {
			console.error(chrome.runtime.lastError);
		} else {
			const { syncTabIds } = result;

			if (!syncTabIds || syncTabIds?.length === 0) return;

			if (syncTabIds.length && syncTabIds.includes(tabId)) {
				chrome.storage.sync.set({ syncTabIds: [] }, () => {
					if (chrome.runtime.lastError) {
						console.error(chrome.runtime.lastError);
					}
				});
			}
		}
	});
};

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
	// Ensures that synchronized tabs stay in sync when they are refreshed.
	if (changeInfo.status === 'complete') {
		chrome.storage.sync.get(['syncTabIds'], (result) => {
			if (chrome.runtime.lastError) {
				console.error(chrome.runtime.lastError);
			} else {
				const { syncTabIds } = result;

				if (!syncTabIds || syncTabIds?.length === 0) return;

				if (syncTabIds.length && syncTabIds.includes(tabId)) {
					chrome.tabs.sendMessage(tabId, {
						command: 'startSyncTab',
						data: tabId
					});
				}
			}
		});
	}
});

// Stop syncing if removed tab IDs are included in syncTabIds.
chrome.tabs.onRemoved.addListener((tabId) => {
	stopSync(tabId);
});

// `Error: Could not establish connection. Receiving end does not exist.` error occurs when the tab is closed while the message is being sent.
