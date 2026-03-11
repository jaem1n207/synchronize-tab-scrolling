import type { ReactNode, RefObject } from 'react';

import { motion } from 'motion/react';

import { ANIMATION_DURATIONS, EASING_FUNCTIONS } from '~/shared/lib/animations';
import { cn } from '~/shared/lib/utils';

import IconLock from '~icons/lucide/lock';

interface BrowserMockupProps {
  title: string;
  url: string;
  isActive?: boolean;
  children: ReactNode;
  scrollRef?: RefObject<HTMLDivElement | null>;
  className?: string;
}

export function BrowserMockup({
  title,
  url,
  isActive = false,
  children,
  scrollRef,
  className,
}: BrowserMockupProps) {
  return (
    <div className={cn('relative', className)}>
      <motion.div
        animate={{ opacity: isActive ? 0.8 : 0 }}
        aria-hidden="true"
        className="pointer-events-none absolute -inset-1 rounded-2xl bg-primary/20 blur-xl"
        initial={false}
        transition={{
          duration: ANIMATION_DURATIONS.slow,
          ease: EASING_FUNCTIONS.easeOut,
        }}
      />

      <div
        className={cn(
          'relative overflow-hidden rounded-xl border border-border bg-card shadow-lg transition-shadow duration-300',
          isActive && 'ring-2 ring-primary/50',
        )}
      >
        <div className="flex items-center gap-2 border-b border-border/60 bg-muted/40 px-3 py-2">
          <div aria-hidden="true" className="flex gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: '#FF5F57' }} />
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: '#FEBC2E' }} />
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: '#28C840' }} />
          </div>

          <div className="ml-2 inline-flex items-center rounded-t-md border-b-2 border-primary/50 bg-background/70 px-3 py-1">
            <span className="max-w-32 truncate text-xs font-medium text-foreground/80">
              {title}
            </span>
          </div>
        </div>

        <div className="border-b border-border/60 bg-muted/20 px-3 py-1.5">
          <div className="flex items-center gap-1.5 rounded-md bg-muted/70 px-2.5 py-1">
            <IconLock className="h-3 w-3 shrink-0 text-muted-foreground/50" />
            <span className="truncate text-xs text-foreground/70">{url}</span>
          </div>
        </div>

        <div
          ref={scrollRef}
          className={cn(
            'h-[320px] overflow-y-auto md:h-[400px]',
            '[&::-webkit-scrollbar]:w-1.5',
            '[&::-webkit-scrollbar-track]:bg-transparent',
            '[&::-webkit-scrollbar-thumb]:rounded-full',
            '[&::-webkit-scrollbar-thumb]:bg-border',
            '[&::-webkit-scrollbar-thumb:hover]:bg-muted-foreground/30',
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
