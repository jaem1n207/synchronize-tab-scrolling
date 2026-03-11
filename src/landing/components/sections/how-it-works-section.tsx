import { motion } from 'motion/react';
import IconDownload from '~icons/lucide/download';
import IconMousePointerClick from '~icons/lucide/mouse-pointer-click';
import IconScroll from '~icons/lucide/scroll';

import type { ComponentType, SVGProps } from 'react';

import { cn } from '~/shared/lib/utils';
import { useTranslation } from '~/landing/lib/i18n';
import { SectionContainer } from '~/landing/components/layout/section-container';
import { ANIMATION_DURATIONS, EASING_FUNCTIONS } from '~/shared/lib/animations';

interface StepConfig {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

const STEP_ICONS: [StepConfig, StepConfig, StepConfig] = [
  { icon: IconDownload },
  { icon: IconMousePointerClick },
  { icon: IconScroll },
];

export function HowItWorksSection() {
  const t = useTranslation();

  return (
    <SectionContainer id="how-it-works">
      <h2 className="mb-12 text-center text-2xl font-bold text-foreground md:text-3xl">
        {t.howItWorks.title}
      </h2>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
        {t.howItWorks.steps.map((step, i) => {
          const { icon: Icon } = STEP_ICONS[i];
          return (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{
                duration: ANIMATION_DURATIONS.slow,
                ease: EASING_FUNCTIONS.easeOut,
                delay: i * 0.1,
              }}
              className="relative text-center"
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 select-none text-5xl font-bold text-primary/10"
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              <div className="relative pt-10">
                <Icon className="mx-auto mb-3 size-8 text-primary" />
                <h3 className="mb-2 text-lg font-semibold text-foreground">{step.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{step.description}</p>
              </div>

              {i < 2 && (
                <div
                  aria-hidden="true"
                  className={cn(
                    'absolute right-0 top-1/2 hidden -translate-y-1/2 translate-x-1/2 text-muted-foreground/30 md:block',
                  )}
                >
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    role="img"
                  >
                    <title>Next step</title>
                    <path d="M5 12h14" />
                    <path d="m12 5 7 7-7 7" />
                  </svg>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </SectionContainer>
  );
}
