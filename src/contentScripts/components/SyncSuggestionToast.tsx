import * as React from 'react';

import { Link2, X, Plus } from 'lucide-react';
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
import type { SyncSuggestionMessage, AddTabToSyncMessage } from '~/shared/types/messages';

const AUTO_DISMISS_DELAY_MS = 10_000;

interface SyncSuggestionToastProps {
  suggestion: SyncSuggestionMessage;
  onAccept: () => void;
  onReject: () => void;
  className?: string;
}

interface AddTabToastProps {
  suggestion: AddTabToSyncMessage;
  onAccept: () => void;
  onReject: () => void;
  className?: string;
}

/**
 * Toast component for suggesting sync of same-URL tabs
 * Shows when auto-sync option is enabled and multiple tabs with same URL are detected
 */
export function SyncSuggestionToast({
  suggestion,
  onAccept,
  onReject,
  className,
}: SyncSuggestionToastProps) {
  const [isVisible, setIsVisible] = React.useState(true);
  const reducedMotion = prefersReducedMotion();
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Issue 10 Fix: Use refs for callbacks to avoid timer restarts on parent re-render
  // This keeps the timer and progress bar animation in sync
  const onRejectRef = React.useRef(onReject);
  const onAcceptRef = React.useRef(onAccept);

  // Update refs when callbacks change (doesn't trigger re-render or timer restart)
  React.useEffect(() => {
    onRejectRef.current = onReject;
    onAcceptRef.current = onAccept;
  }, [onReject, onAccept]);

  // Auto-dismiss after 10 seconds (treats as rejection)
  // Empty dependency array ensures timer runs exactly once on mount
  React.useEffect(() => {
    timerRef.current = setTimeout(() => {
      setIsVisible(false);
      // Small delay before calling onReject to allow exit animation
      setTimeout(() => onRejectRef.current(), 300);
    }, AUTO_DISMISS_DELAY_MS);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleAccept = React.useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    setIsVisible(false);
    setTimeout(() => onAcceptRef.current(), 200);
  }, []);

  const handleReject = React.useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    setIsVisible(false);
    setTimeout(() => onRejectRef.current(), 200);
  }, []);

  return (
    <AnimatePresence mode="wait">
      {isVisible && (
        <motion.div
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className={cn(
            'fixed bottom-6 right-6 z-[2147483647]',
            'max-w-sm w-full',
            'rounded-lg border bg-background/95 backdrop-blur-xl border-border/60 shadow-2xl',
            'p-4',
            'pointer-events-auto',
            className,
          )}
          exit={reducedMotion ? undefined : { opacity: 0, y: 20, scale: 0.95 }}
          initial={reducedMotion ? false : { opacity: 0, y: 20, scale: 0.95 }}
          transition={getMotionTransition(
            ANIMATION_DURATIONS.normal,
            EASING_FUNCTIONS.easeOutCubic,
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center pointer-events-none">
              <Link2 className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0 pointer-events-none">
              {/* Line 1: Title (no truncation) */}
              <h4 className="font-medium text-sm text-foreground">
                {t('foundTabsWithSameUrl', String(suggestion.tabCount))}
              </h4>
              {/* Line 2: Tab titles (no truncation) */}
              <p className="mt-1 text-xs text-muted-foreground">
                {suggestion.tabTitles.slice(0, 2).join(', ')}
                {suggestion.tabTitles.length > 2 && ` +${suggestion.tabTitles.length - 2}`}
              </p>
              {/* Line 3+: URL (no truncation, wrap to multiple lines) */}
              <p className="mt-1 text-xs text-muted-foreground/70 break-all">
                {suggestion.normalizedUrl}
              </p>
            </div>
            <button
              aria-label={t('dismiss')}
              className="flex-shrink-0 p-1 rounded-md hover:bg-muted transition-colors"
              type="button"
              onClick={handleReject}
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          {/* Actions */}
          <div className="mt-4 flex gap-2">
            <Button className="flex-1" size="sm" variant="default" onClick={handleAccept}>
              {t('startSyncButton')}
            </Button>
            <Button className="flex-1" size="sm" variant="outline" onClick={handleReject}>
              {t('notNowButton')}
            </Button>
          </div>

          {/* Progress bar for auto-dismiss */}
          <div className="mt-3 h-1 bg-muted rounded-full overflow-hidden">
            <motion.div
              animate={{ scaleX: 0 }}
              className="h-full bg-primary/50 origin-left"
              initial={{ scaleX: 1 }}
              transition={{ duration: AUTO_DISMISS_DELAY_MS / 1000, ease: 'linear' }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Toast component for suggesting adding a new tab to existing sync
 * Shows when a new tab with same URL is detected while manual sync is active
 */
export function AddTabToSyncToast({ suggestion, onAccept, onReject, className }: AddTabToastProps) {
  const [isVisible, setIsVisible] = React.useState(true);
  const reducedMotion = prefersReducedMotion();
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Issue 10 Fix: Use refs for callbacks to avoid timer restarts on parent re-render
  // This keeps the timer and progress bar animation in sync
  const onRejectRef = React.useRef(onReject);
  const onAcceptRef = React.useRef(onAccept);

  // Update refs when callbacks change (doesn't trigger re-render or timer restart)
  React.useEffect(() => {
    onRejectRef.current = onReject;
    onAcceptRef.current = onAccept;
  }, [onReject, onAccept]);

  // Auto-dismiss after 10 seconds (treats as rejection)
  // Empty dependency array ensures timer runs exactly once on mount
  React.useEffect(() => {
    timerRef.current = setTimeout(() => {
      setIsVisible(false);
      setTimeout(() => onRejectRef.current(), 300);
    }, AUTO_DISMISS_DELAY_MS);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleAccept = React.useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    setIsVisible(false);
    setTimeout(() => onAcceptRef.current(), 200);
  }, []);

  const handleReject = React.useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    setIsVisible(false);
    setTimeout(() => onRejectRef.current(), 200);
  }, []);

  return (
    <AnimatePresence mode="wait">
      {isVisible && (
        <motion.div
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className={cn(
            'fixed bottom-6 right-6 z-[2147483647]',
            'max-w-sm w-full',
            'rounded-lg border bg-background/95 backdrop-blur-xl border-border/60 shadow-2xl',
            'p-4',
            'pointer-events-auto',
            className,
          )}
          exit={reducedMotion ? undefined : { opacity: 0, y: 20, scale: 0.95 }}
          initial={reducedMotion ? false : { opacity: 0, y: 20, scale: 0.95 }}
          transition={getMotionTransition(
            ANIMATION_DURATIONS.normal,
            EASING_FUNCTIONS.easeOutCubic,
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center pointer-events-none">
              <Plus className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0 pointer-events-none">
              {/* Line 1: Title (no truncation) */}
              <h4 className="font-medium text-sm text-foreground">
                {t('newTabSameUrl', suggestion.tabTitle)}
              </h4>
              {/* Line 2: Tab title (no truncation) */}
              <p className="mt-1 text-xs text-muted-foreground">{suggestion.tabTitle}</p>
              {/* Line 3+: URL (no truncation, wrap to multiple lines) */}
              <p className="mt-1 text-xs text-muted-foreground/70 break-all">
                {suggestion.normalizedUrl}
              </p>
              {/* Warning about manual offsets reset */}
              {suggestion.hasManualOffsets && (
                <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                  {t('warningResetScrollOffsets')}
                </p>
              )}
            </div>
            <button
              aria-label={t('dismiss')}
              className="flex-shrink-0 p-1 rounded-md hover:bg-muted transition-colors"
              type="button"
              onClick={handleReject}
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          {/* Actions */}
          <div className="mt-4 flex gap-2">
            <Button className="flex-1" size="sm" variant="default" onClick={handleAccept}>
              {t('addTabButton')}
            </Button>
            <Button className="flex-1" size="sm" variant="outline" onClick={handleReject}>
              {t('skipButton')}
            </Button>
          </div>

          {/* Progress bar for auto-dismiss */}
          <div className="mt-3 h-1 bg-muted rounded-full overflow-hidden">
            <motion.div
              animate={{ scaleX: 0 }}
              className="h-full bg-primary/50 origin-left"
              initial={{ scaleX: 1 }}
              transition={{ duration: AUTO_DISMISS_DELAY_MS / 1000, ease: 'linear' }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
