/// <reference types="vitest/globals" />

describe('showContextualHintToast', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '';
  });

  it('does not render a contextual hint that was hidden by the user', async () => {
    const isContextualHintDismissed = vi.fn().mockResolvedValue(true);

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

    const { showContextualHintToast } = await import('./suggestion-toast');

    await showContextualHintToast({
      hintId: 'page-change-synced',
      surface: 'webpage-overlay',
      source: 'url-sync',
    });

    expect(isContextualHintDismissed).toHaveBeenCalledWith('page-change-synced');
    expect(document.querySelector('#scroll-sync-suggestion-toast-root')).toBeNull();
  });
});
