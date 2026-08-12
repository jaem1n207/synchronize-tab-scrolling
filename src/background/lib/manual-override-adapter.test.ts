import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AutoSyncGroup } from '~/shared/types/auto-sync-state';

import {
  autoSyncState,
  manualSyncOverriddenTabs,
  pendingSuggestions as runtimePendingSuggestions,
} from './auto-sync-state';
import {
  createManualOverrideAdapter,
  isTabProvisionallyManuallyOverridden,
  manualOverrideAdapter,
} from './manual-override-adapter';
import { sendMessageWithTimeout } from './messaging';

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      local: {
        get: vi.fn(),
        set: vi.fn(),
      },
    },
  },
}));

vi.mock('~/shared/lib/logger', () => ({
  ExtensionLogger: vi.fn().mockImplementation(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock('./messaging', () => ({
  sendMessageWithTimeout: vi.fn(),
}));

function createGroup(tabIds: Array<number>, isActive = true): AutoSyncGroup {
  return {
    tabIds: new Set(tabIds),
    isActive,
    ...(isActive ? { activationGeneration: '11111111-1111-4111-8111-111111111111' } : {}),
    tabUrls: new Map(tabIds.map((tabId) => [tabId, `https://example.test/${tabId}`])),
  };
}

describe('createManualOverrideAdapter', () => {
  let groups: Map<string, AutoSyncGroup>;
  let overrideTabIds: Set<number>;
  let pendingSuggestions: Set<string>;
  let events: Array<string>;
  let restoreRuntime: ReturnType<
    typeof vi.fn<(groupIds: ReadonlyArray<string>) => Promise<boolean>>
  >;
  let stopResidualRuntime: ReturnType<
    typeof vi.fn<
      (
        residuals: ReadonlyArray<{
          tabId: number;
          activationGeneration: string;
        }>,
      ) => Promise<boolean>
    >
  >;

  beforeEach(() => {
    groups = new Map([
      ['group-a', createGroup([11, 44])],
      ['group-b', createGroup([22, 33])],
      ['unaffected', createGroup([55, 66], false)],
    ]);
    overrideTabIds = new Set([99]);
    pendingSuggestions = new Set(['group-a', 'group-b', 'unaffected']);
    events = [];
    restoreRuntime = vi.fn(async () => true);
    stopResidualRuntime = vi.fn(async () => true);
  });

  function createAdapter() {
    return createManualOverrideAdapter({
      groups,
      overrideTabIds,
      pendingSuggestions,
      withAutoSyncLock: async (operation) => {
        events.push('auto-lock:enter');
        const result = await operation();
        events.push('auto-lock:exit');
        return result;
      },
      restoreRuntime,
      stopResidualRuntime,
    });
  }

  it('stages every requested auto membership and commits only the connected subset', async () => {
    const adapter = createAdapter();

    const snapshot = await adapter.prepare(7, [11, 22, 33]);

    expect(snapshot).toEqual({
      operationGeneration: 7,
      joiningTabIds: [11, 22, 33],
      previousOverrideTabIds: [99],
      affectedGroupIds: ['group-a', 'group-b'],
    });
    expect(groups.get('group-a')?.tabIds).toEqual(new Set([44]));
    expect(groups.has('group-b')).toBe(false);
    expect(overrideTabIds).toEqual(new Set([99]));
    expect(isTabProvisionallyManuallyOverridden(11)).toBe(true);
    expect(isTabProvisionallyManuallyOverridden(22)).toBe(true);
    expect(isTabProvisionallyManuallyOverridden(33)).toBe(true);

    await expect(adapter.commit(snapshot, [11, 22])).resolves.toEqual({ status: 'committed' });

    expect(overrideTabIds).toEqual(new Set([99, 11, 22]));
    expect(groups.get('group-a')?.tabIds).toEqual(new Set([44]));
    expect(groups.has('group-b')).toBe(false);
    expect(isTabProvisionallyManuallyOverridden(11)).toBe(false);
    expect(isTabProvisionallyManuallyOverridden(22)).toBe(false);
    expect(isTabProvisionallyManuallyOverridden(33)).toBe(true);

    await expect(adapter.rollbackUncommitted(snapshot, [11, 22])).resolves.toEqual({
      status: 'rolled-back',
    });

    expect(groups.get('group-b')?.tabIds).toEqual(new Set([33]));
    expect(groups.get('group-b')?.isActive).toBe(false);
    expect(groups.get('unaffected')?.tabIds).toEqual(new Set([55, 66]));
    expect(pendingSuggestions).toEqual(new Set(['unaffected']));
    expect(restoreRuntime).toHaveBeenCalledWith(['group-b']);
    expect(isTabProvisionallyManuallyOverridden(33)).toBe(false);
  });

  it('rejects a commit from an older operation generation', async () => {
    const adapter = createAdapter();
    const staleSnapshot = await adapter.prepare(4, [11]);
    const currentSnapshot = await adapter.prepare(5, [22]);

    await expect(adapter.commit(staleSnapshot, [11])).resolves.toEqual({ status: 'stale' });
    expect(overrideTabIds).toEqual(new Set([99]));
    expect(isTabProvisionallyManuallyOverridden(11)).toBe(false);

    await adapter.rollback(staleSnapshot);
    expect(isTabProvisionallyManuallyOverridden(11)).toBe(false);
    await adapter.rollback(currentSnapshot);
    expect(isTabProvisionallyManuallyOverridden(22)).toBe(false);
  });

  it('restores the full captured override and group state on rollback', async () => {
    const adapter = createAdapter();
    const snapshot = await adapter.prepare(9, [11, 22]);
    await adapter.commit(snapshot, [11, 22]);

    await expect(adapter.rollback(snapshot)).resolves.toEqual({ status: 'rolled-back' });

    expect(overrideTabIds).toEqual(new Set([99]));
    expect(groups.get('group-a')).toEqual(createGroup([11, 44]));
    expect(groups.get('group-b')).toEqual(createGroup([22, 33]));
    expect(groups.get('unaffected')).toEqual(createGroup([55, 66], false));
    expect(pendingSuggestions).toEqual(new Set(['group-a', 'group-b', 'unaffected']));
    expect(restoreRuntime).toHaveBeenCalledWith(['group-a', 'group-b']);
    expect(isTabProvisionallyManuallyOverridden(11)).toBe(false);
    expect(isTabProvisionallyManuallyOverridden(22)).toBe(false);
  });

  it('returns degraded when captured auto runtime cannot be fully restored', async () => {
    restoreRuntime.mockResolvedValue(false);
    const adapter = createAdapter();
    const snapshot = await adapter.prepare(12, [11, 22]);

    await expect(adapter.rollback(snapshot)).resolves.toEqual({ status: 'degraded' });
    expect(groups.get('group-a')).toEqual(createGroup([11, 44]));
    expect(groups.get('group-b')).toEqual(createGroup([22, 33]));
    expect(isTabProvisionallyManuallyOverridden(11)).toBe(false);
    expect(isTabProvisionallyManuallyOverridden(22)).toBe(false);
  });

  it('returns degraded and clears provisional ownership when runtime restoration throws', async () => {
    restoreRuntime.mockRejectedValue(new Error('restore failed'));
    const adapter = createAdapter();
    const snapshot = await adapter.prepare(13, [11, 22]);

    await expect(adapter.rollback(snapshot)).resolves.toEqual({ status: 'degraded' });
    expect(isTabProvisionallyManuallyOverridden(11)).toBe(false);
    expect(isTabProvisionallyManuallyOverridden(22)).toBe(false);
    expect(groups.get('group-a')).toEqual(createGroup([11, 44]));
    expect(groups.get('group-b')).toEqual(createGroup([22, 33]));
  });

  it('acquires the auto lock for every transaction phase', async () => {
    const adapter = createAdapter();
    const snapshot = await adapter.prepare(3, [11, 22]);
    await adapter.commit(snapshot, [11]);
    await adapter.rollbackUncommitted(snapshot, [11]);
    await adapter.rollback(snapshot);

    expect(events).toEqual([
      'auto-lock:enter',
      'auto-lock:exit',
      'auto-lock:enter',
      'auto-lock:exit',
      'auto-lock:enter',
      'auto-lock:exit',
      'auto-lock:enter',
      'auto-lock:exit',
    ]);
  });

  it('stops only the residual singleton after a two-member group commits', async () => {
    const adapter = createAdapter();
    const snapshot = await adapter.prepare(20, [11]);
    await adapter.commit(snapshot, [11]);

    await expect(adapter.cleanupResidualRuntime(snapshot)).resolves.toEqual({
      status: 'cleaned',
    });

    expect(stopResidualRuntime).toHaveBeenCalledWith([
      {
        tabId: 44,
        activationGeneration: '11111111-1111-4111-8111-111111111111',
      },
    ]);
  });

  it('does not stop a residual active pair after a three-member group commits', async () => {
    groups.set('group-a', createGroup([11, 44, 45]));
    const adapter = createAdapter();
    const snapshot = await adapter.prepare(21, [11]);
    await adapter.commit(snapshot, [11]);

    await expect(adapter.cleanupResidualRuntime(snapshot)).resolves.toEqual({
      status: 'cleaned',
    });

    expect(stopResidualRuntime).not.toHaveBeenCalled();
    expect(groups.get('group-a')?.tabIds).toEqual(new Set([44, 45]));
    expect(groups.get('group-a')?.isActive).toBe(true);
  });

  it('does not stop residual runtime when the staged override rolls back', async () => {
    const adapter = createAdapter();
    const snapshot = await adapter.prepare(22, [11]);

    await adapter.rollback(snapshot);

    expect(stopResidualRuntime).not.toHaveBeenCalled();
    expect(groups.get('group-a')).toEqual(createGroup([11, 44]));
  });
});

describe('manualOverrideAdapter runtime integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    autoSyncState.groups.clear();
    manualSyncOverriddenTabs.clear();
    runtimePendingSuggestions.clear();
  });

  it.each([
    { name: 'missing', activationGeneration: undefined },
    { name: 'malformed', activationGeneration: 'not-a-uuid' },
  ])(
    'fails closed when a captured active group identity is $name',
    async ({ activationGeneration }) => {
      const group: AutoSyncGroup = {
        tabIds: new Set([71, 72]),
        isActive: true,
        ...(activationGeneration === undefined ? {} : { activationGeneration }),
      };
      autoSyncState.groups.set('group-runtime', group);
      const snapshot = await manualOverrideAdapter.prepare(101, [71]);

      await expect(manualOverrideAdapter.rollback(snapshot)).resolves.toEqual({
        status: 'degraded',
      });
      expect(sendMessageWithTimeout).not.toHaveBeenCalled();
      expect(autoSyncState.groups.get('group-runtime')?.isActive).toBe(true);
    },
  );

  it('restores a captured active group with the exact validated identity', async () => {
    const activationGeneration = '11111111-1111-4111-8111-111111111111';
    autoSyncState.groups.set('group-runtime', {
      tabIds: new Set([71, 72]),
      isActive: true,
      activationGeneration,
    });
    vi.mocked(sendMessageWithTimeout).mockImplementation(async (_, __, destination) => ({
      success: true,
      tabId: destination.tabId,
    }));
    const snapshot = await manualOverrideAdapter.prepare(102, [71]);

    await expect(manualOverrideAdapter.rollback(snapshot)).resolves.toEqual({
      status: 'rolled-back',
    });
    expect(sendMessageWithTimeout).toHaveBeenCalledTimes(2);
    expect(sendMessageWithTimeout).toHaveBeenCalledWith(
      'scroll:start',
      {
        tabIds: [71, 72],
        mode: 'ratio',
        currentTabId: 71,
        isAutoSync: true,
        autoSyncGeneration: activationGeneration,
      },
      { context: 'content-script', tabId: 71 },
      1_000,
    );
  });

  it('stops a committed residual singleton with the captured UUID identity', async () => {
    const activationGeneration = '11111111-1111-4111-8111-111111111111';
    autoSyncState.groups.set('group-runtime', {
      tabIds: new Set([71, 72]),
      isActive: true,
      activationGeneration,
    });
    vi.mocked(sendMessageWithTimeout).mockResolvedValue({ success: true, tabId: 72 });
    const snapshot = await manualOverrideAdapter.prepare(103, [71]);
    await manualOverrideAdapter.commit(snapshot, [71]);

    await expect(manualOverrideAdapter.cleanupResidualRuntime(snapshot)).resolves.toEqual({
      status: 'cleaned',
    });
    expect(sendMessageWithTimeout).toHaveBeenCalledWith(
      'scroll:stop',
      { isAutoSync: true, autoSyncGeneration: activationGeneration },
      { context: 'content-script', tabId: 72 },
      1_000,
    );
  });
});
