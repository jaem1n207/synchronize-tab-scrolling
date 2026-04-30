/// <reference types="vitest/globals" />

import { render, screen } from '@testing-library/react';

import { Command, CommandItem, CommandList } from './command';

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

describe('CommandItem', () => {
  it('uses existing accent tokens for hover and keyboard-active states', () => {
    render(
      <Command>
        <CommandList>
          <CommandItem>Open tab</CommandItem>
        </CommandList>
      </Command>,
    );

    const item = screen.getByRole('option', { name: 'Open tab' });

    expect(item.className).toContain('hover:bg-accent');
    expect(item.className).toContain('hover:text-accent-foreground');
    expect(item.className).toContain("data-[selected='true']:bg-accent");
    expect(item.className).toContain('data-[selected=true]:text-accent-foreground');
    expect(item.className).toContain('data-[disabled=true]:pointer-events-none');
    expect(item.className).toContain('data-[disabled=true]:opacity-50');
  });
});
