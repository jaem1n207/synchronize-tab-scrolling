import { StrictMode } from 'react';

import * as Sentry from '@sentry/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';

import { ExtensionLogger } from '~/shared/lib/logger';
import { initializeSentry } from '~/shared/lib/sentry_init';

import { ScrollSyncPopup } from './components/ScrollSyncPopup';

import '~/shared/styles';

// Sentry 초기화 실행
initializeSentry();

const logger = new ExtensionLogger({ scope: 'popup-page' });

// TanStack Query 클라이언트 설정
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5분
      gcTime: 1000 * 60 * 10, // 10분 (이전 cacheTime)
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 1,
    },
  },
});

function init() {
  const appContainer = document.getElementById('app');
  if (!appContainer) {
    throw new Error('Can not find #app element');
  }

  // React 19+ 에러 훅과 Sentry 통합
  const root = createRoot(appContainer, {
    onUncaughtError: Sentry.reactErrorHandler((error, errorInfo) => {
      logger.error(error, {
        context: 'React uncaught error in popup page',
        componentStack: errorInfo?.componentStack,
      });
    }),
    onCaughtError: Sentry.reactErrorHandler((error, errorInfo) => {
      logger.warn('Popup Page: React caught error (in ErrorBoundary)', error, {
        componentStack: errorInfo?.componentStack,
      });
    }),
    onRecoverableError: Sentry.reactErrorHandler((error, errorInfo) => {
      logger.warn('Popup Page: React recoverable error', error, {
        componentStack: errorInfo?.componentStack,
      });
    }),
  });

  root.render(
    <QueryClientProvider client={queryClient}>
      <StrictMode>
        <ScrollSyncPopup />
      </StrictMode>
    </QueryClientProvider>,
  );
}

init();
