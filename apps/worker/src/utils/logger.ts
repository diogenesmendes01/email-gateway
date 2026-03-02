/**
 * Structured logger for the email worker.
 * Outputs JSON lines to stdout/stderr for machine-parseable logs.
 */

type LogLevel = 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  service: string;
  message: string;
  timestamp: string;
  [key: string]: unknown;
}

function write(level: LogLevel, service: string, message: string, context?: Record<string, unknown>) {
  const entry: LogEntry = {
    level,
    service,
    message,
    timestamp: new Date().toISOString(),
    ...context,
  };

  const output = JSON.stringify(entry);
  if (level === 'error') {
    process.stderr.write(output + '\n');
  } else {
    process.stdout.write(output + '\n');
  }
}

export function createLogger(service: string) {
  return {
    info: (message: string, context?: Record<string, unknown>) => write('info', service, message, context),
    warn: (message: string, context?: Record<string, unknown>) => write('warn', service, message, context),
    error: (message: string, context?: Record<string, unknown>) => write('error', service, message, context),
  };
}
