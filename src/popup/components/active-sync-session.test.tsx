import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { PopupActiveManualSyncSnapshot } from '~/shared/types/sync-session';

import { ActiveSyncSession } from './active-sync-session';

import type { QuickSyncShortcutState } from '../hooks';

const messages: Record<string, string> = {
  activeSyncHeading: '스크롤 동기화 중',
  activeSyncSummary: '현재 $TABCOUNT$개 탭의 스크롤이 함께 움직이고 있어요.',
  activeSyncAddInstruction: '다른 탭에서도 $SHORTCUTLABEL$을 누르면 그 탭도 함께 스크롤돼요.',
  activeSyncTabsHeading: '함께 스크롤하는 탭',
  activeSyncEditNotice: '이 팝업에서 탭을 추가하거나 해제하려면 먼저 동기화를 중지해야 해요.',
  currentTabLocation: '현재 탭',
  currentWindowLocation: '현재 창',
  otherWindowLocation: '다른 창',
  activeSyncTabUnavailable: '탭 정보를 불러오지 못했어요',
  connected: '연결됨',
  disconnected: '연결 끊김',
  error: '오류',
  quickSyncShortcutUnassigned: '빠른 동기화 단축키가 지정되어 있지 않아요.',
  quickSyncShortcutUnavailable: '빠른 동기화 단축키를 불러오지 못했어요.',
  reassignQuickSyncShortcut: '단축키 다시 지정',
  syncCleanupIncomplete: '일부 탭의 동기화 표시를 정리하지 못했어요. 탭을 새로고침하면 사라져요.',
  reconnecting: '재연결 중...',
  resyncDisconnectedTabs: '연결이 끊긴 탭 재동기화',
  stoppingSynchronization: '동기화 중지 중',
  stopSynchronization: '동기화 중지',
  stopSync: '중지',
};

vi.mock('~/shared/i18n', () => ({
  t: (key: string, substitutions?: string | Array<string>): string => {
    const message = messages[key] ?? key;
    const values = Array.isArray(substitutions)
      ? substitutions
      : substitutions === undefined
        ? []
        : [substitutions];

    return values.reduce((result, value) => result.replace(/\$[A-Z]+\$/, value), message);
  },
}));

const threeTabCrossWindowSnapshot: PopupActiveManualSyncSnapshot = {
  revision: 12,
  sessionEpoch: 4,
  mode: 'ratio',
  linkedTabIds: [11, 22, 33],
  tabs: [
    {
      availability: 'available',
      tabId: 11,
      title: '현재 문서',
      favIconUrl: 'https://assets.example/current.png',
      windowId: 3,
      location: 'current-tab',
      connectionStatus: 'connected',
    },
    {
      availability: 'available',
      tabId: 22,
      title: '같은 창 문서',
      windowId: 3,
      location: 'current-window',
      connectionStatus: 'connected',
    },
    {
      availability: 'available',
      tabId: 33,
      title: '다른 창 문서',
      windowId: 8,
      location: 'other-window',
      connectionStatus: 'disconnected',
    },
  ],
};

const assignedShortcut: QuickSyncShortcutState = {
  status: 'assigned',
  rawShortcut: 'Command+Shift+Period',
  label: '⌘ ⇧ .',
};

function renderActiveSession(
  snapshot: PopupActiveManualSyncSnapshot = threeTabCrossWindowSnapshot,
  options: {
    shortcut?: QuickSyncShortcutState;
    isStopping?: boolean;
    isReconnecting?: boolean;
    warning?: 'cleanup-incomplete';
  } = {},
) {
  const onOpenShortcutSettings = vi.fn().mockResolvedValue(undefined);
  const onReconnect = vi.fn().mockResolvedValue(undefined);
  const onStop = vi.fn().mockResolvedValue(undefined);

  return {
    onOpenShortcutSettings,
    onReconnect,
    onStop,
    ...render(
      <ActiveSyncSession
        isReconnecting={options.isReconnecting ?? false}
        isStopping={options.isStopping ?? false}
        shortcut={options.shortcut ?? assignedShortcut}
        snapshot={snapshot}
        warning={options.warning}
        onOpenShortcutSettings={onOpenShortcutSettings}
        onReconnect={onReconnect}
        onStop={onStop}
      />,
    ),
  };
}

describe('ActiveSyncSession', () => {
  it('renders the authoritative active summary and exact location labels without edit controls', () => {
    renderActiveSession();

    expect(screen.getByRole('heading', { name: '스크롤 동기화 중' })).toBeInTheDocument();
    expect(screen.getByText('현재 3개 탭의 스크롤이 함께 움직이고 있어요.')).toBeInTheDocument();
    expect(
      screen.getByText('다른 탭에서도 ⌘ ⇧ .을 누르면 그 탭도 함께 스크롤돼요.'),
    ).toBeInTheDocument();

    const list = screen.getByRole('list', { name: '함께 스크롤하는 탭' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(within(list).getByText('현재 탭')).toBeInTheDocument();
    expect(within(list).getByText('현재 창')).toBeInTheDocument();
    expect(within(list).getByText('다른 창')).toBeInTheDocument();
    expect(screen.getByText('현재 문서')).toBeInTheDocument();
    expect(screen.getByRole('presentation')).toHaveAttribute(
      'src',
      'https://assets.example/current.png',
    );
    expect(
      screen.getByText('이 팝업에서 탭을 추가하거나 해제하려면 먼저 동기화를 중지해야 해요.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /remove|해제|추가/iu })).not.toBeInTheDocument();
  });

  it('renders an unavailable row with only generic copy and connection state', () => {
    const snapshot: PopupActiveManualSyncSnapshot = {
      ...threeTabCrossWindowSnapshot,
      linkedTabIds: [90210],
      tabs: [
        {
          availability: 'unavailable',
          tabId: 90210,
          connectionStatus: 'error',
        },
      ],
    };

    renderActiveSession(snapshot);

    const row = screen.getByRole('listitem');
    expect(within(row).getByText('탭 정보를 불러오지 못했어요')).toBeInTheDocument();
    expect(within(row).getByText('오류')).toBeInTheDocument();
    expect(within(row).queryByText('90210')).not.toBeInTheDocument();
    expect(within(row).queryByText(/현재 탭|현재 창|다른 창/)).not.toBeInTheDocument();
    expect(within(row).queryByRole('img')).not.toBeInTheDocument();
  });

  it('shows reconnect only for disconnected or error rows and shares the mutation lock', async () => {
    const user = userEvent.setup();
    const connectedSnapshot: PopupActiveManualSyncSnapshot = {
      ...threeTabCrossWindowSnapshot,
      tabs: threeTabCrossWindowSnapshot.tabs.map((tab) => ({
        ...tab,
        connectionStatus: 'connected',
      })),
    };
    const connectedView = renderActiveSession(connectedSnapshot);

    expect(
      screen.queryByRole('button', { name: '연결이 끊긴 탭 재동기화' }),
    ).not.toBeInTheDocument();
    connectedView.unmount();

    const pendingView = renderActiveSession(threeTabCrossWindowSnapshot, {
      isReconnecting: true,
    });
    const reconnect = screen.getByRole('button', { name: '재연결 중...' });
    const stop = screen.getByRole('button', { name: '동기화 중지' });
    expect(reconnect).toBeDisabled();
    expect(reconnect).toHaveAttribute('aria-busy', 'true');
    expect(stop).toBeDisabled();

    await user.click(reconnect);
    await user.click(stop);
    expect(pendingView.onReconnect).not.toHaveBeenCalled();
    expect(pendingView.onStop).not.toHaveBeenCalled();
  });

  it('offers Stop and reconnect actions when the authoritative session needs them', async () => {
    const user = userEvent.setup();
    const view = renderActiveSession();

    await user.click(screen.getByRole('button', { name: '동기화 중지' }));
    await user.click(screen.getByRole('button', { name: '연결이 끊긴 탭 재동기화' }));

    expect(view.onStop).toHaveBeenCalledOnce();
    expect(view.onReconnect).toHaveBeenCalledOnce();
  });

  it.each([
    [{ status: 'unassigned' }, '빠른 동기화 단축키가 지정되어 있지 않아요.'],
    [{ status: 'unavailable' }, '빠른 동기화 단축키를 불러오지 못했어요.'],
  ] satisfies Array<[QuickSyncShortcutState, string]>)(
    'shows truthful shortcut state %s with a remap CTA',
    async (shortcut, expectedCopy) => {
      const user = userEvent.setup();
      const view = renderActiveSession(threeTabCrossWindowSnapshot, { shortcut });

      expect(screen.getByText(expectedCopy)).toBeInTheDocument();
      expect(
        screen.queryByText(/Command\+Shift\+Period|Ctrl\+Shift\+Period|⌘ ⇧ \./),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/conflict[- ]free|충돌 없음|충돌하지/iu)).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: '단축키 다시 지정' }));
      expect(view.onOpenShortcutSettings).toHaveBeenCalledOnce();
    },
  );

  it('renders the cleanup warning without changing the active topology', () => {
    renderActiveSession(threeTabCrossWindowSnapshot, { warning: 'cleanup-incomplete' });

    expect(screen.getByRole('alert')).toHaveTextContent(
      '일부 탭의 동기화 표시를 정리하지 못했어요. 탭을 새로고침하면 사라져요.',
    );
    expect(screen.getByRole('list', { name: '함께 스크롤하는 탭' })).toBeInTheDocument();
  });
});
