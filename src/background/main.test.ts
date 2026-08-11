import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  events,
  onInstalledAddListenerMock,
  initializeBackgroundMock,
  initializeAutoSyncMock,
  restoreSyncStateMock,
  registerAutoSyncHandlersMock,
  registerConnectionHandlersMock,
  registerScrollSyncHandlersMock,
  registerTabEventHandlersMock,
} = vi.hoisted(() => ({
  events: [] as Array<string>,
  onInstalledAddListenerMock: vi.fn(),
  initializeBackgroundMock: vi.fn(),
  initializeAutoSyncMock: vi.fn(),
  restoreSyncStateMock: vi.fn(),
  registerAutoSyncHandlersMock: vi.fn(),
  registerConnectionHandlersMock: vi.fn(),
  registerScrollSyncHandlersMock: vi.fn(),
  registerTabEventHandlersMock: vi.fn(),
}));

vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: {
      onInstalled: {
        addListener: onInstalledAddListenerMock,
      },
    },
  },
}));

vi.mock('~/shared/lib/logger', () => ({
  ExtensionLogger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
  })),
}));

vi.mock('./handlers', () => ({
  registerAutoSyncHandlers: registerAutoSyncHandlersMock,
  registerConnectionHandlers: registerConnectionHandlersMock,
  registerScrollSyncHandlers: registerScrollSyncHandlersMock,
  registerTabEventHandlers: registerTabEventHandlersMock,
}));

vi.mock('./lib/background-initialization', () => ({
  initializeBackground: initializeBackgroundMock,
}));

vi.mock('./lib/auto-sync-lifecycle', () => ({
  initializeAutoSync: initializeAutoSyncMock,
}));

vi.mock('./lib/auto-sync-state', () => ({
  manualSyncOverriddenTabs: new Set<number>(),
}));

vi.mock('./lib/keep-alive', () => ({
  startKeepAlive: vi.fn(),
}));

vi.mock('./lib/sync-state', () => ({
  syncState: {
    isActive: false,
    linkedTabs: [],
  },
  restoreSyncState: restoreSyncStateMock,
}));

vi.mock('./content-script-hmr', () => ({}));

describe('background main startup', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    events.length = 0;

    onInstalledAddListenerMock.mockImplementation(() => {
      events.push('runtime');
    });
    registerScrollSyncHandlersMock.mockImplementation(() => {
      events.push('scroll');
    });
    registerConnectionHandlersMock.mockImplementation(() => {
      events.push('connection');
    });
    registerAutoSyncHandlersMock.mockImplementation(() => {
      events.push('auto');
    });
    registerTabEventHandlersMock.mockImplementation(() => {
      events.push('tab');
    });
    initializeBackgroundMock.mockImplementation(() => {
      events.push('initialize');
      return new Promise(() => undefined);
    });
    restoreSyncStateMock.mockImplementation(() => {
      events.push('restore');
      return new Promise(() => undefined);
    });
  });

  it('registers every listener synchronously before initialization starts', async () => {
    await import('./main');

    expect(events).toEqual(['runtime', 'scroll', 'connection', 'auto', 'tab', 'initialize']);
  });
});
