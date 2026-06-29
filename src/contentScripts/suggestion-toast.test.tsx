/// <reference types="vitest/globals" />

import { act, waitFor } from '@testing-library/react';

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
      sendMessage: vi.fn(),
    }));
    vi.doMock('~/shared/i18n', () => ({
      t: (key: string) => {
        const messages: Record<string, string> = {
          contextualHintPageChangeSyncedTitle: 'Other tabs moved to the same page',
          contextualHintPageChangeSyncedBody: 'Turn off page-change sync if you do not want this.',
          contextualHintChangeSettingAction: 'Change setting',
          contextualHintShowLaterAction: 'Show later',
          contextualHintHideAction: 'Hide this hint',
        };

        return messages[key] ?? key;
      },
    }));

    return { isContextualHintDismissed, saveDismissedContextualHintId };
  }

  async function finishToastCssLoad(): Promise<ShadowRoot> {
    await waitFor(() => {
      const container = document.querySelector('#scroll-sync-suggestion-toast-root');
      const shadowRoot = container?.shadowRoot ?? null;
      const styleLink = shadowRoot?.querySelector('link[rel="stylesheet"]') ?? null;

      expect(shadowRoot).not.toBeNull();
      expect(styleLink).not.toBeNull();
    });

    const container = document.querySelector('#scroll-sync-suggestion-toast-root');
    const shadowRoot = container?.shadowRoot;
    const styleLink = shadowRoot?.querySelector<HTMLLinkElement>('link[rel="stylesheet"]');

    if (!shadowRoot || !styleLink) {
      throw new Error('Expected contextual hint toast CSS link to exist');
    }

    styleLink.dispatchEvent(new Event('load'));

    return shadowRoot;
  }

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
