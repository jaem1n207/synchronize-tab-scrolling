import { StrictMode } from 'react';

import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';

import '~/shared/styles';
import './styles/landing.css';

import { LocaleProvider } from '~/landing/lib/i18n';
import { App } from '~/landing/app';

function init() {
  const appContainer = document.getElementById('app');
  if (!appContainer) {
    throw new Error('Can not find #app element');
  }

  const root = createRoot(appContainer);

  root.render(
    <StrictMode>
      <MotionConfig reducedMotion="user">
        <LocaleProvider>
          <App />
        </LocaleProvider>
      </MotionConfig>
    </StrictMode>,
  );
}

init();
