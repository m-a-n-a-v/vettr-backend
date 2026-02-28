/**
 * Structured JSON logger for VETTR backend.
 * Replaces ad-hoc console.log calls with consistent, queryable log entries.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  [key: string]: unknown;
}

function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  if (process.env.NODE_ENV === 'test') return;

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  };

  const output = JSON.stringify(entry);

  if (level === 'error') {
    console.error(output);
  } else if (level === 'warn') {
    console.warn(output);
  } else if (process.env.NODE_ENV !== 'production' || level !== 'debug') {
    console.log(output);
  }
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => log('debug', message, meta),
  info: (message: string, meta?: Record<string, unknown>) => log('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => log('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => log('error', message, meta),
};
