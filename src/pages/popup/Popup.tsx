import React from "react";
import { Button, Checkbox, TextField } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import Fuse from "fuse.js";

import "@pages/popup/Popup.css";
import Kbd from "./Kbd";

const tabsKeys = {
  all: ["tabs"] as const,
  list: (queryInfo?: chrome.tabs.QueryInfo) =>
    [...tabsKeys.all, "list", queryInfo] as const,
};

const useTabList = (queryInfo?: chrome.tabs.QueryInfo) => {
  return useQuery({
    queryKey: tabsKeys.list(queryInfo),
    queryFn: async () => {
      const tabs = await chrome.tabs.query(queryInfo ?? {});
      console.log("🚀 ~ file: Popup.tsx:24 ~ queryFn: ~ tabs:", tabs);

      // Returns "tabs", excluding items with URL 'chrome://newtab/'.
      return tabs.filter((tab) => tab.url !== "chrome://newtab/");
    },
    suspense: true,
  });
};

const Popup = () => {
  const { data: tabList = [] } = useTabList();

  const [syncTabIds, setSyncTabIds] = React.useState<number[]>([]);
  const [searchKeyword, setSearchKeyword] = React.useState("");

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const tabId = Number(event.target.name);
    const isChecked = event.target.checked;

    if (isChecked) {
      setSyncTabIds((prev) => [...prev, tabId]);
    } else {
      setSyncTabIds((prev) => prev.filter((id) => id !== tabId));
    }
  };

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

  return (
    <main className="p-3 bg-neutral-900 text-neutral-200">
      <div className="fixed top-0 left-0 right-0 z-10 p-3 bg-neutral-800">
        <TextField
          inputRef={textFieldRef}
          className="w-full text-sm"
          value={searchKeyword}
          onChange={(e) => setSearchKeyword(e.target.value)}
          size="small"
          label={
            <span className="flex items-center gap-1">
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
        <div className="grid grid-cols-1 overflow-y-auto h-80">
          {tabs.map((tab) => (
            <div
              className={`transition-colors duration-75 select-none hover:bg-neutral-700 ${
                syncTabIds.includes(tab.id) && "bg-neutral-700"
              }`}
              key={tab.id}
            >
              <label className="flex items-center flex-1 min-w-0 gap-1 cursor-pointer">
                <Checkbox
                  checked={syncTabIds.includes(tab.id)}
                  onChange={handleChange}
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
        <Button variant="contained" fullWidth disabled={isNotEnoughSelected}>
          {isNotEnoughSelected ? "2개 이상의 탭을 선택해주세요" : "동기화 시작"}
        </Button>
      </div>
    </main>
  );
};

export default Popup;
