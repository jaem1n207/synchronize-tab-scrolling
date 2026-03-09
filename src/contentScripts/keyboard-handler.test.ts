import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  return {
    sendMessageMock: vi.fn(),
    saveManualScrollOffsetMock: vi.fn(),
    loggerInfoMock: vi.fn(),
    loggerDebugMock: vi.fn(),
    loggerWarnMock: vi.fn(),
    loggerErrorMock: vi.fn(),
  };
});

vi.mock('webext-bridge/content-script', () => ({
  sendMessage: mocks.sendMessageMock,
}));

vi.mock('~/shared/lib/storage', () => ({
  saveManualScrollOffset: mocks.saveManualScrollOffsetMock,
}));

vi.mock('~/shared/lib/logger', () => ({
  ExtensionLogger: vi.fn().mockImplementation(() => ({
    info: mocks.loggerInfoMock,
    debug: mocks.loggerDebugMock,
    warn: mocks.loggerWarnMock,
    error: mocks.loggerErrorMock,
  })),
}));

import { cleanupKeyboardHandler, initKeyboardHandler } from './keyboard-handler';

function setDocumentScrollState(scrollHeight: number, clientHeight: number, scrollTop: number) {
  Object.defineProperty(document.documentElement, 'scrollHeight', {
    configurable: true,
    value: scrollHeight,
  });
  Object.defineProperty(document.documentElement, 'clientHeight', {
    configurable: true,
    value: clientHeight,
  });
  document.documentElement.scrollTop = scrollTop;
}

async function flushAsyncHandlers() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('keyboard-handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sendMessageMock.mockResolvedValue(undefined);
    mocks.saveManualScrollOffsetMock.mockResolvedValue(undefined);
    document.documentElement.classList.remove('scroll-sync-manual-mode');
    setDocumentScrollState(2000, 1000, 0);
  });

  afterEach(async () => {
    cleanupKeyboardHandler();
    await flushAsyncHandlers();
    document.documentElement.classList.remove('scroll-sync-manual-mode');
  });

  describe('initKeyboardHandler', () => {
    it('registers keydown listener with passive option', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

      initKeyboardHandler(1);

      expect(addEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function), {
        passive: true,
      });
    });

    it('registers keyup listener with passive option', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

      initKeyboardHandler(2);

      expect(addEventListenerSpy).toHaveBeenCalledWith('keyup', expect.any(Function), {
        passive: true,
      });
    });

    it('registers blur listener', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

      initKeyboardHandler(3);

      expect(addEventListenerSpy).toHaveBeenCalledWith('blur', expect.any(Function));
    });

    it('stores latest tabId for later messages', () => {
      initKeyboardHandler(5);
      initKeyboardHandler(99);

      window.dispatchEvent(new KeyboardEvent('keydown', { altKey: true }));

      expect(mocks.sendMessageMock).toHaveBeenCalledWith(
        'scroll:manual',
        { tabId: 99, enabled: true },
        'background',
      );
    });
  });

  describe('keydown handling', () => {
    it('activates manual mode on Alt key press', () => {
      const setManualModeActive = vi.fn();

      initKeyboardHandler(10, () => ({
        currentScrollTop: 150,
        lastSyncedRatio: 0.2,
        setManualModeActive,
      }));

      window.dispatchEvent(new KeyboardEvent('keydown', { altKey: true }));

      expect(setManualModeActive).toHaveBeenCalledWith(true);
      expect(mocks.sendMessageMock).toHaveBeenCalledWith(
        'scroll:manual',
        { tabId: 10, enabled: true },
        'background',
      );
      expect(document.documentElement.classList.contains('scroll-sync-manual-mode')).toBe(true);
    });

    it('activates manual mode on Meta key press', () => {
      const setManualModeActive = vi.fn();

      initKeyboardHandler(11, () => ({
        currentScrollTop: 320,
        lastSyncedRatio: 0.4,
        setManualModeActive,
      }));

      window.dispatchEvent(new KeyboardEvent('keydown', { metaKey: true }));

      expect(setManualModeActive).toHaveBeenCalledWith(true);
      expect(mocks.sendMessageMock).toHaveBeenCalledWith(
        'scroll:manual',
        { tabId: 11, enabled: true },
        'background',
      );
    });

    it('does not activate again if already in manual mode', () => {
      const setManualModeActive = vi.fn();
      const getScrollInfo = vi.fn(() => ({
        currentScrollTop: 450,
        lastSyncedRatio: 0.45,
        setManualModeActive,
      }));

      initKeyboardHandler(12, getScrollInfo);

      window.dispatchEvent(new KeyboardEvent('keydown', { altKey: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', { altKey: true }));

      expect(getScrollInfo).toHaveBeenCalledTimes(1);
      expect(setManualModeActive).toHaveBeenCalledTimes(1);
      expect(mocks.sendMessageMock).toHaveBeenCalledTimes(1);
      expect(mocks.sendMessageMock).toHaveBeenCalledWith(
        'scroll:manual',
        { tabId: 12, enabled: true },
        'background',
      );
    });

    it('snapshots baseline from lastSyncedRatio for later offset calculation', async () => {
      const setManualModeActive = vi.fn();
      const getScrollInfo = vi
        .fn()
        .mockReturnValueOnce({
          currentScrollTop: 100,
          lastSyncedRatio: 0.3,
          setManualModeActive,
        })
        .mockReturnValueOnce({
          currentScrollTop: 600,
          lastSyncedRatio: 0.3,
          setManualModeActive,
        })
        .mockReturnValueOnce({
          currentScrollTop: 600,
          lastSyncedRatio: 0.3,
          setManualModeActive,
        });

      setDocumentScrollState(2000, 1000, 600);
      initKeyboardHandler(13, getScrollInfo);

      window.dispatchEvent(new KeyboardEvent('keydown', { altKey: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { altKey: false }));
      await flushAsyncHandlers();

      expect(mocks.saveManualScrollOffsetMock).toHaveBeenCalledWith(13, 0.3, 300);
    });

    it('still activates and sends message when getScrollInfo is not provided', () => {
      initKeyboardHandler(14);

      window.dispatchEvent(new KeyboardEvent('keydown', { altKey: true }));

      expect(mocks.sendMessageMock).toHaveBeenCalledWith(
        'scroll:manual',
        { tabId: 14, enabled: true },
        'background',
      );
      expect(document.documentElement.classList.contains('scroll-sync-manual-mode')).toBe(true);
    });
  });

  describe('keyup handling and disableManualMode math', () => {
    it('deactivates manual mode when Alt key is released', async () => {
      const setManualModeActive = vi.fn();

      initKeyboardHandler(20, () => ({
        currentScrollTop: 200,
        lastSyncedRatio: 0.1,
        setManualModeActive,
      }));

      window.dispatchEvent(new KeyboardEvent('keydown', { altKey: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { altKey: false }));
      await flushAsyncHandlers();

      expect(setManualModeActive).toHaveBeenNthCalledWith(1, true);
      expect(setManualModeActive).toHaveBeenNthCalledWith(2, false);
      expect(mocks.sendMessageMock).toHaveBeenLastCalledWith(
        'scroll:manual',
        { tabId: 20, enabled: false },
        'background',
      );
    });

    it('does not deactivate if manual mode is not active', async () => {
      const setManualModeActive = vi.fn();

      initKeyboardHandler(21, () => ({
        currentScrollTop: 100,
        lastSyncedRatio: 0.2,
        setManualModeActive,
      }));

      window.dispatchEvent(new KeyboardEvent('keyup', { altKey: false }));
      await flushAsyncHandlers();

      expect(setManualModeActive).not.toHaveBeenCalled();
      expect(mocks.saveManualScrollOffsetMock).not.toHaveBeenCalled();
      expect(mocks.sendMessageMock).not.toHaveBeenCalled();
    });

    it('does not deactivate if Meta key remains pressed', async () => {
      const setManualModeActive = vi.fn();

      initKeyboardHandler(22, () => ({
        currentScrollTop: 420,
        lastSyncedRatio: 0.25,
        setManualModeActive,
      }));

      window.dispatchEvent(new KeyboardEvent('keydown', { altKey: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { altKey: false, metaKey: true }));
      await flushAsyncHandlers();

      expect(setManualModeActive).toHaveBeenCalledTimes(1);
      expect(setManualModeActive).toHaveBeenCalledWith(true);
      expect(mocks.saveManualScrollOffsetMock).not.toHaveBeenCalled();
    });

    it('calculates offsetRatio as currentRatio minus baseline', async () => {
      const setManualModeActive = vi.fn();
      const getScrollInfo = vi
        .fn()
        .mockReturnValueOnce({
          currentScrollTop: 200,
          lastSyncedRatio: 0.1,
          setManualModeActive,
        })
        .mockReturnValueOnce({
          currentScrollTop: 450,
          lastSyncedRatio: 0.1,
          setManualModeActive,
        })
        .mockReturnValueOnce({
          currentScrollTop: 450,
          lastSyncedRatio: 0.1,
          setManualModeActive,
        });

      setDocumentScrollState(2000, 1000, 450);
      initKeyboardHandler(23, getScrollInfo);

      window.dispatchEvent(new KeyboardEvent('keydown', { altKey: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { altKey: false }));
      await flushAsyncHandlers();

      expect(mocks.saveManualScrollOffsetMock).toHaveBeenCalledWith(23, 0.35, 350);
      expect(document.documentElement.classList.contains('scroll-sync-manual-mode')).toBe(false);
    });

    it('clamps positive offset to +0.5 before saving', async () => {
      const setManualModeActive = vi.fn();
      const getScrollInfo = vi
        .fn()
        .mockReturnValueOnce({
          currentScrollTop: 0,
          lastSyncedRatio: 0,
          setManualModeActive,
        })
        .mockReturnValueOnce({
          currentScrollTop: 950,
          lastSyncedRatio: 0,
          setManualModeActive,
        })
        .mockReturnValueOnce({
          currentScrollTop: 950,
          lastSyncedRatio: 0,
          setManualModeActive,
        });

      setDocumentScrollState(2000, 1000, 950);
      initKeyboardHandler(24, getScrollInfo);

      window.dispatchEvent(new KeyboardEvent('keydown', { altKey: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { altKey: false }));
      await flushAsyncHandlers();

      expect(mocks.saveManualScrollOffsetMock).toHaveBeenCalledWith(24, 0.5, 500);
    });

    it('clamps negative offset to -0.5 before saving', async () => {
      const setManualModeActive = vi.fn();
      const getScrollInfo = vi
        .fn()
        .mockReturnValueOnce({
          currentScrollTop: 900,
          lastSyncedRatio: 0.9,
          setManualModeActive,
        })
        .mockReturnValueOnce({
          currentScrollTop: 100,
          lastSyncedRatio: 0.9,
          setManualModeActive,
        })
        .mockReturnValueOnce({
          currentScrollTop: 100,
          lastSyncedRatio: 0.9,
          setManualModeActive,
        });

      setDocumentScrollState(2000, 1000, 100);
      initKeyboardHandler(25, getScrollInfo);

      window.dispatchEvent(new KeyboardEvent('keydown', { altKey: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { altKey: false }));
      await flushAsyncHandlers();

      expect(mocks.saveManualScrollOffsetMock).toHaveBeenCalledWith(25, -0.5, -500);
    });

    it('uses currentRatio=0 when maxScroll is 0', async () => {
      const setManualModeActive = vi.fn();
      const getScrollInfo = vi
        .fn()
        .mockReturnValueOnce({
          currentScrollTop: 0,
          lastSyncedRatio: 0.3,
          setManualModeActive,
        })
        .mockReturnValueOnce({
          currentScrollTop: 250,
          lastSyncedRatio: 0.3,
          setManualModeActive,
        })
        .mockReturnValueOnce({
          currentScrollTop: 250,
          lastSyncedRatio: 0.3,
          setManualModeActive,
        });

      setDocumentScrollState(900, 900, 250);
      initKeyboardHandler(26, getScrollInfo);

      window.dispatchEvent(new KeyboardEvent('keydown', { altKey: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { altKey: false }));
      await flushAsyncHandlers();

      expect(mocks.saveManualScrollOffsetMock).toHaveBeenCalledTimes(1);
      const [savedTabId, savedRatio, savedPixels] = mocks.saveManualScrollOffsetMock.mock.calls[0];
      expect(savedTabId).toBe(26);
      expect(savedRatio).toBe(-0.3);
      expect(Math.abs(savedPixels)).toBe(0);
    });
  });

  describe('blur handling', () => {
    it('deactivates manual mode when window loses focus', async () => {
      const setManualModeActive = vi.fn();

      initKeyboardHandler(30, () => ({
        currentScrollTop: 350,
        lastSyncedRatio: 0.2,
        setManualModeActive,
      }));

      window.dispatchEvent(new KeyboardEvent('keydown', { altKey: true }));
      window.dispatchEvent(new Event('blur'));
      await flushAsyncHandlers();

      expect(setManualModeActive).toHaveBeenNthCalledWith(1, true);
      expect(setManualModeActive).toHaveBeenNthCalledWith(2, false);
      expect(mocks.sendMessageMock).toHaveBeenLastCalledWith(
        'scroll:manual',
        { tabId: 30, enabled: false },
        'background',
      );
    });

    it('does not deactivate on blur when manual mode is inactive', async () => {
      initKeyboardHandler(31);

      window.dispatchEvent(new Event('blur'));
      await flushAsyncHandlers();

      expect(mocks.saveManualScrollOffsetMock).not.toHaveBeenCalled();
      expect(mocks.sendMessageMock).not.toHaveBeenCalled();
    });
  });

  describe('cleanupKeyboardHandler', () => {
    it('removes keydown, keyup, and blur listeners', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

      initKeyboardHandler(40);
      cleanupKeyboardHandler();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('keyup', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('blur', expect.any(Function));
    });

    it('deactivates manual mode if active during cleanup', async () => {
      const setManualModeActive = vi.fn();

      initKeyboardHandler(41, () => ({
        currentScrollTop: 600,
        lastSyncedRatio: 0.3,
        setManualModeActive,
      }));

      window.dispatchEvent(new KeyboardEvent('keydown', { altKey: true }));
      cleanupKeyboardHandler();
      await flushAsyncHandlers();

      expect(setManualModeActive).toHaveBeenNthCalledWith(1, true);
      expect(setManualModeActive).toHaveBeenNthCalledWith(2, false);
      expect(mocks.sendMessageMock).toHaveBeenLastCalledWith(
        'scroll:manual',
        { tabId: 41, enabled: false },
        'background',
      );
      expect(document.documentElement.classList.contains('scroll-sync-manual-mode')).toBe(false);
    });

    it('does not deactivate when cleanup is called while inactive', async () => {
      initKeyboardHandler(42);

      cleanupKeyboardHandler();
      await flushAsyncHandlers();

      expect(mocks.saveManualScrollOffsetMock).not.toHaveBeenCalled();
      expect(mocks.sendMessageMock).not.toHaveBeenCalled();
    });
  });
});
