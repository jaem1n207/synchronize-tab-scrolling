/// <reference types="vitest/globals" />

import 'vitest-axe/extend-expect';

import { axe } from 'vitest-axe';
import * as axeMatchers from 'vitest-axe/matchers';

import { render } from '~/landing/__tests__/test-utils';
import { App } from '~/landing/app';
import { HeroSection } from '~/landing/components/hero/hero-section';
import { Footer } from '~/landing/components/layout/footer';
import { Header } from '~/landing/components/layout/header';
import { FeaturesSection } from '~/landing/components/sections/features-section';

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface Assertion<T> {
    toHaveNoViolations(): void;
  }
  interface AsymmetricMatchersContaining {
    toHaveNoViolations(): void;
  }
}

expect.extend(axeMatchers);

describe('Landing accessibility', () => {
  beforeEach(() => {
    localStorage.setItem('landing-locale', 'en');
  });

  it('passes axe checks for Header', async () => {
    const { container } = render(<Header />);

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('passes axe checks for HeroSection', async () => {
    const { container } = render(<HeroSection />);

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('passes axe checks for FeaturesSection', async () => {
    const { container } = render(<FeaturesSection />);

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('passes axe checks for Footer', async () => {
    const { container } = render(<Footer />);

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('passes axe checks for full page', async () => {
    const { container } = render(<App />);

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
