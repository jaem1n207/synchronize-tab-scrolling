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
  it('uses a non-color leading indicator for hover and keyboard-active states', () => {
    render(
      <Command>
        <CommandList>
          <CommandItem>Open tab</CommandItem>
        </CommandList>
      </Command>,
    );

    const item = screen.getByRole('option', { name: 'Open tab' });

    expect(item.className).not.toContain('hover:bg-accent');
    expect(item.className).not.toContain('hover:text-accent-foreground');
    expect(item.className).toContain("data-[selected='true']:bg-accent");
    expect(item.className).toContain('data-[selected=true]:text-accent-foreground');
    expect(item.className).toContain("before:content-['']");
    expect(item.className).toContain('before:absolute');
    expect(item.className).toContain('before:left-0');
    expect(item.className).toContain('before:top-1.5');
    expect(item.className).toContain('before:bottom-1.5');
    expect(item.className).toContain('before:w-1');
    expect(item.className).toContain('before:rounded-r-sm');
    expect(item.className).toContain('before:bg-foreground');
    expect(item.className).toContain('before:opacity-0');
    expect(item.className).toContain('before:transition-opacity');
    expect(item.className).toContain('hover:before:opacity-100');
    expect(item.className).toContain('data-[selected=true]:before:opacity-100');
    expect(item.className).toContain('data-[disabled=true]:before:opacity-0');
    expect(item.className).toContain('data-[disabled=true]:data-[selected=true]:before:opacity-0');
    expect(item.className).toContain('data-[disabled=true]:pointer-events-none');
    expect(item.className).toContain('data-[disabled=true]:opacity-50');
  });
});
