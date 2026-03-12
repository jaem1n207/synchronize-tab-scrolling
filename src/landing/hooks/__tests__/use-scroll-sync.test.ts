/// <reference types="vitest/globals" />

import { act, renderHook } from '@testing-library/react';

import { useScrollSync } from '~/landing/hooks/use-scroll-sync';

function setScrollableSize(element: HTMLDivElement, clientHeight: number, scrollHeight: number) {
  Object.defineProperty(element, 'clientHeight', {
    value: clientHeight,
    configurable: true,
  });
  Object.defineProperty(element, 'scrollHeight', {
    value: scrollHeight,
    configurable: true,
  });
}

describe('useScrollSync', () => {
  let rafQueue: Array<FrameRequestCallback>;

  beforeEach(() => {
    rafQueue = [];
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        rafQueue.push(callback);
        return rafQueue.length;
      }),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function flushAnimationFrames() {
    const callbacks = [...rafQueue];
    rafQueue = [];
    for (const callback of callbacks) {
      callback(0);
    }
  }

  it('syncs target panel scroll position when source panel scrolls', () => {
    const left = document.createElement('div');
    const right = document.createElement('div');
    setScrollableSize(left, 100, 300);
    setScrollableSize(right, 100, 300);

    left.scrollTop = 100;
    right.scrollTop = 0;

    const leftRef = { current: left };
    const rightRef = { current: right };

    renderHook(() =>
      useScrollSync({
        leftRef,
        rightRef,
        isSynced: true,
        isAdjusting: false,
      }),
    );

    act(() => {
      left.dispatchEvent(new Event('scroll'));
      flushAnimationFrames();
    });

    expect(right.scrollTop).toBe(100);
  });

  it('tracks manual offset after adjustment mode ends', () => {
    const left = document.createElement('div');
    const right = document.createElement('div');
    setScrollableSize(left, 100, 300);
    setScrollableSize(right, 100, 300);

    left.scrollTop = 100;
    right.scrollTop = 100;

    const leftRef = { current: left };
    const rightRef = { current: right };

    const { result, rerender } = renderHook(
      ({ isAdjusting, isSynced }) =>
        useScrollSync({
          leftRef,
          rightRef,
          isSynced,
          isAdjusting,
        }),
      {
        initialProps: { isAdjusting: false, isSynced: true },
      },
    );

    rerender({ isAdjusting: true, isSynced: true });

    right.scrollTop = 140;

    rerender({ isAdjusting: false, isSynced: true });

    expect(result.current).toBeCloseTo(0.2);
  });

  it('resets manual offset when sync is disabled', () => {
    const left = document.createElement('div');
    const right = document.createElement('div');
    setScrollableSize(left, 100, 300);
    setScrollableSize(right, 100, 300);

    left.scrollTop = 100;
    right.scrollTop = 100;

    const leftRef = { current: left };
    const rightRef = { current: right };

    const { result, rerender } = renderHook(
      ({ isAdjusting, isSynced }) =>
        useScrollSync({
          leftRef,
          rightRef,
          isSynced,
          isAdjusting,
        }),
      {
        initialProps: { isAdjusting: false, isSynced: true },
      },
    );

    rerender({ isAdjusting: true, isSynced: true });
    right.scrollTop = 140;
    rerender({ isAdjusting: false, isSynced: true });

    expect(result.current).toBeCloseTo(0.2);

    rerender({ isAdjusting: false, isSynced: false });

    expect(result.current).toBe(0);
  });
});
