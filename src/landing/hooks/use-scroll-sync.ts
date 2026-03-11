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
}: UseScrollSyncOptions): number {
  const guardRef = useRef<'left' | 'right' | null>(null);
  const guardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<{
    target: HTMLDivElement;
    ratio: number;
    guard: 'left' | 'right';
    direction: 'left-to-right' | 'right-to-left';
  } | null>(null);

  // Ratio difference between right and left panels, captured when manual
  // adjustment ends. Applied during sync so the adjusted alignment persists.
  const offsetRef = useRef(0);

  // Ref mirror of isAdjusting — avoids re-creating scroll listeners on every
  // keydown/keyup, which would cancel in-flight rAF and guard timers
  const isAdjustingRef = useRef(isAdjusting);
  isAdjustingRef.current = isAdjusting;

  const prevAdjustingRef = useRef(false);
  const [manualOffsetRatio, setManualOffsetRatio] = useState(0);

  useEffect(() => {
    const wasAdjusting = prevAdjustingRef.current;
    prevAdjustingRef.current = isAdjusting;

    if (wasAdjusting && !isAdjusting && isSynced) {
      const left = leftRef.current;
      const right = rightRef.current;
      if (!left || !right) return;

      const leftMax = left.scrollHeight - left.clientHeight;
      const rightMax = right.scrollHeight - right.clientHeight;
      const leftRatio = leftMax > 0 ? left.scrollTop / leftMax : 0;
      const rightRatio = rightMax > 0 ? right.scrollTop / rightMax : 0;

      offsetRef.current = rightRatio - leftRatio;
      setManualOffsetRatio(offsetRef.current);
    }
  }, [isAdjusting, isSynced, leftRef, rightRef]);

  useEffect(() => {
    if (!isSynced) {
      offsetRef.current = 0;
      setManualOffsetRatio(0);
    }
  }, [isSynced]);

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
      direction: 'left-to-right' | 'right-to-left',
    ) {
      if (isAdjustingRef.current) return;
      if (guardRef.current === guardPanel) return;

      const maxScroll = source.scrollHeight - source.clientHeight;
      const ratio = maxScroll > 0 ? source.scrollTop / maxScroll : 0;

      pendingRef.current = { target, ratio, guard: guardPanel, direction };

      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          const pending = pendingRef.current;
          if (!pending) return;
          pendingRef.current = null;

          const targetMax = pending.target.scrollHeight - pending.target.clientHeight;
          if (targetMax <= 0) return;

          const offset = offsetRef.current;
          const targetRatio =
            pending.direction === 'left-to-right' ? pending.ratio + offset : pending.ratio - offset;

          // Guard BEFORE scrollTop write — suppresses target's rebound scroll event
          setGuard(pending.guard);
          pending.target.scrollTop = Math.max(0, Math.min(1, targetRatio)) * targetMax;
        });
      }
    }

    function onLeftScroll() {
      scheduleSync(left!, right!, 'right', 'left-to-right');
    }

    function onRightScroll() {
      scheduleSync(right!, left!, 'left', 'right-to-left');
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
  }, [leftRef, rightRef, isSynced]);

  return manualOffsetRatio;
}
