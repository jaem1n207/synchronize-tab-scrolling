/// <reference types="vitest/globals" />

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { UrlSyncSettings } from './url-sync-settings';

vi.mock('~/shared/i18n', () => ({
  t: (key: string) => {
    const messages: Record<string, string> = {
      urlSyncNavigation: 'URL Sync',
      urlSyncModeDescription: 'Choose how linked tabs follow page changes.',
      urlSyncModeFollowChangedTab: 'Follow changed tab',
      urlSyncModeFollowChangedTabDescription: 'Other tabs move to the website you changed.',
      urlSyncModeKeepEachTabsWebsite: "Keep each tab's website",
      urlSyncModeKeepEachTabsWebsiteDescription:
        'Other tabs stay on their own website and open the matching page.',
      urlSyncModeLanguageHelper: 'Languages are kept when possible.',
      urlSyncModeResetNotice:
        'URL Sync mode was reset because the saved setting could not be read.',
    };

    return messages[key] ?? key;
  },
}));

describe('UrlSyncSettings', () => {
  it('shows the title, current mode, and helper copy', () => {
    render(
      <UrlSyncSettings
        enabled={true}
        mode="keep-each-tabs-website"
        onEnabledChange={vi.fn()}
        onModeChange={vi.fn()}
      />,
    );

    expect(screen.getByText('URL Sync')).toBeInTheDocument();
    expect(screen.getByText("Keep each tab's website")).toBeInTheDocument();
    expect(screen.getByText('Languages are kept when possible.')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Keep each tab's website/i })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('keeps the URL Sync enabled switch', async () => {
    const onEnabledChange = vi.fn();
    const user = userEvent.setup();

    render(
      <UrlSyncSettings
        enabled={true}
        mode="follow-changed-tab"
        onEnabledChange={onEnabledChange}
        onModeChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('switch', { name: 'URL Sync' }));

    expect(onEnabledChange).toHaveBeenCalledWith(false);
  });

  it('disables mode buttons when URL Sync is off', () => {
    render(
      <UrlSyncSettings
        enabled={false}
        mode="follow-changed-tab"
        onEnabledChange={vi.fn()}
        onModeChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('radio', { name: /Follow changed tab/i })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /Keep each tab's website/i })).toBeDisabled();
  });

  it('calls onModeChange when selecting a different mode', async () => {
    const onModeChange = vi.fn();
    const user = userEvent.setup();

    render(
      <UrlSyncSettings
        enabled={true}
        mode="follow-changed-tab"
        onEnabledChange={vi.fn()}
        onModeChange={onModeChange}
      />,
    );

    await user.click(screen.getByRole('radio', { name: /Keep each tab's website/i }));

    expect(onModeChange).toHaveBeenCalledWith('keep-each-tabs-website');
  });

  it('does not call onModeChange when selecting the active mode', async () => {
    const onModeChange = vi.fn();
    const user = userEvent.setup();

    render(
      <UrlSyncSettings
        enabled={true}
        mode="follow-changed-tab"
        onEnabledChange={vi.fn()}
        onModeChange={onModeChange}
      />,
    );

    await user.click(screen.getByRole('radio', { name: /Follow changed tab/i }));

    expect(onModeChange).not.toHaveBeenCalled();
  });

  it('renders compact mode without the popup frame', () => {
    render(
      <UrlSyncSettings
        compact
        enabled={true}
        mode="follow-changed-tab"
        onEnabledChange={vi.fn()}
        onModeChange={vi.fn()}
      />,
    );

    const settings = screen.getByRole('region', { name: 'URL Sync' });

    expect(settings).toHaveAttribute('data-compact', 'true');
    expect(settings.className).not.toContain('border');
    expect(settings.className).not.toContain('bg-card');
  });

  it('renders translated notice copy with status semantics and severity styling', () => {
    render(
      <UrlSyncSettings
        enabled={true}
        mode="follow-changed-tab"
        notice={{ key: 'urlSyncModeResetNotice', severity: 'warning' }}
        onEnabledChange={vi.fn()}
        onModeChange={vi.fn()}
      />,
    );

    const notice = screen.getByRole('status');

    expect(notice).toHaveTextContent(
      'URL Sync mode was reset because the saved setting could not be read.',
    );
    expect(notice.className).toContain('border-yellow-200');
    expect(notice.className).toContain('bg-yellow-50');
  });
});
