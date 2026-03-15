/// <reference types="vitest/globals" />

import type { ReactNode } from 'react';

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ExcludedDomainsDialog } from '../excluded-domains-dialog';

// Radix Dialog → simple divs to avoid portal / scroll-lock complexity in jsdom
vi.mock('~/shared/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: ReactNode; open: boolean }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={className} data-testid="dialog-content">
      {children}
    </div>
  ),
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
}));

vi.mock('~/shared/i18n', () => ({
  t: vi.fn((key: string) => key),
}));

vi.mock('~/shared/lib/animations', () => ({
  ANIMATION_DURATIONS: { fast: 0 },
  EASING_FUNCTIONS: { easeOut: [0, 0, 0.2, 1] },
  getMotionTransition: () => ({ duration: 0 }),
}));

vi.mock('~icons/lucide/arrow-right', () => ({
  default: () => <span data-testid="icon-arrow" />,
}));
vi.mock('~icons/lucide/globe', () => ({
  default: () => <span data-testid="icon-globe" />,
}));
vi.mock('~icons/lucide/plus', () => ({
  default: () => <span data-testid="icon-plus" />,
}));
vi.mock('~icons/lucide/x', () => ({
  default: () => <span data-testid="icon-x" />,
}));

// jsdom lacks scrollIntoView
Element.prototype.scrollIntoView = vi.fn();

// Framer-motion layout prop requires ResizeObserver
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

const LONG_DOMAIN = 'bendd-git-fix-visual-audit-improvements-jaemins-crafts.vercel.app';
const SHORT_DOMAINS = ['github.com', 'youtube.com', 'bendd.me'];
const MIXED_DOMAINS = [...SHORT_DOMAINS, LONG_DOMAIN, 'jaem1n207.github.io'];

function renderDialog(overrides: Partial<Parameters<typeof ExcludedDomainsDialog>[0]> = {}) {
  const props = {
    excludedDomains: SHORT_DOMAINS,
    onAddDomain: vi.fn(() => ({ success: true, domain: 'test.com' })),
    onOpenChange: vi.fn(),
    onPreviewDomain: vi.fn(() => null),
    onRemoveDomain: vi.fn(),
    open: true,
    ...overrides,
  };
  return { ...render(<ExcludedDomainsDialog {...props} />), props };
}

describe('ExcludedDomainsDialog', () => {
  /*
   * Regression: Radix Dialog's react-remove-scroll intercepted wheel events
   * on nested Radix ScrollArea. Fix: native overflow-y-auto div.
   */
  describe('scroll container (regression: mouse scroll fix)', () => {
    it('uses native overflow-y-auto instead of Radix ScrollArea', () => {
      renderDialog();

      const scrollContainer = screen.getByTestId('scroll-container');

      expect(scrollContainer.tagName).toBe('DIV');
      expect(scrollContainer.className).toContain('overflow-y-auto');
    });

    it('has overscroll-contain to prevent scroll chaining to dialog', () => {
      renderDialog();

      const scrollContainer = screen.getByTestId('scroll-container');

      expect(scrollContainer.className).toContain('overscroll-contain');
    });

    it('has max-height constraint for the scrollable area', () => {
      renderDialog();

      const scrollContainer = screen.getByTestId('scroll-container');

      expect(scrollContainer.className).toMatch(/max-h-/);
    });
  });

  /*
   * Regression: DialogContent uses display:grid. Grid items default to
   * min-width:auto, preventing shrinking below content width — breaking
   * the CSS truncate chain. Fix: min-w-0 on the grid-item wrapper.
   */
  describe('grid overflow prevention (regression: long URL overflow fix)', () => {
    it('content wrapper has min-w-0 to allow grid-item shrinking', () => {
      renderDialog();

      const dialogContent = screen.getByTestId('dialog-content');
      const contentWrapper = dialogContent.querySelector('.space-y-4');

      expect(contentWrapper).not.toBeNull();
      expect(contentWrapper!.className).toContain('min-w-0');
    });

    it('domain text element has truncate class for ellipsis overflow', () => {
      renderDialog({ excludedDomains: [LONG_DOMAIN] });

      const option = screen.getByRole('option');
      const textSpan = within(option).getByTitle(LONG_DOMAIN);

      expect(textSpan.className).toContain('truncate');
    });

    it('domain text parent has min-w-0 for flex shrinking', () => {
      renderDialog({ excludedDomains: [LONG_DOMAIN] });

      const option = screen.getByRole('option');
      const textSpan = within(option).getByTitle(LONG_DOMAIN);
      const textContainer = textSpan.parentElement!;

      expect(textContainer.className).toContain('min-w-0');
    });

    it('delete button has shrink-0 to remain visible with long domains', () => {
      renderDialog({ excludedDomains: [LONG_DOMAIN] });

      const option = screen.getByRole('option');
      const deleteButton = within(option).getByRole('button');

      expect(deleteButton.className).toContain('shrink-0');
    });
  });

  /*
   * Regression: Added title attribute so users can hover to see full domain
   * name when text is truncated with ellipsis.
   */
  describe('truncated domain tooltip (regression: accessibility)', () => {
    it('each domain item shows full domain name as title tooltip', () => {
      renderDialog({ excludedDomains: MIXED_DOMAINS });

      for (const domain of MIXED_DOMAINS) {
        const textElement = screen.getByTitle(domain);
        expect(textElement).toBeInTheDocument();
        expect(textElement.textContent).toBe(domain);
      }
    });

    it('long domain has title matching full untruncated domain', () => {
      renderDialog({ excludedDomains: [LONG_DOMAIN] });

      const textElement = screen.getByTitle(LONG_DOMAIN);

      expect(textElement.getAttribute('title')).toBe(LONG_DOMAIN);
    });
  });

  describe('rendering', () => {
    it('shows empty state when no domains exist', () => {
      renderDialog({ excludedDomains: [] });

      expect(screen.getByText('noExcludedDomains')).toBeInTheDocument();
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('renders all domains as listbox options', () => {
      renderDialog({ excludedDomains: SHORT_DOMAINS });

      const listbox = screen.getByRole('listbox');
      const options = within(listbox).getAllByRole('option');

      expect(options).toHaveLength(SHORT_DOMAINS.length);
    });

    it('input has combobox role with correct ARIA attributes', () => {
      renderDialog({ excludedDomains: SHORT_DOMAINS });

      const input = screen.getByRole('combobox');

      expect(input).toHaveAttribute('aria-controls', 'excluded-domains-list');
      expect(input).toHaveAttribute('aria-expanded', 'true');
    });

    it('does not render when dialog is closed', () => {
      renderDialog({ open: false });

      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    });

    it('each option has data-value and id attributes', () => {
      renderDialog({ excludedDomains: SHORT_DOMAINS });

      const options = screen.getAllByRole('option');

      for (let i = 0; i < SHORT_DOMAINS.length; i++) {
        expect(options[i]).toHaveAttribute('data-value', SHORT_DOMAINS[i]);
        expect(options[i]).toHaveAttribute(
          'id',
          `excluded-domain-${SHORT_DOMAINS[i].replace(/\./g, '-')}`,
        );
      }
    });
  });

  describe('interactions', () => {
    it('calls onRemoveDomain when delete button is clicked', async () => {
      const user = userEvent.setup();
      const { props } = renderDialog({ excludedDomains: SHORT_DOMAINS });

      const options = screen.getAllByRole('option');
      const deleteButton = within(options[0]).getByRole('button');
      await user.click(deleteButton);

      expect(props.onRemoveDomain).toHaveBeenCalledWith(SHORT_DOMAINS[0]);
    });

    it('calls onAddDomain when Enter is pressed with input value', async () => {
      const user = userEvent.setup();
      const { props } = renderDialog({ excludedDomains: [] });

      const input = screen.getByRole('combobox');
      await user.type(input, 'newdomain.com');
      await user.keyboard('{Enter}');

      expect(props.onAddDomain).toHaveBeenCalledWith('newdomain.com');
    });

    it('selects first domain on ArrowDown', async () => {
      const user = userEvent.setup();
      renderDialog({ excludedDomains: SHORT_DOMAINS });

      const input = screen.getByRole('combobox');
      await user.click(input);
      await user.keyboard('{ArrowDown}');

      const firstOption = screen.getAllByRole('option')[0];

      expect(firstOption).toHaveAttribute('aria-selected', 'true');
    });

    it('deselects on ArrowUp from first domain', async () => {
      const user = userEvent.setup();
      renderDialog({ excludedDomains: SHORT_DOMAINS });

      const input = screen.getByRole('combobox');
      await user.click(input);
      await user.keyboard('{ArrowDown}');
      await user.keyboard('{ArrowUp}');

      const options = screen.getAllByRole('option');
      for (const option of options) {
        expect(option).toHaveAttribute('aria-selected', 'false');
      }
    });

    it('sets pending-remove on first Enter, removes on second Enter', async () => {
      const user = userEvent.setup();
      const { props } = renderDialog({ excludedDomains: SHORT_DOMAINS });

      const input = screen.getByRole('combobox');
      await user.click(input);
      await user.keyboard('{ArrowDown}');

      // First Enter → pending-remove state (no removal yet)
      await user.keyboard('{Enter}');
      expect(props.onRemoveDomain).not.toHaveBeenCalled();

      // Second Enter → actual removal
      await user.keyboard('{Enter}');
      expect(props.onRemoveDomain).toHaveBeenCalledWith(SHORT_DOMAINS[0]);
    });

    it('Escape clears pending-remove then selection in stages', async () => {
      const user = userEvent.setup();
      renderDialog({ excludedDomains: SHORT_DOMAINS });

      const input = screen.getByRole('combobox');
      await user.click(input);
      await user.keyboard('{ArrowDown}');

      // Enter pending-remove state
      await user.keyboard('{Enter}');
      const firstOption = screen.getAllByRole('option')[0];
      expect(firstOption.className).toContain('border-destructive');

      // First Escape → clears pending-remove (selection stays)
      await user.keyboard('{Escape}');
      expect(firstOption).toHaveAttribute('aria-selected', 'true');
      expect(firstOption.className).not.toContain('border-destructive');

      // Second Escape → clears selection
      await user.keyboard('{Escape}');
      expect(firstOption).toHaveAttribute('aria-selected', 'false');
    });

    it('clears selection when user types a character', async () => {
      const user = userEvent.setup();
      renderDialog({ excludedDomains: SHORT_DOMAINS });

      const input = screen.getByRole('combobox');
      await user.click(input);
      await user.keyboard('{ArrowDown}');

      const firstOption = screen.getAllByRole('option')[0];
      expect(firstOption).toHaveAttribute('aria-selected', 'true');

      await user.type(input, 'a');

      expect(firstOption).toHaveAttribute('aria-selected', 'false');
    });
  });
});
