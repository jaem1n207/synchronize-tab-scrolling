/// <reference types="vitest/globals" />

import { act, renderHook } from '@testing-library/react';

import { useReducedMotion } from '~/landing/hooks/use-reduced-motion';

describe('useReducedMotion', () => {
  it('returns the current matchMedia value', () => {
    vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const { result } = renderHook(() => useReducedMotion());

    expect(result.current).toBe(true);
  });

  it('updates when the media query match changes', () => {
    let isReduced = false;
    let onChange: (() => void) | null = null;

    vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)' ? isReduced : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn((_eventName: string, callback: () => void) => {
        onChange = callback;
      }),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const { result } = renderHook(() => useReducedMotion());

    expect(result.current).toBe(false);

    isReduced = true;
    act(() => {
      onChange?.();
    });

    expect(result.current).toBe(true);
  });

  it('unsubscribes from matchMedia change events on unmount', () => {
    const removeEventListener = vi.fn();

    vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener,
      dispatchEvent: vi.fn(),
    }));

    const { unmount } = renderHook(() => useReducedMotion());

    unmount();

    expect(removeEventListener).toHaveBeenCalledTimes(1);
    expect(removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
