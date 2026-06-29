/// <reference types="vitest/globals" />

import { act, waitFor } from '@testing-library/react';

describe('showContextualHintToast', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '';
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

  function mockSuggestionToastDependencies(isContextualHintDismissed = vi.fn().mockResolvedValue(false)) {
    vi.doMock('~/shared/lib/storage', () => ({
      isContextualHintDismissed,
      saveDismissedContextualHintId: vi.fn(),
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

    return { isContextualHintDismissed };
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

  it('keeps contextual hints visible when sync start clears suggestion toasts', async () => {
    mockSuggestionToastDependencies();

    const { hideTransientSuggestionToasts, showContextualHintToast } = await import(
      './suggestion-toast'
    );

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
});
