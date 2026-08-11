import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SyncControlButtons } from './sync-control-buttons';

vi.mock('~/shared/hooks/use-modifier-key', () => ({
  useModifierKey: () => ({
    modKey: 'Ctrl',
  }),
}));

vi.mock('~/shared/i18n', () => ({
  t: (key: string): string => key,
}));

const onResync = vi.fn();
const onStart = vi.fn();
const onStop = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SyncControlButtons mutation lock', () => {
  it('disables both active mutations while Stop is pending without claiming reconnect progress', async () => {
    const user = userEvent.setup();
    render(
      <SyncControlButtons
        hasConnectionError
        isActive
        isStopping
        isReconnecting={false}
        selectedCount={3}
        onResync={onResync}
        onStart={onStart}
        onStop={onStop}
      />,
    );

    const stopButton = screen.getByRole('button', { name: 'stoppingSynchronization' });
    const reconnectButton = screen.getByRole('button', { name: 'resyncDisconnectedTabs' });
    expect(stopButton).toBeDisabled();
    expect(stopButton).toHaveAttribute('aria-busy', 'true');
    expect(reconnectButton).toBeDisabled();
    expect(reconnectButton).not.toHaveAttribute('aria-busy');

    await user.click(stopButton);
    await user.click(reconnectButton);
    expect(onStop).not.toHaveBeenCalled();
    expect(onResync).not.toHaveBeenCalled();
  });

  it('disables both active mutations while reconnect is pending without claiming Stop progress', async () => {
    const user = userEvent.setup();
    render(
      <SyncControlButtons
        hasConnectionError
        isActive
        isReconnecting
        isStopping={false}
        selectedCount={3}
        onResync={onResync}
        onStart={onStart}
        onStop={onStop}
      />,
    );

    const stopButton = screen.getByRole('button', { name: 'stopSynchronization' });
    const reconnectButton = screen.getByRole('button', { name: 'reconnecting' });
    expect(stopButton).toBeDisabled();
    expect(stopButton).not.toHaveAttribute('aria-busy');
    expect(reconnectButton).toBeDisabled();
    expect(reconnectButton).toHaveAttribute('aria-busy', 'true');

    await user.click(stopButton);
    await user.click(reconnectButton);
    expect(onStop).not.toHaveBeenCalled();
    expect(onResync).not.toHaveBeenCalled();
  });

  it('re-enables both controls after the authoritative mutation settles', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <SyncControlButtons
        hasConnectionError
        isActive
        isReconnecting
        isStopping={false}
        selectedCount={3}
        onResync={onResync}
        onStart={onStart}
        onStop={onStop}
      />,
    );

    rerender(
      <SyncControlButtons
        hasConnectionError
        isActive
        isReconnecting={false}
        isStopping={false}
        selectedCount={3}
        onResync={onResync}
        onStart={onStart}
        onStop={onStop}
      />,
    );

    const stopButton = screen.getByRole('button', { name: 'stopSynchronization' });
    const reconnectButton = screen.getByRole('button', { name: 'resyncDisconnectedTabs' });
    expect(stopButton).toBeEnabled();
    expect(reconnectButton).toBeEnabled();

    await user.click(stopButton);
    await user.click(reconnectButton);
    expect(onStop).toHaveBeenCalledOnce();
    expect(onResync).toHaveBeenCalledOnce();
  });
});
