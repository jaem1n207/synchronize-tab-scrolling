import { StrictMode } from 'react';

import * as Sentry from '@sentry/react';
import { createRoot } from 'react-dom/client';

import { ExtensionLogger } from '~/shared/lib/logger';
import { initializeSentry } from '~/shared/lib/sentry_init';

import '~/shared/styles';
import { Test } from './features/test';

// Sentry 초기화 실행
initializeSentry();

const logger = new ExtensionLogger({ scope: 'options-page' });

const container = document.getElementById('app');

if (container) {
  // React 19+ 에러 훅과 Sentry 통합
  const root = createRoot(container, {
    onUncaughtError: Sentry.reactErrorHandler((error, errorInfo) => {
      logger.error(error, {
        context: 'React uncaught error in options page',
        componentStack: errorInfo?.componentStack,
      });
      // Sentry.captureException은 reactErrorHandler 내부에서 이미 호출될 수 있습니다.
      // 중복 전송을 피하려면 Sentry 설정을 확인하거나, 여기서 추가적인 처리를 하지 않아도 됩니다.
    }),
    onCaughtError: Sentry.reactErrorHandler((error, errorInfo) => {
      logger.warn('Options Page: React caught error (in ErrorBoundary)', error, {
        componentStack: errorInfo?.componentStack,
      });
    }),
    onRecoverableError: Sentry.reactErrorHandler((error, errorInfo) => {
      logger.warn('Options Page: React recoverable error', error, {
        componentStack: errorInfo?.componentStack,
      });
    }),
  });

  root.render(
    <StrictMode>
      <Test />
    </StrictMode>,
  );
} else {
  logger.error("Options page 'app' container not found!");
}
