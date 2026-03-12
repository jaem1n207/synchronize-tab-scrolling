/// <reference types="vitest/globals" />

import userEvent from '@testing-library/user-event';

import { act, render, screen, within } from '~/landing/__tests__/test-utils';
import { Header } from '~/landing/components/layout/header';

describe('Header', () => {
  beforeEach(() => {
    localStorage.setItem('landing-locale', 'en');
  });

  it('renders navigation links and language toggle', () => {
    render(<Header />);

    const mainNav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(mainNav).toBeInTheDocument();

    expect(screen.getByRole('link', { name: 'Features' })).toHaveAttribute('href', '#features');
    expect(screen.getByRole('link', { name: 'Use Cases' })).toHaveAttribute('href', '#use-cases');

    expect(screen.getByRole('button', { name: 'English: Change language' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Toggle dark mode' })).toBeInTheDocument();
  });

  it('updates header style on scroll', () => {
    const { container } = render(<Header />);
    const header = container.querySelector('header');

    expect(header).toHaveClass('bg-transparent');

    act(() => {
      window.scrollY = 120;
      window.dispatchEvent(new Event('scroll'));
    });

    expect(header).toHaveClass('bg-background/80');
    expect(header).toHaveClass('backdrop-blur-lg');
  });

  it('opens and closes mobile menu with keyboard-accessible toggle', async () => {
    const user = userEvent.setup();
    render(<Header />);

    const menuToggle = screen.getByRole('button', { name: 'Open menu' });
    expect(menuToggle).toHaveAttribute('aria-expanded', 'false');

    await user.click(menuToggle);

    expect(screen.getByRole('navigation', { name: 'Mobile navigation' })).toBeInTheDocument();
    expect(menuToggle).toHaveAttribute('aria-expanded', 'true');
    expect(document.body.style.overflow).toBe('hidden');

    const mobileNav = screen.getByRole('navigation', { name: 'Mobile navigation' });
    await user.click(within(mobileNav).getByRole('link', { name: 'Features' }));

    expect(screen.queryByRole('navigation', { name: 'Mobile navigation' })).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('');
  });
});
