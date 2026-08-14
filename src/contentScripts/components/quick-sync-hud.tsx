import { useEffect, useRef, useState } from 'react';

import { t } from '~/shared/i18n';
import { EASING_CSS, prefersReducedMotion } from '~/shared/lib/animations';
import {
  QUICK_SYNC_FAILURE_HUD_DURATION_MS,
  QUICK_SYNC_HUD_MOTION_DURATION_MS,
  QUICK_SYNC_SUCCESS_HUD_DURATION_MS,
} from '~/shared/lib/quick-sync';
import type { QuickSyncFeedbackMessage } from '~/shared/types/quick-sync';

export type QuickSyncHudMessage = Exclude<QuickSyncFeedbackMessage, { outcome: 'clear' }>;
export type QuickSyncHudPhase = 'enter' | 'visible' | 'exit';

interface QuickSyncHudProps {
  message: QuickSyncHudMessage;
  onLifetimeEnd?: () => void;
  phase: QuickSyncHudPhase;
}

interface HudCopy {
  marker: string;
  title: string;
  supportingText: string | null;
}

interface Lifetime {
  identity: string;
  deadline: number | null;
}

interface HudPresentation {
  announcement: string;
  clock: number;
  lifetime: Lifetime;
}

function getMessageIdentity(message: QuickSyncHudMessage): string {
  switch (message.outcome) {
    case 'candidate-selected':
    case 'same-candidate':
    case 'second-tab-failed':
      return `${message.generation}:${message.outcome}:${message.expiresAt}`;
    case 'connecting':
      return `${message.generation}:${message.outcome}`;
    case 'start-succeeded':
    case 'add-succeeded':
    case 'already-included':
    case 'add-failed':
      return `${message.generation}:${message.outcome}:${message.tabCount}`;
  }
}

function getRemainingSeconds(deadline: number, now: number): number | null {
  if (now >= deadline) {
    return null;
  }
  return Math.max(1, Math.ceil((deadline - now) / 1_000));
}

function getLifetime(message: QuickSyncHudMessage, now: number): Lifetime {
  const identity = getMessageIdentity(message);
  switch (message.outcome) {
    case 'candidate-selected':
    case 'same-candidate':
    case 'second-tab-failed':
      return { identity, deadline: message.expiresAt };
    case 'start-succeeded':
    case 'add-succeeded':
    case 'already-included':
      return { identity, deadline: now + QUICK_SYNC_SUCCESS_HUD_DURATION_MS };
    case 'add-failed':
      return { identity, deadline: now + QUICK_SYNC_FAILURE_HUD_DURATION_MS };
    case 'connecting':
      return { identity, deadline: null };
  }
}

function formatRemainingSeconds(remainingSeconds: number, reserveWidth: boolean): string {
  const value = String(remainingSeconds);
  return reserveWidth ? value.padStart(2, '\u2007') : value;
}

function getCopy(
  message: QuickSyncHudMessage,
  remainingSeconds: number | null,
  reserveCountdownWidth: boolean,
): HudCopy {
  switch (message.outcome) {
    case 'candidate-selected':
      return {
        marker: '1',
        title: t('quickSyncCandidateSelectedTitle'),
        supportingText:
          remainingSeconds === null
            ? null
            : t(
                'quickSyncCandidateInstruction',
                formatRemainingSeconds(remainingSeconds, reserveCountdownWidth),
              ),
      };
    case 'same-candidate':
      return {
        marker: '1',
        title: t('quickSyncSameCandidateTitle'),
        supportingText:
          remainingSeconds === null
            ? null
            : t(
                'quickSyncCandidateInstruction',
                formatRemainingSeconds(remainingSeconds, reserveCountdownWidth),
              ),
      };
    case 'connecting':
      return {
        marker: '↔',
        title: t('quickSyncConnectingTitle'),
        supportingText: null,
      };
    case 'start-succeeded':
      return {
        marker: '✓',
        title: t('quickSyncStartSucceededTitle', String(message.tabCount)),
        supportingText: null,
      };
    case 'add-succeeded':
      return {
        marker: '+',
        title: t('quickSyncAddSucceededTitle', String(message.tabCount)),
        supportingText: null,
      };
    case 'already-included':
      return {
        marker: '✓',
        title: t('quickSyncAlreadyIncludedTitle', String(message.tabCount)),
        supportingText: null,
      };
    case 'second-tab-failed':
      return {
        marker: '!',
        title: t('quickSyncSecondTabFailedTitle'),
        supportingText:
          remainingSeconds === null
            ? null
            : t(
                'quickSyncSecondTabRetryInstruction',
                formatRemainingSeconds(remainingSeconds, reserveCountdownWidth),
              ),
      };
    case 'add-failed':
      return {
        marker: '!',
        title: t('quickSyncAddFailedTitle'),
        supportingText: t('quickSyncExistingTabsContinue', String(message.tabCount)),
      };
  }
}

function isCandidateLifetime(message: QuickSyncHudMessage): boolean {
  return (
    message.outcome === 'candidate-selected' ||
    message.outcome === 'same-candidate' ||
    message.outcome === 'second-tab-failed'
  );
}

function createHudPresentation(message: QuickSyncHudMessage, now: number): HudPresentation {
  const lifetime = getLifetime(message, now);
  const remainingSeconds =
    lifetime.deadline === null ? null : getRemainingSeconds(lifetime.deadline, now);
  const announcementCopy = getCopy(message, remainingSeconds, false);
  return {
    announcement: [announcementCopy.title, announcementCopy.supportingText]
      .filter((part) => part !== null)
      .join(' '),
    clock: now,
    lifetime,
  };
}

export function QuickSyncExpirationAnnouncement() {
  return (
    <p aria-atomic="true" aria-live="polite" className="sr-only" role="status">
      {t('quickSyncCandidateExpiredAnnouncement')}
    </p>
  );
}

export function QuickSyncHud(props: QuickSyncHudProps) {
  return <QuickSyncHudPresentation key={getMessageIdentity(props.message)} {...props} />;
}

function QuickSyncHudPresentation({ message, onLifetimeEnd, phase }: QuickSyncHudProps) {
  const [presentation] = useState(() => createHudPresentation(message, Date.now()));
  const lifetime = presentation.lifetime;
  const notifiedLifetimeEndRef = useRef<string | null>(null);
  const [clock, setClock] = useState(presentation.clock);
  const remainingSeconds =
    lifetime.deadline === null ? null : getRemainingSeconds(lifetime.deadline, clock);
  const copy = getCopy(message, remainingSeconds, true);
  const announcement = presentation.announcement;
  const hasCandidateLifetime = isCandidateLifetime(message);
  const candidateDeadlineReached = hasCandidateLifetime && remainingSeconds === null;
  const geometryCopy = candidateDeadlineReached ? getCopy(message, 1, true) : copy;
  const timerSeconds = candidateDeadlineReached ? 1 : remainingSeconds;

  useEffect(() => {
    if (lifetime.deadline === null) {
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const updateClock = () => {
      const now = Date.now();
      if (lifetime.deadline !== null && now >= lifetime.deadline) {
        setClock(now);
        if (!hasCandidateLifetime && notifiedLifetimeEndRef.current !== lifetime.identity) {
          notifiedLifetimeEndRef.current = lifetime.identity;
          onLifetimeEnd?.();
        }
        return;
      }

      setClock(now);
      if (lifetime.deadline !== null) {
        const remaining = lifetime.deadline - now;
        const nextSecondBoundary = remaining % 1_000 || 1_000;
        timer = setTimeout(updateClock, Math.min(remaining, nextSecondBoundary));
      }
    };

    const initialRemaining = lifetime.deadline - Date.now();
    timer = setTimeout(
      updateClock,
      Math.max(0, Math.min(initialRemaining, initialRemaining % 1_000 || 1_000)),
    );

    return () => {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    };
  }, [hasCandidateLifetime, lifetime, onLifetimeEnd]);

  const reducedMotion = prefersReducedMotion();
  const isVisible = phase === 'visible';
  const transition = reducedMotion
    ? 'none'
    : `opacity ${QUICK_SYNC_HUD_MOTION_DURATION_MS}ms ${EASING_CSS.easeOutCubic}, transform ${QUICK_SYNC_HUD_MOTION_DURATION_MS}ms ${EASING_CSS.easeOutCubic}`;
  const markerColor =
    message.outcome === 'add-failed' || message.outcome === 'second-tab-failed'
      ? '#fca5a5'
      : message.outcome === 'candidate-selected' || message.outcome === 'same-candidate'
        ? '#93c5fd'
        : '#86efac';

  return (
    <aside
      data-quick-sync-generation={message.generation}
      data-quick-sync-phase={phase}
      style={{
        animation: 'none',
        boxSizing: 'border-box',
        left: '50%',
        maxWidth: 'calc(100vw - 32px)',
        opacity: isVisible ? 1 : 0,
        pointerEvents: 'none',
        position: 'fixed',
        top: '16px',
        transform: isVisible ? 'translate(-50%, 0)' : 'translate(-50%, -4px)',
        transition,
        width: '440px',
        zIndex: 2_147_483_647,
      }}
    >
      <div
        data-quick-sync-surface=""
        style={{
          alignItems: 'center',
          backgroundColor: '#111827',
          border: '1px solid #6b7280',
          borderRadius: '12px',
          boxSizing: 'border-box',
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.28)',
          color: '#f9fafb',
          display: 'grid',
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
          gap: '10px',
          gridTemplateColumns: '24px minmax(0, 1fr) 2ch',
          padding: '10px 14px',
          width: '100%',
        }}
      >
        <span
          aria-hidden="true"
          data-quick-sync-marker=""
          style={{
            alignSelf: 'center',
            alignItems: 'center',
            border: `1px solid ${markerColor}`,
            borderRadius: '999px',
            boxSizing: 'border-box',
            color: markerColor,
            display: 'grid',
            fontSize: '13px',
            fontWeight: 700,
            height: '24px',
            justifySelf: 'center',
            lineHeight: 1,
            placeItems: 'center',
            width: '24px',
          }}
        >
          {copy.marker === '+' ? (
            <svg
              aria-hidden="true"
              focusable="false"
              height="14"
              style={{ display: 'block' }}
              viewBox="0 0 14 14"
              width="14"
            >
              <path
                d="M7 2.5v9M2.5 7h9"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="2"
              />
            </svg>
          ) : (
            copy.marker
          )}
        </span>
        <div style={{ minWidth: 0 }}>
          <p
            aria-hidden="true"
            style={{
              fontSize: '14px',
              fontWeight: 650,
              letterSpacing: '-0.01em',
              lineHeight: 1.35,
              margin: 0,
            }}
          >
            {copy.title}
          </p>
          {geometryCopy.supportingText !== null ? (
            <p
              aria-hidden="true"
              data-quick-sync-supporting-text=""
              style={{
                color: '#d1d5db',
                fontSize: '12px',
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1.45,
                margin: '2px 0 0',
                visibility: candidateDeadlineReached ? 'hidden' : 'visible',
              }}
            >
              {geometryCopy.supportingText}
            </p>
          ) : null}
        </div>
        {timerSeconds !== null ? (
          <span
            aria-live="off"
            data-quick-sync-timer=""
            role="timer"
            style={{
              color: '#f9fafb',
              flex: '0 0 auto',
              fontSize: '13px',
              fontVariantNumeric: 'tabular-nums',
              fontWeight: 700,
              justifySelf: 'end',
              lineHeight: 1,
              minWidth: '2ch',
              textAlign: 'right',
              visibility: candidateDeadlineReached ? 'hidden' : 'visible',
            }}
          >
            {timerSeconds}
          </span>
        ) : null}
      </div>
      <p aria-atomic="true" aria-live="polite" className="sr-only" role="status">
        {announcement}
      </p>
    </aside>
  );
}
