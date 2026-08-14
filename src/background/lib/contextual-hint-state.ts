import browser from 'webextension-polyfill';

import { isPendingUrlSyncContextualHintId } from '~/shared/lib/contextual-hints';
import { ExtensionLogger } from '~/shared/lib/logger';
import type { PendingUrlSyncContextualHintId } from '~/shared/types/contextual-hints';

const logger = new ExtensionLogger({ scope: 'contextual-hint-state' });
const STORAGE_KEY_PREFIX = 'pendingUrlSyncContextualHint:';
const pendingUrlSyncContextualHints = new Map<number, PendingUrlSyncContextualHintId>();
let restorationPromise: Promise<boolean> | null = null;
let storageWriteTail: Promise<void> = Promise.resolve();

function getStorageKey(tabId: number): string {
  return `${STORAGE_KEY_PREFIX}${tabId}`;
}

function getTabIdFromStorageKey(key: string): number | null {
  if (!key.startsWith(STORAGE_KEY_PREFIX)) {
    return null;
  }

  const tabId = Number(key.slice(STORAGE_KEY_PREFIX.length));
  return Number.isSafeInteger(tabId) && tabId > 0 ? tabId : null;
}

function enqueueStorageWrite(
  operation: () => Promise<void>,
  failureReason: 'storage-remove-failed' | 'storage-write-failed',
): Promise<boolean> {
  const result = storageWriteTail.then(operation).then(
    () => true,
    () => {
      logger.warn('Failed to persist pending URL Sync contextual hint state', {
        reason: failureReason,
      });
      return false;
    },
  );
  storageWriteTail = result.then(() => undefined);
  return result;
}

async function restoreFromSessionStorage(): Promise<boolean> {
  let storedValues: Record<string, unknown>;
  try {
    storedValues = await browser.storage.session.get(null);
  } catch {
    logger.warn('Failed to restore pending URL Sync contextual hint state', {
      reason: 'storage-read-failed',
    });
    return false;
  }

  for (const [key, value] of Object.entries(storedValues)) {
    const tabId = getTabIdFromStorageKey(key);
    if (
      tabId !== null &&
      !pendingUrlSyncContextualHints.has(tabId) &&
      isPendingUrlSyncContextualHintId(value)
    ) {
      pendingUrlSyncContextualHints.set(tabId, value);
    }
  }

  return true;
}

export function restorePendingUrlSyncContextualHints(): Promise<boolean> {
  restorationPromise ??= restoreFromSessionStorage();
  return restorationPromise;
}

export function savePendingUrlSyncContextualHint(
  tabId: number,
  hintId: PendingUrlSyncContextualHintId,
): Promise<boolean> {
  pendingUrlSyncContextualHints.set(tabId, hintId);
  return enqueueStorageWrite(
    () => browser.storage.session.set({ [getStorageKey(tabId)]: hintId }),
    'storage-write-failed',
  );
}

export function consumePendingUrlSyncContextualHint(
  tabId: number,
): PendingUrlSyncContextualHintId | null {
  const hintId = pendingUrlSyncContextualHints.get(tabId) ?? null;
  pendingUrlSyncContextualHints.delete(tabId);
  void enqueueStorageWrite(
    () => browser.storage.session.remove(getStorageKey(tabId)),
    'storage-remove-failed',
  );
  return hintId;
}

export function hasPendingUrlSyncContextualHint(tabId: number): boolean {
  return pendingUrlSyncContextualHints.has(tabId);
}

export function clearPendingUrlSyncContextualHint(tabId: number): Promise<boolean> {
  pendingUrlSyncContextualHints.delete(tabId);
  return enqueueStorageWrite(
    () => browser.storage.session.remove(getStorageKey(tabId)),
    'storage-remove-failed',
  );
}
