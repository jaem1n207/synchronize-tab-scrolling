import { StrictMode } from 'react';

import * as Sentry from '@sentry/react';
import { createRoot } from 'react-dom/client';

import { ExtensionLogger } from '~/shared/lib/logger';
import { initializeSentry } from '~/shared/lib/sentry_init';
import '~/shared/styles';

// Sentry 초기화 실행
initializeSentry();

const logger = new ExtensionLogger({ scope: 'options-page' });

/**
 * Sentry 테스트용 에러 발생 트리거 함수
 */
const generateSimpleError = () => {
  logger.info('Generating test error from options page...');
  throw new Error('옵션 페이지에서 발생한 Sentry 테스트 에러입니다!');
};

function FallbackComponent() {
  return (
    <div style={{ padding: '20px', textAlign: 'center', color: 'red' }}>
      <h2>앗! 문제가 발생했습니다.</h2>
      <p>잠시 후 다시 시도해주시거나, 문제가 지속되면 개발자에게 문의해주세요.</p>
    </div>
  );
}

const container = document.getElementById('app');

if (container) {
  // React 19+ 에러 훅과 Sentry 통합
  const root = createRoot(container, {
    onUncaughtError: Sentry.reactErrorHandler((error, errorInfo) => {
      logger.error('Options Page: React uncaught error', {
        error,
        componentStack: errorInfo?.componentStack,
      });
      // Sentry.captureException은 reactErrorHandler 내부에서 이미 호출될 수 있습니다.
      // 중복 전송을 피하려면 Sentry 설정을 확인하거나, 여기서 추가적인 처리를 하지 않아도 됩니다.
    }),
    onCaughtError: Sentry.reactErrorHandler((error, errorInfo) => {
      logger.warn('Options Page: React caught error (in ErrorBoundary)', {
        error,
        componentStack: errorInfo?.componentStack,
      });
    }),
    onRecoverableError: Sentry.reactErrorHandler((error, errorInfo) => {
      logger.warn('Options Page: React recoverable error', {
        error,
        componentStack: errorInfo?.componentStack,
      });
    }),
  });

  root.render(
    <StrictMode>
      <Sentry.ErrorBoundary fallback={<FallbackComponent />} showDialog={false}>
        <div>
          <h2 className="text-xl font-bold mb-4">Sentry 연동 테스트 UI (옵션 페이지)</h2>
          <p className="mb-2">아래 버튼을 클릭하면 Sentry로 테스트 에러가 전송됩니다.</p>
          <button
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition-colors duration-150"
            type="button"
            onClick={generateSimpleError}
          >
            간단한 메시지 에러 발생 (옵션)
          </button>
          <p className="mt-4 text-sm text-gray-600">
            에러 발생 후 Sentry 대시보드에서 해당 에러가 기록되었는지 확인하세요.
          </p>
        </div>
      </Sentry.ErrorBoundary>
    </StrictMode>,
  );
} else {
  logger.error("Options page 'app' container not found!");
}
