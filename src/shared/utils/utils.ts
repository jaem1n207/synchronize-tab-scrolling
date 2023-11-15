export const debounce = <T extends (...args: Parameters<T>) => void>(
  func: T,
  wait: number
) => {
  let timeoutId: NodeJS.Timeout | undefined;

  const clear = () => {
    clearTimeout(timeoutId);
  };
  const debouncedFn = (...args: Parameters<T>) => {
    clear();
    timeoutId = setTimeout(() => {
      timeoutId = undefined;
      func(...args);
    }, wait);
  };

  return debouncedFn;
};

export const throttle = <T extends (...args: Parameters<T>) => void>(
  func: T,
  wait: number
) => {
  let lastCalled = 0;

  return (...args: Parameters<T>) => {
    const now = new Date().getTime();
    if (now - lastCalled < wait) {
      return;
    }
    lastCalled = now;
    return func(...args);
  };
};
