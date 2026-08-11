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
  popupUiState,
  useManualSyncSessionMock,
  useQuickSyncShortcutMock,
  useSyncControlMock,
} = vi.hoisted(() => ({
  handleStartMock: vi.fn(),
  handleDismissErrorMock: vi.fn(),
  reconnectMock: vi.fn(),
  refetchMock: vi.fn(),
  stopMock: vi.fn(),
  popupUiState: {
    actionsMenuOpen: false,
  },
  useManualSyncSessionMock: vi.fn(),
  useQuickSyncShortcutMock: vi.fn(),
  useSyncControlMock: vi.fn(),
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
    if (typeof substitutions === 'string') {
      return `${key}:${substitutions}`;
    }
    return key;
  },
}));

vi.mock('~/shared/lib/storage', () => ({
  saveSelectedTabIds: vi.fn(),
}));

vi.mock('webext-bridge/popup', () => ({
  sendMessage: vi.fn(),
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
    actionsMenuOpen: popupUiState.actionsMenuOpen,
    setActionsMenuOpen: vi.fn(),
    searchInputRef: { current: null },
    sortBy: 'similarity',
    setSortBy: vi.fn(),
    sameDomainFilter: false,
    setSameDomainFilter: vi.fn(),
    handleToggleTab: vi.fn(),
    handleContainerClick: vi.fn(),
  }),
  useQuickSyncShortcut: useQuickSyncShortcutMock,
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
    isMutating: false,
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

function dispatchPopupShortcut(
  init: KeyboardEventInit,
  overrides: { isComposing?: boolean; keyCode?: number } = {},
) {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  if (overrides.isComposing !== undefined) {
    Object.defineProperty(event, 'isComposing', { value: overrides.isComposing });
  }
  if (overrides.keyCode !== undefined) {
    Object.defineProperty(event, 'keyCode', { value: overrides.keyCode });
  }

  const onWindowKeyDown = vi.fn();
  window.addEventListener('keydown', onWindowKeyDown);
  act(() => {
    document.dispatchEvent(event);
  });
  window.removeEventListener('keydown', onWindowKeyDown);

  return { event, onWindowKeyDown };
}

beforeEach(() => {
  vi.clearAllMocks();
  popupUiState.actionsMenuOpen = false;
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
  useQuickSyncShortcutMock.mockReturnValue({
    assignment: {
      status: 'assigned',
      rawShortcut: 'Command+Shift+Period',
      label: '⌘ ⇧ .',
    },
    settingsResult: { status: 'idle' },
    openSettings: vi.fn().mockResolvedValue({ status: 'opened' }),
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

    const view = render(<ScrollSyncPopup />);

    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /removeTab/ })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'startSynchronization' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'urlSyncNavigation' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'quickSyncShortcutHeading' })).toBeInTheDocument();
    expect(screen.getByText('quickSyncShortcutAssignedSummary:⌘ ⇧ .')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'startSynchronization' }));
    expect(handleStartMock).toHaveBeenCalledOnce();

    popupUiState.actionsMenuOpen = true;
    await act(async () => {
      view.rerender(<ScrollSyncPopup />);
      await Promise.resolve();
    });
    expect(screen.getByRole('option', { name: /clearAllSelections/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /sortSimilarity/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /sortRecent/ })).toBeInTheDocument();
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

    expect(screen.getByRole('heading', { name: 'activeSyncHeading' })).toBeInTheDocument();
    expect(screen.getByText('activeSyncSummary:3')).toBeInTheDocument();
    expect(screen.getByText('activeSyncAddInstruction:⌘ ⇧ .')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'activeSyncTabsHeading' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'urlSyncNavigation' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'startSynchronization' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'actionsButton' })).not.toBeInTheDocument();

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

    expect(screen.getByRole('heading', { name: 'activeSyncHeading' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'stopSynchronization' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();

    await act(async () => resolveStop());
  });

  it('blocks reconnect and the popup shortcut while Stop is pending, then re-enables controls', async () => {
    const user = userEvent.setup();
    const activeSession = createActiveSession();
    useManualSyncSessionMock.mockReturnValue(activeSession);
    const { rerender } = render(<ScrollSyncPopup />);

    await user.click(screen.getByRole('button', { name: 'stopSynchronization' }));
    expect(stopMock).toHaveBeenCalledOnce();

    useManualSyncSessionMock.mockReturnValue(
      createSession(activeSession.state, {
        isStopping: true,
        isMutating: true,
      }),
    );
    rerender(<ScrollSyncPopup />);

    const stopButton = screen.getByRole('button', { name: 'stoppingSynchronization' });
    const reconnectButton = screen.getByRole('button', { name: 'resyncDisconnectedTabs' });
    expect(stopButton).toBeDisabled();
    expect(reconnectButton).toBeDisabled();

    await user.click(reconnectButton);
    const pendingShortcut = dispatchPopupShortcut({ key: 's', ctrlKey: true });
    expect(reconnectMock).not.toHaveBeenCalled();
    expect(stopMock).toHaveBeenCalledOnce();
    expect(pendingShortcut.event.defaultPrevented).toBe(false);
    expect(pendingShortcut.onWindowKeyDown).toHaveBeenCalledOnce();

    useManualSyncSessionMock.mockReturnValue(activeSession);
    rerender(<ScrollSyncPopup />);
    expect(screen.getByRole('button', { name: 'stopSynchronization' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'resyncDisconnectedTabs' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'resyncDisconnectedTabs' }));
    expect(reconnectMock).toHaveBeenCalledOnce();
  });

  it('blocks Stop and the popup shortcut and omits inactive Actions while reconnect is pending', async () => {
    const user = userEvent.setup();
    const activeSession = createActiveSession();
    useManualSyncSessionMock.mockReturnValue(activeSession);
    const { rerender } = render(<ScrollSyncPopup />);

    await user.click(screen.getByRole('button', { name: 'resyncDisconnectedTabs' }));
    expect(reconnectMock).toHaveBeenCalledOnce();

    useManualSyncSessionMock.mockReturnValue(
      createSession(activeSession.state, {
        isReconnecting: true,
        isMutating: true,
      }),
    );
    rerender(<ScrollSyncPopup />);

    const stopButton = screen.getByRole('button', { name: 'stopSynchronization' });
    const reconnectButton = screen.getByRole('button', { name: 'reconnecting' });
    expect(stopButton).toBeDisabled();
    expect(reconnectButton).toBeDisabled();

    await user.click(stopButton);
    const pendingShortcut = dispatchPopupShortcut({ key: 's', ctrlKey: true });
    expect(stopMock).not.toHaveBeenCalled();
    expect(pendingShortcut.event.defaultPrevented).toBe(false);
    expect(pendingShortcut.onWindowKeyDown).toHaveBeenCalledOnce();

    popupUiState.actionsMenuOpen = true;
    rerender(<ScrollSyncPopup />);
    expect(screen.queryByRole('button', { name: 'actionsButton' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /stopSync/ })).not.toBeInTheDocument();
    expect(stopMock).not.toHaveBeenCalled();

    useManualSyncSessionMock.mockReturnValue(activeSession);
    rerender(<ScrollSyncPopup />);
    expect(screen.queryByRole('option', { name: /stopSync/ })).not.toBeInTheDocument();
  });

  it('renders a committed cleanup warning without fabricating inactive state', () => {
    useManualSyncSessionMock.mockReturnValue(
      createSession(createActiveSession().state, {
        warning: 'cleanup-incomplete',
      }),
    );

    render(<ScrollSyncPopup />);

    expect(screen.getByRole('alert')).toHaveTextContent('syncCleanupIncomplete');
    expect(screen.getByRole('heading', { name: 'activeSyncHeading' })).toBeInTheDocument();
  });

  it('keeps popup-local Meta/Ctrl+S Start and authoritative Stop behavior', () => {
    const view = render(<ScrollSyncPopup />);

    const startShortcut = dispatchPopupShortcut({ key: 's', metaKey: true });
    expect(handleStartMock).toHaveBeenCalledOnce();
    expect(stopMock).not.toHaveBeenCalled();
    expect(startShortcut.event.defaultPrevented).toBe(true);
    expect(startShortcut.onWindowKeyDown).not.toHaveBeenCalled();

    useManualSyncSessionMock.mockReturnValue(createActiveSession());
    view.rerender(<ScrollSyncPopup />);
    const stopShortcut = dispatchPopupShortcut({ key: 's', ctrlKey: true });

    expect(stopMock).toHaveBeenCalledOnce();
    expect(stopShortcut.event.defaultPrevented).toBe(true);
    expect(stopShortcut.onWindowKeyDown).not.toHaveBeenCalled();
  });

  it('does not implement the browser-wide command as a popup DOM key handler', async () => {
    render(<ScrollSyncPopup />);
    await act(async () => Promise.resolve());

    const metaShortcut = dispatchPopupShortcut({ key: '.', metaKey: true, shiftKey: true });
    const controlShortcut = dispatchPopupShortcut({ key: '.', ctrlKey: true, shiftKey: true });

    expect(handleStartMock).not.toHaveBeenCalled();
    expect(stopMock).not.toHaveBeenCalled();
    expect(metaShortcut.event.defaultPrevented).toBe(false);
    expect(metaShortcut.onWindowKeyDown).toHaveBeenCalledOnce();
    expect(controlShortcut.event.defaultPrevented).toBe(false);
    expect(controlShortcut.onWindowKeyDown).toHaveBeenCalledOnce();
  });

  it('passes IME composition shortcuts through without mutating popup state', async () => {
    render(<ScrollSyncPopup />);
    await act(async () => Promise.resolve());

    const composingShortcut = dispatchPopupShortcut(
      { key: 's', ctrlKey: true },
      { isComposing: true },
    );
    const processShortcut = dispatchPopupShortcut({ key: 's', ctrlKey: true }, { keyCode: 229 });

    expect(handleStartMock).not.toHaveBeenCalled();
    expect(stopMock).not.toHaveBeenCalled();
    expect(composingShortcut.event.defaultPrevented).toBe(false);
    expect(composingShortcut.onWindowKeyDown).toHaveBeenCalledOnce();
    expect(processShortcut.event.defaultPrevented).toBe(false);
    expect(processShortcut.onWindowKeyDown).toHaveBeenCalledOnce();
  });
});
