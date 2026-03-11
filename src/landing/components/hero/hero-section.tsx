import type { RefObject } from 'react';

import { motion, AnimatePresence } from 'motion/react';

import { BrowserMockup } from '~/landing/components/hero/browser-mockup';
import { ConnectionLine } from '~/landing/components/hero/connection-line';
import { ScrollContent } from '~/landing/components/hero/scroll-content';
import { SyncStatusBadge } from '~/landing/components/hero/sync-status-badge';
import { SyncToggleButton } from '~/landing/components/hero/sync-toggle-button';
import { InstallButtons } from '~/landing/components/install-buttons';
import { useModifierKey } from '~/landing/hooks/use-platform';
import { useScrollSync } from '~/landing/hooks/use-scroll-sync';
import { useTranslation } from '~/landing/lib/i18n';
import { ANIMATION_DURATIONS, EASING_FUNCTIONS } from '~/shared/lib/animations';
import { cn } from '~/shared/lib/utils';

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
  const modifier = useModifierKey();

  const [isSynced, setIsSynced] = useState(false);
  const [isAdjusting, setIsAdjusting] = useState(false);
  const leftRef = useRef<HTMLDivElement | null>(null);
  const rightRef = useRef<HTMLDivElement | null>(null);

  useScrollSync({ leftRef, rightRef, isSynced, isAdjusting });

  const toggle = useCallback(() => {
    setIsSynced((prev) => !prev);
    setIsAdjusting(false);
  }, []);

  useEffect(() => {
    if (!isSynced) {
      setIsAdjusting(false);
      return;
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Alt' || e.key === 'Option') {
        e.preventDefault();
        setIsAdjusting(true);
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.key === 'Alt' || e.key === 'Option') {
        setIsAdjusting(false);
      }
    }

    function onBlur() {
      setIsAdjusting(false);
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [isSynced]);

  const syncState = !isSynced ? 'off' : isAdjusting ? 'adjusting' : 'synced';

  const scrollHint = !isSynced
    ? t.hero.scrollHint
    : isAdjusting
      ? t.hero.scrollHintAdjusting.replace('{modifier}', modifier.symbol)
      : t.hero.scrollHintSynced;

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
          isAdjusting={isAdjusting}
          isSynced={isSynced}
          modifierSymbol={modifier.symbol}
          scrollHint={scrollHint}
          syncState={syncState}
          onToggle={toggle}
        />

        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="mt-8 flex justify-center md:mt-10"
          initial={{ opacity: 0, y: 12 }}
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
        animate={{ opacity: 1, y: 0 }}
        className="text-4xl font-bold tracking-tight text-foreground md:text-5xl lg:text-6xl"
        initial={{ opacity: 0, y: 20 }}
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
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground md:mt-5 md:text-xl"
        initial={{ opacity: 0, y: 12 }}
        transition={{ ...ENTRANCE_TRANSITION, delay: STAGGER_MS.subheadline }}
      >
        {subheadline}
      </motion.p>

      <motion.p
        animate={{ opacity: 1 }}
        className="mt-3 text-sm text-muted-foreground/70"
        initial={{ opacity: 0 }}
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
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className="mb-8"
      initial={{ opacity: 0, scale: 0.97, y: 16 }}
      transition={{ ...ENTRANCE_TRANSITION, delay: STAGGER_MS.demo }}
    >
      <div className="flex flex-col items-center gap-4 md:flex-row md:gap-0">
        <BrowserMockup
          className="w-full md:flex-1"
          isActive={isSynced}
          scrollRef={leftRef}
          title="article.en"
          url="example.com/article"
        >
          <ScrollContent variant="en" />
        </BrowserMockup>

        <ConnectionLine isSynced={isSynced} />

        <BrowserMockup
          className="w-full md:flex-1"
          isActive={isSynced}
          scrollRef={rightRef}
          title="article.ko"
          url="example.com/ko/article"
        >
          <ScrollContent variant="ko" />
        </BrowserMockup>
      </div>
    </motion.div>
  );
}

interface ControlsBlockProps {
  syncState: 'off' | 'synced' | 'adjusting';
  isSynced: boolean;
  isAdjusting: boolean;
  onToggle: () => void;
  scrollHint: string;
  modifierSymbol: string;
}

function ControlsBlock({
  syncState,
  isSynced,
  isAdjusting,
  onToggle,
  scrollHint,
  modifierSymbol,
}: ControlsBlockProps) {
  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center gap-3 text-center"
      initial={{ opacity: 0, y: 10 }}
      transition={{ ...ENTRANCE_TRANSITION, delay: STAGGER_MS.controls }}
    >
      <SyncStatusBadge state={syncState} />
      <SyncToggleButton isSynced={isSynced} onToggle={onToggle} />
      <ScrollHint isSynced={isSynced} text={scrollHint} />
      {isSynced && <ModifierHint modifierSymbol={modifierSymbol} visible={!isAdjusting} />}
    </motion.div>
  );
}

interface ScrollHintProps {
  text: string;
  isSynced: boolean;
}

function ScrollHint({ text, isSynced }: ScrollHintProps) {
  return (
    <div aria-live="polite" className="h-5">
      <AnimatePresence mode="wait">
        <motion.span
          key={isSynced ? 'synced' : 'not-synced'}
          animate={{ opacity: 1, y: 0 }}
          className={cn('inline-flex items-center gap-1 text-xs text-muted-foreground')}
          exit={{ opacity: 0, y: -4 }}
          initial={{ opacity: 0, y: 4 }}
          transition={{
            duration: ANIMATION_DURATIONS.fast,
            ease: EASING_FUNCTIONS.easeOut,
          }}
        >
          {text}
          {!isSynced && (
            <motion.span
              animate={{ y: [0, 3, 0] }}
              aria-hidden="true"
              className="inline-block"
              transition={{
                repeat: Infinity,
                duration: 1.4,
                ease: 'easeInOut',
              }}
            >
              ↓
            </motion.span>
          )}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

interface ModifierHintProps {
  modifierSymbol: string;
  visible: boolean;
}

function ModifierHint({ modifierSymbol, visible }: ModifierHintProps) {
  return (
    <span
      aria-hidden={!visible}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border border-border/50 bg-muted/30 px-2.5 py-1 text-xs text-muted-foreground transition-opacity duration-150',
        visible ? 'opacity-80' : 'opacity-0',
      )}
    >
      <kbd className="rounded border border-border bg-background px-1 py-0.5 font-mono text-[10px]">
        {modifierSymbol}
      </kbd>
      <span>+ scroll</span>
    </span>
  );
}
