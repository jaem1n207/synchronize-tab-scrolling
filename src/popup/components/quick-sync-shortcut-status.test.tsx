/// <reference types="vitest/globals" />

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { QuickSyncShortcutStatus } from './quick-sync-shortcut-status';

import type { QuickSyncShortcutState, ShortcutSettingsResult } from '../hooks';

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

function renderStatus(
  assignment: QuickSyncShortcutState,
  settingsResult: ShortcutSettingsResult = { status: 'idle' },
  onOpenSettings = vi.fn<() => Promise<ShortcutSettingsResult>>().mockResolvedValue({
    status: 'opened',
  }),
) {
  return {
    onOpenSettings,
    ...render(
      <QuickSyncShortcutStatus
        assignment={assignment}
        settingsResult={settingsResult}
        onOpenSettings={onOpenSettings}
      />,
    ),
  };
}

const unavailableCases: Array<[QuickSyncShortcutState, string]> = [
  [{ status: 'unassigned' }, 'quickSyncShortcutUnassigned'],
  [{ status: 'unavailable' }, 'quickSyncShortcutUnavailable'],
];

const assignmentTransitionCases: Array<[QuickSyncShortcutState, string]> = [
  [
    {
      status: 'assigned',
      rawShortcut: 'Command+Alt+Period',
      label: '⌘ ⌥ .',
    },
    'quickSyncShortcutAssignedSummary:⌘ ⌥ .',
  ],
  [{ status: 'unassigned' }, 'quickSyncShortcutUnassigned'],
  [{ status: 'unavailable' }, 'quickSyncShortcutUnavailable'],
];

describe('QuickSyncShortcutStatus', () => {
  it('renders a truthful loading state without a fallback shortcut or navigation', () => {
    const { onOpenSettings } = renderStatus({ status: 'loading' });

    expect(screen.getByRole('heading', { name: 'quickSyncShortcutHeading' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('loading');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText(/Command|Ctrl|⌘|⇧/)).not.toBeInTheDocument();
    expect(onOpenSettings).not.toHaveBeenCalled();
  });

  it.each(assignmentTransitionCases)(
    'announces the loading transition to %s through the same stable assignment status',
    (assignment, expectedMessage) => {
      const view = renderStatus({ status: 'loading' });
      const assignmentStatus = screen.getByRole('status');

      expect(assignmentStatus).toHaveAttribute('aria-live', 'polite');
      expect(assignmentStatus).toHaveAttribute('aria-atomic', 'true');

      view.rerender(
        <QuickSyncShortcutStatus
          assignment={assignment}
          settingsResult={{ status: 'idle' }}
          onOpenSettings={view.onOpenSettings}
        />,
      );

      expect(screen.getByRole('status')).toBe(assignmentStatus);
      expect(assignmentStatus).toHaveTextContent(expectedMessage);
    },
  );

  it('shows only the browser-reported assigned shortcut and never claims it is conflict-free', () => {
    renderStatus({
      status: 'assigned',
      rawShortcut: 'Command+Alt+MediaPlayPause',
      label: '⌘ ⌥ MediaPlayPause',
    });

    expect(
      screen.getByText('quickSyncShortcutAssignedSummary:⌘ ⌥ MediaPlayPause'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'reassignQuickSyncShortcut' })).toBeEnabled();
    expect(screen.queryByText(/conflict[- ]free|충돌 없음|충돌하지/iu)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Command\+Shift\+Period|Ctrl\+Shift\+Period/),
    ).not.toBeInTheDocument();
  });

  it.each(unavailableCases)(
    'shows %s with an accessible remap action',
    (assignment, expectedMessage) => {
      renderStatus(assignment);

      expect(screen.getByText(expectedMessage)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'reassignQuickSyncShortcut' })).toBeEnabled();
      expect(
        screen.queryByText(/Command\+Shift\+Period|Ctrl\+Shift\+Period|⌘ ⇧ \./),
      ).not.toBeInTheDocument();
    },
  );

  it('disables and marks the CTA busy while settings are opening', () => {
    renderStatus({ status: 'unassigned' }, { status: 'opening' });

    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('quickSyncShortcutUnassigned');
    expect(screen.getByText('loading')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'reassignQuickSyncShortcut' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'reassignQuickSyncShortcut' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
  });

  it('shows the exact manual Chromium URL after internal-page failure', () => {
    renderStatus(
      { status: 'unavailable' },
      {
        status: 'fallback',
        browser: 'edge',
        settingsUrl: 'edge://extensions/shortcuts',
      },
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'quickSyncShortcutSettingsFallbackChromium:edge://extensions/shortcuts',
    );
  });

  it('shows Firefox gear-menu guidance after the native API fallback', () => {
    renderStatus(
      { status: 'unassigned' },
      {
        status: 'fallback',
        browser: 'firefox',
      },
    );

    expect(screen.getByRole('alert')).toHaveTextContent('quickSyncShortcutSettingsFallbackFirefox');
  });

  it('awaits user-triggered remapping and restores CTA focus after failure', async () => {
    const user = userEvent.setup();
    const fallback: ShortcutSettingsResult = {
      status: 'fallback',
      browser: 'brave',
      settingsUrl: 'brave://extensions/shortcuts',
    };
    const onOpenSettings = vi
      .fn<() => Promise<ShortcutSettingsResult>>()
      .mockResolvedValue(fallback);
    renderStatus({ status: 'unassigned' }, { status: 'idle' }, onOpenSettings);
    const remapButton = screen.getByRole('button', { name: 'reassignQuickSyncShortcut' });

    await user.click(remapButton);

    expect(onOpenSettings).toHaveBeenCalledOnce();
    await waitFor(() => expect(remapButton).toHaveFocus());
  });
});
