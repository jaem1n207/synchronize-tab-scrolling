import { useState, useEffect, useCallback } from 'react';

/**
 * Custom hook for state that persists to localStorage
 * @param key - localStorage key
 * @param initialValue - Initial value if no stored value exists
 * @returns [state, setState] tuple
 */
export function usePersistentState<T>(
  key: string,
  initialValue: T,
): [T, (value: T | ((prev: T) => T)) => void] {
  // Initialize state from localStorage or use initial value
  const [state, setStateInternal] = useState<T>(() => {
    try {
      const storedValue = localStorage.getItem(key);
      return storedValue !== null ? (JSON.parse(storedValue) as T) : initialValue;
    } catch (error) {
      console.error(`Failed to load ${key} from localStorage:`, error);
      return initialValue;
    }
  });

  // Update localStorage whenever state changes
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch (error) {
      console.error(`Failed to save ${key} to localStorage:`, error);
    }
  }, [key, state]);

  // Wrapped setState that accepts both value and updater function
  const setState = useCallback((value: T | ((prev: T) => T)) => {
    setStateInternal((prev) => {
      const newValue = typeof value === 'function' ? (value as (prev: T) => T)(prev) : value;
      return newValue;
    });
  }, []);

  return [state, setState];
}
