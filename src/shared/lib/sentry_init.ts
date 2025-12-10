import {
  BrowserClient,
  defaultStackParser,
  getDefaultIntegrations,
  makeFetchTransport,
  Scope,
  type SeverityLevel,
  type ErrorEvent,
  type EventHint,
} from '@sentry/browser';
import browser from 'webextension-polyfill';

// Filter integrations that use global state (not compatible with browser extensions)
// See: https://docs.sentry.io/platforms/javascript/best-practices/browser-extensions/
const integrations = getDefaultIntegrations({}).filter(
  (defaultIntegration) =>
    !['BrowserApiErrors', 'Breadcrumbs', 'GlobalHandlers'].includes(defaultIntegration.name),
);

let sentryScope: Scope | null = null;

export const initializeSentry = (): void => {
  const dsn =
    'https://3fa7b6b2a6c5e4cc0018e61cf4f417eb@o4509283258990592.ingest.us.sentry.io/4509283262398464';

  if (!dsn) {
    console.warn('Sentry DSN이 유효하지 않거나 설정되지 않았습니다. Sentry 로깅이 비활성화됩니다.');
    return;
  }

  try {
    const client = new BrowserClient({
      dsn,
      release: `synchronize-tab-scrolling@${browser.runtime.getManifest().version}`,
      environment: process.env.NODE_ENV,
      sendDefaultPii: true,
      transport: makeFetchTransport,
      stackParser: defaultStackParser,
      integrations,
      beforeSend(event: ErrorEvent, hint: EventHint): ErrorEvent | null {
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

    sentryScope = new Scope();
    sentryScope.setClient(client);
    client.init();

    console.info('Sentry가 성공적으로 초기화되었습니다.');
  } catch (error) {
    console.error('Sentry 초기화 중 오류 발생:', error);
  }
};

export const getSentryScope = (): Scope | null => sentryScope;

export const captureException = (
  error: Error,
  context?: {
    extra?: Record<string, unknown>;
    tags?: Record<string, string>;
    level?: SeverityLevel;
  },
): string | undefined => {
  if (!sentryScope) return undefined;

  return sentryScope.captureException(error, {
    captureContext: {
      extra: context?.extra,
      tags: context?.tags,
      level: context?.level,
    },
  });
};

export const captureMessage = (
  message: string,
  context?: {
    level?: SeverityLevel;
    extra?: Record<string, unknown>;
    tags?: Record<string, string>;
  },
): string | undefined => {
  if (!sentryScope) return undefined;

  return sentryScope.captureMessage(message, context?.level ?? 'info', {
    captureContext: {
      extra: context?.extra,
      tags: context?.tags,
    },
  });
};
