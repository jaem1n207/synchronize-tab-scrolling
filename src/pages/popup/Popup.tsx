import React from "react";
import { Button, Checkbox, TextField } from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Fuse from "fuse.js";

import { t } from "@src/chrome/i18n";
import { useAsyncErrorBoundaryQuery } from "@shared/component/useAsyncErrorBoundaryQuery";
import Kbd from "./Kbd";

const tabsKeys = {
  all: ["tabs"] as const,
  list: (queryInfo?: chrome.tabs.QueryInfo) =>
    [...tabsKeys.all, "list", queryInfo] as const,
  storage: () => [...tabsKeys.all, "storage"] as const,
  getSyncTabIds: () => [...tabsKeys.storage(), "getSyncTabIds"] as const,
};

const Popup = () => {
  const queryClient = useQueryClient();

  const textFieldRef = React.useRef<HTMLInputElement>(null);

  const [searchKeyword, setSearchKeyword] = React.useState("");

  const { data: tabList = [], isSuccess: tabsLoaded } =
    useAsyncErrorBoundaryQuery({
      queryKey: tabsKeys.list(),
      queryFn: async () => {
        const tabs = await chrome.tabs.query({});
        // Returns "tabs", excluding items with URL 'chrome://newtab/'.
        return tabs.filter((tab) => tab.url !== "chrome://newtab/");
      },
    });
  const [checkedTabIds, setCheckedTabIds] = React.useState<number[]>([]);

  const { data: syncTabIds, isSuccess: syncTabIdsLoaded } =
    useAsyncErrorBoundaryQuery({
      queryKey: tabsKeys.getSyncTabIds(),
      queryFn: async (): Promise<number[]> => {
        return new Promise((resolve, reject) => {
          chrome.runtime.sendMessage(
            { command: "getSyncTabIds" },
            (response) => {
              if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
              } else {
                resolve(response);
              }
            }
          );
        });
      },
      onSuccess: (data) => {
        queryClient.setQueryData(tabsKeys.getSyncTabIds(), data);
      },
    });
  const isSynced = syncTabIds.length > 0;

  const mutateSyncTabIds = useMutation({
    mutationFn: async (syncTabIds: number[]) => {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          { command: "setSyncTabIds", data: { syncTabIds } },
          (response) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve(response);
            }
          }
        );
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(tabsKeys.getSyncTabIds());
    },
  });

  const startSync = () => {
    chrome.runtime.sendMessage({ command: "startSync", data: checkedTabIds });
    mutateSyncTabIds.mutate(checkedTabIds);
  };

  const stopSync = () => {
    chrome.runtime.sendMessage({ command: "stopSync" });
    setCheckedTabIds([]); // clear checkedTabIds
    mutateSyncTabIds.mutate([]); // clear syncTabIds
  };

  const fuse = new Fuse(tabList, {
    keys: ["title", "url"],
  });
  const tabs = searchKeyword
    ? fuse.search(searchKeyword).map((result) => result.item)
    : tabList;

  const sortedTabs = isSynced
    ? tabs.sort((a, b) => (syncTabIds.includes(b.id) ? 1 : -1))
    : tabs;

  const isSearching = searchKeyword !== "";
  const isNotEnoughSelected = checkedTabIds.length < 2;
  const isEmptySearchResult = isSearching && sortedTabs.length === 0;

  const handleChangeCheckedTabIds = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const tabId = Number(event.target.name);
    const isChecked = event.target.checked;

    if (isChecked) {
      setCheckedTabIds([...checkedTabIds, tabId]);
    } else {
      setCheckedTabIds(checkedTabIds.filter((id) => id !== tabId));
    }
  };

  React.useEffect(() => {
    if (tabsLoaded && syncTabIdsLoaded) {
      chrome.runtime.sendMessage({
        command: "updateSyncTabs",
        data: syncTabIds,
      });
    }
  }, [tabsLoaded, syncTabIdsLoaded, syncTabIds]);

  const isMac = window.navigator.platform.includes("Mac");
  const modifierKeyPrefix = isMac ? "⌘" : "Ctrl";
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

  // If open the popup again while syncing, check the tabs being synced.
  React.useEffect(() => {
    setCheckedTabIds(syncTabIds);
  }, [syncTabIds]);

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
              {t("search")}
              <Kbd wide={!isMac}>{modifierKeyPrefix}</Kbd>
              <Kbd>K</Kbd>
            </span>
          }
        />
      </div>

      <div className="py-14" role="list">
        {isEmptySearchResult && (
          <div className="flex items-center justify-center h-12 text-sm select-none text-neutral-400">
            {t("noSearchResult")}
          </div>
        )}
        <div className="grid grid-cols-1 overflow-y-auto max-h-80">
          {sortedTabs.map((tab) => (
            <div
              className={`transition-colors duration-75 select-none hover:bg-neutral-700 ${
                checkedTabIds.includes(tab.id) && "bg-neutral-700"
              }`}
              key={tab.id}
            >
              <label className="flex items-center flex-1 min-w-0 gap-1 cursor-pointer">
                <Checkbox
                  size="small"
                  disabled={isSynced}
                  aria-label={tab.title}
                  checked={checkedTabIds.includes(tab.id)}
                  onChange={handleChangeCheckedTabIds}
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
            size="small"
            fullWidth
          >
            {t("stopSync")}
          </Button>
        ) : (
          <Button
            onClick={startSync}
            variant="contained"
            fullWidth
            size="small"
            disabled={isNotEnoughSelected}
          >
            {isNotEnoughSelected ? t("selectMoreTabs") : t("startSync")}
          </Button>
        )}
      </div>
    </main>
  );
};

export default Popup;
