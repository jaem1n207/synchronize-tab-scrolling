/// <reference types="vitest/globals" />

import { render, screen } from '~/landing/__tests__/test-utils';
import { CtaSection } from '~/landing/components/sections/cta-section';
import { FeaturesSection } from '~/landing/components/sections/features-section';
import { HowItWorksSection } from '~/landing/components/sections/how-it-works-section';
import { ProblemSection } from '~/landing/components/sections/problem-section';
import { TrustSection } from '~/landing/components/sections/trust-section';
import { UseCasesSection } from '~/landing/components/sections/use-cases-section';

describe('Landing content sections', () => {
  beforeEach(() => {
    localStorage.setItem('landing-locale', 'en');
  });

  it('renders all section headings and key content blocks', () => {
    const { container } = render(
      <>
        <ProblemSection />
        <HowItWorksSection />
        <FeaturesSection />
        <UseCasesSection />
        <TrustSection />
        <CtaSection />
      </>,
    );

    expect(screen.getByRole('heading', { name: 'How it works' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Features' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Who is this for?' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Privacy first. Always.' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ready to sync?' })).toBeInTheDocument();

    expect(screen.getByText('Install the extension')).toBeInTheDocument();
    expect(screen.getByText('Real-time scroll sync')).toBeInTheDocument();
    expect(screen.getByText('Translators')).toBeInTheDocument();
    expect(screen.getByText('No data collection')).toBeInTheDocument();
    expect(screen.getByText('Free forever. Install in 3 seconds.')).toBeInTheDocument();

    expect(container.querySelectorAll('section')).toHaveLength(6);
  });

  it('renders expected section anchors for navigation structure', () => {
    const { container } = render(
      <>
        <HowItWorksSection />
        <FeaturesSection />
        <UseCasesSection />
      </>,
    );

    expect(container.querySelector('section#how-it-works')).toBeInTheDocument();
    expect(container.querySelector('section#features')).toBeInTheDocument();
    expect(container.querySelector('section#use-cases')).toBeInTheDocument();
  });
});
