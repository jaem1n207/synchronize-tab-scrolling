import { motion, AnimatePresence } from 'motion/react';

import { useTranslation } from '~/landing/lib/i18n';
import { ANIMATION_DURATIONS, EASING_FUNCTIONS } from '~/shared/lib/animations';

interface SyncStatusBadgeProps {
  isSynced: boolean;
}

export function SyncStatusBadge({ isSynced }: SyncStatusBadgeProps) {
  const t = useTranslation();

  return (
    <div className="inline-flex items-center text-xs font-medium">
      <AnimatePresence mode="wait" initial={false}>
        {isSynced ? (
          <motion.span
            key="synced"
            className="inline-flex items-center gap-1.5 text-green-600 dark:text-green-400"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{
              duration: ANIMATION_DURATIONS.fast,
              ease: EASING_FUNCTIONS.easeOut,
            }}
          >
            <span className="relative flex h-2 w-2">
              <motion.span
                className="absolute inset-0 rounded-full bg-green-500/50"
                animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
                transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
              />
              <span className="relative h-2 w-2 rounded-full bg-green-500" />
            </span>
            {t.hero.synced}
          </motion.span>
        ) : (
          <motion.span
            key="not-synced"
            className="inline-flex items-center gap-1.5 text-muted-foreground"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
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
