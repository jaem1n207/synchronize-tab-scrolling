import { useSyncExternalStore } from 'react';

type SystemTheme = 'light' | 'dark';

const getSnapshot = (): SystemTheme => {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const getServerSnapshot = (): SystemTheme => 'light';

const subscribe = (callback: () => void): (() => void) => {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  mediaQuery.addEventListener('change', callback);
  return () => mediaQuery.removeEventListener('change', callback);
};

export const useSystemTheme = (): SystemTheme => {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
};
