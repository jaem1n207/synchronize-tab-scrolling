import React from "react";
import { Button, Checkbox, TextField } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Fuse from "fuse.js";

import "@pages/popup/Popup.css";
import Kbd from "./Kbd";

const tabsKeys = {
  all: ["tabs"] as const,
  list: (queryInfo?: chrome.tabs.QueryInfo) =>
    [...tabsKeys.all, "list", queryInfo] as const,
  storage: () => [...tabsKeys.all, "storage"] as const,
  syncTabIds: () => [...tabsKeys.storage(), "syncTabIds"] as const,
  sync: (syncTabIds: number[]) =>
    [...tabsKeys.storage(), "syncs", syncTabIds] as const,
};

const useTabList = (queryInfo?: chrome.tabs.QueryInfo) => {
  return useQuery({
    queryKey: tabsKeys.list(queryInfo),
    queryFn: async () => {
      const tabs = await chrome.tabs.query(queryInfo || {});
      // Returns "tabs", excluding items with URL 'chrome://newtab/'.
      return tabs.filter((tab) => tab.url !== "chrome://newtab/");
    },
    suspense: true,
  });
};

// The maximum number of set, remove, or clear operations that can be performed each hour.
// This is 1 every 2 seconds, a lower ceiling than the short term higher writes-per-minute limit.
// Updates that would cause this limit to be exceeded fail immediately and set runtime.lastError.
const getSyncTabIds = async (): Promise<number[]> => {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(["syncTabIds"], function (result) {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(result.syncTabIds || []);
      }
    });
  });
};

const setSyncTabIds = async (syncTabIds: number[]): Promise<void> => {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set({ syncTabIds }, function () {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
};

const getIsSyncing = async (): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(["isSynced"], function (result) {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(result.isSynced || false);
      }
    });
  });
};

const setIsSyncing = async (isSynced: boolean): Promise<void> => {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set({ isSynced }, function () {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
};

const Popup = () => {
  const queryClient = useQueryClient();

  const { data: tabList = [], isSuccess: tabsLoaded } = useTabList();
  const { data: syncTabIds = [], isSuccess: syncTabIdsLoaded } = useQuery({
    queryKey: tabsKeys.syncTabIds(),
    queryFn: getSyncTabIds,
    onSuccess: (data) => {
      queryClient.setQueryData(tabsKeys.syncTabIds(), data);
    },
  });

  React.useEffect(() => {
    console.log("🚀 ~ file: Popup.tsx:91 ~ Popup ~ syncTabIds:", syncTabIds);
  }, [syncTabIds]);

  const mutation = useMutation({
    mutationFn: setSyncTabIds,
    onSuccess: () => {
      queryClient.invalidateQueries(tabsKeys.syncTabIds());
    },
  });

  const handleChangeSyncTabIds = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const tabId = Number(event.target.name);
    const isChecked = event.target.checked;

    if (isChecked) {
      mutation.mutate([...syncTabIds, tabId]);
    } else {
      mutation.mutate(syncTabIds.filter((id) => id !== tabId));
    }
  };

  const { data: isSynced = false, isSuccess: isSyncedLoaded } = useQuery({
    queryKey: tabsKeys.sync(syncTabIds),
    queryFn: getIsSyncing,
    onSuccess: (data) => {
      queryClient.setQueryData(tabsKeys.sync(syncTabIds), data);
    },
  });

  const syncMutation = useMutation({
    mutationFn: setIsSyncing,
    onSuccess: () => {
      queryClient.invalidateQueries(tabsKeys.sync(syncTabIds));
    },
  });

  const startSync = () => {
    chrome.runtime.sendMessage({ command: "startSync", data: syncTabIds });
    syncMutation.mutate(true);
  };

  const stopSync = () => {
    chrome.runtime.sendMessage({ command: "stopSync" });
    syncMutation.mutate(false);
    mutation.mutate([]); // clear syncTabIds
  };

  React.useEffect(() => {
    if (tabsLoaded && syncTabIdsLoaded) {
      chrome.runtime.sendMessage({
        command: "updateSyncTabs",
        data: syncTabIds,
      });
    }
  }, [tabsLoaded, syncTabIdsLoaded, syncTabIds]);

  const [searchKeyword, setSearchKeyword] = React.useState("");

  const fuse = new Fuse(tabList, {
    keys: ["title", "url"],
  });

  const tabs = searchKeyword
    ? fuse.search(searchKeyword).map((result) => result.item)
    : tabList;

  const isSearching = searchKeyword !== "";
  const isEmptySearchResult = isSearching && tabs.length === 0;
  const isNotEnoughSelected = syncTabIds.length < 2;

  const textFieldRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        textFieldRef.current?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const isMac = window.navigator.platform.includes("Mac");
  const modifierKeyPrefix = isMac ? "⌘" : "Ctrl";

  // I want to sort the tabs that are currently being synced to the top. But if isSynced is false, I don't want to sort it.
  const sortedTabs = isSynced
    ? tabs.sort((a, b) => (syncTabIds.includes(b.id) ? 1 : -1))
    : tabs;

  return (
    <main className="p-3 bg-neutral-900 text-neutral-200">
      <div className="fixed top-0 left-0 right-0 z-10 p-3 bg-neutral-800">
        <TextField
          inputRef={textFieldRef}
          className="w-full"
          value={searchKeyword}
          onChange={(e) => setSearchKeyword(e.target.value)}
          size="small"
          label={
            <span className="flex items-center gap-1 text-sm">
              검색
              <Kbd wide={!isMac}>{modifierKeyPrefix}</Kbd>
              <Kbd>K</Kbd>
            </span>
          }
        />
      </div>

      <div className="py-14" role="list">
        {isEmptySearchResult && (
          <div className="flex items-center justify-center h-12 text-sm select-none text-neutral-400">
            검색 결과가 없어요.
          </div>
        )}
        <div className="grid grid-cols-1 overflow-y-auto max-h-80">
          {sortedTabs.map((tab) => (
            <div
              className={`transition-colors duration-75 select-none hover:bg-neutral-700 ${
                syncTabIds.includes(tab.id) && "bg-neutral-700"
              }`}
              key={tab.id}
            >
              <label className="flex items-center flex-1 min-w-0 gap-1 cursor-pointer">
                <Checkbox
                  disabled={isSynced}
                  aria-label={tab.title}
                  checked={syncTabIds.includes(tab.id)}
                  onChange={handleChangeSyncTabIds}
                  name={tab.id.toString()}
                />
                <img src={tab.favIconUrl} className="w-4 h-4" />
                <div title={tab.title} className="w-full text-xs truncate">
                  {tab.title}
                </div>
              </label>
            </div>
          ))}
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-10 p-3 bg-neutral-800">
        {isSynced ? (
          <Button
            onClick={stopSync}
            variant="contained"
            color="warning"
            fullWidth
          >
            동기화 중지
          </Button>
        ) : (
          <Button
            onClick={startSync}
            variant="contained"
            fullWidth
            disabled={isNotEnoughSelected || !isSyncedLoaded}
          >
            {isNotEnoughSelected
              ? "2개 이상의 탭을 선택해주세요"
              : isSyncedLoaded
              ? "동기화 시작"
              : "동기화 중이예요..."}
          </Button>
        )}
      </div>
    </main>
  );
};

export default Popup;
