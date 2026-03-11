import { Header } from '~/landing/components/layout/header';
import { Footer } from '~/landing/components/layout/footer';
import { HeroSection } from '~/landing/components/hero/hero-section';
import { ProblemSection } from '~/landing/components/sections/problem-section';
import { HowItWorksSection } from '~/landing/components/sections/how-it-works-section';
import { FeaturesSection } from '~/landing/components/sections/features-section';
import { UseCasesSection } from '~/landing/components/sections/use-cases-section';
import { TrustSection } from '~/landing/components/sections/trust-section';
import { CtaSection } from '~/landing/components/sections/cta-section';

export function App() {
  return (
    <div className="min-h-svh bg-background text-foreground">
      <Header />
      <main>
        <HeroSection />
        <ProblemSection />
        <HowItWorksSection />
        <FeaturesSection />
        <UseCasesSection />
        <TrustSection />
        <CtaSection />
      </main>
      <Footer />
    </div>
  );
}
