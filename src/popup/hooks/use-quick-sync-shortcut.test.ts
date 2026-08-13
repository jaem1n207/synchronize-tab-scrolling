import { act, createElement } from 'react';

import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import browser from 'webextension-polyfill';

import { useQuickSyncShortcut } from './use-quick-sync-shortcut';

type CommandChangedListener = (changeInfo: browser.Commands.OnChangedChangeInfoType) => void;

const browserMocks = vi.hoisted(() => {
  const commandChangedListeners = new Set<CommandChangedListener>();
  const onChanged = {
    addListener: vi.fn((listener: CommandChangedListener) => {
      commandChangedListeners.add(listener);
    }),
    removeListener: vi.fn((listener: CommandChangedListener) => {
      commandChangedListeners.delete(listener);
    }),
  };

  return {
    commandChangedListeners,
    getAll: vi.fn<() => Promise<Array<browser.Commands.Command>>>(),
    onChanged,
    openShortcutSettings: vi.fn<() => Promise<void>>(),
    tabsCreate: vi.fn(),
  };
});

vi.mock('webextension-polyfill', () => ({
  default: {
    commands: {
      getAll: browserMocks.getAll,
      openShortcutSettings: browserMocks.openShortcutSettings,
      onChanged: browserMocks.onChanged,
    },
    tabs: {
      create: browserMocks.tabsCreate,
    },
  },
}));

interface HookResult<T> {
  current: T;
}

interface RenderHookResult<T> {
  result: HookResult<T>;
  unmount: () => void;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => {
    throw new Error('Deferred resolved before initialization');
  };
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
}

function renderHook<T>(hook: () => T): RenderHookResult<T> {
  const container = document.createElement('div');
  const root = createRoot(container);
  let value: T | undefined;

  function HookHost(): null {
    value = hook();
    return null;
  }

  act(() => {
    root.render(createElement(HookHost));
  });

  return {
    result: {
      get current() {
        if (value === undefined) {
          throw new Error('Hook result was read before initial render');
        }
        return value;
      },
    },
    unmount: () => {
      act(() => {
        root.unmount();
      });
    },
  };
}

async function waitFor(assertion: () => void): Promise<void> {
  const timeoutAt = Date.now() + 1_000;
  while (Date.now() < timeoutAt) {
    try {
      assertion();
      return;
    } catch {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
    }
  }
  assertion();
}

function setBrowserIdentity(userAgent: string, brands?: Array<{ brand: string; version: string }>) {
  Object.defineProperty(window.navigator, 'userAgent', {
    configurable: true,
    value: userAgent,
  });
  Object.defineProperty(window.navigator, 'userAgentData', {
    configurable: true,
    value: brands === undefined ? undefined : { brands },
  });
  Object.defineProperty(window.navigator, 'brave', {
    configurable: true,
    value: undefined,
  });
}

function assignedCommand(shortcut = 'Command+Alt+Period'): Array<browser.Commands.Command> {
  return [{ name: 'quick-sync-start-or-add', shortcut }];
}

function triggerCommandChange(name = 'quick-sync-start-or-add'): void {
  for (const listener of browserMocks.commandChangedListeners) {
    listener({
      name,
      newShortcut: 'Command+Shift+Period',
      oldShortcut: 'Command+Alt+Period',
    });
  }
}

describe('useQuickSyncShortcut assignment', () => {
  beforeEach(() => {
    browserMocks.getAll.mockReset();
    browserMocks.openShortcutSettings.mockReset();
    browserMocks.tabsCreate.mockReset();
    browserMocks.commandChangedListeners.clear();
    browserMocks.onChanged.addListener.mockClear();
    browserMocks.onChanged.removeListener.mockClear();
    Object.defineProperty(browser.commands, 'onChanged', {
      configurable: true,
      value: browserMocks.onChanged,
    });
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    browserMocks.getAll.mockResolvedValue(assignedCommand());
    browserMocks.openShortcutSettings.mockResolvedValue();
    browserMocks.tabsCreate.mockResolvedValue({ id: 91 });
    setBrowserIdentity('Mozilla/5.0 Macintosh Chrome/140.0 Safari/537.36', [
      { brand: 'Google Chrome', version: '140' },
    ]);
  });

  it('starts loading and uses the actual assignment returned by commands.getAll', async () => {
    const deferred = createDeferred<Array<browser.Commands.Command>>();
    browserMocks.getAll.mockReturnValueOnce(deferred.promise);
    const { result, unmount } = renderHook(() => useQuickSyncShortcut());

    expect(result.current.assignment).toEqual({ status: 'loading' });

    deferred.resolve(assignedCommand());
    await waitFor(() => {
      expect(result.current.assignment).toEqual({
        status: 'assigned',
        rawShortcut: 'Command+Alt+Period',
        label: '⌘ ⌥ .',
      });
    });

    unmount();
  });

  it.each([
    { commands: [] },
    { commands: [{ name: '_execute_action', shortcut: 'Command+Shift+Y' }] },
    { commands: [{ name: 'quick-sync-start-or-add', shortcut: '' }] },
  ])('treats a missing or empty exact command as unassigned', async ({ commands }) => {
    browserMocks.getAll.mockResolvedValueOnce(commands);
    const { result, unmount } = renderHook(() => useQuickSyncShortcut());

    await waitFor(() => {
      expect(result.current.assignment).toEqual({ status: 'unassigned' });
    });

    unmount();
  });

  it('keeps commands.getAll rejection distinct from unassigned without a suggested fallback', async () => {
    browserMocks.getAll.mockRejectedValueOnce(new Error('commands unavailable'));
    const { result, unmount } = renderHook(() => useQuickSyncShortcut());

    await waitFor(() => {
      expect(result.current.assignment).toEqual({ status: 'unavailable' });
    });
    expect(result.current.assignment).not.toHaveProperty('label');
    expect(result.current.assignment).not.toHaveProperty('rawShortcut');

    unmount();
  });

  it('loads the assignment when shortcut change events are unavailable', async () => {
    Object.defineProperty(browser.commands, 'onChanged', {
      configurable: true,
      value: undefined,
    });

    let unmount: (() => void) | undefined;
    try {
      const rendered = renderHook(() => useQuickSyncShortcut());
      unmount = rendered.unmount;

      await waitFor(() => {
        expect(rendered.result.current.assignment).toEqual({
          status: 'assigned',
          rawShortcut: 'Command+Alt+Period',
          label: '⌘ ⌥ .',
        });
      });
      expect(browserMocks.getAll).toHaveBeenCalledOnce();
      expect(browserMocks.onChanged.addListener).not.toHaveBeenCalled();

      unmount();
      unmount = undefined;
      expect(browserMocks.onChanged.removeListener).not.toHaveBeenCalled();
    } finally {
      unmount?.();
      Object.defineProperty(browser.commands, 'onChanged', {
        configurable: true,
        value: browserMocks.onChanged,
      });
    }
  });

  it('refreshes the authoritative assignment on exact command changes and cleans up', async () => {
    browserMocks.getAll
      .mockResolvedValueOnce(assignedCommand())
      .mockResolvedValueOnce(assignedCommand('Command+Shift+Period'));
    const { result, unmount } = renderHook(() => useQuickSyncShortcut());
    await waitFor(() => expect(result.current.assignment.status).toBe('assigned'));

    act(() => {
      triggerCommandChange();
    });

    await waitFor(() => {
      expect(result.current.assignment).toEqual({
        status: 'assigned',
        rawShortcut: 'Command+Shift+Period',
        label: '⌘ ⇧ .',
      });
    });
    expect(browserMocks.commandChangedListeners).toHaveLength(1);

    unmount();
    expect(browserMocks.commandChangedListeners).toHaveLength(0);
  });

  it('ignores changes for other commands', async () => {
    const { result, unmount } = renderHook(() => useQuickSyncShortcut());
    await waitFor(() => expect(result.current.assignment.status).toBe('assigned'));

    act(() => {
      triggerCommandChange('_execute_action');
    });

    expect(browserMocks.getAll).toHaveBeenCalledOnce();
    unmount();
  });
});

describe('useQuickSyncShortcut remapping', () => {
  beforeEach(() => {
    browserMocks.getAll.mockReset();
    browserMocks.openShortcutSettings.mockReset();
    browserMocks.tabsCreate.mockReset();
    browserMocks.commandChangedListeners.clear();
    browserMocks.onChanged.addListener.mockClear();
    browserMocks.onChanged.removeListener.mockClear();
    Object.defineProperty(browser.commands, 'onChanged', {
      configurable: true,
      value: browserMocks.onChanged,
    });
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    browserMocks.getAll.mockResolvedValue(assignedCommand());
    browserMocks.openShortcutSettings.mockResolvedValue();
    browserMocks.tabsCreate.mockResolvedValue({ id: 91 });
  });

  it('awaits the native Firefox API and does not open about:addons on success', async () => {
    setBrowserIdentity('Mozilla/5.0 Firefox/141.0');
    const deferred = createDeferred<void>();
    browserMocks.openShortcutSettings.mockReturnValueOnce(deferred.promise);
    const { result, unmount } = renderHook(() => useQuickSyncShortcut());

    let settingsPromise: Promise<unknown> | undefined;
    act(() => {
      settingsPromise = result.current.openSettings();
    });
    expect(result.current.settingsResult).toEqual({ status: 'opening' });
    expect(browserMocks.tabsCreate).not.toHaveBeenCalled();

    deferred.resolve();
    await act(async () => {
      await settingsPromise;
    });

    expect(result.current.settingsResult).toEqual({ status: 'opened' });
    expect(browserMocks.tabsCreate).not.toHaveBeenCalled();
    unmount();
  });

  it('opens about:addons and exposes gear-menu guidance when the Firefox API is absent', async () => {
    setBrowserIdentity('Mozilla/5.0 Firefox/141.0');
    const { result, unmount } = renderHook(() => useQuickSyncShortcut());

    Object.defineProperty(browser.commands, 'openShortcutSettings', {
      configurable: true,
      value: undefined,
    });

    await act(async () => {
      await result.current.openSettings();
    });

    expect(browserMocks.tabsCreate).toHaveBeenCalledWith({
      active: true,
      url: 'about:addons',
    });
    expect(result.current.settingsResult).toEqual({
      status: 'fallback',
      browser: 'firefox',
    });

    Object.defineProperty(browser.commands, 'openShortcutSettings', {
      configurable: true,
      value: browserMocks.openShortcutSettings,
    });
    unmount();
  });

  it('uses the Firefox fallback when the native API rejects', async () => {
    setBrowserIdentity('Mozilla/5.0 Firefox/141.0');
    browserMocks.openShortcutSettings.mockRejectedValueOnce(new Error('not supported'));
    const { result, unmount } = renderHook(() => useQuickSyncShortcut());

    await act(async () => {
      await result.current.openSettings();
    });

    expect(browserMocks.tabsCreate).toHaveBeenCalledWith({
      active: true,
      url: 'about:addons',
    });
    expect(result.current.settingsResult).toEqual({
      status: 'fallback',
      browser: 'firefox',
    });
    unmount();
  });

  it('waits for the exact Chromium internal page before reporting opened', async () => {
    setBrowserIdentity('Mozilla/5.0 Chrome/140.0 Safari/537.36', [
      { brand: 'Google Chrome', version: '140' },
    ]);
    const deferred = createDeferred<unknown>();
    browserMocks.tabsCreate.mockReturnValueOnce(deferred.promise);
    const { result, unmount } = renderHook(() => useQuickSyncShortcut());

    let settingsPromise: Promise<unknown> | undefined;
    await act(async () => {
      settingsPromise = result.current.openSettings();
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(browserMocks.tabsCreate).toHaveBeenCalledWith({
        active: true,
        url: 'chrome://extensions/shortcuts',
      });
    });
    expect(result.current.settingsResult).toEqual({ status: 'opening' });

    deferred.resolve({ id: 92 });
    await act(async () => {
      await settingsPromise;
    });
    expect(result.current.settingsResult).toEqual({ status: 'opened' });
    unmount();
  });

  it('preserves exact Edge and Brave internal routes', async () => {
    const routes: Array<[string, unknown, string]> = [
      ['Mozilla/5.0 Chrome/140.0 Safari/537.36 Edg/140.0', {}, 'edge://extensions/shortcuts'],
      [
        'Mozilla/5.0 Chrome/140.0 Safari/537.36',
        { brave: { isBrave: vi.fn().mockResolvedValue(true) } },
        'brave://extensions/shortcuts',
      ],
    ];

    for (const [userAgent, runtimeValue, expectedUrl] of routes) {
      setBrowserIdentity(userAgent);
      Object.defineProperty(window.navigator, 'brave', {
        configurable: true,
        value:
          typeof runtimeValue === 'object' && runtimeValue !== null && 'brave' in runtimeValue
            ? runtimeValue.brave
            : undefined,
      });
      const { result, unmount } = renderHook(() => useQuickSyncShortcut());

      await act(async () => {
        await result.current.openSettings();
      });

      expect(browserMocks.tabsCreate).toHaveBeenLastCalledWith({
        active: true,
        url: expectedUrl,
      });
      unmount();
    }
  });

  it('exposes manual URL guidance when an internal page rejects', async () => {
    setBrowserIdentity('Mozilla/5.0 Chrome/140.0 Safari/537.36', [
      { brand: 'Chromium', version: '140' },
    ]);
    browserMocks.tabsCreate.mockRejectedValueOnce(new Error('blocked internal page'));
    const { result, unmount } = renderHook(() => useQuickSyncShortcut());

    await act(async () => {
      await result.current.openSettings();
    });

    expect(result.current.settingsResult).toEqual({
      status: 'fallback',
      browser: 'chromium-other',
      settingsUrl: 'chrome://extensions/shortcuts',
    });
    unmount();
  });
});
