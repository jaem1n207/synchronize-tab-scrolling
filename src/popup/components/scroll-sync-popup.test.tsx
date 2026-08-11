import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ScrollSyncPopup } from './scroll-sync-popup';

import type { UseManualSyncSessionResult } from '../hooks/use-manual-sync-session';

class ResizeObserverMock {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverMock);
Object.defineProperty(Element.prototype, 'scrollIntoView', {
  configurable: true,
  value: vi.fn(),
});

const {
  handleStartMock,
  handleDismissErrorMock,
  reconnectMock,
  refetchMock,
  stopMock,
  useManualSyncSessionMock,
  useSyncControlMock,
} = vi.hoisted(() => ({
  handleStartMock: vi.fn(),
  handleDismissErrorMock: vi.fn(),
  reconnectMock: vi.fn(),
  refetchMock: vi.fn(),
  stopMock: vi.fn(),
  useManualSyncSessionMock: vi.fn(),
  useSyncControlMock: vi.fn(),
}));

vi.mock('~/shared/hooks/use-keyboard-shortcuts', () => ({
  useKeyboardShortcuts: vi.fn(),
}));

vi.mock('~/shared/hooks/use-modifier-key', () => ({
  useModifierKey: () => ({
    modKey: 'Ctrl',
    shiftKey: 'Shift',
  }),
}));

vi.mock('~/shared/i18n', () => ({
  t: (key: string, substitutions?: string | string[]): string => {
    if (Array.isArray(substitutions)) {
      return `${key}:${substitutions.join(',')}`;
    }
    return key;
  },
}));

vi.mock('~/shared/lib/storage', () => ({
  saveSelectedTabIds: vi.fn(),
}));

vi.mock('webextension-polyfill', () => ({
  default: {
    i18n: {
      getUILanguage: vi.fn().mockReturnValue('en'),
    },
    tabs: {
      create: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

vi.mock('../hooks', () => ({
  useAutoSync: () => ({
    autoSyncEnabled: false,
    autoSyncTabCount: 0,
    handleAutoSyncChange: vi.fn(),
  }),
  useDomainExclusions: () => ({
    excludedDomains: [],
    addDomain: vi.fn(),
    removeDomain: vi.fn(),
    previewDomain: vi.fn(),
  }),
  useManualSyncSession: useManualSyncSessionMock,
  usePopupState: () => ({
    selectedTabIds: [1, 2],
    setSelectedTabIds: vi.fn(),
    actionsMenuOpen: false,
    setActionsMenuOpen: vi.fn(),
    searchInputRef: { current: null },
    sortBy: 'similarity',
    setSortBy: vi.fn(),
    sameDomainFilter: false,
    setSameDomainFilter: vi.fn(),
    handleToggleTab: vi.fn(),
    handleContainerClick: vi.fn(),
  }),
  useSyncControl: useSyncControlMock,
  useTabDiscovery: () => ({
    tabs: [
      {
        id: 1,
        title: 'First tab',
        url: 'https://example.com/one',
        eligible: true,
      },
      {
        id: 2,
        title: 'Second tab',
        url: 'https://example.com/two',
        eligible: true,
      },
    ],
    currentTabId: 1,
    filteredAndSortedTabs: [
      {
        id: 1,
        title: 'First tab',
        url: 'https://example.com/one',
        eligible: true,
      },
      {
        id: 2,
        title: 'Second tab',
        url: 'https://example.com/two',
        eligible: true,
      },
    ],
    selectedTabsInfo: [
      {
        id: 1,
        title: 'First tab',
        url: 'https://example.com/one',
        eligible: true,
      },
      {
        id: 2,
        title: 'Second tab',
        url: 'https://example.com/two',
        eligible: true,
      },
    ],
    tabDiscoveryError: null,
    dismissTabDiscoveryError: vi.fn(),
  }),
  useUrlSync: () => ({
    urlSyncEnabled: false,
    urlSyncMode: 'follow-changed-tab',
    urlSyncNotice: null,
    handleUrlSyncChange: vi.fn(),
    handleUrlSyncModeChange: vi.fn(),
  }),
}));

function createSession(
  state: UseManualSyncSessionResult['state'],
  options: Partial<UseManualSyncSessionResult> = {},
): UseManualSyncSessionResult {
  return {
    state,
    isStopping: false,
    isReconnecting: false,
    warning: undefined,
    refetch: refetchMock,
    stop: stopMock,
    reconnect: reconnectMock,
    ...options,
  };
}

function createActiveSession(): UseManualSyncSessionResult {
  return createSession({
    status: 'active',
    snapshot: {
      revision: 12,
      sessionEpoch: 4,
      mode: 'ratio',
      linkedTabIds: [1, 22, 33],
      tabs: [
        {
          availability: 'available',
          tabId: 1,
          title: 'First tab',
          windowId: 3,
          location: 'current-tab',
          connectionStatus: 'connected',
        },
        {
          availability: 'available',
          tabId: 22,
          title: 'Other window',
          windowId: 8,
          location: 'other-window',
          connectionStatus: 'disconnected',
        },
        {
          availability: 'unavailable',
          tabId: 33,
          connectionStatus: 'error',
        },
      ],
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  refetchMock.mockResolvedValue(undefined);
  stopMock.mockResolvedValue(undefined);
  reconnectMock.mockResolvedValue(undefined);
  useManualSyncSessionMock.mockReturnValue(
    createSession({
      status: 'inactive',
      revision: 1,
      sessionEpoch: 2,
    }),
  );
  useSyncControlMock.mockReturnValue({
    error: null,
    handleStart: handleStartMock,
    handleDismissError: handleDismissErrorMock,
  });
});

describe('ScrollSyncPopup authoritative session composition', () => {
  it('shows a stable loading status without mounting inactive controls', () => {
    useManualSyncSessionMock.mockReturnValue(createSession({ status: 'loading' }));

    render(<ScrollSyncPopup />);

    expect(screen.getByRole('status')).toHaveTextContent('loading');
    expect(screen.queryByRole('button', { name: 'startSynchronization' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('shows a persistent status error and retries the authoritative read', async () => {
    const user = userEvent.setup();
    useManualSyncSessionMock.mockReturnValue(
      createSession({
        status: 'error',
        reason: 'transport-error',
      }),
    );

    render(<ScrollSyncPopup />);

    expect(screen.getByRole('alert')).toHaveTextContent('manualSyncStateUnavailable');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'retryStatusCheck' }));

    expect(refetchMock).toHaveBeenCalledOnce();
  });

  it('keeps the existing picker and manual Start only for authoritative inactive', async () => {
    const user = userEvent.setup();

    render(<ScrollSyncPopup />);

    expect(screen.getByRole('combobox')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'startSynchronization' }));

    expect(handleStartMock).toHaveBeenCalledOnce();
    expect(useSyncControlMock).toHaveBeenCalledWith(
      expect.objectContaining({
        onSessionChange: refetchMock,
      }),
    );
  });

  it('renders degraded Start recovery copy as an accessible warning', async () => {
    useSyncControlMock.mockReturnValue({
      error: {
        message: 'autoSyncRecoveryDegraded',
        severity: 'warning',
        timestamp: 1,
      },
      handleStart: handleStartMock,
      handleDismissError: handleDismissErrorMock,
    });

    render(<ScrollSyncPopup />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole('alert')).toHaveTextContent('autoSyncRecoveryDegraded');
  });

  it('uses authoritative active controls without mounting the inactive picker', async () => {
    const user = userEvent.setup();
    useManualSyncSessionMock.mockReturnValue(createActiveSession());

    render(<ScrollSyncPopup />);

    expect(screen.getByRole('status')).toHaveTextContent('syncActive');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'startSynchronization' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'stopSynchronization' }));
    await user.click(screen.getByRole('button', { name: 'resyncDisconnectedTabs' }));

    expect(stopMock).toHaveBeenCalledOnce();
    expect(reconnectMock).toHaveBeenCalledOnce();
  });

  it('does not optimistically replace active topology while Stop is pending', async () => {
    const user = userEvent.setup();
    let resolveStop = (): void => undefined;
    stopMock.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveStop = resolve;
      }),
    );
    useManualSyncSessionMock.mockReturnValue(createActiveSession());

    render(<ScrollSyncPopup />);

    await user.click(screen.getByRole('button', { name: 'stopSynchronization' }));

    expect(screen.getByRole('status')).toHaveTextContent('syncActive');
    expect(screen.getByRole('button', { name: 'stopSynchronization' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();

    await act(async () => resolveStop());
  });

  it('renders a committed cleanup warning without fabricating inactive state', () => {
    useManualSyncSessionMock.mockReturnValue(
      createSession(createActiveSession().state, {
        warning: 'cleanup-incomplete',
      }),
    );

    render(<ScrollSyncPopup />);

    expect(screen.getByRole('alert')).toHaveTextContent('syncCleanupIncomplete');
    expect(screen.getByRole('status')).toHaveTextContent('syncActive');
  });
});
