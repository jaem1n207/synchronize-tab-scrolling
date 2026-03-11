/// <reference types="vitest/globals" />

import userEvent from '@testing-library/user-event';

import { render, screen } from '~/landing/__tests__/test-utils';
import { HeroSection } from '~/landing/components/hero/hero-section';

describe('HeroSection', () => {
  beforeEach(() => {
    localStorage.setItem('landing-locale', 'en');
  });

  it('renders initial sync controls and scroll hint', () => {
    render(<HeroSection />);

    const toggle = screen.getByRole('button', { name: /Enable Sync/i });

    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(toggle).toHaveAttribute('data-umami-event', 'hero-sync-toggle');
    expect(screen.getByText('Not synced')).toBeInTheDocument();
    expect(screen.getByText('Scroll the left panel')).toBeInTheDocument();
  });

  it('switches to synced state after enabling sync', async () => {
    const user = userEvent.setup();
    render(<HeroSection />);

    await user.click(screen.getByRole('button', { name: /Enable Sync/i }));

    const syncingButton = screen.getByRole('button', { name: /Syncing/i });
    expect(syncingButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Synced')).toBeInTheDocument();
    expect(screen.getByText('Scroll either panel')).toBeInTheDocument();
  });

  it('shows adjusting status and modifier hint while Alt is held', async () => {
    const user = userEvent.setup();
    render(<HeroSection />);

    await user.click(screen.getByRole('button', { name: /Enable Sync/i }));
    await user.keyboard('{Alt>}');

    expect(screen.getByText('Adjusting')).toBeInTheDocument();
    expect(screen.getByText(/scroll to adjust individually/i)).toBeInTheDocument();

    await user.keyboard('{/Alt}');

    expect(screen.getByText('Synced')).toBeInTheDocument();
  });
});
