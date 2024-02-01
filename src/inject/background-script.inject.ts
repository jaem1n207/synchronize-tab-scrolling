chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.command === 'getSyncTabIds') {
    chrome.storage.local.get(['syncTabIds'], (result) => {
      if (chrome.runtime.lastError) {
        sendResponse(chrome.runtime.lastError);
        return;
      }

      sendResponse(result.syncTabIds || []);
    });

    return true;
  }

  if (request.command === 'setSyncTabIds') {
    const { syncTabIds } = request.data;
    chrome.storage.local.set({ syncTabIds }, () => {
      if (chrome.runtime.lastError) {
        sendResponse(chrome.runtime.lastError);
        return;
      }

      sendResponse();
    });

    return true;
  }

  if (request.command === 'startSync') {
    const checkedTabIds: number[] = request.data || [];

    for (const tabId of checkedTabIds) {
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
            files: ['content-script.js']
          },
          () => {
            if (chrome.runtime.lastError) {
              console.error(
                `Error in chrome.scripting.executeScript: ${chrome.runtime.lastError.message}`
              );
              return;
            }
            // After successful injection, send the message
            chrome.tabs.sendMessage(tabId, {
              command: 'startSyncTab',
              data: tabId
            });

            console.debug('Sent startSyncTab message to tab', tabId, 'with data', tabId);
          }
        );
      });
    }
  }

  if (request.command === 'stopSync') {
    const checkedTabIds: number[] = request.data || [];

    if (checkedTabIds.length) {
      for (const tabId of checkedTabIds) {
        chrome.tabs.sendMessage(tabId, {
          command: 'stopSyncTab',
          data: tabId
        });
      }
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

    chrome.storage.local.get(['syncTabIds'], (result) => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError);
      } else {
        const { syncTabIds } = result as { syncTabIds: number[] };

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
  chrome.storage.local.get(['syncTabIds'], (result) => {
    if (chrome.runtime.lastError) {
      console.error(chrome.runtime.lastError);
    } else {
      const { syncTabIds } = result;

      if (!syncTabIds || syncTabIds?.length === 0) return;

      if (syncTabIds.length && syncTabIds.includes(tabId)) {
        chrome.storage.local.set({ syncTabIds: [] }, () => {
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
    chrome.storage.local.get(['syncTabIds'], (result) => {
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
