import { ExtensionLogger } from '~/shared/lib/logger';
import * as Sentry from '@sentry/react';

const logger = new ExtensionLogger({ scope: 'options-test-page' });

/**
 * Sentry 테스트용 에러 발생 트리거 함수
 */
const generateSimpleError = () => {
  logger.info('Generating test error from options page...');
  throw new Error('옵션 페이지에서 발생한 Sentry 테스트 에러입니다!');
};

export function Test() {
  const [errored, setErrored] = useState(false);

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Sentry 연동 테스트 UI (옵션 페이지)</h2>
      <p className="mb-2">아래 버튼을 클릭하면 Sentry로 테스트 에러가 전송됩니다.</p>
      <button
        type="button"
        onClick={() => {
          throw new Error('Sentry Test Error');
        }}
      >
        Break the world
      </button>
      <button
        onClick={() => {
          Sentry.captureException(
            new Error(
              JSON.stringify({
                message: '특정 작업 중 심각한 오류 발생!',
                userId: 'test-123',
                action: 'processPayment',
                orderId: 789,
              }),
            ),
            {
              tags: {
                file: 'test.tsx',
                line: 22,
              },
            },
          );
          // try {
          //   const error = new Error('특정 작업 중 심각한 오류 발생!');
          //   throw error;
          // } catch (e) {
          //   if (e instanceof Error) {
          //     logger.error(e); // Error 객체 직접 전달
          //     // 또는 추가 컨텍스트와 함께:
          //     // logger.error(e, { userId: 123, action: 'processPayment' });
          //     // 또는 사용자 정의 메시지와 함께 Error 객체 전달:
          //     // logger.error("결제 모듈에서 예외 발생", e, { orderId: 789 });
          //   } else {
          //     logger.error(`알 수 없는 에러 발생: ${String(e)}`);
          //   }
          // }
        }}
      >
        hello
      </button>
      {!errored ? (
        <button
          onClick={() => {
            setErrored(true);
            logger.error(new Error('Sentry Test Error 에요~~~!'));
          }}
        >
          Sentry 테스트
        </button>
      ) : (
        <button
          onClick={() => {
            setErrored(false);
          }}
        >
          초기화
        </button>
      )}
      <button
        className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition-colors duration-150"
        type="button"
        onClick={() => {
          logger.error(
            '옵션 > test > button1 클릭 후 에러 발생 테스트',
            new Error('에러 스택 트레이스 테스트'),
          );
        }}
      >
        간단한 메시지 에러 발생 (옵션)
      </button>
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
  );
}
