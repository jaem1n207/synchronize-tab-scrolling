import { motion } from 'motion/react';
import IconArrowUpDown from '~icons/lucide/arrow-up-down';
import IconSlidersHorizontal from '~icons/lucide/sliders-horizontal';
import IconSparkles from '~icons/lucide/sparkles';
import IconLink from '~icons/lucide/link';
import IconShieldOff from '~icons/lucide/shield-off';
import IconWifi from '~icons/lucide/wifi';

import type { ComponentType, SVGProps } from 'react';

import { useTranslation } from '~/landing/lib/i18n';
import { SectionContainer } from '~/landing/components/layout/section-container';
import { ANIMATION_DURATIONS, EASING_FUNCTIONS } from '~/shared/lib/animations';

const FEATURE_ICONS: ComponentType<SVGProps<SVGSVGElement>>[] = [
  IconArrowUpDown,
  IconSlidersHorizontal,
  IconSparkles,
  IconLink,
  IconShieldOff,
  IconWifi,
];

export function FeaturesSection() {
  const t = useTranslation();

  return (
    <SectionContainer id="features">
      <h2 className="mb-12 text-center text-2xl font-bold text-foreground md:text-3xl">
        {t.features.title}
      </h2>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {t.features.items.map((feature, i) => {
          const Icon = FEATURE_ICONS[i];
          return (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{
                duration: ANIMATION_DURATIONS.slow,
                ease: EASING_FUNCTIONS.easeOut,
                delay: i * 0.08,
              }}
              className="rounded-xl border border-border bg-card p-6 transition-all hover:border-primary/30 hover:shadow-md"
            >
              <Icon className="mb-3 size-8 text-primary" />
              <h3 className="mb-1 text-base font-semibold text-card-foreground">{feature.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
            </motion.div>
          );
        })}
      </div>
    </SectionContainer>
  );
}
