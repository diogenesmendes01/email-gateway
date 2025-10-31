import { randomUUID } from 'crypto';

/**
 * Tracing Service - TASK 7.1
 *
 * Provides distributed tracing capabilities with standardized correlation IDs
 * that flow through API → Queue → Worker → SES
 */

export interface TraceContext {
  traceId: string; // Unique ID for the entire request chain
  spanId: string; // Unique ID for this specific operation
  parentSpanId?: string; // Parent operation ID for nested operations
  companyId: string; // Tenant identifier
  timestamp: number; // Timestamp when trace was created
}

export interface LogEntry {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  companyId: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: string;
  duration?: number;
  metadata?: Record<string, any>;
}

export class TracingService {
  private serviceName: string;

  constructor(serviceName: string) {
    this.serviceName = serviceName;
  }

  /**
   * Create a new trace context
   * @param companyId Company/tenant ID
   * @param parentContext Optional parent context for nested operations
   */
  createTrace(companyId: string, parentContext?: Partial<TraceContext>): TraceContext {
    return {
      traceId: parentContext?.traceId || this.generateTraceId(),
      spanId: this.generateSpanId(),
      parentSpanId: parentContext?.spanId,
      companyId,
      timestamp: Date.now(),
    };
  }

  /**
   * Create a child span from parent context
   * @param parentContext Parent trace context
   */
  createSpan(parentContext: TraceContext): TraceContext {
    return {
      ...parentContext,
      spanId: this.generateSpanId(),
      parentSpanId: parentContext.spanId,
      timestamp: Date.now(),
    };
  }

  /**
   * Log a structured message with trace context
   * @param context Trace context
   * @param level Log level
   * @param message Log message
   * @param metadata Additional metadata
   */
  log(
    context: TraceContext,
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    metadata?: Record<string, any>
  ): void {
    const logEntry: LogEntry = {
      traceId: context.traceId,
      spanId: context.spanId,
      parentSpanId: context.parentSpanId,
      companyId: context.companyId,
      level,
      message,
      timestamp: new Date().toISOString(),
      metadata: {
        ...metadata,
        service: this.serviceName,
      },
    };

    // Output as JSON for structured logging
    this.output(logEntry);
  }

  /**
   * Log with timing information
   * @param context Trace context
   * @param level Log level
   * @param message Log message
   * @param startTime Start timestamp for duration calculation
   * @param metadata Additional metadata
   */
  logWithTiming(
    context: TraceContext,
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    startTime: number,
    metadata?: Record<string, any>
  ): void {
    const duration = Date.now() - startTime;

    this.log(context, level, message, {
      ...metadata,
      duration,
    });
  }

  /**
   * Log operation start
   * @param context Trace context
   * @param operation Operation name
   * @param metadata Additional metadata
   */
  logStart(context: TraceContext, operation: string, metadata?: Record<string, any>): void {
    this.log(context, 'info', `${operation} started`, {
      ...metadata,
      operation,
      phase: 'start',
    });
  }

  /**
   * Log operation completion
   * @param context Trace context
   * @param operation Operation name
   * @param startTime Start timestamp
   * @param metadata Additional metadata
   */
  logComplete(
    context: TraceContext,
    operation: string,
    startTime: number,
    metadata?: Record<string, any>
  ): void {
    this.logWithTiming(context, 'info', `${operation} completed`, startTime, {
      ...metadata,
      operation,
      phase: 'complete',
    });
  }

  /**
   * Log operation error
   * @param context Trace context
   * @param operation Operation name
   * @param error Error object
   * @param startTime Start timestamp
   * @param metadata Additional metadata
   */
  logError(
    context: TraceContext,
    operation: string,
    error: Error,
    startTime: number,
    metadata?: Record<string, any>
  ): void {
    this.logWithTiming(context, 'error', `${operation} failed: ${error.message}`, startTime, {
      ...metadata,
      operation,
      phase: 'error',
      error: {
        name: error.name,
        message: (error as Error).message,
        stack: error.stack,
      },
    });
  }

  /**
   * Create a trace-aware timer for operation timing
   * @param context Trace context
   * @param operation Operation name
   */
  startTimer(context: TraceContext, operation: string): () => void {
    const startTime = Date.now();
    this.logStart(context, operation);

    return () => {
      this.logComplete(context, operation, startTime);
    };
  }

  /**
   * Serialize trace context for job data
   * @param context Trace context
   */
  serializeContext(context: TraceContext): string {
    return JSON.stringify(context);
  }

  /**
   * Deserialize trace context from job data
   * @param serialized Serialized context
   */
  deserializeContext(serialized: string): TraceContext {
    return JSON.parse(serialized);
  }

  /**
   * Extract trace context from job data
   * @param jobData Job data object
   */
  extractContextFromJob(jobData: any): TraceContext | null {
    if (jobData._traceContext) {
      return typeof jobData._traceContext === 'string'
        ? this.deserializeContext(jobData._traceContext)
        : jobData._traceContext;
    }
    return null;
  }

  /**
   * Inject trace context into job data
   * @param jobData Job data object
   * @param context Trace context
   */
  injectContextIntoJob(jobData: any, context: TraceContext): any {
    return {
      ...jobData,
      _traceContext: context,
    };
  }

  /**
   * Generate a trace ID (UUID v4)
   */
  private generateTraceId(): string {
    return `trace_${randomUUID()}`;
  }

  /**
   * Generate a span ID (UUID v4)
   */
  private generateSpanId(): string {
    return `span_${randomUUID()}`;
  }

  /**
   * Output log entry (can be overridden for custom logging)
   * @param entry Log entry
   */
  private output(entry: LogEntry): void {
    // Output as single-line JSON for log aggregation tools
    console.log(JSON.stringify(entry));
  }

  /**
   * Format trace context as string for display
   * @param context Trace context
   */
  formatContext(context: TraceContext): string {
    return `[trace=${context.traceId.substring(0, 8)} span=${context.spanId.substring(0, 8)} company=${context.companyId}]`;
  }
}
