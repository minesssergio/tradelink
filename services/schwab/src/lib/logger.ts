// =============================================================================
// Structured Logger
// JSON-based structured logging to stdout. Platform-agnostic.
// =============================================================================

import { LogEntry } from '../types/schwab.types.js';

const SERVICE_NAME = 'schwab-auth';

/**
 * Masks a sensitive string, showing only the last 4 characters.
 * Returns '****' if the value is too short.
 */
export function maskSensitive(value: string): string {
  if (value.length <= 4) return '****';
  return `****${value.slice(-4)}`;
}

/**
 * Creates a structured log entry and writes it to stdout as JSON.
 */
function writeLog(entry: LogEntry): void {
  const output = JSON.stringify(entry);
  process.stdout.write(output + '\n');
}

/**
 * Structured logger for the Schwab service.
 * All output is JSON to stdout — compatible with any log aggregator.
 */
export const logger = {
  info(message: string, context?: Record<string, unknown>): void {
    writeLog({
      timestamp: new Date().toISOString(),
      level: 'info',
      service: SERVICE_NAME,
      message,
      context,
    });
  },

  warn(message: string, context?: Record<string, unknown>): void {
    writeLog({
      timestamp: new Date().toISOString(),
      level: 'warn',
      service: SERVICE_NAME,
      message,
      context,
    });
  },

  error(
    message: string,
    error?: unknown,
    context?: Record<string, unknown>
  ): void {
    const errorInfo =
      error instanceof Error
        ? {
            code: (error as { code?: string }).code,
            message: error.message,
            stack: error.stack,
          }
        : error
          ? { message: String(error) }
          : undefined;

    writeLog({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: SERVICE_NAME,
      message,
      context,
      error: errorInfo,
    });
  },
};
