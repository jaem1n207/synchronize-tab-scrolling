import * as Sentry from '@sentry/react';

// Sentry SeverityLevel 타입. @sentry/types 에서 가져올 수도 있습니다.
type SentrySeverityLevel = 'fatal' | 'error' | 'warning' | 'log' | 'info' | 'debug';

// LogLevel은 내부적으로 사용하거나 콘솔 출력에 사용될 수 있습니다.
type LogLevel = 'info' | 'error' | 'warn' | 'debug';

interface LoggerOptions {
  scope: string;
}

export class ExtensionLogger {
  private scope: string;

  constructor({ scope }: LoggerOptions) {
    this.scope = scope;
  }

  private mapToSentryLevel(level: LogLevel): SentrySeverityLevel {
    switch (level) {
      case 'error':
        return 'error';
      case 'warn':
        return 'warning';
      case 'info':
        return 'info';
      case 'debug':
        return 'debug';
      default:
        // LogLevel에 'trace'가 없으므로 기본값을 'log'로 설정
        return 'log';
    }
  }

  private formatConsoleMessage(level: LogLevel, message: string, args?: unknown[]): string {
    const timestamp = new Date().toISOString();
    const formattedArgs = args
      ?.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)))
      .join(' ');
    return `[${timestamp}] [${level.toUpperCase()}] [${this.scope}]: ${message}${formattedArgs ? ` ${formattedArgs}` : ''}`;
  }

  private getSerializableArgs(args?: unknown[]): Record<string, unknown> {
    const extraData: Record<string, unknown> = {};
    if (args && args.length > 0) {
      args.forEach((arg, index) => {
        // Error 객체는 Sentry가 captureException에서 특별히 처리하므로, 여기서는 일반 객체나 원시값만 처리
        if (arg instanceof Error) {
          extraData[`argument_${index}`] = {
            name: arg.name,
            message: arg.message,
            stack: arg.stack,
          };
        } else if (
          typeof arg === 'object' ||
          typeof arg === 'string' ||
          typeof arg === 'number' ||
          typeof arg === 'boolean'
        ) {
          extraData[`argument_${index}`] = arg;
        } else {
          extraData[`argument_${index}`] = String(arg);
        }
      });
    }
    return extraData;
  }

  async log(level: LogLevel, message: string, ...args: unknown[]): Promise<void> {
    // 1. 콘솔에 로그 출력
    const consoleMessage = this.formatConsoleMessage(level, message, args);
    switch (level) {
      case 'error':
        console.error(consoleMessage);
        break;
      case 'warn':
        console.warn(consoleMessage);
        break;
      case 'info':
        console.info(consoleMessage);
        break;
      case 'debug':
      default:
        // 프로덕션 환경에서는 debug 콘솔 로그를 생략할 수 있습니다.
        if (process.env.NODE_ENV !== 'production') {
          console.debug(consoleMessage);
        }
        break;
    }

    // 2. Sentry로 로그 전송
    const sentryClientOptions = Sentry.getClient()?.getOptions();
    if (sentryClientOptions && sentryClientOptions.dsn) {
      const sentryLevel = this.mapToSentryLevel(level);
      const tags = { scope: this.scope };

      if (level === 'error') {
        const errorInstanceFromArgs = args.find((arg) => arg instanceof Error) as Error | undefined;
        let exceptionToCapture: Error;
        let extraForSentry: Record<string, unknown> = {};

        if (errorInstanceFromArgs) {
          // 사용자가 Error 객체를 명시적으로 전달한 경우
          // 예: logger.error("추가 메시지", new Error("실제 에러"), ...);
          // 또는 logger.error(new Error("실제 에러"), ...);
          exceptionToCapture = errorInstanceFromArgs;
          const remainingArgs = args.filter((arg) => arg !== errorInstanceFromArgs);
          extraForSentry = this.getSerializableArgs(remainingArgs);
          // `log` 메소드에 전달된 `message`가 실제 Error 객체의 메시지와 다를 경우,
          // 사용자가 에러 객체와 함께 컨텍스트 메시지를 제공한 것으로 간주하여 extra에 포함합니다.
          if (message !== exceptionToCapture.message) {
            extraForSentry.contextualMessage = message;
          }
        } else {
          // 문자열 메시지만 전달된 경우, 내부적으로 Error 객체를 생성하여 스택 트레이스 확보
          // 예: logger.error("단순 에러 메시지", ...);
          exceptionToCapture = new Error(message);
          extraForSentry = this.getSerializableArgs(args); // 여기서 args는 Error 객체가 아닌 추가 정보들
        }

        Sentry.captureException(exceptionToCapture, {
          level: sentryLevel,
          extra: extraForSentry,
          tags: tags,
        });
      } else {
        // 'warn', 'info', 'debug' 레벨은 기존처럼 captureMessage 사용
        // (단, debug 레벨은 프로덕션에서 Sentry 전송 안 하도록 추가 제어 가능)
        // if (level === 'debug' && process.env.NODE_ENV === 'production') {
        //   return; // 프로덕션 환경에서는 debug 로그를 Sentry로 보내지 않음
        // }
        console.log('captureMessage', message, sentryLevel, tags);
        Sentry.captureMessage(message, {
          level: sentryLevel,
          extra: {
            ...this.getSerializableArgs(args),
          },
          tags: tags,
        });
      }
    }
  }

  info(message: string, ...args: unknown[]): Promise<void> {
    return this.log('info', message, ...args);
  }

  /**
   * 에러를 로깅합니다.
   * 가장 정확한 스택 트레이스를 위해서는 첫 번째 인자로 Error 객체를 전달하는 것이 좋습니다.
   * 예: logger.error(new Error("데이터베이스 연결 실패"));
   *     logger.error("사용자 인증 실패", { userId: 123 }); (이 경우 스택 트레이스는 로거 내부에서 시작됨)
   *     logger.error("결제 처리 중 오류", new Error("PG사 응답 실패"), { orderId: 456 });
   */
  error(messageOrError: string | Error, ...args: unknown[]): Promise<void> {
    if (messageOrError instanceof Error) {
      // logger.error(new Error("에러 객체"), 추가정보1, 추가정보2)
      // -> log('error', error.message, error객체, 추가정보1, 추가정보2)
      return this.log('error', messageOrError.message, messageOrError, ...args);
    }
    // logger.error("문자열 메시지", new Error("에러 객체"), 추가정보1)
    // logger.error("문자열 메시지", 일반객체, 추가정보1)
    // -> log('error', "문자열 메시지", new Error객체 또는 일반객체, 추가정보1)
    return this.log('error', messageOrError, ...args);
  }

  warn(message: string, ...args: unknown[]): Promise<void> {
    return this.log('warn', message, ...args);
  }

  debug(message: string, ...args: unknown[]): Promise<void> {
    return this.log('debug', message, ...args);
  }
}

// Sentry 초기화는 각 엔트리 포인트(background, content script 등)에서 한 번씩 수행해야 합니다.
// Logger 인스턴스 생성 예시 (Sentry가 초기화된 후):
// const logger = new ExtensionLogger({ scope: 'background' });
// logger.info('확장 프로그램이 시작되었습니다.', { someData: 123 });
// logger.warn('주의가 필요한 상황입니다.');
// try {
//   throw new Error('테스트 에러!');
// } catch (e) {
//   if (e instanceof Error) {
//     logger.error(e, '추가 정보:', { detail: '세부사항' });
//   } else {
//     logger.error('알 수 없는 에러 발생', String(e));
//   }
// }
