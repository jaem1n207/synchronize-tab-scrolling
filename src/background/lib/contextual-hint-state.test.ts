import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sessionStorageData, storageGetMock, storageRemoveMock, storageSetMock } = vi.hoisted(
  () => ({
    sessionStorageData: new Map<string, unknown>(),
    storageGetMock: vi.fn(),
    storageRemoveMock: vi.fn(),
    storageSetMock: vi.fn(),
  }),
);

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      session: {
        get: storageGetMock,
        remove: storageRemoveMock,
        set: storageSetMock,
      },
    },
  },
}));

vi.mock('~/shared/lib/logger', () => ({
  ExtensionLogger: vi.fn().mockImplementation(() => ({
    warn: vi.fn(),
  })),
}));

async function loadContextualHintState() {
  return import('./contextual-hint-state');
}

describe('contextual hint state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    sessionStorageData.clear();
    storageGetMock.mockImplementation(async () => Object.fromEntries(sessionStorageData));
    storageSetMock.mockImplementation(async (values: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(values)) {
        sessionStorageData.set(key, value);
      }
    });
    storageRemoveMock.mockImplementation(async (key: string) => {
      sessionStorageData.delete(key);
    });
  });

  it('stores and consumes pending URL Sync hints by tab ID', async () => {
    const {
      consumePendingUrlSyncContextualHint,
      restorePendingUrlSyncContextualHints,
      savePendingUrlSyncContextualHint,
    } = await loadContextualHintState();
    await restorePendingUrlSyncContextualHints();
    await savePendingUrlSyncContextualHint(10, 'page-change-synced');
    await savePendingUrlSyncContextualHint(20, 'keep-website-path-synced');

    expect(consumePendingUrlSyncContextualHint(10)).toBe('page-change-synced');
    expect(consumePendingUrlSyncContextualHint(10)).toBeNull();
    expect(consumePendingUrlSyncContextualHint(20)).toBe('keep-website-path-synced');
  });

  it('reports a pending URL Sync navigation without consuming its hint', async () => {
    const {
      consumePendingUrlSyncContextualHint,
      hasPendingUrlSyncContextualHint,
      restorePendingUrlSyncContextualHints,
      savePendingUrlSyncContextualHint,
    } = await loadContextualHintState();
    await restorePendingUrlSyncContextualHints();
    await savePendingUrlSyncContextualHint(25, 'keep-website-path-synced');

    expect(hasPendingUrlSyncContextualHint(25)).toBe(true);
    expect(consumePendingUrlSyncContextualHint(25)).toBe('keep-website-path-synced');
    expect(hasPendingUrlSyncContextualHint(25)).toBe(false);
  });

  it('clears a pending hint without consuming other tabs', async () => {
    const {
      clearPendingUrlSyncContextualHint,
      consumePendingUrlSyncContextualHint,
      restorePendingUrlSyncContextualHints,
      savePendingUrlSyncContextualHint,
    } = await loadContextualHintState();
    await restorePendingUrlSyncContextualHints();
    await savePendingUrlSyncContextualHint(30, 'page-change-synced');
    await savePendingUrlSyncContextualHint(40, 'keep-website-path-synced');

    await clearPendingUrlSyncContextualHint(30);

    expect(consumePendingUrlSyncContextualHint(30)).toBeNull();
    expect(consumePendingUrlSyncContextualHint(40)).toBe('keep-website-path-synced');
  });

  it('restores a pending hint after a simulated service-worker restart', async () => {
    const firstWorker = await loadContextualHintState();
    await firstWorker.restorePendingUrlSyncContextualHints();
    await firstWorker.savePendingUrlSyncContextualHint(50, 'page-change-synced');

    vi.resetModules();
    const restartedWorker = await loadContextualHintState();
    await restartedWorker.restorePendingUrlSyncContextualHints();

    expect(restartedWorker.hasPendingUrlSyncContextualHint(50)).toBe(true);
    expect(restartedWorker.consumePendingUrlSyncContextualHint(50)).toBe('page-change-synced');
  });

  it('rejects malformed session storage values during restoration', async () => {
    const firstWorker = await loadContextualHintState();
    await firstWorker.restorePendingUrlSyncContextualHints();
    await firstWorker.savePendingUrlSyncContextualHint(60, 'page-change-synced');
    const storedKey = sessionStorageData.keys().next().value;
    expect(storedKey).toBeDefined();
    if (storedKey === undefined) {
      return;
    }
    sessionStorageData.set(storedKey, 'unsupported-hint');

    vi.resetModules();
    const restartedWorker = await loadContextualHintState();
    await restartedWorker.restorePendingUrlSyncContextualHints();

    expect(restartedWorker.hasPendingUrlSyncContextualHint(60)).toBe(false);
  });
});
