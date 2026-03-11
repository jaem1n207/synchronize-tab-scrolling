import { useTranslation } from '~/landing/lib/i18n';
import { SectionContainer } from '~/landing/components/layout/section-container';

export function ProblemSection() {
  const t = useTranslation();

  return (
    <SectionContainer className="flex flex-col items-center justify-center">
      <div className="mx-auto max-w-3xl text-center">
        <div aria-hidden="true" className="mx-auto mb-8 h-px w-16 bg-border" />
        <p className="text-xl font-medium leading-relaxed text-foreground md:text-2xl lg:text-3xl">
          {t.problem.text}
        </p>
      </div>
    </SectionContainer>
  );
}
