/// <reference types="vitest/globals" />
import '@testing-library/jest-dom/vitest';
import { MotionGlobalConfig } from 'motion/react';

MotionGlobalConfig.skipAnimations = true;

class MockIntersectionObserver implements IntersectionObserver {
  readonly root: Element | null = null;
  readonly rootMargin: string = '';
  readonly thresholds: ReadonlyArray<number> = [];
  private callback: IntersectionObserverCallback;
  private targets = new Set<Element>();

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    MockIntersectionObserver.instances.push(this);
  }

  observe(target: Element): void {
    this.targets.add(target);
  }
  unobserve(target: Element): void {
    this.targets.delete(target);
  }
  disconnect(): void {
    this.targets.clear();
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  triggerIntersection(isIntersecting: boolean): void {
    const target = this.targets.values().next().value ?? document.createElement('div');
    const entry = {
      isIntersecting,
      intersectionRatio: isIntersecting ? 1 : 0,
      boundingClientRect: {} as DOMRectReadOnly,
      intersectionRect: {} as DOMRectReadOnly,
      rootBounds: null,
      target,
      time: Date.now(),
    };
    this.callback([entry], this);
  }

  static instances: MockIntersectionObserver[] = [];
  static reset(): void {
    MockIntersectionObserver.instances = [];
  }
}

vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

Object.defineProperty(window, 'scrollY', {
  writable: true,
  value: 0,
});

beforeEach(() => {
  MockIntersectionObserver.reset();
  localStorageMock.clear();
  vi.clearAllMocks();
});

export { MockIntersectionObserver };
