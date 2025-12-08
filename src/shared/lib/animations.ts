/**
 * Animation utilities following PRD animation guidelines
 * - Fast animations: 200-300ms default, never >1s
 * - Use ease-out for elements entering screen
 * - Hardware acceleration via transform/opacity
 * - Respect prefers-reduced-motion
 */

import type { Transition, EasingDefinition } from 'motion/react';

export const ANIMATION_DURATIONS = {
  fast: 0.15,
  normal: 0.25,
  slow: 0.3,
} as const;

export const EASING_FUNCTIONS = {
  easeOut: [0, 0, 0.2, 1],
  easeOutQuad: [0.25, 0.46, 0.45, 0.94],
  easeOutCubic: [0.215, 0.61, 0.355, 1],
  easeOutExpo: [0.19, 1, 0.22, 1],
} as const satisfies Record<string, EasingDefinition>;

export const EASING_CSS = {
  easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
  easeOutQuad: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
  easeOutCubic: 'cubic-bezier(0.215, 0.61, 0.355, 1)',
  easeOutExpo: 'cubic-bezier(0.19, 1, 0.22, 1)',
} as const;

export const PANEL_ANIMATIONS = {
  minimize: {
    duration: ANIMATION_DURATIONS.normal * 1000,
    easing: EASING_CSS.easeOutCubic,
  },
  maximize: {
    duration: ANIMATION_DURATIONS.normal * 1000,
    easing: EASING_CSS.easeOutCubic,
  },
  edgeSnap: {
    duration: ANIMATION_DURATIONS.fast * 1000,
    easing: EASING_CSS.easeOutQuad,
  },
  appear: {
    duration: ANIMATION_DURATIONS.slow * 1000,
    easing: EASING_CSS.easeOutExpo,
  },
} as const;

export const prefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

export const getTransitionStyle = (
  properties: string[],
  duration: number,
  easing: string,
): string => {
  if (prefersReducedMotion()) {
    return 'none';
  }
  return properties.map((prop) => `${prop} ${duration}ms ${easing}`).join(', ');
};

/**
 * Motion transitions with reduced motion support
 */
export const getMotionTransition = (
  duration: number = ANIMATION_DURATIONS.normal,
  ease: EasingDefinition = EASING_FUNCTIONS.easeOut,
): Transition => {
  if (prefersReducedMotion()) {
    return { duration: 0 };
  }
  return { duration, ease };
};

/**
 * Common motion animation variants
 */
export const motionVariants = {
  slideDown: {
    initial: { opacity: 0, y: -10 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 },
  },
  slideUp: {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 10 },
  },
  scale: {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 },
  },
  fade: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  },
} as const;
