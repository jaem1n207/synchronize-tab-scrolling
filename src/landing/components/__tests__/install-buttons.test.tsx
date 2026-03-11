/// <reference types="vitest/globals" />

import userEvent from '@testing-library/user-event';

import { render, screen } from '~/landing/__tests__/test-utils';
import { InstallButtons } from '~/landing/components/install-buttons';
import { STORE_URLS } from '~/landing/lib/constants';
import { detectBrowser } from '~/landing/lib/detect-browser';

vi.mock('~/landing/lib/detect-browser', () => ({
  detectBrowser: vi.fn(),
}));

const mockedDetectBrowser = vi.mocked(detectBrowser);

describe('InstallButtons', () => {
  beforeEach(() => {
    mockedDetectBrowser.mockReturnValue('firefox');
  });

  it('renders primary CTA for detected browser with correct URL and analytics attributes', () => {
    render(<InstallButtons />);

    const primary = screen.getByRole('link', { name: 'Add to Firefox' });

    expect(primary).toHaveAttribute('href', STORE_URLS.firefox);
    expect(primary).toHaveAttribute('data-umami-event', 'install-primary');
    expect(primary).toHaveAttribute('data-umami-event-browser', 'Firefox');
  });

  it('renders secondary browser links with expected URLs and analytics attributes', () => {
    render(<InstallButtons />);

    expect(screen.getByText('Also available on')).toBeInTheDocument();

    const expectedSecondary: Array<{ label: string; url: string }> = [
      { label: 'Chrome', url: STORE_URLS.chrome },
      { label: 'Edge', url: STORE_URLS.edge },
      { label: 'Arc', url: STORE_URLS.arc },
      { label: 'Brave', url: STORE_URLS.brave },
      { label: 'Dia', url: STORE_URLS.dia },
    ];

    for (const browser of expectedSecondary) {
      const link = screen.getByRole('link', { name: `Add to ${browser.label}` });
      expect(link).toHaveAttribute('href', browser.url);
      expect(link).toHaveAttribute('data-umami-event', 'install-secondary');
      expect(link).toHaveAttribute('data-umami-event-browser', browser.label);
    }
  });

  it('renders only compact primary button without secondary links', async () => {
    const user = userEvent.setup();
    render(<InstallButtons variant="compact" />);

    const primary = screen.getByRole('link', { name: 'Add to Firefox' });
    await user.hover(primary);

    expect(primary).toHaveAttribute('href', STORE_URLS.firefox);
    expect(screen.queryByText('Also available on')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('link')).toHaveLength(1);
  });

  it('falls back to chrome text and URL for unsupported browsers', () => {
    mockedDetectBrowser.mockReturnValue('safari');

    render(<InstallButtons />);

    const primary = screen.getByRole('link', { name: 'Add to Chrome' });
    expect(primary).toHaveAttribute('href', STORE_URLS.chrome);
  });
});
