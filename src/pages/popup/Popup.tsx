import React from "react";
import {
  Button,
  Checkbox,
  FormControlLabel,
  FormGroup,
  TextField,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";

import "@pages/popup/Popup.css";

const tabsKeys = {
  all: ["tabs"] as const,
  list: () => [...tabsKeys.all, "list"] as const,
};

const useTabList = () => {
  return useQuery({
    queryKey: tabsKeys.list(),
    queryFn: async () => {
      const tabs = await chrome.tabs.query({});
      return tabs ?? [];
    },
    suspense: true,
    staleTime: 1000 * 60 * 5,
  });
};

const Popup = () => {
  const { data: tabList } = useTabList();

  const [syncTabs, setSyncTabs] = React.useState<{
    [key: number]: boolean;
  }>({});
  const [searchKeyword, setSearchKeyword] = React.useState("");

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSyncTabs({
      ...syncTabs,
      [event.target.name]: event.target.checked,
    });
  };

  const tabs = React.useMemo(() => {
    if (searchKeyword === "") {
      return tabList;
    } else {
      return tabList.filter((tab) =>
        tab.title.toLowerCase().includes(searchKeyword.toLowerCase())
      );
    }
  }, [searchKeyword]);

  return (
    <main className="p-3 bg-neutral-900 text-neutral-200">
      <div className="fixed top-0 left-0 right-0 z-10 p-3 bg-neutral-800">
        <TextField
          className="w-full"
          value={searchKeyword}
          onChange={(e) => setSearchKeyword(e.target.value)}
          size="small"
          label="탭 제목으로 검색"
        />
      </div>

      <div className="flex flex-col gap-1 py-12">
        <FormGroup>
          {tabs.map((tab) => (
            <FormControlLabel
              className="transition-colors duration-75 select-none hover:bg-neutral-700"
              key={tab.id}
              control={
                <Checkbox
                  checked={syncTabs[tab.id]}
                  onChange={handleChange}
                  name={tab.id.toString()}
                />
              }
              label={
                <div className="flex items-center gap-1">
                  <img src={tab.favIconUrl} className="w-4 h-4" />
                  <div title={tab.title} className="flex-auto text-xs truncate">
                    {tab.title}
                  </div>
                </div>
              }
            />
          ))}
        </FormGroup>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-10 p-3 bg-neutral-800">
        <Button
          variant="contained"
          fullWidth
          disabled={Object.values(syncTabs).filter(Boolean).length < 2}
        >
          탭 그룹 생성
        </Button>
      </div>
    </main>
  );
};

export default Popup;
