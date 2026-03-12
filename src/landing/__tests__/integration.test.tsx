/// <reference types="vitest/globals" />

import userEvent from '@testing-library/user-event';

import { render, screen } from '~/landing/__tests__/test-utils';
import { App } from '~/landing/app';
import { STORE_URLS } from '~/landing/lib/constants';
import { detectBrowser } from '~/landing/lib/detect-browser';
import de from '~/landing/lib/translations/de';
import en from '~/landing/lib/translations/en';

vi.mock('~/landing/lib/detect-browser', () => ({
  detectBrowser: vi.fn(),
}));

const mockedDetectBrowser = vi.mocked(detectBrowser);

describe('Landing page integration', () => {
  beforeEach(() => {
    localStorage.setItem('landing-locale', 'en');
    mockedDetectBrowser.mockReturnValue('chrome');
  });

  it('updates visible UI text across components when language changes', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getAllByText(en.features.title).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'English: Change language' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'English: Change language' }));
    await user.click(screen.getByRole('menuitem', { name: /Deutsch/i }));

    expect(screen.getAllByText(de.features.title).length).toBeGreaterThan(0);
    expect(screen.getByText(de.hero.enableSync)).toBeInTheDocument();
    expect(screen.getByText(de.problem.text)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deutsch: Change language' })).toBeInTheDocument();
  });

  it('renders install buttons using detected browser store URL across sections', () => {
    mockedDetectBrowser.mockReturnValue('edge');
    const { container } = render(<App />);

    const primaryLinks = container.querySelectorAll('a[data-umami-event="install-primary"]');

    expect(primaryLinks.length).toBeGreaterThan(0);

    primaryLinks.forEach((link) => {
      expect(link).toHaveAttribute('href', STORE_URLS.edge);
      expect(link).toHaveAttribute('data-umami-event-browser', 'Edge');
    });
  });
});
