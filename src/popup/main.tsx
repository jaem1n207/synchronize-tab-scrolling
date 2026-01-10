import { StrictMode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';

import { ExtensionLogger } from '~/shared/lib/logger';

import { ScrollSyncPopup } from './components/ScrollSyncPopup';

import '~/shared/styles';

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
    <QueryClientProvider client={queryClient}>
      <StrictMode>
        <ScrollSyncPopup />
      </StrictMode>
    </QueryClientProvider>,
  );
}

init();
