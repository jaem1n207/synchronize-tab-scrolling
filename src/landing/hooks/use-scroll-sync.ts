import type { RefObject } from 'react';

export function useScrollSync(
  leftRef: RefObject<HTMLDivElement | null>,
  rightRef: RefObject<HTMLDivElement | null>,
  isSynced: boolean,
): void {
  const syncingRef = useRef<'left' | 'right' | null>(null);

  useEffect(() => {
    const left = leftRef.current;
    const right = rightRef.current;
    if (!left || !right || !isSynced) return;

    function syncScroll(
      source: HTMLDivElement,
      target: HTMLDivElement,
      direction: 'left' | 'right',
    ) {
      if (syncingRef.current === direction) return;
      syncingRef.current = direction === 'left' ? 'right' : 'left';

      const maxScroll = source.scrollHeight - source.clientHeight;
      const progress = maxScroll > 0 ? source.scrollTop / maxScroll : 0;
      const targetMax = target.scrollHeight - target.clientHeight;
      target.scrollTop = progress * targetMax;

      requestAnimationFrame(() => {
        syncingRef.current = null;
      });
    }

    function onLeftScroll() {
      syncScroll(left!, right!, 'right');
    }

    function onRightScroll() {
      syncScroll(right!, left!, 'left');
    }

    left.addEventListener('scroll', onLeftScroll, { passive: true });
    right.addEventListener('scroll', onRightScroll, { passive: true });

    return () => {
      left.removeEventListener('scroll', onLeftScroll);
      right.removeEventListener('scroll', onRightScroll);
    };
  }, [leftRef, rightRef, isSynced]);
}
