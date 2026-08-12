/// <reference types="vitest/globals" />

import { act, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

describe('showContextualHintToast', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '';
    document.documentElement.style.fontSize = '';
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
  });

  function mockSuggestionToastDependencies(
    isContextualHintDismissed = vi.fn().mockResolvedValue(false),
    saveDismissedContextualHintId = vi.fn().mockResolvedValue(undefined),
  ) {
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    vi.doMock('~/shared/lib/storage', () => ({
      isContextualHintDismissed,
      saveDismissedContextualHintId,
    }));
    vi.doMock('~/shared/lib/logger', () => ({
      ExtensionLogger: vi.fn().mockImplementation(() => ({
        debug: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
      })),
    }));
    vi.doMock('webextension-polyfill', () => ({
      default: {
        runtime: {
          getURL: (path: string) => path,
        },
      },
    }));
    vi.doMock('webext-bridge/content-script', () => ({
      onMessage: vi.fn(),
      sendMessage,
    }));
    vi.doMock('~/shared/i18n', () => ({
      t: (key: string) => {
        const messages: Record<string, string> = {
          contextualHintPageChangeSyncedTitle: 'Other tabs moved to the same page',
          contextualHintPageChangeSyncedBody: 'Turn off page-change sync if you do not want this.',
          contextualHintChangeSettingAction: 'Change setting',
          contextualHintShowLaterAction: 'Show later',
          contextualHintHideAction: 'Hide this hint',
          syncSuggestionCleanupRetrying:
            'Synchronization changed. Cleanup is still being retried. Check the popup for current status.',
        };

        return messages[key] ?? key;
      },
    }));

    return { isContextualHintDismissed, saveDismissedContextualHintId, sendMessage };
  }

  async function finishToastCssLoad(waitForContainer = true): Promise<ShadowRoot> {
    if (waitForContainer) {
      await waitFor(() => {
        const container = document.querySelector('#scroll-sync-suggestion-toast-root');
        const shadowRoot = container?.shadowRoot ?? null;
        const styleLink = shadowRoot?.querySelector('link[rel="stylesheet"]') ?? null;

        expect(shadowRoot).not.toBeNull();
        expect(styleLink).not.toBeNull();
      });
    }

    const container = document.querySelector('#scroll-sync-suggestion-toast-root');
    const shadowRoot = container?.shadowRoot;
    const styleLink = shadowRoot?.querySelector<HTMLLinkElement>('link[rel="stylesheet"]');

    if (!shadowRoot || !styleLink) {
      throw new Error('Expected contextual hint toast CSS link to exist');
    }

    styleLink.dispatchEvent(new Event('load'));

    return shadowRoot;
  }

  async function mountSyncSuggestionToast(expectedRevision: number) {
    const dependencies = mockSuggestionToastDependencies();
    const { showSyncSuggestionToast } = await import('./suggestion-toast');
    const showPromise = showSyncSuggestionToast({
      normalizedUrl: 'https://fixture.invalid/group',
      tabCount: 2,
      tabIds: [11, 22],
      tabTitles: ['First', 'Second'],
      expectedRevision,
    });
    const shadowRoot = await finishToastCssLoad(false);

    await act(async () => {
      await showPromise;
    });

    const app = shadowRoot.querySelector<HTMLElement>('#scroll-sync-suggestion-app');
    if (!app) {
      throw new Error('Expected sync suggestion toast app to exist');
    }

    return { dependencies, ui: within(app) };
  }

  async function mountAddTabSuggestionToast(expectedRevision: number) {
    const dependencies = mockSuggestionToastDependencies();
    const { showAddTabSuggestionToast } = await import('./suggestion-toast');
    const showPromise = showAddTabSuggestionToast({
      tabId: 33,
      tabTitle: 'Third',
      hasManualOffsets: false,
      normalizedUrl: 'https://fixture.invalid/group',
      expectedRevision,
    });
    const shadowRoot = await finishToastCssLoad(false);

    await act(async () => {
      await showPromise;
    });

    const app = shadowRoot.querySelector<HTMLElement>('#scroll-sync-suggestion-app');
    if (!app) {
      throw new Error('Expected add-tab suggestion toast app to exist');
    }

    return { dependencies, ui: within(app) };
  }

  it('echoes the displayed revision when accepting an initial suggestion', async () => {
    const user = userEvent.setup();
    const { dependencies, ui } = await mountSyncSuggestionToast(6);

    await user.click(ui.getByRole('button', { name: 'startSyncButton' }));

    await waitFor(() => {
      expect(dependencies.sendMessage).toHaveBeenCalledWith(
        'sync-suggestion:response',
        {
          normalizedUrl: 'https://fixture.invalid/group',
          accepted: true,
          expectedRevision: 6,
        },
        'background',
      );
    });
  });

  it('echoes the displayed revision when snoozing an initial suggestion', async () => {
    const user = userEvent.setup();
    const { dependencies, ui } = await mountSyncSuggestionToast(7);

    await user.click(ui.getByRole('button', { name: 'notNowButton' }));

    await waitFor(() => {
      expect(dependencies.sendMessage).toHaveBeenCalledWith(
        'sync-suggestion:response',
        {
          normalizedUrl: 'https://fixture.invalid/group',
          accepted: false,
          snooze: true,
          expectedRevision: 7,
        },
        'background',
      );
    });
  });

  it('echoes the displayed revision when permanently declining an initial suggestion', async () => {
    const user = userEvent.setup();
    const { dependencies, ui } = await mountSyncSuggestionToast(8);

    await user.click(ui.getByRole('button', { name: 'neverShowAgainForDomain' }));

    await waitFor(() => {
      expect(dependencies.sendMessage).toHaveBeenCalledWith(
        'sync-suggestion:response',
        {
          normalizedUrl: 'https://fixture.invalid/group',
          accepted: false,
          permanent: true,
          expectedRevision: 8,
        },
        'background',
      );
    });
  });

  it('echoes the displayed revision when an initial suggestion auto-dismisses', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { dependencies } = await mountSyncSuggestionToast(9);

    await act(async () => vi.advanceTimersByTimeAsync(10_300));

    expect(dependencies.sendMessage).toHaveBeenCalledWith(
      'sync-suggestion:response',
      {
        normalizedUrl: 'https://fixture.invalid/group',
        accepted: false,
        snooze: false,
        expectedRevision: 9,
      },
      'background',
    );
  });

  it('echoes the displayed revision when accepting an add-tab suggestion', async () => {
    const user = userEvent.setup();
    const { dependencies, ui } = await mountAddTabSuggestionToast(10);

    await user.click(ui.getByRole('button', { name: 'addTabButton' }));

    await waitFor(() => {
      expect(dependencies.sendMessage).toHaveBeenCalledWith(
        'sync-suggestion:add-tab-response',
        {
          tabId: 33,
          accepted: true,
          normalizedUrl: 'https://fixture.invalid/group',
          expectedRevision: 10,
        },
        'background',
      );
    });
  });

  it('announces degraded cleanup after a committed add instead of closing as clean success', async () => {
    const user = userEvent.setup();
    const { dependencies, ui } = await mountAddTabSuggestionToast(14);
    dependencies.sendMessage.mockResolvedValueOnce({
      success: true,
      revision: 15,
      warning: 'auto-sync-degraded',
    });

    await user.click(ui.getByRole('button', { name: 'addTabButton' }));

    const notice = await ui.findByRole('status');
    expect(notice).toHaveAttribute('aria-live', 'polite');
    expect(notice).toHaveTextContent(
      'Synchronization changed. Cleanup is still being retried. Check the popup for current status.',
    );
    expect(ui.queryByText('successSyncStarted')).not.toBeInTheDocument();
  });

  it('keeps the normal committed add path free of degraded cleanup notices', async () => {
    const user = userEvent.setup();
    const { dependencies, ui } = await mountAddTabSuggestionToast(15);
    dependencies.sendMessage.mockResolvedValueOnce({ success: true, revision: 16 });

    await user.click(ui.getByRole('button', { name: 'addTabButton' }));

    await waitFor(() => {
      expect(ui.queryByRole('button', { name: 'addTabButton' })).not.toBeInTheDocument();
    });
    expect(ui.queryByRole('status')).not.toBeInTheDocument();
  });

  it('echoes the displayed revision when snoozing an add-tab suggestion', async () => {
    const user = userEvent.setup();
    const { dependencies, ui } = await mountAddTabSuggestionToast(11);

    await user.click(ui.getByRole('button', { name: 'skipButton' }));

    await waitFor(() => {
      expect(dependencies.sendMessage).toHaveBeenCalledWith(
        'sync-suggestion:add-tab-response',
        {
          tabId: 33,
          accepted: false,
          snooze: true,
          normalizedUrl: 'https://fixture.invalid/group',
          expectedRevision: 11,
        },
        'background',
      );
    });
  });

  it('echoes the displayed revision when permanently declining an add-tab suggestion', async () => {
    const user = userEvent.setup();
    const { dependencies, ui } = await mountAddTabSuggestionToast(12);

    await user.click(ui.getByRole('button', { name: 'neverShowAgainForDomain' }));

    await waitFor(() => {
      expect(dependencies.sendMessage).toHaveBeenCalledWith(
        'sync-suggestion:add-tab-response',
        {
          tabId: 33,
          accepted: false,
          permanent: true,
          normalizedUrl: 'https://fixture.invalid/group',
          expectedRevision: 12,
        },
        'background',
      );
    });
  });

  it('echoes the displayed revision when an add-tab suggestion auto-dismisses', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { dependencies } = await mountAddTabSuggestionToast(13);

    await act(async () => vi.advanceTimersByTimeAsync(10_300));

    expect(dependencies.sendMessage).toHaveBeenCalledWith(
      'sync-suggestion:add-tab-response',
      {
        tabId: 33,
        accepted: false,
        snooze: false,
        normalizedUrl: 'https://fixture.invalid/group',
        expectedRevision: 13,
      },
      'background',
    );
  });

  it('does not render a contextual hint that was hidden by the user', async () => {
    const isContextualHintDismissed = vi.fn().mockResolvedValue(true);
    mockSuggestionToastDependencies(isContextualHintDismissed);

    const { showContextualHintToast } = await import('./suggestion-toast');

    await showContextualHintToast({
      hintId: 'page-change-synced',
      surface: 'webpage-overlay',
      source: 'url-sync',
    });

    expect(isContextualHintDismissed).toHaveBeenCalledWith('page-change-synced');
    expect(document.querySelector('#scroll-sync-suggestion-toast-root')).toBeNull();
  });

  it('injects pixel overrides for toast geometry utilities', async () => {
    document.documentElement.style.fontSize = '10px';
    mockSuggestionToastDependencies();

    const { showContextualHintToast } = await import('./suggestion-toast');

    const showPromise = showContextualHintToast({
      hintId: 'manual-scroll-adjustment',
      surface: 'webpage-overlay',
      source: 'sync-start',
    });
    const shadowRoot = await finishToastCssLoad();

    await act(async () => {
      await showPromise;
    });

    const injectedStyles = Array.from(shadowRoot.querySelectorAll('style'))
      .map((styleElement) => styleElement.textContent ?? '')
      .join('\n');

    expect(injectedStyles).toContain(
      '#scroll-sync-suggestion-app .bottom-6 { bottom: 24px !important; }',
    );
    expect(injectedStyles).toContain('#scroll-sync-suggestion-app .text-sm {');
    expect(injectedStyles).toContain('line-height: 20px !important;');
    expect(injectedStyles).toContain(
      '#scroll-sync-suggestion-app .p-4 { padding: 16px !important; }',
    );
    expect(injectedStyles).toContain(
      '#scroll-sync-suggestion-app .h-10 { height: 40px !important; }',
    );
    expect(injectedStyles).toContain('--radius: 8px;');
  });

  it('keeps contextual hints visible when sync start clears suggestion toasts', async () => {
    mockSuggestionToastDependencies();

    const { hideTransientSuggestionToasts, showContextualHintToast } =
      await import('./suggestion-toast');

    const showPromise = showContextualHintToast({
      hintId: 'page-change-synced',
      surface: 'webpage-overlay',
      source: 'url-sync',
    });
    const shadowRoot = await finishToastCssLoad();

    await act(async () => {
      await showPromise;
    });
    await waitFor(() => {
      expect(shadowRoot.textContent).toContain('Other tabs moved to the same page');
    });

    act(() => {
      hideTransientSuggestionToasts();
    });

    expect(shadowRoot.textContent).toContain('Other tabs moved to the same page');
  });

  it('does not re-render the same hint while permanent dismissal is being saved', async () => {
    let resolveSave: (() => void) | null = null;
    const saveDismissedContextualHintId = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        }),
    );
    const { isContextualHintDismissed } = mockSuggestionToastDependencies(
      vi.fn().mockResolvedValue(false),
      saveDismissedContextualHintId,
    );

    const { showContextualHintToast } = await import('./suggestion-toast');

    const showPromise = showContextualHintToast({
      hintId: 'page-change-synced',
      surface: 'webpage-overlay',
      source: 'url-sync',
    });
    const shadowRoot = await finishToastCssLoad();

    await act(async () => {
      await showPromise;
    });
    await waitFor(() => {
      expect(shadowRoot.textContent).toContain('Other tabs moved to the same page');
    });

    const hideButton = Array.from(shadowRoot.querySelectorAll('button')).find(
      (button) => button.textContent === 'Hide this hint',
    );
    if (!hideButton) {
      throw new Error('Expected permanent hide button to exist');
    }

    act(() => {
      hideButton.click();
    });

    await waitFor(() => {
      expect(saveDismissedContextualHintId).toHaveBeenCalledWith('page-change-synced');
    });

    await act(async () => {
      await showContextualHintToast({
        hintId: 'page-change-synced',
        surface: 'webpage-overlay',
        source: 'url-sync',
      });
    });

    expect(isContextualHintDismissed).toHaveBeenCalledTimes(1);
    expect(shadowRoot.textContent).not.toContain('Other tabs moved to the same page');

    await act(async () => {
      resolveSave?.();
    });
  });
});
