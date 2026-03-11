import { motion } from 'motion/react';
import IconLanguages from '~icons/lucide/languages';
import IconCode2 from '~icons/lucide/code-2';
import IconBookOpen from '~icons/lucide/book-open';
import IconGraduationCap from '~icons/lucide/graduation-cap';

import type { ComponentType, SVGProps } from 'react';

import { useTranslation } from '~/landing/lib/i18n';
import { SectionContainer } from '~/landing/components/layout/section-container';
import { ANIMATION_DURATIONS, EASING_FUNCTIONS } from '~/shared/lib/animations';

const USE_CASE_ICONS: ComponentType<SVGProps<SVGSVGElement>>[] = [
  IconLanguages,
  IconCode2,
  IconBookOpen,
  IconGraduationCap,
];

export function UseCasesSection() {
  const t = useTranslation();

  return (
    <SectionContainer id="use-cases">
      <h2 className="mb-12 text-center text-2xl font-bold text-foreground md:text-3xl">
        {t.useCases.title}
      </h2>

      <div className="mx-auto grid max-w-3xl grid-cols-1 gap-6 sm:grid-cols-2">
        {t.useCases.items.map((useCase, i) => {
          const Icon = USE_CASE_ICONS[i];
          return (
            <motion.div
              key={useCase.role}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{
                duration: ANIMATION_DURATIONS.slow,
                ease: EASING_FUNCTIONS.easeOut,
                delay: i * 0.1,
              }}
              className="rounded-xl border border-border bg-card p-6 transition-all hover:border-primary/30 hover:shadow-md"
            >
              <Icon className="mb-3 size-8 text-primary" />
              <h3 className="mb-1 text-lg font-semibold text-card-foreground">{useCase.role}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{useCase.description}</p>
            </motion.div>
          );
        })}
      </div>
    </SectionContainer>
  );
}
