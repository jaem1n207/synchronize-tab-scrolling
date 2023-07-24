import reloadOnUpdate from "virtual:reload-on-update-in-background-script";

reloadOnUpdate("pages/background");

/**
 * Extension reloading is necessary because the browser automatically caches the css.
 * If you do not use the css of the content script, please delete it.
 */
reloadOnUpdate("pages/content/style.scss");

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.command === "getSyncTabIds") {
    chrome.storage.sync.get(["syncTabIds"], (result) => {
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

  if (request.command === "setSyncTabIds") {
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

  if (request.command === "startSync") {
    const checkedTabIds: number[] = request.data || [];

    checkedTabIds.forEach((tabId) => {
      chrome.tabs.sendMessage(tabId, {
        command: "startSyncTab",
        data: tabId,
      });
    });
  }

  if (request.command === "stopSync") {
    const checkedTabIds: number[] = request.data || [];

    if (checkedTabIds.length) {
      checkedTabIds.forEach((tabId) => {
        chrome.tabs.sendMessage(tabId, {
          command: "stopSyncTab",
          data: tabId,
        });
      });
    }
  }

  if (request.command === "syncScroll") {
    const senderTabId = sender.tab?.id;
    const { scrollYPercentage } = request.data;
    console.log(
      "Received syncScroll message from tab",
      sender.tab?.id,
      "with data",
      request.data
    );

    if (!senderTabId) return;

    chrome.storage.sync.get(
      ["syncTabIds"],
      (result: { syncTabIds: number[] }) => {
        if (chrome.runtime.lastError) {
          console.error(chrome.runtime.lastError);
        } else {
          const { syncTabIds } = result;

          if (!syncTabIds) return;

          if (syncTabIds.length && syncTabIds.includes(senderTabId)) {
            for (const tabId of syncTabIds) {
              // Prevent sending messages to the sender tab.
              if (tabId !== senderTabId) {
                console.log("Sending syncScrollForTab message to tab", tabId);
                chrome.tabs.sendMessage(tabId, {
                  command: "syncScrollForTab",
                  data: { scrollYPercentage },
                });
              }
            }
          }
        }
      }
    );
  }
});

// Stop syncing if removed tab IDs are included in syncTabIds.
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.sync.get(["syncTabIds"], (result) => {
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
});

// `Error: Could not establish connection. Receiving end does not exist.` error occurs when the tab is closed while the message is being sent.
// https://stackoverflow.com/questions/20077487/chrome-extension-message-passing-response-not-sent
