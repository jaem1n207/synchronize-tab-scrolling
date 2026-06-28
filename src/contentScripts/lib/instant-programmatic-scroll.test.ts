import { afterEach, describe, expect, it, vi } from 'vitest';

import { applyInstantProgrammaticScroll } from './instant-programmatic-scroll';

function restoreDescriptor(
  target: object,
  propertyKey: PropertyKey,
  descriptor: PropertyDescriptor | undefined,
): void {
  if (descriptor) {
    Object.defineProperty(target, propertyKey, descriptor);
    return;
  }

  Reflect.deleteProperty(target, propertyKey);
}

function installScrollTopObserver(
  element: HTMLElement,
  onSet: (value: number) => void,
): () => void {
  const originalDescriptor = Object.getOwnPropertyDescriptor(element, 'scrollTop');
  let scrollTop = element.scrollTop;

  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    get: () => scrollTop,
    set: (value: number) => {
      onSet(value);
      scrollTop = value;
    },
  });

  return () => {
    restoreDescriptor(element, 'scrollTop', originalDescriptor);
  };
}

function setScrollingElement(scrollingElement: Element | null): () => void {
  const originalDescriptor = Object.getOwnPropertyDescriptor(document, 'scrollingElement');

  Object.defineProperty(document, 'scrollingElement', {
    configurable: true,
    get: () => scrollingElement,
  });

  return () => {
    restoreDescriptor(document, 'scrollingElement', originalDescriptor);
  };
}

describe('applyInstantProgrammaticScroll', () => {
  afterEach(() => {
    document.documentElement.style.scrollBehavior = '';
    document.documentElement.scrollTop = 0;
    document.body.innerHTML = '';
    document.body.style.scrollBehavior = '';
    vi.restoreAllMocks();
  });

  it('temporarily forces root scroll behavior to auto and restores the inline value', () => {
    document.documentElement.style.scrollBehavior = 'smooth';
    const scrollTopAssignments: Array<number> = [];
    const restoreScrollTop = installScrollTopObserver(document.documentElement, (value) => {
      scrollTopAssignments.push(value);
      expect(document.documentElement.style.scrollBehavior).toBe('auto');
    });

    try {
      const applied = applyInstantProgrammaticScroll(420);

      expect(applied).toBe(true);
      expect(scrollTopAssignments).toEqual([420]);
      expect(document.documentElement.scrollTop).toBe(420);
      expect(document.documentElement.style.scrollBehavior).toBe('smooth');
    } finally {
      restoreScrollTop();
    }
  });

  it('restores an empty root scroll behavior value after applying the scroll', () => {
    document.documentElement.style.scrollBehavior = '';
    const scrollTopAssignments: Array<number> = [];
    const restoreScrollTop = installScrollTopObserver(document.documentElement, (value) => {
      scrollTopAssignments.push(value);
      expect(document.documentElement.style.scrollBehavior).toBe('auto');
    });

    try {
      const applied = applyInstantProgrammaticScroll(240);

      expect(applied).toBe(true);
      expect(scrollTopAssignments).toEqual([240]);
      expect(document.documentElement.scrollTop).toBe(240);
      expect(document.documentElement.style.scrollBehavior).toBe('');
    } finally {
      restoreScrollTop();
    }
  });

  it('temporarily overrides and restores body scroll behavior when body is not the root', () => {
    document.documentElement.style.scrollBehavior = 'smooth';
    document.body.style.scrollBehavior = 'smooth';
    const scrollTopAssignments: Array<number> = [];
    const restoreScrollTop = installScrollTopObserver(document.documentElement, (value) => {
      scrollTopAssignments.push(value);
      expect(document.documentElement.style.scrollBehavior).toBe('auto');
      expect(document.body.style.scrollBehavior).toBe('auto');
    });

    try {
      const applied = applyInstantProgrammaticScroll(360);

      expect(applied).toBe(true);
      expect(scrollTopAssignments).toEqual([360]);
      expect(document.documentElement.scrollTop).toBe(360);
      expect(document.documentElement.style.scrollBehavior).toBe('smooth');
      expect(document.body.style.scrollBehavior).toBe('smooth');
    } finally {
      restoreScrollTop();
    }
  });

  it('falls back to window.scrollTo when root assignment does not move the page', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const originalDescriptor = Object.getOwnPropertyDescriptor(
      document.documentElement,
      'scrollTop',
    );

    Object.defineProperty(document.documentElement, 'scrollTop', {
      configurable: true,
      get: () => 0,
      set: () => {},
    });

    try {
      const applied = applyInstantProgrammaticScroll(500);

      expect(applied).toBe(true);
      expect(scrollTo).toHaveBeenCalledWith(0, 500);
    } finally {
      restoreDescriptor(document.documentElement, 'scrollTop', originalDescriptor);
    }
  });

  it('does not apply non-finite scroll targets', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

    expect(applyInstantProgrammaticScroll(Number.NaN)).toBe(false);
    expect(applyInstantProgrammaticScroll(Number.POSITIVE_INFINITY)).toBe(false);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('uses document.scrollingElement only when it is an HTMLElement and otherwise falls back', () => {
    const svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const bodyScrollTopAssignments: Array<number> = [];
    const rootScrollTopAssignments: Array<number> = [];
    const restoreBodyScrollTop = installScrollTopObserver(document.body, (value) => {
      bodyScrollTopAssignments.push(value);
    });
    const restoreRootScrollTop = installScrollTopObserver(document.documentElement, (value) => {
      rootScrollTopAssignments.push(value);
    });
    let restoreScrollingElement = setScrollingElement(document.body);

    try {
      expect(applyInstantProgrammaticScroll(125)).toBe(true);
      expect(bodyScrollTopAssignments).toEqual([125]);
      expect(rootScrollTopAssignments).toEqual([]);

      restoreScrollingElement();
      restoreScrollingElement = setScrollingElement(svgElement);

      expect(applyInstantProgrammaticScroll(275)).toBe(true);
      expect(bodyScrollTopAssignments).toEqual([125]);
      expect(rootScrollTopAssignments).toEqual([275]);
    } finally {
      restoreScrollingElement();
      restoreBodyScrollTop();
      restoreRootScrollTop();
    }
  });
});
