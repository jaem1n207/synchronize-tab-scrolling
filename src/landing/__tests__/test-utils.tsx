/// <reference types="vitest/globals" />
import type { ReactElement } from 'react';
import { StrictMode } from 'react';

import { render, type RenderOptions } from '@testing-library/react';
import { MotionConfig } from 'motion/react';

import { LocaleProvider } from '~/landing/lib/i18n';

function AllProviders({ children }: { children: React.ReactNode }) {
  return (
    <StrictMode>
      <MotionConfig reducedMotion="user">
        <LocaleProvider>{children}</LocaleProvider>
      </MotionConfig>
    </StrictMode>
  );
}

function customRender(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return render(ui, { wrapper: AllProviders, ...options });
}

export { screen, within, waitFor, fireEvent, cleanup, act } from '@testing-library/react';
export { customRender as render };
