/// <reference types="vitest/globals" />

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { UrlSyncSettings } from './url-sync-settings';

vi.mock('~/shared/i18n', () => ({
  t: (key: string) => {
    const messages: Record<string, string> = {
      urlSyncNavigation: 'Sync page changes',
      urlSyncStateOn: 'On',
      urlSyncStateOff: 'Off',
      urlSyncExpandSettings: 'Change page sync mode',
      urlSyncCollapseSettings: 'Hide page sync modes',
      urlSyncModeDescription: 'Choose how linked tabs follow page changes.',
      urlSyncModeFollowChangedTab: 'Follow changed tab',
      urlSyncModeFollowChangedTabDescription: 'Other tabs move to the website you changed.',
      urlSyncModeFollowChangedTabExample:
        'Example: if tab A moves to example.com/products, other tabs move to example.com/products too.',
      urlSyncModeKeepEachTabsWebsite: "Keep each tab's website",
      urlSyncModeKeepEachTabsWebsiteDescription:
        'Other tabs stay on their own website and open the matching page.',
      urlSyncModeKeepEachTabsWebsiteExample:
        'Example: if tab A moves to docs.example.com/pricing, tab B opens shop.example.com/pricing.',
      urlSyncModeLanguageHelper: 'Languages are kept when possible.',
      urlSyncModeResetNotice: 'URL Sync mode was reset because the saved setting was not valid.',
      urlSyncKeepWebsiteBlockedNotice:
        'Could not keep this tab on its current website for that page change. No navigation was synced.',
      urlSyncLanguagePreservationNotice: 'Language could not be preserved for this page change.',
      urlSyncSettingSaveFailedNotice:
        'Could not save the URL Sync setting. The previous setting is still being used.',
      urlSyncSettingReadFailedNotice:
        'Could not read the URL Sync setting. URL navigation was not synced.',
    };

    if (!(key in messages)) {
      throw new Error(`Missing test translation for ${key}`);
    }

    return messages[key];
  },
}));

describe('UrlSyncSettings', () => {
  it('shows the title and current mode', () => {
    render(
      <UrlSyncSettings
        enabled={true}
        mode="keep-each-tabs-website"
        onEnabledChange={vi.fn()}
        onModeChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Sync page changes' })).toBeInTheDocument();
    expect(screen.getByText("Keep each tab's website")).toBeInTheDocument();
    expect(screen.queryByText('Languages are kept when possible.')).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Keep each tab's website/i })).toBeChecked();
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

    await user.click(screen.getByRole('switch', { name: 'Sync page changes' }));

    expect(onEnabledChange).toHaveBeenCalledWith(false);
  });

  it('unlocks the URL Sync switch after onEnabledChange throws synchronously', async () => {
    const onEnabledChange = vi.fn(() => {
      throw new Error('toggle save failed');
    });
    const user = userEvent.setup();

    render(
      <UrlSyncSettings
        enabled={true}
        mode="follow-changed-tab"
        onEnabledChange={onEnabledChange}
        onModeChange={vi.fn()}
      />,
    );

    const enabledSwitch = screen.getByRole('switch', { name: 'Sync page changes' });

    await user.click(enabledSwitch);
    await waitFor(() => {
      expect(enabledSwitch).not.toBeDisabled();
    });
    await user.click(enabledSwitch);

    expect(onEnabledChange).toHaveBeenCalledTimes(2);
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

  it('blocks mode changes while the enabled switch callback is pending', async () => {
    const onEnabledChange = vi.fn(() => new Promise<void>(() => {}));
    const onModeChange = vi.fn();
    const user = userEvent.setup();

    render(
      <UrlSyncSettings
        enabled={true}
        mode="follow-changed-tab"
        onEnabledChange={onEnabledChange}
        onModeChange={onModeChange}
      />,
    );

    const enabledSwitch = screen.getByRole('switch', { name: 'Sync page changes' });
    const keepWebsiteRadio = screen.getByRole('radio', { name: /Keep each tab's website/i });

    await user.click(enabledSwitch);

    expect(keepWebsiteRadio).toBeDisabled();

    await user.click(keepWebsiteRadio);

    expect(onModeChange).not.toHaveBeenCalled();
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

  it('ignores rapid duplicate mode selections while the callback is pending', async () => {
    const onModeChange = vi.fn(() => new Promise<void>(() => {}));
    const user = userEvent.setup();

    render(
      <UrlSyncSettings
        enabled={true}
        mode="follow-changed-tab"
        onEnabledChange={vi.fn()}
        onModeChange={onModeChange}
      />,
    );

    const keepWebsiteRadio = screen.getByRole('radio', { name: /Keep each tab's website/i });

    await user.click(keepWebsiteRadio);
    await user.click(keepWebsiteRadio);

    expect(onModeChange).toHaveBeenCalledTimes(1);
  });

  it('handles rejected mode callbacks without creating another pending lock', async () => {
    const onModeChange = vi.fn().mockRejectedValue(new Error('mode save failed'));
    const user = userEvent.setup();

    render(
      <UrlSyncSettings
        enabled={true}
        mode="follow-changed-tab"
        onEnabledChange={vi.fn()}
        onModeChange={onModeChange}
      />,
    );

    const keepWebsiteRadio = screen.getByRole('radio', { name: /Keep each tab's website/i });

    await user.click(keepWebsiteRadio);
    await user.click(keepWebsiteRadio);

    expect(onModeChange).toHaveBeenCalledTimes(2);
  });

  it('unlocks mode selection after onModeChange throws synchronously', async () => {
    const onModeChange = vi.fn(() => {
      throw new Error('mode save failed');
    });
    const user = userEvent.setup();

    render(
      <UrlSyncSettings
        enabled={true}
        mode="follow-changed-tab"
        onEnabledChange={vi.fn()}
        onModeChange={onModeChange}
      />,
    );

    const keepWebsiteRadio = screen.getByRole('radio', { name: /Keep each tab's website/i });

    await user.click(keepWebsiteRadio);
    await waitFor(() => {
      expect(keepWebsiteRadio).not.toBeDisabled();
    });
    await user.click(keepWebsiteRadio);

    expect(onModeChange).toHaveBeenCalledTimes(2);
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

  describe('inline-collapsible variant', () => {
    it('renders collapsed with status and active mode visible', () => {
      render(
        <UrlSyncSettings
          enabled={true}
          mode="keep-each-tabs-website"
          variant="inline-collapsible"
          onEnabledChange={vi.fn()}
          onModeChange={vi.fn()}
        />,
      );

      const settings = screen.getByRole('region', { name: 'Sync page changes' });
      const disclosure = screen.getByRole('button', { name: 'Change page sync mode' });

      expect(settings).toHaveAttribute('data-variant', 'inline-collapsible');
      expect(settings).toHaveTextContent('On');
      expect(settings).toHaveTextContent("Keep each tab's website");
      expect(settings).not.toHaveTextContent('example.com/products');
      expect(settings).not.toHaveTextContent('docs.example.com/pricing');
      expect(settings).not.toHaveTextContent('Languages are kept when possible.');
      expect(disclosure).toHaveAttribute('aria-expanded', 'false');
      expect(disclosure).toHaveAccessibleDescription(/On.*Keep each tab's website/);
      expect(
        screen.queryByText('Other tabs stay on their own website and open the matching page.'),
      ).not.toBeInTheDocument();
    });

    it('expands inline and exposes both mode descriptions', async () => {
      const user = userEvent.setup();

      render(
        <UrlSyncSettings
          enabled={true}
          mode="follow-changed-tab"
          variant="inline-collapsible"
          onEnabledChange={vi.fn()}
          onModeChange={vi.fn()}
        />,
      );

      const disclosure = screen.getByRole('button', { name: 'Change page sync mode' });

      await user.click(disclosure);

      expect(screen.getByRole('button', { name: 'Hide page sync modes' })).toHaveAttribute(
        'aria-expanded',
        'true',
      );
      expect(screen.getByText('Other tabs move to the website you changed.')).toBeInTheDocument();
      expect(
        screen.getByText(
          'Example: if tab A moves to example.com/products, other tabs move to example.com/products too.',
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText('Other tabs stay on their own website and open the matching page.'),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          'Example: if tab A moves to docs.example.com/pricing, tab B opens shop.example.com/pricing.',
        ),
      ).toBeInTheDocument();
    });

    it('expands inline settings when expandToken changes to a positive value', () => {
      const { rerender } = render(
        <UrlSyncSettings
          enabled={true}
          expandToken={0}
          mode="follow-changed-tab"
          variant="inline-collapsible"
          onEnabledChange={vi.fn()}
          onModeChange={vi.fn()}
        />,
      );

      expect(screen.getByRole('button', { name: 'Change page sync mode' })).toHaveAttribute(
        'aria-expanded',
        'false',
      );

      rerender(
        <UrlSyncSettings
          enabled={true}
          expandToken={1}
          mode="follow-changed-tab"
          variant="inline-collapsible"
          onEnabledChange={vi.fn()}
          onModeChange={vi.fn()}
        />,
      );

      expect(screen.getByRole('button', { name: 'Hide page sync modes' })).toHaveAttribute(
        'aria-expanded',
        'true',
      );
      expect(screen.getByText('Other tabs move to the website you changed.')).toBeInTheDocument();
    });

    it('collapses after a successful mode change', async () => {
      const onModeChange = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();

      render(
        <UrlSyncSettings
          enabled={true}
          mode="follow-changed-tab"
          variant="inline-collapsible"
          onEnabledChange={vi.fn()}
          onModeChange={onModeChange}
        />,
      );

      await user.click(screen.getByRole('button', { name: 'Change page sync mode' }));
      await user.click(screen.getByRole('radio', { name: /Keep each tab's website/i }));

      expect(onModeChange).toHaveBeenCalledWith('keep-each-tabs-website');
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Change page sync mode' })).toHaveAttribute(
          'aria-expanded',
          'false',
        );
      });
    });

    it('keeps the editor open after a failed mode change', async () => {
      const onModeChange = vi.fn().mockRejectedValue(new Error('mode save failed'));
      const user = userEvent.setup();

      render(
        <UrlSyncSettings
          enabled={true}
          mode="follow-changed-tab"
          variant="inline-collapsible"
          onEnabledChange={vi.fn()}
          onModeChange={onModeChange}
        />,
      );

      await user.click(screen.getByRole('button', { name: 'Change page sync mode' }));
      await user.click(screen.getByRole('radio', { name: /Keep each tab's website/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Hide page sync modes' })).toHaveAttribute(
          'aria-expanded',
          'true',
        );
      });
    });

    it('keeps the editor open when a mode change resolves to false', async () => {
      const onModeChange = vi.fn().mockResolvedValue(false);
      const user = userEvent.setup();

      render(
        <UrlSyncSettings
          enabled={true}
          mode="follow-changed-tab"
          variant="inline-collapsible"
          onEnabledChange={vi.fn()}
          onModeChange={onModeChange}
        />,
      );

      await user.click(screen.getByRole('button', { name: 'Change page sync mode' }));
      await user.click(screen.getByRole('radio', { name: /Keep each tab's website/i }));

      expect(onModeChange).toHaveBeenCalledWith('keep-each-tabs-website');
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Hide page sync modes' })).toHaveAttribute(
          'aria-expanded',
          'true',
        );
      });
    });

    it('keeps the active mode visible but disables mode choices when URL Sync is off', async () => {
      const user = userEvent.setup();

      render(
        <UrlSyncSettings
          enabled={false}
          mode="keep-each-tabs-website"
          variant="inline-collapsible"
          onEnabledChange={vi.fn()}
          onModeChange={vi.fn()}
        />,
      );

      expect(screen.getByText('Off')).toBeInTheDocument();
      expect(screen.getByText("Keep each tab's website")).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Change page sync mode' }));

      expect(screen.getByRole('radio', { name: /Follow changed tab/i })).toBeDisabled();
      expect(screen.getByRole('radio', { name: /Keep each tab's website/i })).toBeDisabled();
    });
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

    const settings = screen.getByRole('region', { name: 'Sync page changes' });

    expect(settings).toHaveAttribute('data-variant', 'panel-compact');
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
      'URL Sync mode was reset because the saved setting was not valid.',
    );
    expect(notice.className).toContain('border-yellow-200');
    expect(notice.className).toContain('bg-yellow-50');
  });
});
