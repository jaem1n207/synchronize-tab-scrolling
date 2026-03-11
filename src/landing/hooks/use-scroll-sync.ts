import type { RefObject } from 'react';

interface UseScrollSyncOptions {
  leftRef: RefObject<HTMLDivElement | null>;
  rightRef: RefObject<HTMLDivElement | null>;
  isSynced: boolean;
  isAdjusting: boolean;
}

export function useScrollSync({
  leftRef,
  rightRef,
  isSynced,
  isAdjusting,
}: UseScrollSyncOptions): void {
  const guardRef = useRef<'left' | 'right' | null>(null);
  const guardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<{
    target: HTMLDivElement;
    ratio: number;
    guard: 'left' | 'right';
  } | null>(null);

  useEffect(() => {
    const left = leftRef.current;
    const right = rightRef.current;
    if (!left || !right || !isSynced) return;

    // Re-entrancy guard duration: must exceed browser scroll-event delay
    // for programmatic scrollTop writes (~16ms/frame × 2-3 frames)
    const GUARD_MS = 60;

    function setGuard(panel: 'left' | 'right') {
      if (guardTimerRef.current !== null) {
        clearTimeout(guardTimerRef.current);
      }
      guardRef.current = panel;
      guardTimerRef.current = setTimeout(() => {
        guardRef.current = null;
        guardTimerRef.current = null;
      }, GUARD_MS);
    }

    function scheduleSync(
      source: HTMLDivElement,
      target: HTMLDivElement,
      guardPanel: 'left' | 'right',
    ) {
      if (isAdjusting) return;
      if (guardRef.current === guardPanel) return;

      const maxScroll = source.scrollHeight - source.clientHeight;
      const ratio = maxScroll > 0 ? source.scrollTop / maxScroll : 0;

      pendingRef.current = { target, ratio, guard: guardPanel };

      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          const pending = pendingRef.current;
          if (!pending) return;
          pendingRef.current = null;

          const targetMax = pending.target.scrollHeight - pending.target.clientHeight;
          if (targetMax <= 0) return;

          // Guard BEFORE scrollTop write — suppresses target's rebound scroll event
          setGuard(pending.guard);
          pending.target.scrollTop = pending.ratio * targetMax;
        });
      }
    }

    function onLeftScroll() {
      scheduleSync(left!, right!, 'right');
    }

    function onRightScroll() {
      scheduleSync(right!, left!, 'left');
    }

    left.addEventListener('scroll', onLeftScroll, { passive: true });
    right.addEventListener('scroll', onRightScroll, { passive: true });

    return () => {
      left.removeEventListener('scroll', onLeftScroll);
      right.removeEventListener('scroll', onRightScroll);

      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (guardTimerRef.current !== null) {
        clearTimeout(guardTimerRef.current);
        guardTimerRef.current = null;
      }
      guardRef.current = null;
      pendingRef.current = null;
    };
  }, [leftRef, rightRef, isSynced, isAdjusting]);
}
