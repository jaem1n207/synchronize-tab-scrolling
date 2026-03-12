/// <reference types="vitest/globals" />

import { render, screen } from '~/landing/__tests__/test-utils';
import { Footer } from '~/landing/components/layout/footer';
import { GITHUB_REPO_URL, DEMO_VIDEO_URL, SUPPORT_EMAIL } from '~/landing/lib/constants';

const BUG_REPORT_URL = `${GITHUB_REPO_URL}/issues/new?title=Bug%20Report&labels=bug&assignees=jaem1n207`;

describe('Footer', () => {
  beforeEach(() => {
    localStorage.setItem('landing-locale', 'en');
  });

  it('renders all footer links with correct hrefs', () => {
    render(<Footer />);

    expect(screen.getByRole('link', { name: /github/i })).toHaveAttribute('href', GITHUB_REPO_URL);
    expect(screen.getByRole('link', { name: /demo/i })).toHaveAttribute('href', DEMO_VIDEO_URL);
    expect(screen.getByRole('link', { name: /report/i })).toHaveAttribute('href', BUG_REPORT_URL);
    expect(screen.getByRole('link', { name: /email/i })).toHaveAttribute(
      'href',
      `mailto:${SUPPORT_EMAIL}`,
    );
    expect(screen.getByRole('link', { name: 'jaem1n207' })).toHaveAttribute(
      'href',
      'https://github.com/jaem1n207',
    );
  });

  it('has analytics attributes on all interactive links', () => {
    render(<Footer />);

    const expectedEvents: Array<{ name: RegExp | string; event: string }> = [
      { name: /github/i, event: 'footer-github' },
      { name: /demo/i, event: 'footer-demo' },
      { name: /report/i, event: 'footer-bug-report' },
      { name: /email/i, event: 'footer-email' },
      { name: 'jaem1n207', event: 'footer-author' },
    ];

    for (const { name, event } of expectedEvents) {
      const link = screen.getByRole('link', { name });
      expect(link).toHaveAttribute('data-umami-event', event);
    }
  });
});
