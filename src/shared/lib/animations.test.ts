import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ANIMATION_DURATIONS,
  EASING_FUNCTIONS,
  EASING_CSS,
  PANEL_ANIMATIONS,
  prefersReducedMotion,
  getTransitionStyle,
  getMotionTransition,
  motionVariants,
} from './animations';

describe('animations', () => {
  describe('constants', () => {
    it('defines animation durations in seconds', () => {
      expect(ANIMATION_DURATIONS.fast).toBe(0.15);
      expect(ANIMATION_DURATIONS.normal).toBe(0.25);
      expect(ANIMATION_DURATIONS.slow).toBe(0.3);
    });

    it('defines easing functions as cubic bezier arrays', () => {
      expect(EASING_FUNCTIONS.easeOut).toEqual([0, 0, 0.2, 1]);
      expect(EASING_FUNCTIONS.easeOutQuad).toHaveLength(4);
      expect(EASING_FUNCTIONS.easeOutCubic).toHaveLength(4);
      expect(EASING_FUNCTIONS.easeOutExpo).toHaveLength(4);
    });

    it('defines CSS easing strings as cubic-bezier format', () => {
      expect(EASING_CSS.easeOut).toMatch(/^cubic-bezier\(.+\)$/);
      expect(EASING_CSS.easeOutQuad).toMatch(/^cubic-bezier\(.+\)$/);
      expect(EASING_CSS.easeOutCubic).toMatch(/^cubic-bezier\(.+\)$/);
      expect(EASING_CSS.easeOutExpo).toMatch(/^cubic-bezier\(.+\)$/);
    });

    it('derives panel animation durations from ANIMATION_DURATIONS (in ms)', () => {
      expect(PANEL_ANIMATIONS.minimize.duration).toBe(ANIMATION_DURATIONS.normal * 1000);
      expect(PANEL_ANIMATIONS.maximize.duration).toBe(ANIMATION_DURATIONS.normal * 1000);
      expect(PANEL_ANIMATIONS.edgeSnap.duration).toBe(ANIMATION_DURATIONS.fast * 1000);
      expect(PANEL_ANIMATIONS.appear.duration).toBe(ANIMATION_DURATIONS.slow * 1000);
    });

    it('uses appropriate CSS easing for each panel animation', () => {
      expect(PANEL_ANIMATIONS.minimize.easing).toBe(EASING_CSS.easeOutCubic);
      expect(PANEL_ANIMATIONS.maximize.easing).toBe(EASING_CSS.easeOutCubic);
      expect(PANEL_ANIMATIONS.edgeSnap.easing).toBe(EASING_CSS.easeOutQuad);
      expect(PANEL_ANIMATIONS.appear.easing).toBe(EASING_CSS.easeOutExpo);
    });
  });

  describe('motionVariants', () => {
    it('defines slideDown with correct initial/animate/exit states', () => {
      expect(motionVariants.slideDown.initial).toEqual({ opacity: 0, y: -10 });
      expect(motionVariants.slideDown.animate).toEqual({ opacity: 1, y: 0 });
      expect(motionVariants.slideDown.exit).toEqual({ opacity: 0, y: -10 });
    });

    it('defines slideUp with correct states', () => {
      expect(motionVariants.slideUp.initial).toEqual({ opacity: 0, y: 10 });
      expect(motionVariants.slideUp.animate).toEqual({ opacity: 1, y: 0 });
      expect(motionVariants.slideUp.exit).toEqual({ opacity: 0, y: 10 });
    });

    it('defines scale variant with correct states', () => {
      expect(motionVariants.scale.initial).toEqual({ opacity: 0, scale: 0.95 });
      expect(motionVariants.scale.animate).toEqual({ opacity: 1, scale: 1 });
      expect(motionVariants.scale.exit).toEqual({ opacity: 0, scale: 0.95 });
    });

    it('defines fade variant with opacity only', () => {
      expect(motionVariants.fade.initial).toEqual({ opacity: 0 });
      expect(motionVariants.fade.animate).toEqual({ opacity: 1 });
      expect(motionVariants.fade.exit).toEqual({ opacity: 0 });
    });
  });

  describe('prefersReducedMotion', () => {
    let matchMediaSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      matchMediaSpy = vi.fn();
      Object.defineProperty(window, 'matchMedia', {
        value: matchMediaSpy,
        configurable: true,
        writable: true,
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('returns true when user prefers reduced motion', () => {
      matchMediaSpy.mockReturnValue({ matches: true });
      expect(prefersReducedMotion()).toBe(true);
      expect(matchMediaSpy).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
    });

    it('returns false when user does not prefer reduced motion', () => {
      matchMediaSpy.mockReturnValue({ matches: false });
      expect(prefersReducedMotion()).toBe(false);
    });
  });

  describe('getTransitionStyle', () => {
    let matchMediaSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      matchMediaSpy = vi.fn();
      Object.defineProperty(window, 'matchMedia', {
        value: matchMediaSpy,
        configurable: true,
        writable: true,
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('returns transition string for single property', () => {
      matchMediaSpy.mockReturnValue({ matches: false });
      const result = getTransitionStyle(['transform'], 250, EASING_CSS.easeOutCubic);
      expect(result).toBe(`transform 250ms ${EASING_CSS.easeOutCubic}`);
    });

    it('returns comma-separated transition for multiple properties', () => {
      matchMediaSpy.mockReturnValue({ matches: false });
      const result = getTransitionStyle(['transform', 'opacity'], 200, EASING_CSS.easeOut);
      expect(result).toBe(
        `transform 200ms ${EASING_CSS.easeOut}, opacity 200ms ${EASING_CSS.easeOut}`,
      );
    });

    it('returns "none" when user prefers reduced motion', () => {
      matchMediaSpy.mockReturnValue({ matches: true });
      const result = getTransitionStyle(['transform', 'opacity'], 200, EASING_CSS.easeOut);
      expect(result).toBe('none');
    });

    it('handles empty properties array', () => {
      matchMediaSpy.mockReturnValue({ matches: false });
      const result = getTransitionStyle([], 200, EASING_CSS.easeOut);
      expect(result).toBe('');
    });
  });

  describe('getMotionTransition', () => {
    let matchMediaSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      matchMediaSpy = vi.fn();
      Object.defineProperty(window, 'matchMedia', {
        value: matchMediaSpy,
        configurable: true,
        writable: true,
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('returns transition with default values when no arguments', () => {
      matchMediaSpy.mockReturnValue({ matches: false });
      const result = getMotionTransition();
      expect(result).toEqual({
        duration: ANIMATION_DURATIONS.normal,
        ease: EASING_FUNCTIONS.easeOut,
      });
    });

    it('returns transition with custom duration and ease', () => {
      matchMediaSpy.mockReturnValue({ matches: false });
      const result = getMotionTransition(0.5, EASING_FUNCTIONS.easeOutExpo);
      expect(result).toEqual({
        duration: 0.5,
        ease: EASING_FUNCTIONS.easeOutExpo,
      });
    });

    it('returns zero-duration transition when user prefers reduced motion', () => {
      matchMediaSpy.mockReturnValue({ matches: true });
      const result = getMotionTransition(0.5, EASING_FUNCTIONS.easeOutExpo);
      expect(result).toEqual({ duration: 0 });
    });

    it('respects reduced motion even with default arguments', () => {
      matchMediaSpy.mockReturnValue({ matches: true });
      const result = getMotionTransition();
      expect(result).toEqual({ duration: 0 });
    });
  });
});
