import { captureException, getSentryScope } from './sentry_init';

import type { SeverityLevel } from '@sentry/browser';

type LogLevel = 'info' | 'error' | 'warn' | 'debug';

interface LoggerOptions {
  scope: string;
}

export class ExtensionLogger {
  private scope: string;

  constructor({ scope }: LoggerOptions) {
    this.scope = scope;
  }

  private mapToSentryLevel(level: LogLevel): SeverityLevel {
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
    // 1. Console output - only in development mode
    if (__DEV__) {
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
          console.debug(consoleMessage);
          break;
      }
    }

    // 2. Sentry로 로그 전송 - error 레벨만 전송
    // info, warn, debug는 Sentry rate limit 초과 방지를 위해 console에만 출력
    if (level !== 'error') return;

    const sentryScope = getSentryScope();
    if (!sentryScope) return;

    const sentryLevel = this.mapToSentryLevel(level);
    const tags = { scope: this.scope };

    const errorInstanceFromArgs = args.find((arg) => arg instanceof Error) as Error | undefined;
    let exceptionToCapture: Error;
    let extraForSentry: Record<string, unknown> = {};

    if (errorInstanceFromArgs) {
      exceptionToCapture = errorInstanceFromArgs;
      const remainingArgs = args.filter((arg) => arg !== errorInstanceFromArgs);
      extraForSentry = this.getSerializableArgs(remainingArgs);
      if (message !== exceptionToCapture.message) {
        extraForSentry.contextualMessage = message;
      }
    } else {
      exceptionToCapture = new Error(message);
      extraForSentry = this.getSerializableArgs(args);
    }

    captureException(exceptionToCapture, {
      level: sentryLevel,
      extra: extraForSentry,
      tags,
    });
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
}
