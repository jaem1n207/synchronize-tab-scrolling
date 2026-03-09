import { useState, useEffect, useMemo, useCallback } from 'react';

import browser from 'webextension-polyfill';

import { t } from '~/shared/i18n';
import { ExtensionLogger } from '~/shared/lib/logger';
import {
  sortTabsWithDomainGrouping,
  sortTabsByRecentVisits,
  filterTabsBySameDomain,
} from '~/shared/lib/tab-similarity';
import { isForbiddenUrl } from '~/shared/lib/url-utils';

import type { TabInfo, ErrorState } from '../types';
import type { SortOption } from '../types/filters';

const logger = new ExtensionLogger({ scope: 'popup' });

interface UseTabDiscoveryParams {
  selectedTabIds: Array<number>;
  sortBy: SortOption;
  sameDomainFilter: boolean;
}

interface UseTabDiscoveryReturn {
  tabs: Array<TabInfo>;
  currentTabId: number | undefined;
  filteredAndSortedTabs: Array<TabInfo>;
  selectedTabsInfo: Array<TabInfo>;
  tabDiscoveryError: ErrorState | null;
  dismissTabDiscoveryError: () => void;
}

function getIneligibleReason(url: string): string | undefined {
  if (
    url.includes('chrome.google.com/webstore') ||
    url.includes('microsoftedge.microsoft.com/addons') ||
    url.includes('addons.mozilla.org')
  ) {
    return t('ineligibleWebStore');
  }
  if (url.match(/^https?:\/\/(drive|docs|sheets|mail)\.google\.com/)) {
    return t('ineligibleGoogleServices');
  }
  if (url.match(/^(chrome|edge|about|firefox|moz-extension|chrome-extension):/)) {
    return t('ineligibleBrowserInternal');
  }
  if (url.match(/^(view-source|data|javascript|file|blob):/)) {
    return t('ineligibleSpecialProtocol');
  }
  return t('ineligibleSecurityRestriction');
}

function toBrowserTab(tab: browser.Tabs.Tab): TabInfo | null {
  if (tab.id === undefined) return null;

  const url = tab.url || '';
  const isForbidden = isForbiddenUrl(url);

  return {
    id: tab.id,
    title: tab.title || t('untitled'),
    url,
    favIconUrl: tab.favIconUrl,
    eligible: !isForbidden,
    ineligibleReason: isForbidden ? getIneligibleReason(url) : undefined,
    lastAccessed: tab.lastAccessed,
  };
}

export function useTabDiscovery({
  selectedTabIds,
  sortBy,
  sameDomainFilter,
}: UseTabDiscoveryParams): UseTabDiscoveryReturn {
  const [tabs, setTabs] = useState<Array<TabInfo>>([]);
  const [currentTabId, setCurrentTabId] = useState<number>();
  const [tabDiscoveryError, setTabDiscoveryError] = useState<ErrorState | null>(null);

  const queryBrowserTabs = useCallback(async (): Promise<Array<TabInfo>> => {
    const browserTabs = await browser.tabs.query({ currentWindow: true });

    const [currentTab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (currentTab?.id) {
      setCurrentTabId(currentTab.id);
    }

    const tabInfos = browserTabs.map(toBrowserTab).filter((tab): tab is TabInfo => tab !== null);

    setTabs(tabInfos);
    return tabInfos;
  }, []);

  useEffect(() => {
    queryBrowserTabs().catch((err) => {
      logger.error('Failed to query browser tabs:', err);
      setTabDiscoveryError({
        message: t('errorLoadTabsFailed'),
        severity: 'error',
        timestamp: Date.now(),
        action: {
          label: t('retry'),
          handler: () => {
            setTabDiscoveryError(null);
            queryBrowserTabs().catch(() => {});
          },
        },
      });
      setTabs([]);
    });
  }, [queryBrowserTabs]);

  const dismissTabDiscoveryError = useCallback(() => {
    setTabDiscoveryError(null);
  }, []);

  const filteredAndSortedTabs = useMemo(() => {
    let processedTabs = [...tabs];

    if (sameDomainFilter) {
      processedTabs = filterTabsBySameDomain(processedTabs, currentTabId);
    }

    if (sortBy === 'similarity') {
      processedTabs = sortTabsWithDomainGrouping(processedTabs, currentTabId);
    } else if (sortBy === 'recent') {
      processedTabs = sortTabsByRecentVisits(processedTabs);
    }

    return processedTabs;
  }, [tabs, sameDomainFilter, sortBy, currentTabId]);

  const selectedTabsInfo = useMemo(
    () => tabs.filter((tab) => selectedTabIds.includes(tab.id)),
    [tabs, selectedTabIds],
  );

  return {
    tabs,
    currentTabId,
    filteredAndSortedTabs,
    selectedTabsInfo,
    tabDiscoveryError,
    dismissTabDiscoveryError,
  };
}
