/**
 * throttleAndDebounce 함수
 * 첫 번째 호출은 즉시 실행하고, 이후 호출은 throttle과 debounce를 결합하여 처리
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function throttleAndDebounce<T extends (...args: any[]) => void>(
  fn: T,
  delay: number,
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null;
  let called = false;

  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    if (!called) {
      fn(...args);
      called = true;
      setTimeout(() => {
        called = false;
      }, delay);
    } else {
      timeoutId = setTimeout(() => {
        fn(...args);
      }, delay);
    }
  };
}
