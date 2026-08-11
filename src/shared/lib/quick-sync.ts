export const QUICK_SYNC_CANDIDATE_DURATION_MS = 10_000;
export const QUICK_SYNC_CONTROL_TIMEOUT_MS = 1_000;
export const QUICK_SYNC_RECONNECT_TIMEOUT_MS = 3_000;
export const QUICK_SYNC_RECENT_OUTCOME_DURATION_MS = 30_000;
export const QUICK_SYNC_SUCCESS_HUD_DURATION_MS = 2_500;
export const QUICK_SYNC_FAILURE_HUD_DURATION_MS = 4_000;
export const QUICK_SYNC_BADGE_DURATION_MS = 4_000;
export const QUICK_SYNC_PORT_PREFIX = 'quick-sync-candidate:';

export function getQuickSyncRemainingSeconds(now: number, expiresAt: number): number | null {
  const remainingMilliseconds = expiresAt - now;
  if (remainingMilliseconds <= 0) {
    return null;
  }

  return Math.ceil(remainingMilliseconds / 1_000);
}

export function getQuickSyncPortName(generation: number): string {
  return `${QUICK_SYNC_PORT_PREFIX}${generation}`;
}

export function parseQuickSyncPortGeneration(name: string): number | null {
  if (!name.startsWith(QUICK_SYNC_PORT_PREFIX)) {
    return null;
  }

  const generationValue = name.slice(QUICK_SYNC_PORT_PREFIX.length);
  if (generationValue.length === 0) {
    return null;
  }

  const generation = Number(generationValue);
  return Number.isSafeInteger(generation) && generation >= 0 ? generation : null;
}

export function toQuickSyncShortcutLabel(shortcut: string, platform: 'mac' | 'other'): string {
  const tokens = shortcut.split('+').filter((token) => token.length > 0);
  const labels = tokens.map((token) => {
    if (token === 'Command') return '⌘';
    if (token === 'MacCtrl') return '⌃';
    if (token === 'Shift') return '⇧';
    if (token === 'Period') return '.';
    if (token === 'Alt' && platform === 'mac') return '⌥';
    return token;
  });

  return labels.join(' ');
}
