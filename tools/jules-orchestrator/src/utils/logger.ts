import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  }
});

export interface Logger {
  info(obj: any, msg?: string): void;
  error(obj: any, msg?: string): void;
  warn(obj: any, msg?: string): void;
  debug(obj: any, msg?: string): void;
}
