/**
 * Animation utilities following PRD animation guidelines
 * - Fast animations: 200-300ms default, never >1s
 * - Use ease-out for elements entering screen
 * - Hardware acceleration via transform/opacity
 * - Respect prefers-reduced-motion
 */

export const ANIMATION_DURATIONS = {
  fast: 200,
  normal: 250,
  slow: 300,
} as const;

export const EASING_FUNCTIONS = {
  easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
  easeOutQuad: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
  easeOutCubic: 'cubic-bezier(0.215, 0.61, 0.355, 1)',
  easeOutExpo: 'cubic-bezier(0.19, 1, 0.22, 1)',
} as const;

export const PANEL_ANIMATIONS = {
  minimize: {
    duration: ANIMATION_DURATIONS.normal,
    easing: EASING_FUNCTIONS.easeOutCubic,
  },
  maximize: {
    duration: ANIMATION_DURATIONS.normal,
    easing: EASING_FUNCTIONS.easeOutCubic,
  },
  edgeSnap: {
    duration: ANIMATION_DURATIONS.fast,
    easing: EASING_FUNCTIONS.easeOutQuad,
  },
  appear: {
    duration: ANIMATION_DURATIONS.slow,
    easing: EASING_FUNCTIONS.easeOutExpo,
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
