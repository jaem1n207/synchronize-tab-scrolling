import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RecentQuickSyncOutcome } from '~/shared/types/quick-sync';

import { QuickSyncRecentOutcome } from './quick-sync-recent-outcome';

const { sendMessageMock } = vi.hoisted(() => ({
  sendMessageMock: vi.fn(),
}));

vi.mock('webext-bridge/popup', () => ({
  sendMessage: sendMessageMock,
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

function createOutcome(overrides: Partial<RecentQuickSyncOutcome> = {}): RecentQuickSyncOutcome {
  return {
    tabId: 71,
    resultKind: 'add-failed',
    reason: 'connection-timeout',
    tabCount: 3,
    expiresAt: Date.now() + 30_000,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  sendMessageMock.mockResolvedValue({ status: 'dismissed' });
});

describe('QuickSyncRecentOutcome', () => {
  const failureCopyCases: Array<[RecentQuickSyncOutcome['resultKind'], string]> = [
    ['unsupported', 'quickSyncUnsupportedTab'],
    ['candidate-failed', 'quickSyncSecondTabFailedTitle'],
    ['start-failed', 'quickSyncSecondTabFailedTitle'],
    ['add-failed', 'quickSyncAddFailedTitle'],
    ['session-state-unavailable', 'manualSyncStateUnavailable'],
  ];

  it.each(failureCopyCases)(
    'renders actionable %s failure copy without raw tab information',
    (resultKind, copy) => {
      render(
        <QuickSyncRecentOutcome
          outcome={createOutcome({ resultKind })}
          onAuthoritativeRefetch={vi.fn().mockResolvedValue(undefined)}
        />,
      );

      expect(screen.getByRole('alert')).toHaveTextContent(copy);
      expect(screen.queryByText('71')).not.toBeInTheDocument();
    },
  );

  it('adds existing-session context only to an Add failure with an authoritative count', () => {
    render(
      <QuickSyncRecentOutcome
        outcome={createOutcome()}
        onAuthoritativeRefetch={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('quickSyncAddFailedTitle');
    expect(screen.getByRole('alert')).toHaveTextContent('quickSyncExistingTabsContinue:3');
  });

  it.each([
    ['unsupported-page', 'quickSyncUnsupportedTab'],
    ['auto-sync-degraded', 'autoSyncRecoveryDegraded'],
    ['session-state-unavailable', 'manualSyncStateUnavailable'],
  ] satisfies Array<[RecentQuickSyncOutcome['reason'], string]>)(
    'uses the approved %s reason copy instead of a generic operation failure',
    (reason, expectedCopy) => {
      render(
        <QuickSyncRecentOutcome
          outcome={createOutcome({ reason })}
          onAuthoritativeRefetch={vi.fn().mockResolvedValue(undefined)}
        />,
      );

      expect(screen.getByRole('alert')).toHaveTextContent(expectedCopy);
      expect(screen.getByRole('alert')).not.toHaveTextContent('quickSyncAddFailedTitle');
    },
  );

  it('does not render an expired outcome', () => {
    render(
      <QuickSyncRecentOutcome
        outcome={createOutcome({ expiresAt: Date.now() - 1 })}
        onAuthoritativeRefetch={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('dismisses the exact tab and expiry and hides only after dismissal is authoritative', async () => {
    const user = userEvent.setup();
    const outcome = createOutcome({ tabId: 88, expiresAt: Date.now() + 20_000 });
    render(
      <QuickSyncRecentOutcome
        outcome={outcome}
        onAuthoritativeRefetch={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'dismiss' }));

    expect(sendMessageMock).toHaveBeenCalledWith(
      'quick-sync:dismiss-recent-outcome',
      { tabId: 88, expiresAt: outcome.expiresAt },
      'background',
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps a stale notice until an authoritative refetch removes it', async () => {
    const user = userEvent.setup();
    const onAuthoritativeRefetch = vi.fn().mockResolvedValue(undefined);
    sendMessageMock.mockResolvedValueOnce({ status: 'stale' });
    const view = render(
      <QuickSyncRecentOutcome
        outcome={createOutcome()}
        onAuthoritativeRefetch={onAuthoritativeRefetch}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'dismiss' }));

    expect(onAuthoritativeRefetch).toHaveBeenCalledOnce();
    expect(screen.getByRole('alert')).toBeInTheDocument();

    view.rerender(
      <QuickSyncRecentOutcome
        outcome={undefined}
        onAuthoritativeRefetch={onAuthoritativeRefetch}
      />,
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
