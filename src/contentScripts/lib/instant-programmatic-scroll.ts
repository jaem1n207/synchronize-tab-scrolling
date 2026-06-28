interface ScrollBehaviorSnapshot {
  element: HTMLElement;
  scrollBehavior: string;
}

function isHTMLElement(element: Element | null, documentRef: Document): element is HTMLElement {
  const HTMLElementConstructor = documentRef.defaultView?.HTMLElement;
  return Boolean(HTMLElementConstructor && element instanceof HTMLElementConstructor);
}

function getScrollRoot(documentRef: Document): HTMLElement {
  const scrollingElement = documentRef.scrollingElement;
  if (isHTMLElement(scrollingElement, documentRef)) {
    return scrollingElement;
  }

  return documentRef.documentElement;
}

function collectScrollBehaviorSnapshots(
  documentRef: Document,
  scrollRoot: HTMLElement,
): Array<ScrollBehaviorSnapshot> {
  const snapshots: Array<ScrollBehaviorSnapshot> = [
    {
      element: scrollRoot,
      scrollBehavior: scrollRoot.style.scrollBehavior,
    },
  ];

  if (documentRef.body && documentRef.body !== scrollRoot) {
    snapshots.push({
      element: documentRef.body,
      scrollBehavior: documentRef.body.style.scrollBehavior,
    });
  }

  return snapshots;
}

function forceAutoScrollBehavior(snapshots: ReadonlyArray<ScrollBehaviorSnapshot>): void {
  snapshots.forEach(({ element }) => {
    element.style.scrollBehavior = 'auto';
  });
}

function restoreScrollBehavior(snapshots: ReadonlyArray<ScrollBehaviorSnapshot>): void {
  snapshots.forEach(({ element, scrollBehavior }) => {
    element.style.scrollBehavior = scrollBehavior;
  });
}

export function applyInstantProgrammaticScroll(
  top: number,
  documentRef: Document = document,
  windowRef: Window = window,
): boolean {
  if (!Number.isFinite(top)) {
    return false;
  }

  const scrollRoot = getScrollRoot(documentRef);
  const snapshots = collectScrollBehaviorSnapshots(documentRef, scrollRoot);
  const previousScrollTop = scrollRoot.scrollTop;

  forceAutoScrollBehavior(snapshots);

  try {
    scrollRoot.scrollTop = top;

    if (scrollRoot.scrollTop === previousScrollTop && previousScrollTop !== top) {
      windowRef.scrollTo(0, top);
    }

    return true;
  } finally {
    restoreScrollBehavior(snapshots);
  }
}
