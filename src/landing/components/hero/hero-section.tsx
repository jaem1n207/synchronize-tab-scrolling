import { motion, AnimatePresence } from 'motion/react';

import type { RefObject } from 'react';

import { cn } from '~/shared/lib/utils';
import { useTranslation } from '~/landing/lib/i18n';
import { ANIMATION_DURATIONS, EASING_FUNCTIONS } from '~/shared/lib/animations';
import { useScrollSync } from '~/landing/hooks/use-scroll-sync';

import { BrowserMockup } from '~/landing/components/hero/browser-mockup';
import { ScrollContent } from '~/landing/components/hero/scroll-content';
import { SyncToggleButton } from '~/landing/components/hero/sync-toggle-button';
import { ConnectionLine } from '~/landing/components/hero/connection-line';
import { SyncStatusBadge } from '~/landing/components/hero/sync-status-badge';
import { InstallButtons } from '~/landing/components/install-buttons';

const STAGGER_MS = {
  headline: 0,
  subheadline: 0.15,
  trustSignal: 0.3,
  demo: 0.4,
  controls: 0.5,
  cta: 0.6,
} as const;

const ENTRANCE_TRANSITION = {
  duration: ANIMATION_DURATIONS.slow,
  ease: EASING_FUNCTIONS.easeOutExpo,
};

export function HeroSection() {
  const t = useTranslation();

  const [isSynced, setIsSynced] = useState(false);
  const leftRef = useRef<HTMLDivElement | null>(null);
  const rightRef = useRef<HTMLDivElement | null>(null);

  useScrollSync(leftRef, rightRef, isSynced);

  const toggle = useCallback(() => setIsSynced((prev) => !prev), []);

  return (
    <section className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden pt-24 pb-12 md:pb-16">
      <div className="relative z-10 mx-auto w-full max-w-6xl px-4">
        <HeadlineBlock
          headline={t.hero.headline}
          subheadline={t.hero.subheadline}
          trustSignal={t.hero.trustSignal}
        />

        <DemoBlock isSynced={isSynced} leftRef={leftRef} rightRef={rightRef} />

        <ControlsBlock
          isSynced={isSynced}
          onToggle={toggle}
          scrollHint={isSynced ? t.hero.scrollHintSynced : t.hero.scrollHint}
          isSyncedForHint={isSynced}
        />

        <motion.div
          className="mt-8 flex justify-center md:mt-10"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...ENTRANCE_TRANSITION, delay: STAGGER_MS.cta }}
        >
          <InstallButtons variant="hero" />
        </motion.div>
      </div>
    </section>
  );
}

interface HeadlineBlockProps {
  headline: string;
  subheadline: string;
  trustSignal: string;
}

function HeadlineBlock({ headline, subheadline, trustSignal }: HeadlineBlockProps) {
  return (
    <div className="mb-8 text-center md:mb-12">
      <motion.h1
        className="text-4xl font-bold tracking-tight text-foreground md:text-5xl lg:text-6xl"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          type: 'spring',
          stiffness: 100,
          damping: 15,
          delay: STAGGER_MS.headline,
        }}
      >
        {headline}
      </motion.h1>

      <motion.p
        className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground md:mt-5 md:text-xl"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...ENTRANCE_TRANSITION, delay: STAGGER_MS.subheadline }}
      >
        {subheadline}
      </motion.p>

      <motion.p
        className="mt-3 text-sm text-muted-foreground/70"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ ...ENTRANCE_TRANSITION, delay: STAGGER_MS.trustSignal }}
      >
        {trustSignal}
      </motion.p>
    </div>
  );
}

interface DemoBlockProps {
  isSynced: boolean;
  leftRef: RefObject<HTMLDivElement | null>;
  rightRef: RefObject<HTMLDivElement | null>;
}

function DemoBlock({ isSynced, leftRef, rightRef }: DemoBlockProps) {
  return (
    <motion.div
      className="mb-8"
      initial={{ opacity: 0, scale: 0.97, y: 16 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ ...ENTRANCE_TRANSITION, delay: STAGGER_MS.demo }}
    >
      <div className="flex flex-col items-center gap-4 md:flex-row md:gap-0">
        <BrowserMockup
          title="article.en"
          url="example.com/article"
          isActive={isSynced}
          scrollRef={leftRef}
          className="w-full md:flex-1"
        >
          <ScrollContent variant="en" />
        </BrowserMockup>

        <ConnectionLine isSynced={isSynced} />

        <BrowserMockup
          title="article.ko"
          url="example.com/ko/article"
          isActive={isSynced}
          scrollRef={rightRef}
          className="w-full md:flex-1"
        >
          <ScrollContent variant="ko" />
        </BrowserMockup>
      </div>
    </motion.div>
  );
}

interface ControlsBlockProps {
  isSynced: boolean;
  onToggle: () => void;
  scrollHint: string;
  isSyncedForHint: boolean;
}

function ControlsBlock({ isSynced, onToggle, scrollHint, isSyncedForHint }: ControlsBlockProps) {
  return (
    <motion.div
      className="flex flex-col items-center gap-3 text-center"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...ENTRANCE_TRANSITION, delay: STAGGER_MS.controls }}
    >
      <SyncStatusBadge isSynced={isSynced} />
      <SyncToggleButton isSynced={isSynced} onToggle={onToggle} />
      <ScrollHint text={scrollHint} isSynced={isSyncedForHint} />
    </motion.div>
  );
}

interface ScrollHintProps {
  text: string;
  isSynced: boolean;
}

function ScrollHint({ text, isSynced }: ScrollHintProps) {
  return (
    <div className="h-5" aria-live="polite">
      <AnimatePresence mode="wait">
        <motion.span
          key={isSynced ? 'synced' : 'not-synced'}
          className={cn('inline-flex items-center gap-1 text-xs text-muted-foreground')}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{
            duration: ANIMATION_DURATIONS.fast,
            ease: EASING_FUNCTIONS.easeOut,
          }}
        >
          {text}
          {!isSynced && (
            <motion.span
              className="inline-block"
              animate={{ y: [0, 3, 0] }}
              transition={{
                repeat: Infinity,
                duration: 1.4,
                ease: 'easeInOut',
              }}
              aria-hidden="true"
            >
              ↓
            </motion.span>
          )}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
