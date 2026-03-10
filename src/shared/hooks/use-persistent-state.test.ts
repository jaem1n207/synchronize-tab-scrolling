import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();

const mockLocalStorage = {
  getItem: (key: string): string | null => store.get(key) ?? null,
  setItem: (key: string, value: string): void => {
    store.set(key, value);
  },
  removeItem: (key: string): void => {
    store.delete(key);
  },
};

describe('use-persistent-state logic', () => {
  beforeEach(() => {
    store.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    store.clear();
  });

  describe('localStorage read (initialization)', () => {
    function initializeState<T>(key: string, initialValue: T): T {
      try {
        const storedValue = mockLocalStorage.getItem(key);
        return storedValue !== null ? (JSON.parse(storedValue) as T) : initialValue;
      } catch {
        return initialValue;
      }
    }

    it('returns initial value when localStorage is empty', () => {
      expect(initializeState('test-key', 'default')).toBe('default');
    });

    it('returns stored string value', () => {
      mockLocalStorage.setItem('test-key', JSON.stringify('stored'));
      expect(initializeState('test-key', 'default')).toBe('stored');
    });

    it('returns stored number value', () => {
      mockLocalStorage.setItem('counter', JSON.stringify(42));
      expect(initializeState('counter', 0)).toBe(42);
    });

    it('returns stored boolean value', () => {
      mockLocalStorage.setItem('flag', JSON.stringify(true));
      expect(initializeState('flag', false)).toBe(true);
    });

    it('returns stored object value', () => {
      const stored = { name: 'test', count: 5 };
      mockLocalStorage.setItem('obj', JSON.stringify(stored));
      expect(initializeState('obj', {})).toEqual(stored);
    });

    it('returns stored array value', () => {
      const stored = [1, 2, 3];
      mockLocalStorage.setItem('arr', JSON.stringify(stored));
      expect(initializeState('arr', [])).toEqual(stored);
    });

    it('returns stored null value (distinguishes null from missing)', () => {
      mockLocalStorage.setItem('nullable', JSON.stringify(null));
      expect(initializeState('nullable', 'default')).toBeNull();
    });

    it('returns initial value when stored value is malformed JSON', () => {
      mockLocalStorage.setItem('broken', 'not-json{{{');
      expect(initializeState('broken', 'fallback')).toBe('fallback');
    });

    it('returns initial value when getItem throws', () => {
      const originalGetItem = mockLocalStorage.getItem;
      mockLocalStorage.getItem = () => {
        throw new Error('SecurityError');
      };
      expect(initializeState('key', 'safe')).toBe('safe');
      mockLocalStorage.getItem = originalGetItem;
    });
  });

  describe('localStorage write (persistence)', () => {
    function persistState<T>(key: string, value: T): boolean {
      try {
        mockLocalStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    }

    it('saves string value', () => {
      persistState('key', 'value');
      expect(mockLocalStorage.getItem('key')).toBe('"value"');
    });

    it('saves number value', () => {
      persistState('counter', 42);
      expect(mockLocalStorage.getItem('counter')).toBe('42');
    });

    it('saves boolean value', () => {
      persistState('flag', true);
      expect(mockLocalStorage.getItem('flag')).toBe('true');
    });

    it('saves object value', () => {
      persistState('obj', { name: 'test' });
      expect(JSON.parse(mockLocalStorage.getItem('obj')!)).toEqual({ name: 'test' });
    });

    it('saves array value', () => {
      persistState('arr', [1, 2, 3]);
      expect(JSON.parse(mockLocalStorage.getItem('arr')!)).toEqual([1, 2, 3]);
    });

    it('saves null value', () => {
      persistState('nullable', null);
      expect(mockLocalStorage.getItem('nullable')).toBe('null');
    });

    it('overwrites previous value', () => {
      persistState('key', 'first');
      persistState('key', 'second');
      expect(JSON.parse(mockLocalStorage.getItem('key')!)).toBe('second');
    });

    it('returns false when setItem throws', () => {
      const originalSetItem = mockLocalStorage.setItem;
      mockLocalStorage.setItem = () => {
        throw new Error('QuotaExceededError');
      };
      expect(persistState('key', 'value')).toBe(false);
      mockLocalStorage.setItem = originalSetItem;
    });
  });

  describe('round-trip (read after write)', () => {
    function persistState<T>(key: string, value: T): void {
      mockLocalStorage.setItem(key, JSON.stringify(value));
    }

    function initializeState<T>(key: string, initialValue: T): T {
      try {
        const storedValue = mockLocalStorage.getItem(key);
        return storedValue !== null ? (JSON.parse(storedValue) as T) : initialValue;
      } catch {
        return initialValue;
      }
    }

    it('preserves string through write-read cycle', () => {
      persistState('key', 'hello');
      expect(initializeState('key', '')).toBe('hello');
    });

    it('preserves complex object through write-read cycle', () => {
      const complex = {
        nested: { deep: { value: 42 } },
        list: ['a', 'b'],
        flag: true,
      };
      persistState('complex', complex);
      expect(initializeState('complex', {})).toEqual(complex);
    });

    it('preserves empty object through write-read cycle', () => {
      persistState('empty', {});
      expect(initializeState('empty', { default: true })).toEqual({});
    });

    it('preserves zero through write-read cycle', () => {
      persistState('zero', 0);
      expect(initializeState('zero', 999)).toBe(0);
    });

    it('preserves empty string through write-read cycle', () => {
      persistState('empty-str', '');
      expect(initializeState('empty-str', 'default')).toBe('');
    });

    it('preserves false through write-read cycle', () => {
      persistState('false-val', false);
      expect(initializeState('false-val', true)).toBe(false);
    });
  });

  describe('updater function pattern', () => {
    function applyUpdate<T>(prev: T, update: T | ((prev: T) => T)): T {
      return typeof update === 'function' ? (update as (prev: T) => T)(prev) : update;
    }

    it('applies direct value', () => {
      expect(applyUpdate(0, 5)).toBe(5);
    });

    it('applies updater function', () => {
      expect(applyUpdate(0, (prev) => prev + 1)).toBe(1);
    });

    it('applies updater function for strings', () => {
      expect(applyUpdate('hello', (prev) => prev + ' world')).toBe('hello world');
    });

    it('applies updater function for objects', () => {
      const prev = { count: 0 };
      const result = applyUpdate(prev, (p) => ({ ...p, count: p.count + 1 }));
      expect(result).toEqual({ count: 1 });
    });

    it('applies updater function for arrays', () => {
      expect(applyUpdate([1, 2], (prev) => [...prev, 3])).toEqual([1, 2, 3]);
    });

    it('applies direct replacement for objects', () => {
      expect(applyUpdate({ old: true }, { new: true })).toEqual({ new: true });
    });
  });
});
