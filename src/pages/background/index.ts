import reloadOnUpdate from "virtual:reload-on-update-in-background-script";

reloadOnUpdate("pages/background");

/**
 * Extension reloading is necessary because the browser automatically caches the css.
 * If you do not use the css of the content script, please delete it.
 */
reloadOnUpdate("pages/content/style.scss");

let syncTabIds: number[] = [];
let isSyncing = false;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.command === "startSync") {
    syncTabIds = request.data;
    isSyncing = true;
  }

  if (request.command === "stopSync") {
    isSyncing = false;
  }

  console.log(
    "🚀 ~ file: index.ts:23 ~ chrome.runtime.onMessage.addListener ~ isSyncing:",
    isSyncing
  );

  if (request.command === "scroll" && isSyncing) {
    const { percentage } = request.data;
    const sourceTabId = sender.tab?.id;
    if (!sourceTabId) return; // if tab id is undefined, don't do anything
    for (const tabId of syncTabIds) {
      if (tabId !== sourceTabId) {
        console.log(
          "🚀 ~ file: index.ts:39 ~ chrome.runtime.onMessage.addListener ~ tabId",
          tabId,
          percentage
        );
        chrome.tabs.sendMessage(tabId, { command: "scroll", data: percentage });
      }
    }
  }
});

// Stop syncing if removed tab IDs are included in syncTabIds.
chrome.tabs.onRemoved.addListener((tabId) => {
  if (syncTabIds.length && syncTabIds.includes(tabId)) {
    console.log("removed!");
    isSyncing = false;
    syncTabIds = [];
  }
});
