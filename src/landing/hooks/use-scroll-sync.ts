import type { RefObject } from 'react';

interface UseScrollSyncOptions {
  leftRef: RefObject<HTMLDivElement | null>;
  rightRef: RefObject<HTMLDivElement | null>;
  isSynced: boolean;
  isAdjusting: boolean;
}

type Panel = 'left' | 'right';

interface PanelOffsets {
  left: number;
  right: number;
}

const MAX_OFFSET_RATIO = 0.5;

function clampRatio(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clampOffset(value: number): number {
  return Math.max(-MAX_OFFSET_RATIO, Math.min(MAX_OFFSET_RATIO, value));
}

function getScrollRatio(element: HTMLDivElement): number {
  const maxScroll = element.scrollHeight - element.clientHeight;
  return maxScroll > 0 ? element.scrollTop / maxScroll : 0;
}

export function useScrollSync({
  leftRef,
  rightRef,
  isSynced,
  isAdjusting,
}: UseScrollSyncOptions): number {
  const guardRef = useRef<Panel | null>(null);
  const guardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<{
    target: HTMLDivElement;
    targetRatio: number;
    targetPanel: Panel;
  } | null>(null);

  const offsetsRef = useRef<PanelOffsets>({ left: 0, right: 0 });
  const baselineRatioRef = useRef(0);
  const lastActivePanelRef = useRef<Panel>('left');

  const isAdjustingRef = useRef(isAdjusting);
  isAdjustingRef.current = isAdjusting;

  const prevAdjustingRef = useRef(false);
  const [manualOffsetRatio, setManualOffsetRatio] = useState(0);

  useEffect(() => {
    const left = leftRef.current;
    const right = rightRef.current;
    if (!left || !right || !isSynced) {
      prevAdjustingRef.current = isAdjusting;
      return;
    }

    const wasAdjusting = prevAdjustingRef.current;
    prevAdjustingRef.current = isAdjusting;

    if (!wasAdjusting && isAdjusting) {
      const leftRatio = getScrollRatio(left);
      const rightRatio = getScrollRatio(right);
      const pureLeft = leftRatio - offsetsRef.current.left;
      const pureRight = rightRatio - offsetsRef.current.right;

      baselineRatioRef.current = lastActivePanelRef.current === 'left' ? pureLeft : pureRight;
      return;
    }

    if (wasAdjusting && !isAdjusting) {
      const leftRatio = getScrollRatio(left);
      const rightRatio = getScrollRatio(right);
      const baseline = baselineRatioRef.current;

      const nextOffsets: PanelOffsets = {
        left: clampOffset(leftRatio - baseline),
        right: clampOffset(rightRatio - baseline),
      };

      offsetsRef.current = nextOffsets;
      setManualOffsetRatio(nextOffsets.right - nextOffsets.left);
    }
  }, [isAdjusting, isSynced, leftRef, rightRef]);

  useEffect(() => {
    if (!isSynced) {
      offsetsRef.current = { left: 0, right: 0 };
      baselineRatioRef.current = 0;
      setManualOffsetRatio(0);
      prevAdjustingRef.current = false;
    }
  }, [isSynced]);

  useEffect(() => {
    const left = leftRef.current;
    const right = rightRef.current;
    if (!left || !right || !isSynced) return;
    const leftElement: HTMLDivElement = left;
    const rightElement: HTMLDivElement = right;

    const GUARD_MS = 80;

    function setGuard(panel: Panel) {
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
      sourcePanel: Panel,
      targetPanel: Panel,
    ) {
      if (isAdjustingRef.current) return;
      if (guardRef.current === sourcePanel) return;

      lastActivePanelRef.current = sourcePanel;

      const sourceRatio = getScrollRatio(source);
      const sourceOffset = offsetsRef.current[sourcePanel];
      const targetOffset = offsetsRef.current[targetPanel];
      const pureRatio = sourceRatio - sourceOffset;

      baselineRatioRef.current = pureRatio;

      pendingRef.current = {
        target,
        targetRatio: clampRatio(pureRatio + targetOffset),
        targetPanel,
      };

      if (rafRef.current !== null) return;

      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const pending = pendingRef.current;
        if (!pending) return;
        pendingRef.current = null;

        const targetMax = pending.target.scrollHeight - pending.target.clientHeight;
        if (targetMax <= 0) return;

        setGuard(pending.targetPanel);
        pending.target.scrollTop = pending.targetRatio * targetMax;
      });
    }

    function onLeftScroll() {
      scheduleSync(leftElement, rightElement, 'left', 'right');
    }

    function onRightScroll() {
      scheduleSync(rightElement, leftElement, 'right', 'left');
    }

    leftElement.addEventListener('scroll', onLeftScroll, { passive: true });
    rightElement.addEventListener('scroll', onRightScroll, { passive: true });

    return () => {
      leftElement.removeEventListener('scroll', onLeftScroll);
      rightElement.removeEventListener('scroll', onRightScroll);

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
