import * as React from 'react';

import { AnimatePresence, motion } from 'motion/react';

import { Button } from '~/shared/components/ui/button';
import { t } from '~/shared/i18n';
import {
  ANIMATION_DURATIONS,
  EASING_FUNCTIONS,
  getMotionTransition,
  prefersReducedMotion,
} from '~/shared/lib/animations';
import { cn } from '~/shared/lib/utils';
import type { ContextualHintId } from '~/shared/types/contextual-hints';

import IconMousePointer2 from '~icons/lucide/mouse-pointer-2';

const DEFAULT_CONTEXTUAL_HINT_AUTO_DISMISS_DELAY_MS = 12_000;

interface ContextualHintToastProps {
  hintId: Extract<ContextualHintId, 'manual-scroll-adjustment'>;
  shortcutLabel: string;
  onAutoDismiss: () => void;
  onHidePermanently: () => void | Promise<void>;
  autoDismissDelayMs?: number;
  className?: string;
}

export function ContextualHintToast({
  hintId,
  shortcutLabel,
  onAutoDismiss,
  onHidePermanently,
  autoDismissDelayMs = DEFAULT_CONTEXTUAL_HINT_AUTO_DISMISS_DELAY_MS,
  className,
}: ContextualHintToastProps) {
  const [isVisible, setIsVisible] = React.useState(true);
  const reducedMotion = prefersReducedMotion();
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const onAutoDismissRef = React.useRef(onAutoDismiss);
  const onHidePermanentlyRef = React.useRef(onHidePermanently);

  React.useEffect(() => {
    onAutoDismissRef.current = onAutoDismiss;
    onHidePermanentlyRef.current = onHidePermanently;
  }, [onAutoDismiss, onHidePermanently]);

  React.useEffect(() => {
    timerRef.current = setTimeout(() => {
      setIsVisible(false);
      setTimeout(() => onAutoDismissRef.current(), 300);
    }, autoDismissDelayMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [autoDismissDelayMs]);

  const handleHidePermanently = React.useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    setIsVisible(false);
    setTimeout(() => {
      void onHidePermanentlyRef.current();
    }, 200);
  }, []);

  if (hintId !== 'manual-scroll-adjustment') {
    return null;
  }

  return (
    <AnimatePresence mode="wait">
      {isVisible && (
        <motion.aside
          animate={{ opacity: 1, y: 0, scale: 1 }}
          aria-label={t('contextualHintManualScrollTitle')}
          className={cn(
            'fixed bottom-6 right-6 z-[2147483647]',
            'w-[min(360px,calc(100vw-32px))]',
            'max-h-[90vh] overflow-y-auto overscroll-contain',
            'rounded-lg border bg-background/95 backdrop-blur-xl border-border/60 shadow-2xl',
            'p-4',
            'pointer-events-auto',
            className,
          )}
          exit={reducedMotion ? undefined : { opacity: 0, y: 20, scale: 0.95 }}
          initial={reducedMotion ? false : { opacity: 0, y: 20, scale: 0.95 }}
          role="status"
          style={{
            fontSize: '16px',
            fontFamily:
              "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
            lineHeight: '1.5',
          }}
          transition={getMotionTransition(
            ANIMATION_DURATIONS.normal,
            EASING_FUNCTIONS.easeOutCubic,
          )}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center pointer-events-none">
              <IconMousePointer2 className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-medium text-foreground">
                {t('contextualHintManualScrollTitle')}
              </h4>
              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                <p>{t('contextualHintManualScrollDifferentLengths')}</p>
                <p>{t('contextualHintManualScrollShortcut', shortcutLabel)}</p>
                <p>{t('contextualHintManualScrollResume')}</p>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <Button className="w-full" size="sm" variant="outline" onClick={handleHidePermanently}>
              {t('contextualHintManualScrollHideButton')}
            </Button>
          </div>

          <div className="mt-3 h-1 bg-muted rounded-full overflow-hidden">
            <motion.div
              animate={{ scaleX: 0 }}
              className="h-full bg-primary/50 origin-left"
              initial={{ scaleX: 1 }}
              transition={{ duration: autoDismissDelayMs / 1000, ease: 'linear' }}
            />
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
