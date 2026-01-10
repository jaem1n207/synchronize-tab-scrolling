type LogLevel = 'info' | 'error' | 'warn' | 'debug';

interface LoggerOptions {
  scope: string;
}

export class ExtensionLogger {
  private scope: string;

  constructor({ scope }: LoggerOptions) {
    this.scope = scope;
  }

  private formatConsoleMessage(level: LogLevel, message: string, args?: unknown[]): string {
    const timestamp = new Date().toISOString();
    const formattedArgs = args
      ?.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)))
      .join(' ');
    return `[${timestamp}] [${level.toUpperCase()}] [${this.scope}]: ${message}${formattedArgs ? ` ${formattedArgs}` : ''}`;
  }

  async log(level: LogLevel, message: string, ...args: unknown[]): Promise<void> {
    // Console output - only in development mode
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
