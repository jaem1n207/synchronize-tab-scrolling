import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AutoSyncGroup } from '~/shared/types/auto-sync-state';

import {
  createManualOverrideAdapter,
  isTabProvisionallyManuallyOverridden,
} from './manual-override-adapter';

vi.mock('./messaging', () => ({
  sendMessageWithTimeout: vi.fn(),
}));

function createGroup(tabIds: Array<number>, isActive = true): AutoSyncGroup {
  return {
    tabIds: new Set(tabIds),
    isActive,
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
});
