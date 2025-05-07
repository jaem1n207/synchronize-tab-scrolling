import * as Sentry from '@sentry/react';
import browser from 'webextension-polyfill';

// Sentry SeverityLevel 타입. @sentry/types 에서 가져올 수도 있습니다.
type SentrySeverityLevel = 'fatal' | 'error' | 'warning' | 'log' | 'info' | 'debug';

// LogLevel은 내부적으로 사용하거나 콘솔 출력에 사용될 수 있습니다.
type LogLevel = 'info' | 'error' | 'warn' | 'debug';

interface LoggerOptions {
  scope: string;
  storage?: browser.Storage.StorageArea;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  scope: string;
  args?: unknown[]; // 직렬화 가능한 추가 데이터
}

export class ExtensionLogger {
  private scope: string;
  private storage: browser.Storage.StorageArea;
  private static MAX_LOCAL_LOGS = 100; // 로컬 스토리지에 저장할 최대 로그 수

  constructor({ scope, storage = browser.storage.local }: LoggerOptions) {
    this.scope = scope;
    this.storage = storage;
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

  private async storeLogLocally(logEntry: LogEntry): Promise<void> {
    // 디버그 로그는 로컬에 저장하지 않거나, 개발 모드에서만 저장할 수 있습니다.
    if (logEntry.level === 'debug' && process.env.NODE_ENV === 'production') {
      return;
    }
    try {
      const result = await this.storage.get('logs');
      const logs: LogEntry[] = (result.logs || []) as LogEntry[];
      logs.push(logEntry);
      await this.storage.set({ logs: logs.slice(-ExtensionLogger.MAX_LOCAL_LOGS) });
    } catch (error) {
      // 로컬 스토리지 저장 실패는 Sentry로 보내지 않도록 주의 (무한 루프 방지)
      console.error(`[${this.scope}] 로컬 스토리지에 로그 저장 실패:`, error);
    }
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

    // 2. 로컬 스토리지에 로그 저장 (선택적)
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      scope: this.scope,
      message,
      args,
    };
    await this.storeLogLocally(logEntry);

    // 3. Sentry로 로그 전송
    const sentryClientOptions = Sentry.getClient()?.getOptions();
    if (sentryClientOptions && sentryClientOptions.dsn) {
      const sentryLevel = this.mapToSentryLevel(level);

      // 디버그 로그는 프로덕션에서 Sentry로 보내지 않음 (Sentry 샘플링으로도 조절 가능)
      if (level === 'debug' && process.env.NODE_ENV === 'production') {
        return;
      }

      const extraData = {
        scope: this.scope,
        ...this.getSerializableArgs(args), // args를 직렬화 가능한 형태로 추가
      };

      // 첫 번째 인자가 Error 객체인지 확인
      const errorArg = args.find((arg) => arg instanceof Error) as Error | undefined;

      if (level === 'error' && errorArg) {
        Sentry.captureException(errorArg, {
          level: sentryLevel,
          extra: {
            ...extraData,
            originalMessage: message, // Error 객체와 별개로 전달된 메시지
          },
          tags: { scope: this.scope },
        });
      } else {
        Sentry.captureMessage(message, {
          level: sentryLevel,
          extra: extraData,
          tags: { scope: this.scope },
        });
      }
    }
  }

  info(message: string, ...args: unknown[]): Promise<void> {
    return this.log('info', message, ...args);
  }

  error(messageOrError: string | Error, ...args: unknown[]): Promise<void> {
    if (messageOrError instanceof Error) {
      return this.log('error', messageOrError.message, messageOrError, ...args);
    }
    return this.log('error', messageOrError, ...args);
  }

  warn(message: string, ...args: unknown[]): Promise<void> {
    return this.log('warn', message, ...args);
  }

  debug(message: string, ...args: unknown[]): Promise<void> {
    return this.log('debug', message, ...args);
  }

  // 저장된 로그를 가져오는 유틸리티 함수 (디버깅용)
  async getLocalLogs(): Promise<LogEntry[]> {
    try {
      const result = await this.storage.get('logs');
      return (result.logs || []) as LogEntry[];
    } catch (error) {
      console.error(`[${this.scope}] 로컬 로그 가져오기 실패:`, error);
      return [];
    }
  }

  // 로컬 로그 삭제 함수
  async clearLocalLogs(): Promise<void> {
    try {
      await this.storage.remove('logs');
      console.info(`[${this.scope}] 로컬 로그가 삭제되었습니다.`);
    } catch (error) {
      console.error(`[${this.scope}] 로컬 로그 삭제 실패:`, error);
    }
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
