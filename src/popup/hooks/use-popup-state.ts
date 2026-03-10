import { useState, useCallback, useEffect, useRef } from 'react';

import { usePersistentState } from '~/shared/hooks/use-persistent-state';
import { saveSelectedTabIds } from '~/shared/lib/storage';

import { DEFAULT_PREFERENCES } from '../types/filters';

import type { SortOption } from '../types/filters';

interface UsePopupStateReturn {
  selectedTabIds: Array<number>;
  setSelectedTabIds: React.Dispatch<React.SetStateAction<Array<number>>>;
  actionsMenuOpen: boolean;
  setActionsMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  searchInputRef: React.RefObject<{ focus: () => void } | null>;
  sortBy: SortOption;
  setSortBy: (value: SortOption | ((prev: SortOption) => SortOption)) => void;
  sameDomainFilter: boolean;
  setSameDomainFilter: (value: boolean | ((prev: boolean) => boolean)) => void;
  handleToggleTab: (tabId: number) => void;
  handleContainerClick: (e: React.MouseEvent) => void;
}

const INTERACTIVE_SELECTORS =
  'button, input, a, textarea, select, [role="button"], [role="checkbox"], [role="switch"], [role="menuitem"]';

export function usePopupState(): UsePopupStateReturn {
  const [selectedTabIds, setSelectedTabIds] = useState<Array<number>>([]);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const searchInputRef = useRef<{ focus: () => void } | null>(null);

  const [sortBy, setSortBy] = usePersistentState<SortOption>(
    'popup-sort-by',
    DEFAULT_PREFERENCES.sortBy,
  );
  const [sameDomainFilter, setSameDomainFilter] = usePersistentState<boolean>(
    'popup-same-domain-filter',
    DEFAULT_PREFERENCES.filters.sameDomainOnly,
  );

  const handleToggleTab = useCallback((tabId: number) => {
    setSelectedTabIds((prev) => {
      const newSelection = prev.includes(tabId)
        ? prev.filter((id) => id !== tabId)
        : [...prev, tabId];

      saveSelectedTabIds(newSelection);
      return newSelection;
    });
  }, []);

  useEffect(() => {
    if (!actionsMenuOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [actionsMenuOpen]);

  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const isInteractive = target.closest(INTERACTIVE_SELECTORS);

    if (!isInteractive) {
      setTimeout(() => searchInputRef.current?.focus(), 0);
    }
  }, []);

  return {
    selectedTabIds,
    setSelectedTabIds,
    actionsMenuOpen,
    setActionsMenuOpen,
    searchInputRef,
    sortBy,
    setSortBy,
    sameDomainFilter,
    setSameDomainFilter,
    handleToggleTab,
    handleContainerClick,
  };
}
