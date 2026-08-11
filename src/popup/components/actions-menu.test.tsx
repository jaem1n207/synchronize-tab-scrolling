import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActionsMenu } from './actions-menu';

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

vi.mock('~/shared/hooks/use-modifier-key', () => ({
  useModifierKey: () => ({
    modKey: 'Ctrl',
    shiftKey: 'Shift',
  }),
}));

vi.mock('~/shared/i18n', () => ({
  t: (key: string): string => key,
}));

const onAutoSyncChange = vi.fn();
const onOpenChange = vi.fn();
const onOpenExcludedDomains = vi.fn();
const onSameDomainFilterChange = vi.fn();
const onSortChange = vi.fn();
const onStartSync = vi.fn();
const onStopSync = vi.fn();
const onToggleAllTabs = vi.fn();

function renderActionsMenu(isSyncMutationPending: boolean) {
  return render(
    <ActionsMenu
      isSyncActive
      open
      autoSyncEnabled={false}
      excludedDomainsCount={0}
      isSyncMutationPending={isSyncMutationPending}
      sameDomainFilter={false}
      selectedCount={3}
      sortBy="similarity"
      onAutoSyncChange={onAutoSyncChange}
      onOpenChange={onOpenChange}
      onOpenExcludedDomains={onOpenExcludedDomains}
      onSameDomainFilterChange={onSameDomainFilterChange}
      onSortChange={onSortChange}
      onStartSync={onStartSync}
      onStopSync={onStopSync}
      onToggleAllTabs={onToggleAllTabs}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ActionsMenu mutation lock', () => {
  it('semantically disables the Stop item and ignores pointer or keyboard activation', async () => {
    const user = userEvent.setup();
    renderActionsMenu(true);

    const stopItem = screen.getByRole('option', { name: /stopSync/ });
    expect(stopItem).toHaveAttribute('aria-disabled', 'true');
    expect(stopItem).toHaveAttribute('data-disabled', 'true');

    await user.click(stopItem);
    stopItem.focus();
    await user.keyboard('{Enter}');
    expect(onStopSync).not.toHaveBeenCalled();
  });

  it('keeps non-topology settings enabled while a session mutation is pending', async () => {
    const user = userEvent.setup();
    renderActionsMenu(true);

    const autoSyncItem = screen.getByRole('option', { name: /autoSyncSameUrl/ });
    expect(autoSyncItem).not.toHaveAttribute('aria-disabled', 'true');

    await user.click(autoSyncItem);
    expect(onAutoSyncChange).toHaveBeenCalledWith(true);
  });

  it('re-enables Stop after the authoritative mutation settles', async () => {
    const user = userEvent.setup();
    const { rerender } = renderActionsMenu(true);

    rerender(
      <ActionsMenu
        isSyncActive
        open
        autoSyncEnabled={false}
        excludedDomainsCount={0}
        isSyncMutationPending={false}
        sameDomainFilter={false}
        selectedCount={3}
        sortBy="similarity"
        onAutoSyncChange={onAutoSyncChange}
        onOpenChange={onOpenChange}
        onOpenExcludedDomains={onOpenExcludedDomains}
        onSameDomainFilterChange={onSameDomainFilterChange}
        onSortChange={onSortChange}
        onStartSync={onStartSync}
        onStopSync={onStopSync}
        onToggleAllTabs={onToggleAllTabs}
      />,
    );

    const stopItem = screen.getByRole('option', { name: /stopSync/ });
    expect(stopItem).not.toHaveAttribute('aria-disabled', 'true');

    await user.click(stopItem);
    expect(onStopSync).toHaveBeenCalledOnce();
  });
});
