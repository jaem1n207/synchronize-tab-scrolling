/// <reference types="vitest/globals" />

describe('content script entrypoint', () => {
  it('registers Quick Sync feedback before exposing the ready runtime sentinel', async () => {
    vi.resetModules();
    Reflect.deleteProperty(globalThis, '__synchronizeTabScrollingRuntimeReady');
    const calls: Array<string> = [];
    vi.doMock('./quick-sync-hud', () => ({
      initQuickSyncHud: () => calls.push('quick-sync-hud'),
    }));
    vi.doMock('./scroll-sync', () => ({
      initScrollSync: () => calls.push('scroll-sync'),
    }));

    await import('./index');

    expect(calls).toEqual(['quick-sync-hud', 'scroll-sync']);
    expect(Reflect.get(globalThis, '__synchronizeTabScrollingRuntimeReady')).toBe(true);
  });
});
