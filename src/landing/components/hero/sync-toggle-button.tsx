import { motion, AnimatePresence } from 'motion/react';

import { useTranslation } from '~/landing/lib/i18n';
import { ANIMATION_DURATIONS, EASING_FUNCTIONS } from '~/shared/lib/animations';
import { cn } from '~/shared/lib/utils';

import IconCheck from '~icons/lucide/check';
import IconLink2 from '~icons/lucide/link-2';

interface SyncToggleButtonProps {
  isSynced: boolean;
  onToggle: () => void;
}

export function SyncToggleButton({ isSynced, onToggle }: SyncToggleButtonProps) {
  const t = useTranslation();

  return (
    <div className="relative inline-flex">
      {!isSynced && (
        <motion.span
          animate={{ scale: [1, 1.15, 1], opacity: [0.6, 0, 0.6] }}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-full bg-primary/30"
          transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}
        />
      )}

      <motion.button
        layout
        aria-pressed={isSynced}
        className={cn(
          'relative inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold',
          'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          isSynced
            ? 'bg-green-700 text-white hover:bg-green-800 dark:bg-green-700 dark:hover:bg-green-600'
            : 'bg-primary text-primary-foreground hover:bg-primary/90',
        )}
        data-umami-event="hero-sync-toggle"
        type="button"
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.96 }}
        onClick={onToggle}
      >
        <AnimatePresence initial={false} mode="wait">
          {isSynced ? (
            <motion.span
              key="syncing"
              animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center gap-2"
              exit={{ opacity: 0, y: -8 }}
              initial={{ opacity: 0, y: 8 }}
              transition={{
                duration: ANIMATION_DURATIONS.fast,
                ease: EASING_FUNCTIONS.easeOut,
              }}
            >
              <IconCheck className="h-4 w-4" />
              {t.hero.syncing}
              <motion.span
                animate={{ opacity: [1, 0.3, 1] }}
                className="h-1.5 w-1.5 rounded-full bg-white"
                transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }}
              />
            </motion.span>
          ) : (
            <motion.span
              key="enable"
              animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center gap-2"
              exit={{ opacity: 0, y: -8 }}
              initial={{ opacity: 0, y: 8 }}
              transition={{
                duration: ANIMATION_DURATIONS.fast,
                ease: EASING_FUNCTIONS.easeOut,
              }}
            >
              <IconLink2 className="h-4 w-4" />
              {t.hero.enableSync}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  );
}
