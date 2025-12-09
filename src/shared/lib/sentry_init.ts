import * as Sentry from '@sentry/react';
import browser from 'webextension-polyfill';

export const initializeSentry = (): void => {
  const dsn =
    'https://3fa7b6b2a6c5e4cc0018e61cf4f417eb@o4509283258990592.ingest.us.sentry.io/4509283262398464';

  if (!dsn) {
    console.warn('Sentry DSN이 유효하지 않거나 설정되지 않았습니다. Sentry 로깅이 비활성화됩니다.');
    return;
  }

  try {
    Sentry.init({
      dsn: dsn,
      release: `synchronize-tab-scrolling@${browser.runtime.getManifest().version}`,
      environment: process.env.NODE_ENV, // 'development' 또는 'production'
      // Setting this option to true will send default PII data to Sentry.
      // For example, automatic IP address collection on events
      sendDefaultPii: true,
      integrations: [
        Sentry.replayIntegration({
          // Session Replay 마스킹 옵션 (필요시 설정)
          // maskAllText: true,
          // blockAllMedia: true,
        }),
      ],
      // Session Replay
      // 무료 플랜 최적화: 일반 세션은 리플레이하지 않고, 에러 발생 세션만 리플레이합니다.
      replaysSessionSampleRate: 0.0, // This sets the sample rate at 0%.
      replaysOnErrorSampleRate: 1.0, // If you're not already sampling the entire session, change the sample rate to 100% when sampling sessions where errors occur.
      beforeSend(event, hint) {
        const error = hint.originalException;
        if (error && typeof error === 'string' && error.includes('특정 에러 메시지')) {
          return null;
        }
        // Chrome 확장 프로그램에서 발생하는 몇 가지 일반적인 오류를 필터링
        // 예: "Extension context invalidated" 오류는 사용자가 확장을 비활성화/제거할 때 발생할 수 있으며, Sentry로 보낼 필요 없습니다.
        if (typeof error === 'string' && error.includes('Extension context invalidated')) {
          return null;
        }
        if (error instanceof Error && error.message.includes('Extension context invalidated')) {
          return null;
        }
        return event;
      },
    });

    // 사용자 정보 설정
    // Sentry.setUser({ id: 'user_id', email: 'user@example.com' });

    // 태그 또는 추가 데이터 설정
    // Sentry.setTag('page_locale', 'ko-KR');
    // Sentry.setExtra('custom_data', { foo: 'bar' });

    console.info('Sentry가 성공적으로 초기화되었습니다.');
  } catch (error) {
    console.error('Sentry 초기화 중 오류 발생:', error);
  }
};
