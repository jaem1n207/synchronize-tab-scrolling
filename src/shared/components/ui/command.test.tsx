/// <reference types="vitest/globals" />

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { Command, CommandItem, CommandList } from './command';

const INDICATOR_SELECTOR = '[data-slot="command-item-leading-indicator"]';

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

function getIndicatorCount() {
  return document.querySelectorAll(INDICATOR_SELECTOR).length;
}

describe('CommandItem', () => {
  it('moves one shared leading indicator from the selected item to the hovered item', async () => {
    render(
      <Command>
        <CommandList>
          <CommandItem>Previous item</CommandItem>
          <CommandItem>Next item</CommandItem>
        </CommandList>
      </Command>,
    );

    const previousItem = screen.getByRole('option', { name: 'Previous item' });
    const nextItem = screen.getByRole('option', { name: 'Next item' });

    expect(previousItem.className).not.toContain('before:');
    expect(nextItem.className).not.toContain('before:');

    await waitFor(() => {
      expect(previousItem.querySelector(INDICATOR_SELECTOR)).not.toBeNull();
    });
    expect(previousItem.querySelector(INDICATOR_SELECTOR)?.getAttribute('data-motion-mode')).toBe(
      'instant',
    );
    expect(getIndicatorCount()).toBe(1);

    fireEvent.pointerEnter(nextItem);

    await waitFor(() => {
      expect(nextItem.querySelector(INDICATOR_SELECTOR)).not.toBeNull();
    });
    expect(previousItem.querySelector(INDICATOR_SELECTOR)).toBeNull();
    expect(getIndicatorCount()).toBe(1);
    expect(nextItem.querySelector(INDICATOR_SELECTOR)?.getAttribute('data-layout-id')).toBe(
      'command-item-leading-indicator',
    );
    expect(nextItem.querySelector(INDICATOR_SELECTOR)?.getAttribute('data-motion-mode')).toBe(
      'animated',
    );
  });

  it('moves the shared indicator when cmdk changes the selected item', async () => {
    render(
      <Command>
        <CommandList>
          <CommandItem>First option</CommandItem>
          <CommandItem>Second option</CommandItem>
        </CommandList>
      </Command>,
    );

    const firstOption = screen.getByRole('option', { name: 'First option' });
    const secondOption = screen.getByRole('option', { name: 'Second option' });

    await waitFor(() => {
      expect(firstOption.querySelector(INDICATOR_SELECTOR)).not.toBeNull();
    });
    expect(firstOption.querySelector(INDICATOR_SELECTOR)?.getAttribute('data-motion-mode')).toBe(
      'instant',
    );
    expect(getIndicatorCount()).toBe(1);

    secondOption.setAttribute('data-selected', 'true');
    firstOption.setAttribute('data-selected', 'false');

    await waitFor(() => {
      expect(secondOption.querySelector(INDICATOR_SELECTOR)).not.toBeNull();
    });
    expect(firstOption.querySelector(INDICATOR_SELECTOR)).toBeNull();
    expect(secondOption.querySelector(INDICATOR_SELECTOR)?.getAttribute('data-motion-mode')).toBe(
      'animated',
    );
    expect(getIndicatorCount()).toBe(1);
  });

  it('removes the moving indicator when a disabled item becomes selected or hovered', async () => {
    render(
      <Command>
        <CommandList>
          <CommandItem>Enabled option</CommandItem>
          <CommandItem disabled>Disabled option</CommandItem>
        </CommandList>
      </Command>,
    );

    const enabledOption = screen.getByRole('option', { name: 'Enabled option' });
    const disabledOption = screen.getByRole('option', { name: 'Disabled option' });

    fireEvent.pointerEnter(enabledOption);

    await waitFor(() => {
      expect(enabledOption.querySelector(INDICATOR_SELECTOR)).not.toBeNull();
    });
    enabledOption.setAttribute('data-selected', 'true');
    expect(getIndicatorCount()).toBe(1);

    disabledOption.setAttribute('data-selected', 'true');
    fireEvent.pointerEnter(disabledOption);

    await waitFor(() => {
      expect(getIndicatorCount()).toBe(0);
    });
    expect(enabledOption.querySelector(INDICATOR_SELECTOR)).toBeNull();
    expect(disabledOption.querySelector(INDICATOR_SELECTOR)).toBeNull();
    expect(disabledOption.className).toContain('data-[disabled=true]:cursor-not-allowed');
    expect(disabledOption.className).toContain('data-[disabled=true]:opacity-50');

    fireEvent.pointerLeave(disabledOption);

    await waitFor(() => {
      expect(enabledOption.querySelector(INDICATOR_SELECTOR)).not.toBeNull();
    });
    expect(disabledOption.querySelector(INDICATOR_SELECTOR)).toBeNull();
    expect(getIndicatorCount()).toBe(1);
  });
});
