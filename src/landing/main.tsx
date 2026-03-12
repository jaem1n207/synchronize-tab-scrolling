import { StrictMode } from 'react';

import { MotionConfig } from 'motion/react';
import { createRoot, hydrateRoot } from 'react-dom/client';

import '~/shared/styles';
import './styles/landing.css';

import { App } from '~/landing/app';
import { LocaleProvider } from '~/landing/lib/i18n';

function init() {
  const appContainer = document.getElementById('app');
  if (!appContainer) {
    throw new Error('Can not find #app element');
  }

  const app = (
    <StrictMode>
      <MotionConfig reducedMotion="user">
        <LocaleProvider>
          <App />
        </LocaleProvider>
      </MotionConfig>
    </StrictMode>
  );

  const hasPrerenderedContent = appContainer.children.length > 0;

  if (hasPrerenderedContent) {
    hydrateRoot(appContainer, app, {
      onRecoverableError: (error, errorInfo) => {
        console.warn('[landing] Recoverable hydration error:', error, {
          componentStack: errorInfo?.componentStack,
        });
      },
    });
  } else {
    createRoot(appContainer).render(app);
  }

  requestAnimationFrame(() => {
    document.documentElement.classList.remove('i18n-loading');
  });
}

init();
