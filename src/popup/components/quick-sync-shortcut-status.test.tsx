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

describe('QuickSyncShortcutStatus', () => {
  it('does not reserve prominent card space while the assignment is loading', () => {
    const { onOpenSettings } = renderStatus({ status: 'loading' });

    expect(
      screen.queryByRole('heading', { name: 'quickSyncShortcutHeading' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText(/Command|Ctrl|⌘|⇧/)).not.toBeInTheDocument();
    expect(onOpenSettings).not.toHaveBeenCalled();
  });

  it('does not render an assigned shortcut as a prominent main-flow card', () => {
    renderStatus({
      status: 'assigned',
      rawShortcut: 'Command+Alt+MediaPlayPause',
      label: '⌘ ⌥ MediaPlayPause',
    });

    expect(
      screen.queryByRole('heading', { name: 'quickSyncShortcutHeading' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
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

  it('shows assigned remap failure as a compact accessible alert without restoring the card', () => {
    renderStatus(
      {
        status: 'assigned',
        rawShortcut: 'Command+Alt+Period',
        label: '⌘ ⌥ .',
      },
      {
        status: 'fallback',
        browser: 'edge',
        settingsUrl: 'edge://extensions/shortcuts',
      },
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'quickSyncShortcutSettingsFallbackChromium:edge://extensions/shortcuts',
    );
    expect(
      screen.queryByRole('heading', { name: 'quickSyncShortcutHeading' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
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
