import { useEffect, useRef, useState } from 'react';

import { t } from '~/shared/i18n';
import { prefersReducedMotion } from '~/shared/lib/animations';
import {
  QUICK_SYNC_FAILURE_HUD_DURATION_MS,
  QUICK_SYNC_SUCCESS_HUD_DURATION_MS,
} from '~/shared/lib/quick-sync';
import type { QuickSyncFeedbackMessage } from '~/shared/types/quick-sync';

export type QuickSyncHudMessage = Exclude<QuickSyncFeedbackMessage, { outcome: 'clear' }>;

interface QuickSyncHudProps {
  message: QuickSyncHudMessage;
  onLifetimeEnd?: () => void;
  semanticOutcome?: 'expired';
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

interface Announcement {
  identity: string;
  text: string;
}

function getRemainingSeconds(deadline: number, now: number): number | null {
  if (now >= deadline) {
    return null;
  }
  return Math.max(1, Math.ceil((deadline - now) / 1_000));
}

function getLifetime(message: QuickSyncHudMessage, now: number): Lifetime {
  const identity = `${message.generation}:${message.outcome}`;
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

function getCopy(message: QuickSyncHudMessage, remainingSeconds: number | null): HudCopy {
  switch (message.outcome) {
    case 'candidate-selected':
      return {
        marker: '1',
        title: t('quickSyncCandidateSelectedTitle'),
        supportingText:
          remainingSeconds === null
            ? null
            : t('quickSyncCandidateInstruction', String(remainingSeconds)),
      };
    case 'same-candidate':
      return {
        marker: '1',
        title: t('quickSyncSameCandidateTitle'),
        supportingText:
          remainingSeconds === null
            ? null
            : t('quickSyncCandidateInstruction', String(remainingSeconds)),
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
            : t('quickSyncSecondTabRetryInstruction', String(remainingSeconds)),
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

export function QuickSyncHud({ message, onLifetimeEnd, semanticOutcome }: QuickSyncHudProps) {
  const lifetimeRef = useRef<Lifetime>(getLifetime(message, Date.now()));
  const nextIdentity = `${message.generation}:${message.outcome}`;
  if (lifetimeRef.current.identity !== nextIdentity) {
    lifetimeRef.current = getLifetime(message, Date.now());
  }

  const lifetime = lifetimeRef.current;
  const [clock, setClock] = useState(Date.now());
  const [endedIdentity, setEndedIdentity] = useState<string | null>(null);
  const remainingSeconds =
    lifetime.deadline === null ? null : getRemainingSeconds(lifetime.deadline, clock);
  const copy = getCopy(message, remainingSeconds);
  const announcementRef = useRef<Announcement | null>(null);
  if (announcementRef.current?.identity !== nextIdentity) {
    announcementRef.current = {
      identity: nextIdentity,
      text: [copy.title, copy.supportingText].filter((part) => part !== null).join(' '),
    };
  }
  const announcement = announcementRef.current.text;
  const hasCandidateLifetime = isCandidateLifetime(message);

  useEffect(() => {
    setEndedIdentity(null);
    if (lifetime.deadline === null) {
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const updateClock = () => {
      const now = Date.now();
      if (lifetime.deadline !== null && now >= lifetime.deadline) {
        setClock(now);
        if (!hasCandidateLifetime) {
          setEndedIdentity(lifetime.identity);
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

  if (semanticOutcome === 'expired') {
    return (
      <p aria-atomic="true" aria-live="polite" className="sr-only" role="status">
        {t('quickSyncCandidateExpiredAnnouncement')}
      </p>
    );
  }
  if (endedIdentity === lifetime.identity) {
    return null;
  }

  const reducedMotion = prefersReducedMotion();
  const markerColor =
    message.outcome === 'add-failed' || message.outcome === 'second-tab-failed'
      ? '#fca5a5'
      : message.outcome === 'candidate-selected' || message.outcome === 'same-candidate'
        ? '#93c5fd'
        : '#86efac';

  return (
    <aside
      className="pointer-events-none fixed left-1/2 top-4 z-[2147483647] -translate-x-1/2"
      data-quick-sync-generation={message.generation}
      style={{
        animation: reducedMotion
          ? 'none'
          : 'quick-sync-hud-enter 120ms cubic-bezier(0.215, 0.61, 0.355, 1)',
        transition: reducedMotion ? 'none' : 'opacity 120ms ease-out, transform 120ms ease-out',
      }}
    >
      <style>{`
        @keyframes quick-sync-hud-enter {
          from { opacity: 0; transform: translate(-50%, -4px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
        @media (prefers-reduced-motion: reduce) {
          aside { animation: none; transition: none; }
        }
      `}</style>
      <div
        style={{
          alignItems: 'center',
          backgroundColor: '#111827',
          border: '1px solid #6b7280',
          borderRadius: '12px',
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.28)',
          color: '#f9fafb',
          display: 'flex',
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
          gap: '10px',
          maxWidth: 'min(520px, calc(100vw - 32px))',
          padding: '10px 14px',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            alignItems: 'center',
            border: `1px solid ${markerColor}`,
            borderRadius: '999px',
            color: markerColor,
            display: 'inline-flex',
            flex: '0 0 24px',
            fontSize: '13px',
            fontWeight: 700,
            height: '24px',
            justifyContent: 'center',
            lineHeight: 1,
          }}
        >
          {copy.marker}
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
          {copy.supportingText !== null ? (
            <p
              aria-hidden="true"
              style={{
                color: '#d1d5db',
                fontSize: '12px',
                lineHeight: 1.45,
                margin: '2px 0 0',
              }}
            >
              {copy.supportingText}
            </p>
          ) : null}
        </div>
        {remainingSeconds !== null ? (
          <span
            aria-live="off"
            role="timer"
            style={{
              color: '#f9fafb',
              flex: '0 0 auto',
              fontSize: '13px',
              fontVariantNumeric: 'tabular-nums',
              fontWeight: 700,
              lineHeight: 1,
              minWidth: '18px',
              textAlign: 'right',
            }}
          >
            {remainingSeconds}
          </span>
        ) : null}
      </div>
      <p aria-atomic="true" aria-live="polite" className="sr-only" role="status">
        {announcement}
      </p>
    </aside>
  );
}
