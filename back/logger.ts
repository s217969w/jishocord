import { randomUUID } from 'node:crypto';
import { LogContext } from './interface.js';

export function createLogContext(operation: string, details: Omit<LogContext, 'correlationId' | 'operation'> = {}): LogContext {
  return { correlationId: randomUUID(), operation, ...details };
}

export function logError(context: LogContext, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ level: 'error', ...context, message }));
}

export function logInfo(context: LogContext, message: string): void {
  console.log(JSON.stringify({ level: 'info', ...context, message }));
}
