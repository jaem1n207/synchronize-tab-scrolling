const AUTO_SYNC_ACTIVATION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AutoSyncActivationId = string;

/**
 * Auto-sync activation IDs are opaque UUID v4 values. The default generator's UUID uniqueness
 * contract spans service-worker lifetimes without storage I/O. Injected generators must preserve
 * the same global-uniqueness contract.
 */
export function createAutoSyncActivationId(): AutoSyncActivationId {
  return crypto.randomUUID();
}

export function isAutoSyncActivationId(value: unknown): value is AutoSyncActivationId {
  return typeof value === 'string' && AUTO_SYNC_ACTIVATION_ID_PATTERN.test(value);
}

export function doesAutoSyncStopMatchActivation(
  requestedActivationId: unknown,
  activeActivationId: AutoSyncActivationId,
): boolean {
  return (
    requestedActivationId === undefined ||
    (isAutoSyncActivationId(requestedActivationId) &&
      requestedActivationId === activeActivationId)
  );
}
