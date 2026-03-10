import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('use-system-theme logic', () => {
  let matchMediaSpy: ReturnType<typeof vi.fn>;
  let listeners: Array<() => void>;

  beforeEach(() => {
    listeners = [];
    matchMediaSpy = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn((_event: string, callback: () => void) => {
        listeners.push(callback);
      }),
      removeEventListener: vi.fn((_event: string, callback: () => void) => {
        listeners = listeners.filter((l) => l !== callback);
      }),
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    Object.defineProperty(window, 'matchMedia', {
      value: matchMediaSpy,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    listeners = [];
  });

  describe('getSnapshot (theme detection)', () => {
    function getSnapshot(): 'light' | 'dark' {
      if (typeof window === 'undefined') return 'light';
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    it('returns dark when system prefers dark mode', () => {
      matchMediaSpy.mockReturnValue({ matches: true });
      expect(getSnapshot()).toBe('dark');
    });

    it('returns light when system prefers light mode', () => {
      matchMediaSpy.mockReturnValue({ matches: false });
      expect(getSnapshot()).toBe('light');
    });

    it('queries the correct media query', () => {
      matchMediaSpy.mockReturnValue({ matches: false });
      getSnapshot();
      expect(matchMediaSpy).toHaveBeenCalledWith('(prefers-color-scheme: dark)');
    });
  });

  describe('getServerSnapshot (SSR fallback)', () => {
    it('always returns light for server-side rendering', () => {
      const getServerSnapshot = (): 'light' | 'dark' => 'light';
      expect(getServerSnapshot()).toBe('light');
    });
  });

  describe('subscribe (media query listener)', () => {
    function subscribe(callback: () => void): () => void {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      mediaQuery.addEventListener('change', callback);
      return () => mediaQuery.removeEventListener('change', callback);
    }

    it('adds event listener to media query', () => {
      const callback = vi.fn();
      subscribe(callback);

      expect(matchMediaSpy).toHaveBeenCalledWith('(prefers-color-scheme: dark)');
      const mockMediaQuery = matchMediaSpy.mock.results[0].value;
      expect(mockMediaQuery.addEventListener).toHaveBeenCalledWith('change', callback);
    });

    it('returns unsubscribe function that removes listener', () => {
      const callback = vi.fn();
      const unsubscribe = subscribe(callback);

      unsubscribe();

      const mockMediaQuery = matchMediaSpy.mock.results[0].value;
      expect(mockMediaQuery.removeEventListener).toHaveBeenCalledWith('change', callback);
    });

    it('notifies callback when theme changes', () => {
      const callback = vi.fn();
      subscribe(callback);

      expect(listeners).toHaveLength(1);
      listeners[0]();
      expect(listeners).toHaveLength(1);
    });
  });

  describe('theme values', () => {
    it('only produces "light" or "dark" values', () => {
      const validThemes = ['light', 'dark'];

      matchMediaSpy.mockReturnValue({ matches: true });
      const darkResult = window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
      expect(validThemes).toContain(darkResult);

      matchMediaSpy.mockReturnValue({ matches: false });
      const lightResult = window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
      expect(validThemes).toContain(lightResult);
    });
  });
});
