import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

import { throttleAndDebounce } from './performance-utils';

describe('throttleAndDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should execute first call immediately (leading edge)', () => {
    const fn = vi.fn();
    const throttled = throttleAndDebounce(fn, 100);

    throttled();

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should throttle subsequent calls within delay period', () => {
    const fn = vi.fn();
    const throttled = throttleAndDebounce(fn, 100);

    throttled();
    throttled();
    throttled();

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should execute final call after delay (trailing edge)', () => {
    const fn = vi.fn();
    const throttled = throttleAndDebounce(fn, 100);

    throttled();
    throttled();
    throttled();

    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should pass arguments correctly to function', () => {
    const fn = vi.fn();
    const throttled = throttleAndDebounce(fn, 100);

    throttled('arg1', 'arg2');

    expect(fn).toHaveBeenCalledWith('arg1', 'arg2');

    throttled('arg3', 'arg4');
    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenLastCalledWith('arg3', 'arg4');
  });

  it('should result in exactly 2 executions for multiple rapid calls', () => {
    const fn = vi.fn();
    const throttled = throttleAndDebounce(fn, 100);

    throttled();
    throttled();
    throttled();
    throttled();
    throttled();

    expect(fn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should allow new immediate execution after delay period', () => {
    const fn = vi.fn();
    const throttled = throttleAndDebounce(fn, 100);

    throttled();
    expect(fn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(100);

    throttled();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should handle cleanup and cancellation properly', () => {
    const fn = vi.fn();
    const throttled = throttleAndDebounce(fn, 100);

    throttled();
    throttled();

    expect(fn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledTimes(2);
  });
});
