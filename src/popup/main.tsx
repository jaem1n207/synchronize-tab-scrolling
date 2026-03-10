import { StrictMode } from 'react';

import { createRoot } from 'react-dom/client';

import { ExtensionLogger } from '~/shared/lib/logger';

import { ScrollSyncPopup } from './components/scroll-sync-popup';

import '~/shared/styles';

const logger = new ExtensionLogger({ scope: 'popup-page' });

function init() {
  const appContainer = document.getElementById('app');
  if (!appContainer) {
    throw new Error('Can not find #app element');
  }

  // React 19+ 에러 훅
  const root = createRoot(appContainer, {
    onUncaughtError: (error, errorInfo) => {
      logger.error(error as Error, {
        context: 'React uncaught error in popup page',
        componentStack: errorInfo?.componentStack,
      });
    },
    onCaughtError: (error, errorInfo) => {
      logger.warn('Popup Page: React caught error (in ErrorBoundary)', error, {
        componentStack: errorInfo?.componentStack,
      });
    },
    onRecoverableError: (error, errorInfo) => {
      logger.warn('Popup Page: React recoverable error', error, {
        componentStack: errorInfo?.componentStack,
      });
    },
  });

  root.render(
    <StrictMode>
      <ScrollSyncPopup />
    </StrictMode>,
  );
}

init();
