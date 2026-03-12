import { InstallButtons } from '~/landing/components/install-buttons';
import { SectionContainer } from '~/landing/components/layout/section-container';
import { useTranslation } from '~/landing/lib/i18n';

export function CtaSection() {
  const t = useTranslation();

  return (
    <SectionContainer className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,hsl(var(--primary)/0.05)_0%,transparent_70%)]"
      />

      <div className="relative text-center">
        <h2 className="mb-4 text-3xl font-bold text-foreground md:text-4xl">{t.cta.title}</h2>
        <p className="mb-8 text-lg text-muted-foreground">{t.cta.subtitle}</p>
        <InstallButtons position="cta" variant="hero" />
      </div>
    </SectionContainer>
  );
}
