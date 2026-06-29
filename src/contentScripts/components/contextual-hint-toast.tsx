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

import IconLink2 from '~icons/lucide/link-2';
import IconMousePointer2 from '~icons/lucide/mouse-pointer-2';

const DEFAULT_CONTEXTUAL_HINT_AUTO_DISMISS_DELAY_MS = 12_000;

type WebpageOverlayHintId = Extract<
  ContextualHintId,
  'manual-scroll-adjustment' | 'page-change-synced' | 'keep-website-path-synced'
>;

interface ContextualHintToastProps {
  hintId: WebpageOverlayHintId;
  shortcutLabel?: string;
  onAutoDismiss: () => void;
  onHidePermanently: () => void | Promise<void>;
  onOpenSettings?: () => void;
  autoDismissDelayMs?: number;
  className?: string;
}

interface HintCopy {
  titleKey:
    | 'contextualHintManualScrollTitle'
    | 'contextualHintPageChangeSyncedTitle'
    | 'contextualHintKeepWebsitePathSyncedTitle';
  bodyKeys: Array<
    | 'contextualHintManualScrollDifferentLengths'
    | 'contextualHintManualScrollResume'
    | 'contextualHintPageChangeSyncedBody'
    | 'contextualHintKeepWebsitePathSyncedBody'
  >;
}

const URL_SYNC_HINT_IDS = new Set<WebpageOverlayHintId>([
  'page-change-synced',
  'keep-website-path-synced',
]);

const HINT_COPY: Record<WebpageOverlayHintId, HintCopy> = {
  'manual-scroll-adjustment': {
    titleKey: 'contextualHintManualScrollTitle',
    bodyKeys: ['contextualHintManualScrollDifferentLengths'],
  },
  'page-change-synced': {
    titleKey: 'contextualHintPageChangeSyncedTitle',
    bodyKeys: ['contextualHintPageChangeSyncedBody'],
  },
  'keep-website-path-synced': {
    titleKey: 'contextualHintKeepWebsitePathSyncedTitle',
    bodyKeys: ['contextualHintKeepWebsitePathSyncedBody'],
  },
};

export function ContextualHintToast({
  hintId,
  shortcutLabel,
  onAutoDismiss,
  onHidePermanently,
  onOpenSettings,
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

  const closeTemporarily = React.useCallback((afterClose: () => void) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    setIsVisible(false);
    setTimeout(afterClose, 200);
  }, []);

  const handleTemporaryDismiss = React.useCallback(() => {
    closeTemporarily(() => onAutoDismissRef.current());
  }, [closeTemporarily]);

  const handleHidePermanently = React.useCallback(() => {
    closeTemporarily(() => {
      void onHidePermanentlyRef.current();
    });
  }, [closeTemporarily]);

  const handleOpenSettings = React.useCallback(() => {
    closeTemporarily(() => {
      onOpenSettings?.();
    });
  }, [closeTemporarily, onOpenSettings]);

  const isUrlSyncHint = URL_SYNC_HINT_IDS.has(hintId);
  const copy = HINT_COPY[hintId];
  const title = t(copy.titleKey);

  return (
    <AnimatePresence mode="wait">
      {isVisible && (
        <motion.aside
          animate={{ opacity: 1, y: 0, scale: 1 }}
          aria-label={title}
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
              {isUrlSyncHint ? (
                <IconLink2 className="w-5 h-5 text-primary" />
              ) : (
                <IconMousePointer2 className="w-5 h-5 text-primary" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-medium text-foreground">{title}</h4>
              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                {copy.bodyKeys.map((key) => (
                  <p key={key}>{t(key)}</p>
                ))}
                {hintId === 'manual-scroll-adjustment' && shortcutLabel && (
                  <>
                    <p>{t('contextualHintManualScrollShortcut', shortcutLabel)}</p>
                    <p>{t('contextualHintManualScrollResume')}</p>
                  </>
                )}
              </div>
            </div>
          </div>

          {isUrlSyncHint ? (
            <div className="mt-4 grid gap-2">
              <Button className="w-full" size="sm" onClick={handleOpenSettings}>
                {t('contextualHintChangeSettingAction')}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" variant="outline" onClick={handleTemporaryDismiss}>
                  {t('contextualHintShowLaterAction')}
                </Button>
                <Button size="sm" variant="ghost" onClick={handleHidePermanently}>
                  {t('contextualHintHideAction')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-4">
              <Button
                className="w-full"
                size="sm"
                variant="outline"
                onClick={handleHidePermanently}
              >
                {t('contextualHintManualScrollHideButton')}
              </Button>
            </div>
          )}

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
