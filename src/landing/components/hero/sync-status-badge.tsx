import { motion, AnimatePresence } from 'motion/react';

import { useReducedMotion } from '~/landing/hooks/use-reduced-motion';
import { useTranslation } from '~/landing/lib/i18n';
import { ANIMATION_DURATIONS, EASING_FUNCTIONS } from '~/shared/lib/animations';

type SyncState = 'off' | 'synced' | 'adjusting';

interface SyncStatusBadgeProps {
  state: SyncState;
}

export function SyncStatusBadge({ state }: SyncStatusBadgeProps) {
  const t = useTranslation();
  const reduceMotion = useReducedMotion();

  return (
    <div aria-live="polite" className="inline-flex items-center text-xs font-medium">
      <AnimatePresence initial={false} mode="wait">
        {state === 'synced' && (
          <motion.span
            key="synced"
            animate={{ opacity: 1, scale: 1 }}
            className="inline-flex items-center gap-1.5 text-green-700 dark:text-green-400"
            exit={{ opacity: 0, scale: 0.9 }}
            initial={{ opacity: 0, scale: 0.9 }}
            transition={{
              duration: ANIMATION_DURATIONS.fast,
              ease: EASING_FUNCTIONS.easeOut,
            }}
          >
            <span className="relative flex h-2 w-2">
              <motion.span
                animate={reduceMotion ? {} : { scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
                className="absolute inset-0 rounded-full bg-green-500/50"
                transition={
                  reduceMotion ? {} : { repeat: Infinity, duration: 2, ease: 'easeInOut' }
                }
              />
              <span className="relative h-2 w-2 rounded-full bg-green-500" />
            </span>
            {t.hero.synced}
          </motion.span>
        )}

        {state === 'adjusting' && (
          <motion.span
            key="adjusting"
            animate={{ opacity: 1, scale: 1 }}
            className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400"
            exit={{ opacity: 0, scale: 0.9 }}
            initial={{ opacity: 0, scale: 0.9 }}
            transition={{
              duration: ANIMATION_DURATIONS.fast,
              ease: EASING_FUNCTIONS.easeOut,
            }}
          >
            <span className="relative flex h-2 w-2">
              <motion.span
                animate={reduceMotion ? {} : { scale: [1, 1.4, 1], opacity: [1, 0.6, 1] }}
                className="absolute inset-0 rounded-full bg-amber-500/50"
                transition={
                  reduceMotion ? {} : { repeat: Infinity, duration: 1.2, ease: 'easeInOut' }
                }
              />
              <span className="relative h-2 w-2 rounded-full bg-amber-500" />
            </span>
            {t.hero.adjusting}
          </motion.span>
        )}

        {state === 'off' && (
          <motion.span
            key="not-synced"
            animate={{ opacity: 1, scale: 1 }}
            className="inline-flex items-center gap-1.5 text-muted-foreground"
            exit={{ opacity: 0, scale: 0.9 }}
            initial={{ opacity: 0, scale: 0.9 }}
            transition={{
              duration: ANIMATION_DURATIONS.fast,
              ease: EASING_FUNCTIONS.easeOut,
            }}
          >
            <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
            {t.hero.notSynced}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
