import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearAllManualScrollOffsets,
  clearManualScrollOffset,
  clearStorage,
  getManualScrollOffset,
  loadAutoSyncEnabled,
  loadAutoSyncExcludedUrls,
  loadManualScrollOffsets,
  loadPanelMinimized,
  loadSelectedTabIds,
  loadSyncMode,
  loadUrlSyncEnabled,
  saveAutoSyncEnabled,
  saveAutoSyncExcludedUrls,
  saveManualScrollOffset,
  savePanelMinimized,
  saveSelectedTabIds,
  saveSyncMode,
  saveUrlSyncEnabled,
} from './storage';

const { storageGetMock, storageSetMock, storageClearMock, loggerErrorMock, extensionLoggerMock } =
  vi.hoisted(() => ({
    storageGetMock: vi.fn(),
    storageSetMock: vi.fn(),
    storageClearMock: vi.fn(),
    loggerErrorMock: vi.fn(),
    extensionLoggerMock: vi.fn().mockImplementation(() => ({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: loggerErrorMock,
    })),
  }));

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      local: {
        get: storageGetMock,
        set: storageSetMock,
        clear: storageClearMock,
      },
    },
  },
}));

vi.mock('./logger', () => ({
  ExtensionLogger: extensionLoggerMock,
}));

vi.mock('~/shared/lib/logger', () => ({
  ExtensionLogger: extensionLoggerMock,
}));

describe('saveSyncMode', () => {
  it('saves sync mode successfully', async () => {
    storageSetMock.mockResolvedValue(undefined);

    await saveSyncMode('ratio');

    expect(storageSetMock).toHaveBeenCalledWith({ syncMode: 'ratio' });
  });

  it('logs an error when storage set rejects', async () => {
    const error = new Error('set failed');
    storageSetMock.mockRejectedValue(error);

    await saveSyncMode('element');

    expect(loggerErrorMock).toHaveBeenCalledWith('Failed to save sync mode:', error);
  });
});

describe('loadSyncMode', () => {
  it('returns stored sync mode when present', async () => {
    storageGetMock.mockResolvedValue({ syncMode: 'element' });

    await expect(loadSyncMode()).resolves.toBe('element');
    expect(storageGetMock).toHaveBeenCalledWith('syncMode');
  });

  it('returns default ratio when key is missing', async () => {
    storageGetMock.mockResolvedValue({});

    await expect(loadSyncMode()).resolves.toBe('ratio');
  });

  it('returns default ratio and logs error on rejection', async () => {
    const error = new Error('get failed');
    storageGetMock.mockRejectedValue(error);

    await expect(loadSyncMode()).resolves.toBe('ratio');
    expect(loggerErrorMock).toHaveBeenCalledWith('Failed to load sync mode:', error);
  });
});

describe('savePanelMinimized', () => {
  it('saves panel minimized state', async () => {
    storageSetMock.mockResolvedValue(undefined);

    await savePanelMinimized(true);

    expect(storageSetMock).toHaveBeenCalledWith({ isPanelMinimized: true });
  });

  it('logs an error when save fails', async () => {
    const error = new Error('set failed');
    storageSetMock.mockRejectedValue(error);

    await savePanelMinimized(false);

    expect(loggerErrorMock).toHaveBeenCalledWith('Failed to save panel minimized state:', error);
  });
});

describe('loadPanelMinimized', () => {
  it('returns stored panel minimized state', async () => {
    storageGetMock.mockResolvedValue({ isPanelMinimized: true });

    await expect(loadPanelMinimized()).resolves.toBe(true);
    expect(storageGetMock).toHaveBeenCalledWith('isPanelMinimized');
  });

  it('returns false by default when key is missing', async () => {
    storageGetMock.mockResolvedValue({});

    await expect(loadPanelMinimized()).resolves.toBe(false);
  });

  it('returns false and logs error when load fails', async () => {
    const error = new Error('get failed');
    storageGetMock.mockRejectedValue(error);

    await expect(loadPanelMinimized()).resolves.toBe(false);
    expect(loggerErrorMock).toHaveBeenCalledWith('Failed to load panel minimized state:', error);
  });
});

describe('saveSelectedTabIds', () => {
  it('saves selected tab IDs', async () => {
    storageSetMock.mockResolvedValue(undefined);

    await saveSelectedTabIds([1, 2, 3]);

    expect(storageSetMock).toHaveBeenCalledWith({ selectedTabIds: [1, 2, 3] });
  });

  it('logs an error when save fails', async () => {
    const error = new Error('set failed');
    storageSetMock.mockRejectedValue(error);

    await saveSelectedTabIds([7]);

    expect(loggerErrorMock).toHaveBeenCalledWith('Failed to save selected tab IDs:', error);
  });
});

describe('loadSelectedTabIds', () => {
  it('returns stored selected tab IDs', async () => {
    storageGetMock.mockResolvedValue({ selectedTabIds: [10, 20] });

    await expect(loadSelectedTabIds()).resolves.toEqual([10, 20]);
    expect(storageGetMock).toHaveBeenCalledWith('selectedTabIds');
  });

  it('returns empty array by default when key is missing', async () => {
    storageGetMock.mockResolvedValue({});

    await expect(loadSelectedTabIds()).resolves.toEqual([]);
  });

  it('returns empty array and logs error when load fails', async () => {
    const error = new Error('get failed');
    storageGetMock.mockRejectedValue(error);

    await expect(loadSelectedTabIds()).resolves.toEqual([]);
    expect(loggerErrorMock).toHaveBeenCalledWith('Failed to load selected tab IDs:', error);
  });
});

describe('loadManualScrollOffsets', () => {
  it('returns stored manual scroll offsets in new object format', async () => {
    storageGetMock.mockResolvedValue({
      manualScrollOffsets: {
        1: { ratio: 0.25, pixels: 120 },
        2: { ratio: -0.1, pixels: -50 },
      },
    });

    await expect(loadManualScrollOffsets()).resolves.toEqual({
      1: { ratio: 0.25, pixels: 120 },
      2: { ratio: -0.1, pixels: -50 },
    });
    expect(storageGetMock).toHaveBeenCalledWith('manualScrollOffsets');
  });

  it('migrates legacy numeric offsets to object format', async () => {
    storageGetMock.mockResolvedValue({
      manualScrollOffsets: {
        11: 0.3,
        22: -0.25,
      },
    });

    await expect(loadManualScrollOffsets()).resolves.toEqual({
      11: { ratio: 0.3, pixels: 0 },
      22: { ratio: -0.25, pixels: 0 },
    });
  });

  it('migrates mixed legacy and new formats', async () => {
    storageGetMock.mockResolvedValue({
      manualScrollOffsets: {
        5: 0.4,
        9: { ratio: -0.2, pixels: -88 },
      },
    });

    await expect(loadManualScrollOffsets()).resolves.toEqual({
      5: { ratio: 0.4, pixels: 0 },
      9: { ratio: -0.2, pixels: -88 },
    });
  });

  it('returns empty object when key is missing', async () => {
    storageGetMock.mockResolvedValue({});

    await expect(loadManualScrollOffsets()).resolves.toEqual({});
  });

  it('returns empty object and logs error on storage rejection', async () => {
    const error = new Error('get failed');
    storageGetMock.mockRejectedValue(error);

    await expect(loadManualScrollOffsets()).resolves.toEqual({});
    expect(loggerErrorMock).toHaveBeenCalledWith('Failed to load manual scroll offsets:', error);
  });
});

describe('saveManualScrollOffset', () => {
  it('saves offset for a tab while preserving existing offsets', async () => {
    storageGetMock.mockResolvedValue({
      manualScrollOffsets: {
        1: { ratio: 0.1, pixels: 10 },
      },
    });
    storageSetMock.mockResolvedValue(undefined);

    await saveManualScrollOffset(2, 0.35, 140);

    expect(storageSetMock).toHaveBeenCalledWith({
      manualScrollOffsets: {
        1: { ratio: 0.1, pixels: 10 },
        2: { ratio: 0.35, pixels: 140 },
      },
    });
  });

  it('overwrites existing offset for the same tab', async () => {
    storageGetMock.mockResolvedValue({
      manualScrollOffsets: {
        3: { ratio: 0.1, pixels: 10 },
      },
    });
    storageSetMock.mockResolvedValue(undefined);

    await saveManualScrollOffset(3, -0.2, -80);

    expect(storageSetMock).toHaveBeenCalledWith({
      manualScrollOffsets: {
        3: { ratio: -0.2, pixels: -80 },
      },
    });
  });

  it('starts from empty offsets when load returns empty object', async () => {
    storageGetMock.mockResolvedValue({});
    storageSetMock.mockResolvedValue(undefined);

    await saveManualScrollOffset(99, 0.05, 12);

    expect(storageSetMock).toHaveBeenCalledWith({
      manualScrollOffsets: {
        99: { ratio: 0.05, pixels: 12 },
      },
    });
  });

  it('logs error when save to storage fails', async () => {
    const error = new Error('set failed');
    storageGetMock.mockResolvedValue({ manualScrollOffsets: {} });
    storageSetMock.mockRejectedValue(error);

    await saveManualScrollOffset(4, 0.2, 40);

    expect(loggerErrorMock).toHaveBeenCalledWith('Failed to save manual scroll offset:', error);
  });
});

describe('getManualScrollOffset', () => {
  it('returns stored offset for the requested tab', async () => {
    storageGetMock.mockResolvedValue({
      manualScrollOffsets: {
        7: { ratio: 0.15, pixels: 77 },
      },
    });

    await expect(getManualScrollOffset(7)).resolves.toEqual({ ratio: 0.15, pixels: 77 });
  });

  it('returns default offset when tab offset is missing', async () => {
    storageGetMock.mockResolvedValue({
      manualScrollOffsets: {
        8: { ratio: 0.2, pixels: 22 },
      },
    });

    await expect(getManualScrollOffset(9)).resolves.toEqual({ ratio: 0, pixels: 0 });
  });

  it('returns default offset when load fails', async () => {
    storageGetMock.mockRejectedValue(new Error('get failed'));

    await expect(getManualScrollOffset(1)).resolves.toEqual({ ratio: 0, pixels: 0 });
  });
});

describe('clearManualScrollOffset', () => {
  it('removes only the requested tab offset', async () => {
    storageGetMock.mockResolvedValue({
      manualScrollOffsets: {
        1: { ratio: 0.1, pixels: 10 },
        2: { ratio: 0.2, pixels: 20 },
      },
    });
    storageSetMock.mockResolvedValue(undefined);

    await clearManualScrollOffset(1);

    expect(storageSetMock).toHaveBeenCalledWith({
      manualScrollOffsets: {
        2: { ratio: 0.2, pixels: 20 },
      },
    });
  });

  it('keeps offsets unchanged when tab key does not exist', async () => {
    storageGetMock.mockResolvedValue({
      manualScrollOffsets: {
        3: { ratio: 0.3, pixels: 30 },
      },
    });
    storageSetMock.mockResolvedValue(undefined);

    await clearManualScrollOffset(99);

    expect(storageSetMock).toHaveBeenCalledWith({
      manualScrollOffsets: {
        3: { ratio: 0.3, pixels: 30 },
      },
    });
  });

  it('logs an error when save fails', async () => {
    const error = new Error('set failed');
    storageGetMock.mockResolvedValue({ manualScrollOffsets: {} });
    storageSetMock.mockRejectedValue(error);

    await clearManualScrollOffset(4);

    expect(loggerErrorMock).toHaveBeenCalledWith('Failed to clear manual scroll offset:', error);
  });
});

describe('clearAllManualScrollOffsets', () => {
  it('resets manual scroll offsets to an empty object', async () => {
    storageSetMock.mockResolvedValue(undefined);

    await clearAllManualScrollOffsets();

    expect(storageSetMock).toHaveBeenCalledWith({ manualScrollOffsets: {} });
  });

  it('logs an error when reset fails', async () => {
    const error = new Error('set failed');
    storageSetMock.mockRejectedValue(error);

    await clearAllManualScrollOffsets();

    expect(loggerErrorMock).toHaveBeenCalledWith(
      'Failed to clear all manual scroll offsets:',
      error,
    );
  });
});

describe('saveUrlSyncEnabled', () => {
  it('saves URL sync enabled state', async () => {
    storageSetMock.mockResolvedValue(undefined);

    await saveUrlSyncEnabled(false);

    expect(storageSetMock).toHaveBeenCalledWith({ urlSyncEnabled: false });
  });

  it('logs an error when save fails', async () => {
    const error = new Error('set failed');
    storageSetMock.mockRejectedValue(error);

    await saveUrlSyncEnabled(true);

    expect(loggerErrorMock).toHaveBeenCalledWith('Failed to save URL sync enabled state:', error);
  });
});

describe('loadUrlSyncEnabled', () => {
  it('returns true by default when key is undefined', async () => {
    storageGetMock.mockResolvedValue({});

    await expect(loadUrlSyncEnabled()).resolves.toBe(true);
    expect(storageGetMock).toHaveBeenCalledWith('urlSyncEnabled');
  });

  it('returns explicitly stored false value', async () => {
    storageGetMock.mockResolvedValue({ urlSyncEnabled: false });

    await expect(loadUrlSyncEnabled()).resolves.toBe(false);
  });

  it('returns explicitly stored true value', async () => {
    storageGetMock.mockResolvedValue({ urlSyncEnabled: true });

    await expect(loadUrlSyncEnabled()).resolves.toBe(true);
  });

  it('returns true and logs error when load fails', async () => {
    const error = new Error('get failed');
    storageGetMock.mockRejectedValue(error);

    await expect(loadUrlSyncEnabled()).resolves.toBe(true);
    expect(loggerErrorMock).toHaveBeenCalledWith('Failed to load URL sync enabled state:', error);
  });
});

describe('saveAutoSyncEnabled', () => {
  it('saves auto-sync enabled state', async () => {
    storageSetMock.mockResolvedValue(undefined);

    await saveAutoSyncEnabled(false);

    expect(storageSetMock).toHaveBeenCalledWith({ autoSyncEnabled: false });
  });

  it('logs an error when save fails', async () => {
    const error = new Error('set failed');
    storageSetMock.mockRejectedValue(error);

    await saveAutoSyncEnabled(true);

    expect(loggerErrorMock).toHaveBeenCalledWith('Failed to save auto-sync enabled state:', error);
  });
});

describe('loadAutoSyncEnabled', () => {
  it('returns true by default when key is undefined', async () => {
    storageGetMock.mockResolvedValue({});

    await expect(loadAutoSyncEnabled()).resolves.toBe(true);
    expect(storageGetMock).toHaveBeenCalledWith('autoSyncEnabled');
  });

  it('returns explicitly stored false value', async () => {
    storageGetMock.mockResolvedValue({ autoSyncEnabled: false });

    await expect(loadAutoSyncEnabled()).resolves.toBe(false);
  });

  it('returns explicitly stored true value', async () => {
    storageGetMock.mockResolvedValue({ autoSyncEnabled: true });

    await expect(loadAutoSyncEnabled()).resolves.toBe(true);
  });

  it('returns true and logs error when load fails', async () => {
    const error = new Error('get failed');
    storageGetMock.mockRejectedValue(error);

    await expect(loadAutoSyncEnabled()).resolves.toBe(true);
    expect(loggerErrorMock).toHaveBeenCalledWith('Failed to load auto-sync enabled state:', error);
  });
});

describe('saveAutoSyncExcludedUrls', () => {
  it('saves excluded URL patterns', async () => {
    storageSetMock.mockResolvedValue(undefined);

    await saveAutoSyncExcludedUrls(['*login*', '*admin*']);

    expect(storageSetMock).toHaveBeenCalledWith({
      autoSyncExcludedUrls: ['*login*', '*admin*'],
    });
  });

  it('logs an error when save fails', async () => {
    const error = new Error('set failed');
    storageSetMock.mockRejectedValue(error);

    await saveAutoSyncExcludedUrls(['*private*']);

    expect(loggerErrorMock).toHaveBeenCalledWith('Failed to save auto-sync excluded URLs:', error);
  });
});

describe('loadAutoSyncExcludedUrls', () => {
  it('returns stored excluded URL patterns', async () => {
    storageGetMock.mockResolvedValue({ autoSyncExcludedUrls: ['*foo*', '*bar*'] });

    await expect(loadAutoSyncExcludedUrls()).resolves.toEqual(['*foo*', '*bar*']);
    expect(storageGetMock).toHaveBeenCalledWith('autoSyncExcludedUrls');
  });

  it('returns empty array by default when key is missing', async () => {
    storageGetMock.mockResolvedValue({});

    await expect(loadAutoSyncExcludedUrls()).resolves.toEqual([]);
  });

  it('returns empty array and logs error when load fails', async () => {
    const error = new Error('get failed');
    storageGetMock.mockRejectedValue(error);

    await expect(loadAutoSyncExcludedUrls()).resolves.toEqual([]);
    expect(loggerErrorMock).toHaveBeenCalledWith('Failed to load auto-sync excluded URLs:', error);
  });
});

describe('clearStorage', () => {
  it('clears browser storage', async () => {
    storageClearMock.mockResolvedValue(undefined);

    await clearStorage();

    expect(storageClearMock).toHaveBeenCalledTimes(1);
  });

  it('logs an error when clear fails', async () => {
    const error = new Error('clear failed');
    storageClearMock.mockRejectedValue(error);

    await clearStorage();

    expect(loggerErrorMock).toHaveBeenCalledWith('Failed to clear storage:', error);
  });
});

beforeEach(() => {
  vi.clearAllMocks();

  storageGetMock.mockResolvedValue({});
  storageSetMock.mockResolvedValue(undefined);
  storageClearMock.mockResolvedValue(undefined);
  loggerErrorMock.mockResolvedValue(undefined);
});
