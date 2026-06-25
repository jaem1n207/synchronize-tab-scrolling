import { act, createElement } from 'react';

import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getFileSchemeAccessInfo,
  type FileSchemeAccessInfo,
} from '~/shared/lib/file-scheme-access';

import { useTabDiscovery } from './use-tab-discovery';

import type browser from 'webextension-polyfill';

const { getFileSchemeAccessInfoMock, tabsQueryMock } = vi.hoisted(() => ({
  getFileSchemeAccessInfoMock: vi.fn<() => Promise<FileSchemeAccessInfo>>(),
  tabsQueryMock: vi.fn(),
}));

vi.mock('webextension-polyfill', () => ({
  default: {
    tabs: {
      query: tabsQueryMock,
    },
  },
}));

vi.mock('~/shared/lib/file-scheme-access', () => ({
  getFileSchemeAccessInfo: getFileSchemeAccessInfoMock,
}));

vi.mock('~/shared/i18n', () => ({
  t: (key: string): string => key,
}));

vi.mock('~/shared/lib/logger', () => ({
  ExtensionLogger: vi.fn().mockImplementation(() => ({
    error: vi.fn(),
  })),
}));

type BrowserTab = browser.Tabs.Tab;
type QueryInfo = Parameters<typeof browser.tabs.query>[0];

interface HookResult<T> {
  current: T;
}

interface RenderHookResult<T> {
  result: HookResult<T>;
  unmount: () => void;
}

function renderHook<T>(hook: () => T): RenderHookResult<T> {
  const container = document.createElement('div');
  const root = createRoot(container);
  let value: T;

  function HookHost(): null {
    value = hook();
    return null;
  }

  act(() => {
    root.render(createElement(HookHost));
  });

  return {
    result: {
      get current() {
        return value;
      },
    },
    unmount: () => {
      act(() => {
        root.unmount();
      });
    },
  };
}

function enableReactActEnvironment(): void {
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
    configurable: true,
    value: true,
    writable: true,
  });
}

async function waitFor(assertion: () => void): Promise<void> {
  const timeoutAt = Date.now() + 1_000;
  while (Date.now() < timeoutAt) {
    try {
      assertion();
      return;
    } catch {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
    }
  }
  assertion();
}

function makeTab(overrides: Partial<BrowserTab>): BrowserTab {
  return {
    active: false,
    highlighted: false,
    id: 1,
    incognito: false,
    index: 0,
    pinned: false,
    title: 'Example',
    url: 'https://example.com',
    ...overrides,
  };
}

function mockTabQueries(tabs: Array<BrowserTab>, activeTab = tabs[0]): void {
  tabsQueryMock.mockImplementation((queryInfo: QueryInfo) => {
    if (queryInfo.active) {
      return Promise.resolve([activeTab]);
    }

    return Promise.resolve(tabs);
  });
}

function renderUseTabDiscovery(): RenderHookResult<ReturnType<typeof useTabDiscovery>> {
  return renderHook(() =>
    useTabDiscovery({
      sameDomainFilter: false,
      selectedTabIds: [],
      sortBy: 'similarity',
    }),
  );
}

describe('useTabDiscovery file URLs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enableReactActEnvironment();
    getFileSchemeAccessInfoMock.mockResolvedValue({
      allowed: true,
      canCheck: true,
      settingsUrl: 'chrome://extensions/?id=test-id',
    });
  });

  it('marks browser-readable local files eligible when file access is allowed', async () => {
    mockTabQueries([
      makeTab({
        active: true,
        id: 1,
        title: 'report.md',
        url: 'file:///Users/me/report.md',
      }),
    ]);

    const { result, unmount } = renderUseTabDiscovery();

    await waitFor(() => expect(result.current.tabs).toHaveLength(1));

    expect(getFileSchemeAccessInfo).toHaveBeenCalledTimes(1);
    expect(result.current.tabs[0]).toEqual(
      expect.objectContaining({
        eligible: true,
        ineligibleReason: undefined,
        localFilePrivacyNote: 'localFilePrivacyNote',
        unavailableAction: undefined,
      }),
    );

    unmount();
  });

  it('marks browser-readable local files unavailable with settings action when access is disabled', async () => {
    getFileSchemeAccessInfoMock.mockResolvedValue({
      allowed: false,
      canCheck: true,
      settingsUrl: 'chrome://extensions/?id=test-id',
    });
    mockTabQueries([
      makeTab({
        active: true,
        id: 2,
        title: 'report.json',
        url: 'file:///Users/me/report.json',
      }),
    ]);

    const { result, unmount } = renderUseTabDiscovery();

    await waitFor(() => expect(result.current.tabs).toHaveLength(1));

    expect(getFileSchemeAccessInfo).toHaveBeenCalledTimes(1);
    expect(result.current.tabs[0]).toEqual(
      expect.objectContaining({
        eligible: false,
        ineligibleReason: 'ineligibleFileAccessDisabled',
        localFilePrivacyNote: 'localFilePrivacyNote',
        unavailableAction: {
          label: 'openExtensionSettings',
          url: 'chrome://extensions/?id=test-id',
        },
      }),
    );

    unmount();
  });

  it('keeps local PDFs unavailable with the special protocol reason', async () => {
    mockTabQueries([
      makeTab({
        active: true,
        id: 3,
        title: 'report.pdf',
        url: 'file:///Users/me/report.pdf',
      }),
    ]);

    const { result, unmount } = renderUseTabDiscovery();

    await waitFor(() => expect(result.current.tabs).toHaveLength(1));

    expect(result.current.tabs[0]).toEqual(
      expect.objectContaining({
        eligible: false,
        ineligibleReason: 'ineligibleSpecialProtocol',
        localFilePrivacyNote: undefined,
        unavailableAction: undefined,
      }),
    );

    unmount();
  });
});
