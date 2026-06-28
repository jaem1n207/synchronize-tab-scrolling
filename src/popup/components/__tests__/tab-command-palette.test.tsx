/// <reference types="vitest/globals" />

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import browser from 'webextension-polyfill';

import { TabCommandPalette } from '../tab-command-palette';

import type { TabInfo } from '../../types';

const { tabsCreateMock } = vi.hoisted(() => ({
  tabsCreateMock: vi.fn(),
}));

vi.mock('webextension-polyfill', () => ({
  default: {
    tabs: {
      create: tabsCreateMock,
    },
  },
}));

vi.mock('~/shared/i18n', () => ({
  t: (key: string, substitutions?: string | Array<string>): string => {
    if (Array.isArray(substitutions)) {
      return `${key}:${substitutions.join(',')}`;
    }

    if (typeof substitutions === 'string') {
      return `${key}:${substitutions}`;
    }

    return key;
  },
}));

vi.mock('~/shared/lib/logger', () => ({
  ExtensionLogger: vi.fn().mockImplementation(() => ({
    warn: vi.fn(),
  })),
}));

vi.mock('~icons/lucide/alert-circle', () => ({
  default: () => <span data-testid="icon-alert-circle" />,
}));
vi.mock('~icons/lucide/check', () => ({
  default: () => <span data-testid="icon-check" />,
}));
vi.mock('~icons/lucide/filter', () => ({
  default: () => <span data-testid="icon-filter" />,
}));
vi.mock('~icons/lucide/search', () => ({
  default: () => <span data-testid="icon-search" />,
}));

if (!globalThis.ResizeObserver) {
  vi.stubGlobal(
    'ResizeObserver',
    class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
}

Element.prototype.scrollIntoView = vi.fn();

const LOCAL_FILE_PRIVACY_NOTE = 'Synchronized using scroll position only.';
const SETTINGS_URL = 'chrome://extensions/?id=test-id';

function renderPalette(tabs: Array<TabInfo>, onToggleTab = vi.fn()) {
  return {
    onToggleTab,
    ...render(
      <TabCommandPalette
        currentTabId={1}
        isSyncActive={false}
        selectedTabIds={[]}
        tabs={tabs}
        onToggleTab={onToggleTab}
      />,
    ),
  };
}

describe('TabCommandPalette local file actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tabsCreateMock.mockResolvedValue({
      active: true,
      highlighted: false,
      id: 99,
      incognito: false,
      index: 0,
      pinned: false,
    });
  });

  it('renders local file privacy notes for eligible and unavailable rows', async () => {
    renderPalette([
      {
        eligible: true,
        id: 1,
        localFilePrivacyNote: LOCAL_FILE_PRIVACY_NOTE,
        title: 'allowed.md',
        url: 'file:///Users/me/allowed.md',
      },
      {
        eligible: false,
        id: 2,
        ineligibleReason: 'Local file access is off',
        localFilePrivacyNote: LOCAL_FILE_PRIVACY_NOTE,
        title: 'blocked.json',
        unavailableAction: {
          label: 'Open extension settings',
          url: SETTINGS_URL,
        },
        url: 'file:///Users/me/blocked.json',
      },
    ]);

    await waitFor(() => {
      expect(screen.getAllByText(LOCAL_FILE_PRIVACY_NOTE)).toHaveLength(2);
    });
  });

  it('opens the settings URL without selecting the unavailable row', async () => {
    const user = userEvent.setup();
    const onToggleTab = vi.fn();
    renderPalette(
      [
        {
          eligible: false,
          id: 2,
          ineligibleReason: 'Local file access is off',
          localFilePrivacyNote: LOCAL_FILE_PRIVACY_NOTE,
          title: 'blocked.json',
          unavailableAction: {
            label: 'Open extension settings',
            url: SETTINGS_URL,
          },
          url: 'file:///Users/me/blocked.json',
        },
      ],
      onToggleTab,
    );

    const blockedRow = screen.getByRole('option', {
      name: 'blocked.json - Local file access is off',
    });
    const settingsButton = screen.getByRole('button', {
      name: 'Open extension settings',
    });

    await waitFor(() => {
      expect(blockedRow).toHaveAttribute('aria-disabled', 'true');
    });
    expect(settingsButton).toBeEnabled();

    await user.click(settingsButton);

    expect(browser.tabs.create).toHaveBeenCalledWith({ url: SETTINGS_URL });
    expect(onToggleTab).not.toHaveBeenCalled();
  });
});

describe('TabCommandPalette selection summary', () => {
  it('renders the selection summary between the heading and search input', async () => {
    render(
      <TabCommandPalette
        currentTabId={1}
        isSyncActive={false}
        selectedTabIds={[]}
        selectionSummary={<div data-testid="selection-summary">Select 2 or more tabs</div>}
        tabs={[
          {
            eligible: true,
            id: 1,
            title: 'Example tab',
            url: 'https://example.com',
          },
        ]}
        onToggleTab={vi.fn()}
      />,
    );

    const heading = await screen.findByRole('heading', { name: 'tabSelectionHeading' });
    const summary = await screen.findByTestId('selection-summary');
    const searchInput = await screen.findByRole('combobox');

    expect(
      heading.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      summary.compareDocumentPosition(searchInput) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
