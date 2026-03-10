import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendMessage } from 'webext-bridge/popup';

import { extractDomainFromUrl } from '~/shared/lib/auto-sync-url-utils';

import { useDomainExclusions } from './use-domain-exclusions';

vi.mock('webext-bridge/popup', () => ({
  sendMessage: vi.fn(),
}));

vi.mock('~/shared/lib/logger', () => ({
  ExtensionLogger: vi.fn().mockImplementation(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock('~/shared/lib/auto-sync-url-utils', () => ({
  extractDomainFromUrl: vi.fn(),
  normalizeDomain: vi.fn((domain: string) => domain.toLowerCase()),
}));

interface HookResult<T> {
  current: T;
}

interface ReactActEnvironmentGlobal {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
}

interface RenderHookResult<T> {
  result: HookResult<T>;
  unmount: () => void;
}

function renderHook<T>(hook: () => T): RenderHookResult<T> {
  const container = document.createElement('div');
  const root = createRoot(container);
  let value: T;

  function HookHost(): null {
    value = hook();
    return null;
  }

  act(() => {
    root.render(createElement(HookHost));
  });

  return {
    result: {
      get current() {
        return value;
      },
    },
    unmount: () => {
      act(() => {
        root.unmount();
      });
    },
  };
}

async function waitFor(assertion: () => void): Promise<void> {
  const timeoutAt = Date.now() + 1_000;
  while (Date.now() < timeoutAt) {
    try {
      assertion();
      return;
    } catch {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
    }
  }
  assertion();
}

describe('useDomainExclusions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as ReactActEnvironmentGlobal).IS_REACT_ACT_ENVIRONMENT = true;
    vi.mocked(sendMessage).mockResolvedValue({ domains: [] });
    vi.mocked(extractDomainFromUrl).mockImplementation((url: string) => {
      try {
        return new URL(url).hostname;
      } catch {
        return null;
      }
    });
  });

  it('addDomain extracts domain from full URL', async () => {
    vi.mocked(extractDomainFromUrl).mockImplementation((url: string) => {
      if (url === 'https://github.com/user/repo') {
        return 'github.com';
      }
      return null;
    });

    const { result, unmount } = renderHook(() => useDomainExclusions());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let addResult: ReturnType<typeof result.current.addDomain> = { success: false };
    act(() => {
      addResult = result.current.addDomain('https://github.com/user/repo');
    });

    expect(addResult).toEqual({ success: true, domain: 'github.com' });
    expect(result.current.excludedDomains).toEqual(['github.com']);
    const changedCalls = vi
      .mocked(sendMessage)
      .mock.calls.filter((call) => call[0] === 'auto-sync:excluded-domains-changed');
    expect(changedCalls).toHaveLength(1);
    expect(changedCalls[0]).toEqual([
      'auto-sync:excluded-domains-changed',
      { domains: ['github.com'] },
      'background',
    ]);

    unmount();
  });

  it('addDomain handles plain domain input', async () => {
    vi.mocked(extractDomainFromUrl).mockImplementation((url: string) => {
      if (url === 'github.com') {
        return null;
      }
      if (url === 'https://github.com') {
        return 'github.com';
      }
      return null;
    });

    const { result, unmount } = renderHook(() => useDomainExclusions());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let addResult: ReturnType<typeof result.current.addDomain> = { success: false };
    act(() => {
      addResult = result.current.addDomain('github.com');
    });

    expect(addResult).toEqual({ success: true, domain: 'github.com' });
    expect(extractDomainFromUrl).toHaveBeenCalledWith('github.com');
    expect(extractDomainFromUrl).toHaveBeenCalledWith('https://github.com');
    const changedCalls = vi
      .mocked(sendMessage)
      .mock.calls.filter((call) => call[0] === 'auto-sync:excluded-domains-changed');
    expect(changedCalls).toHaveLength(1);
    expect(changedCalls[0]).toEqual([
      'auto-sync:excluded-domains-changed',
      { domains: ['github.com'] },
      'background',
    ]);

    unmount();
  });

  it('addDomain returns error for invalid input', async () => {
    vi.mocked(extractDomainFromUrl).mockImplementation((url: string) => {
      if (url === 'not-a-url' || url === 'https://not-a-url') {
        return null;
      }
      return 'example.com';
    });

    const { result, unmount } = renderHook(() => useDomainExclusions());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let addResult: ReturnType<typeof result.current.addDomain> = { success: false };
    act(() => {
      addResult = result.current.addDomain('not-a-url');
    });

    expect(addResult).toEqual({ success: false, error: 'invalidDomain' });
    expect(result.current.excludedDomains).toEqual([]);
    expect(
      vi
        .mocked(sendMessage)
        .mock.calls.some((call) => call[0] === 'auto-sync:excluded-domains-changed'),
    ).toBe(false);

    unmount();
  });

  it('addDomain returns error for duplicate domain', async () => {
    vi.mocked(sendMessage).mockResolvedValue({ domains: ['github.com'] });
    vi.mocked(extractDomainFromUrl).mockImplementation((url: string) => {
      if (url === 'github.com' || url === 'https://github.com') {
        return 'github.com';
      }
      return null;
    });

    const { result, unmount } = renderHook(() => useDomainExclusions());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.excludedDomains).toEqual(['github.com']);

    let addResult: ReturnType<typeof result.current.addDomain> = { success: false };
    act(() => {
      addResult = result.current.addDomain('github.com');
    });

    expect(addResult).toEqual({ success: false, error: 'domainAlreadyExcluded' });
    const changedCalls = vi
      .mocked(sendMessage)
      .mock.calls.filter((call) => call[0] === 'auto-sync:excluded-domains-changed');
    expect(changedCalls).toHaveLength(0);

    unmount();
  });

  it('removeDomain removes from list and syncs to background', async () => {
    vi.mocked(sendMessage).mockResolvedValue({ domains: ['github.com', 'example.com'] });

    const { result, unmount } = renderHook(() => useDomainExclusions());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.removeDomain('github.com');
    });

    expect(result.current.excludedDomains).toEqual(['example.com']);
    const changedCalls = vi
      .mocked(sendMessage)
      .mock.calls.filter((call) => call[0] === 'auto-sync:excluded-domains-changed');
    expect(changedCalls).toHaveLength(1);
    expect(changedCalls[0]).toEqual([
      'auto-sync:excluded-domains-changed',
      { domains: ['example.com'] },
      'background',
    ]);

    unmount();
  });

  it('loads domains on mount via sendMessage', async () => {
    vi.mocked(sendMessage).mockResolvedValue({ domains: ['github.com', 'twitter.com'] });

    const { result, unmount } = renderHook(() => useDomainExclusions());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.excludedDomains).toEqual(['github.com', 'twitter.com']);
    });

    expect(sendMessage).toHaveBeenCalledWith('auto-sync:get-excluded-domains', {}, 'background');

    unmount();
  });
});
